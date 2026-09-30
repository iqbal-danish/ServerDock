pub mod analysis;
pub mod commands;
pub mod database;
pub mod editor;
pub mod filesystem;
pub mod logger;
pub mod search;
pub mod security;
pub mod sftp;
pub mod transfers;
pub mod types;

use std::sync::Arc;
use commands::AppState;
use database::Database;
use logger::Logger;
use sftp::SftpManager;
use tauri::Manager;
use transfers::TransferEngine;

#[cfg_attr(mobile, tauri::mobile_entry_point)]
pub fn run() {
    tauri::Builder::default()
        .plugin(tauri_plugin_opener::init())
        .setup(|app| {
            let app_handle = app.handle().clone();
            let app_data_dir = app
                .path()
                .app_data_dir()
                .unwrap_or_else(|_| std::path::PathBuf::from("byteflow_data"));

            let db = Database::new(app_data_dir).expect("Failed to initialize SQLite database");
            let logger = Logger::new(app_handle.clone());
            let sftp = SftpManager::new();
            sftp.set_logger(logger.clone());
            let transfers = TransferEngine::new(app_handle, sftp.clone(), db.clone());

            let state = Arc::new(AppState {
                db,
                sftp,
                transfers,
                logger,
            });

            app.manage(state);
            if let Some(w) = app.get_webview_window("main") {
                let _ = w.set_theme(Some(tauri::Theme::Dark));
                if let Some(icon) = app.default_window_icon() {
                    let _ = w.set_icon(icon.clone());
                }
            }
            Ok(())
        })
        .on_window_event(|window, event| {
            if let tauri::WindowEvent::CloseRequested { api, .. } = event {
                api.prevent_close();
                let app = window.app_handle().clone();
                if let Some(state) = window.try_state::<Arc<AppState>>() {
                    let state = state.inner().clone();
                    tauri::async_runtime::spawn(async move {
                        let _ = tokio::time::timeout(std::time::Duration::from_millis(800), async {
                            state.transfers.shutdown().await;
                            state.sftp.disconnect().await;
                        })
                        .await;

                        app.exit(0);
                        std::process::exit(0);
                    });
                } else {
                    app.exit(0);
                    std::process::exit(0);
                }
            }
        })
        .invoke_handler(tauri::generate_handler![
            // Connections
            commands::list_profiles,
            commands::save_profile,
            commands::delete_profile,
            commands::delete_saved_password,
            commands::clear_all_saved_passwords,
            commands::test_sftp_connection,
            commands::connect_sftp,
            commands::disconnect_sftp,
            commands::exit_app,
            commands::get_connection_status,
            commands::get_connection_logs,
            commands::clear_connection_logs,
            // Filesystem
            commands::get_default_local_directory,
            commands::list_local_directory,
            commands::list_remote_directory,
            commands::create_local_directory,
            commands::create_remote_directory,
            commands::delete_local_file,
            commands::delete_remote_file,
            commands::rename_local_file,
            commands::rename_remote_file,
            commands::calculate_local_checksum,
            // Transfers
            commands::queue_transfer,
            commands::get_transfers,
            commands::pause_transfer,
            commands::resume_transfer,
            commands::cancel_transfer,
            commands::retry_transfer,
            commands::clear_completed_transfers,
            commands::set_transfer_concurrency,
            commands::get_transfer_concurrency,
            commands::get_transfer_history,
            // Editor & Large Files
            commands::read_file_lines,
            commands::read_file_chunk,
            commands::read_remote_chunk,
            commands::save_local_file,
            commands::format_xml,
            commands::validate_xml,
            commands::format_json,
            commands::validate_json,
            commands::compare_files,
            // Search
            commands::search_file,
            // Analysis
            commands::analyze_xml_file,
            commands::get_xml_tag_values,
            commands::analyze_json_file,
            commands::analyze_job_feed,
            // Benchmarks
            commands::run_performance_benchmark,
        ])
        .run(tauri::generate_context!())
        .expect("error while running ByteFlow application");
}
