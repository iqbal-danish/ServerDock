use std::sync::Arc;
use std::time::Instant;
use tauri::State;
use crate::analysis::DeveloperAnalyzer;
use crate::database::Database;
use crate::editor::LargeFileEngine;
use crate::filesystem::LocalFilesystem;
use crate::search::SearchEngine;
use crate::security::CredentialManager;
use crate::sftp::SftpManager;
use crate::transfers::TransferEngine;
use crate::types::*;

pub struct AppState {
    pub db: Database,
    pub sftp: SftpManager,
    pub transfers: TransferEngine,
    pub logger: crate::logger::Logger,
}

// ---------------- CONNECTION PROFILES ---------------- //

#[tauri::command]
pub async fn list_profiles(state: State<'_, Arc<AppState>>) -> Result<Vec<ConnectionProfile>, String> {
    let mut profiles = state.db.list_profiles()?;
    for p in profiles.iter_mut() {
        p.has_saved_password = Some(CredentialManager::has_secret(&p.id));
    }
    Ok(profiles)
}

#[tauri::command]
pub async fn save_profile(
    state: State<'_, Arc<AppState>>,
    profile: ConnectionProfile,
    secret: Option<String>,
) -> Result<(), String> {
    if let Some(sec) = secret {
        if !sec.is_empty() {
            CredentialManager::store_secret(&profile.id, &sec)?;
            state.logger.log("SUCCESS", "AUTH", &format!("Password for '{}' stored safely in Windows Credential Manager.", profile.name)).await;
        } else {
            let _ = CredentialManager::delete_secret(&profile.id);
            state.logger.log("INFO", "AUTH", &format!("Password for '{}' removed from Windows Credential Manager.", profile.name)).await;
        }
    }
    state.db.save_profile(&profile)
}

#[tauri::command]
pub async fn delete_saved_password(
    state: State<'_, Arc<AppState>>,
    id: String,
) -> Result<(), String> {
    CredentialManager::delete_secret(&id)?;
    state.logger.log("INFO", "AUTH", &format!("Removed saved password from Windows Credential Manager for profile: {id}")).await;
    Ok(())
}

#[tauri::command]
pub async fn clear_all_saved_passwords(
    state: State<'_, Arc<AppState>>,
) -> Result<(), String> {
    let profiles = state.db.list_profiles()?;
    for p in profiles {
        let _ = CredentialManager::delete_secret(&p.id);
    }
    state.logger.log("INFO", "AUTH", "Cleared all stored credentials from Windows Credential Manager.").await;
    Ok(())
}

#[tauri::command]
pub async fn delete_profile(
    state: State<'_, Arc<AppState>>,
    id: String,
) -> Result<(), String> {
    let _ = CredentialManager::delete_secret(&id);
    state.logger.log("INFO", "DATABASE", &format!("Deleted connection profile and credential: {id}")).await;
    state.db.delete_profile(&id)
}

#[tauri::command]
pub async fn test_sftp_connection(
    state: State<'_, Arc<AppState>>,
    host: String,
    port: u16,
    username: String,
    auth_type: String,
    password: Option<String>,
    key_path: Option<String>,
) -> Result<ConnectionTestResult, String> {
    Ok(state.sftp.test_connection(
        &host,
        port,
        &username,
        &auth_type,
        password.as_deref(),
        key_path.as_deref(),
    ).await)
}

#[tauri::command]
pub async fn connect_sftp(
    state: State<'_, Arc<AppState>>,
    profile_id: Option<String>,
    host: String,
    port: u16,
    username: String,
    auth_type: String,
    password: Option<String>,
    key_path: Option<String>,
    remote_dir: Option<String>,
) -> Result<String, String> {
    // If password not passed in command, attempt to read from secure OS credential store
    let actual_pass = if password.is_some() && !password.as_ref().unwrap().is_empty() {
        state.logger.log("INFO", "AUTH", "Using password provided in connection request.").await;
        password
    } else if let Some(ref pid) = profile_id {
        state.logger.log("INFO", "AUTH", &format!("Checking Windows Credential Manager for profile: {pid}...")).await;
        match CredentialManager::get_secret(pid) {
            Ok(Some(sec)) => {
                state.logger.log("SUCCESS", "AUTH", "Retrieved password from Windows Credential Manager.").await;
                Some(sec)
            }
            Ok(None) => {
                state.logger.log("WARN", "AUTH", "No saved password found in Windows Credential Manager for this connection profile.").await;
                None
            }
            Err(e) => {
                state.logger.log("ERROR", "AUTH", &format!("Failed to retrieve password from Windows Credential Manager: {e}")).await;
                None
            }
        }
    } else {
        None
    };

    let start_dir = state
        .sftp
        .connect(
            profile_id.clone(),
            &host,
            port,
            &username,
            &auth_type,
            actual_pass.as_deref(),
            key_path.as_deref(),
            remote_dir.as_deref(),
        )
        .await?;

    if let Some(pid) = profile_id {
        if let Ok(mut profiles) = state.db.list_profiles() {
            if let Some(p) = profiles.iter_mut().find(|x| x.id == pid) {
                p.last_connected = Some(chrono::Utc::now().to_rfc3339());
                let _ = state.db.save_profile(p);
            }
        }
    }

    Ok(start_dir)
}

#[tauri::command]
pub async fn get_connection_logs(state: State<'_, Arc<AppState>>) -> Result<Vec<LogEntry>, String> {
    Ok(state.logger.get_logs().await)
}

#[tauri::command]
pub async fn clear_connection_logs(state: State<'_, Arc<AppState>>) -> Result<(), String> {
    state.logger.clear().await;
    Ok(())
}

#[tauri::command]
pub async fn disconnect_sftp(
    state: State<'_, Arc<AppState>>,
    profile_id: Option<String>,
) -> Result<(), String> {
    state.sftp.disconnect(profile_id.as_deref()).await;
    Ok(())
}

#[tauri::command]
pub async fn switch_sftp_session(
    state: State<'_, Arc<AppState>>,
    profile_id: String,
) -> Result<String, String> {
    state.sftp.switch_session(&profile_id).await
}

#[tauri::command]
pub async fn get_active_sessions(
    state: State<'_, Arc<AppState>>,
) -> Result<Vec<ActiveSessionInfo>, String> {
    Ok(state.sftp.list_active_sessions().await)
}

#[tauri::command]
pub async fn exit_app(
    state: State<'_, Arc<AppState>>,
    app_handle: tauri::AppHandle,
) -> Result<(), String> {
    let _ = tokio::time::timeout(std::time::Duration::from_millis(800), async {
        state.transfers.shutdown().await;
        state.sftp.disconnect(None).await;
    })
    .await;

    app_handle.exit(0);
    std::process::exit(0);
}

#[tauri::command]
pub async fn get_connection_status(state: State<'_, Arc<AppState>>) -> Result<ConnectionStatus, String> {
    let connected = state.sftp.is_connected().await;
    let (profile_id, host, username) = state.sftp.get_current_info().await;

    Ok(ConnectionStatus {
        connected,
        profile_id,
        host,
        username,
        current_remote_dir: ".".to_string(),
        error: None,
    })
}

// ---------------- FILESYSTEM (LOCAL & REMOTE) ---------------- //

#[tauri::command]
pub async fn get_default_local_directory() -> Result<String, String> {
    Ok(LocalFilesystem::get_default_directory())
}

#[tauri::command]
pub async fn list_local_directory(path: String) -> Result<Vec<FileItem>, String> {
    tokio::task::spawn_blocking(move || LocalFilesystem::list_directory(&path))
        .await
        .map_err(|e| e.to_string())?
}

#[tauri::command]
pub async fn list_remote_directory(
    state: State<'_, Arc<AppState>>,
    path: String,
    profile_id: Option<String>,
    force_refresh: Option<bool>,
) -> Result<Vec<FileItem>, String> {
    state.sftp.list_directory(&path, profile_id.as_deref(), force_refresh.unwrap_or(false)).await
}

#[tauri::command]
pub async fn create_local_directory(path: String) -> Result<(), String> {
    LocalFilesystem::create_directory(&path)
}

#[tauri::command]
pub async fn create_remote_directory(
    state: State<'_, Arc<AppState>>,
    path: String,
    profile_id: Option<String>,
) -> Result<(), String> {
    state.sftp.create_directory(&path, profile_id.as_deref()).await
}

#[tauri::command]
pub async fn delete_local_file(path: String) -> Result<(), String> {
    LocalFilesystem::delete_file(&path)
}

#[tauri::command]
pub async fn delete_remote_file(
    state: State<'_, Arc<AppState>>,
    path: String,
    is_dir: bool,
    profile_id: Option<String>,
) -> Result<(), String> {
    state.sftp.delete_file(&path, is_dir, profile_id.as_deref()).await
}

#[tauri::command]
pub async fn rename_local_file(old_path: String, new_path: String) -> Result<(), String> {
    LocalFilesystem::rename_file(&old_path, &new_path)
}

#[tauri::command]
pub async fn rename_remote_file(
    state: State<'_, Arc<AppState>>,
    old_path: String,
    new_path: String,
    profile_id: Option<String>,
) -> Result<(), String> {
    state.sftp.rename(&old_path, &new_path, profile_id.as_deref()).await
}

#[tauri::command]
pub async fn calculate_local_checksum(path: String) -> Result<String, String> {
    tokio::task::spawn_blocking(move || LocalFilesystem::calculate_sha256(&path))
        .await
        .map_err(|e| e.to_string())?
}

// ---------------- TRANSFERS ---------------- //

#[tauri::command]
pub async fn queue_transfer(
    state: State<'_, Arc<AppState>>,
    file_name: String,
    direction: String,
    source_path: String,
    dest_path: String,
    total_bytes: u64,
) -> Result<String, String> {
    let dir = if direction.to_lowercase() == "upload" {
        TransferDirection::Upload
    } else {
        TransferDirection::Download
    };

    let id = state
        .transfers
        .queue_transfer(file_name, dir, source_path, dest_path, total_bytes)
        .await;

    Ok(id)
}

#[tauri::command]
pub async fn get_transfers(state: State<'_, Arc<AppState>>) -> Result<Vec<TransferItem>, String> {
    Ok(state.transfers.get_transfers().await)
}

#[tauri::command]
pub async fn pause_transfer(state: State<'_, Arc<AppState>>, id: String) -> Result<(), String> {
    state.transfers.pause_transfer(&id).await;
    Ok(())
}

#[tauri::command]
pub async fn resume_transfer(state: State<'_, Arc<AppState>>, id: String) -> Result<(), String> {
    state.transfers.resume_transfer(&id).await;
    Ok(())
}

#[tauri::command]
pub async fn cancel_transfer(state: State<'_, Arc<AppState>>, id: String) -> Result<(), String> {
    state.transfers.cancel_transfer(&id).await;
    Ok(())
}

#[tauri::command]
pub async fn retry_transfer(state: State<'_, Arc<AppState>>, id: String) -> Result<(), String> {
    state.transfers.retry_transfer(&id).await;
    Ok(())
}

#[tauri::command]
pub async fn clear_completed_transfers(state: State<'_, Arc<AppState>>) -> Result<(), String> {
    state.transfers.clear_completed().await;
    Ok(())
}

#[tauri::command]
pub async fn set_transfer_concurrency(
    state: State<'_, Arc<AppState>>,
    limit: usize,
) -> Result<(), String> {
    state.transfers.set_concurrency(limit).await;
    Ok(())
}

#[tauri::command]
pub async fn get_transfer_concurrency(state: State<'_, Arc<AppState>>) -> Result<usize, String> {
    Ok(state.transfers.get_concurrency().await)
}

#[tauri::command]
pub async fn get_transfer_history(
    state: State<'_, Arc<AppState>>,
    limit: Option<usize>,
) -> Result<Vec<TransferItem>, String> {
    state.db.get_transfer_history(limit.unwrap_or(50))
}

// ---------------- EDITOR & LARGE FILES ---------------- //

#[tauri::command]
pub async fn read_file_lines(
    path: String,
    start_line: usize,
    line_count: usize,
) -> Result<FileChunkResponse, String> {
    tokio::task::spawn_blocking(move || LargeFileEngine::read_lines(&path, start_line, line_count))
        .await
        .map_err(|e| e.to_string())?
}

#[tauri::command]
pub async fn read_file_chunk(
    path: String,
    offset: u64,
    length: usize,
) -> Result<FileChunkResponse, String> {
    tokio::task::spawn_blocking(move || LargeFileEngine::read_chunk(&path, offset, length))
        .await
        .map_err(|e| e.to_string())?
}

#[tauri::command]
pub async fn read_remote_chunk(
    state: State<'_, Arc<AppState>>,
    path: String,
    offset: u64,
    length: usize,
    profile_id: Option<String>,
) -> Result<FileChunkResponse, String> {
    let bytes = state.sftp.read_file_chunk(&path, offset, length, profile_id.as_deref()).await?;
    let content = String::from_utf8_lossy(&bytes).to_string();
    let chunk_size = bytes.len();
    Ok(FileChunkResponse {
        content,
        byte_offset: offset,
        chunk_size,
        total_size: 0,
        eof: chunk_size < length,
        start_line: 1,
        line_count: 0,
        total_lines: None,
    })
}

#[tauri::command]
pub async fn save_local_file(path: String, content: String) -> Result<(), String> {
    tokio::task::spawn_blocking(move || LocalFilesystem::write_file_content(&path, content.as_bytes()))
        .await
        .map_err(|e| e.to_string())?
}

#[tauri::command]
pub async fn format_xml(raw_xml: String) -> Result<String, String> {
    LargeFileEngine::format_xml(&raw_xml)
}

#[tauri::command]
pub async fn validate_xml(raw_xml: String) -> Result<(bool, Option<String>), String> {
    Ok(LargeFileEngine::validate_xml(&raw_xml))
}

#[tauri::command]
pub async fn format_json(raw_json: String) -> Result<String, String> {
    LargeFileEngine::format_json(&raw_json)
}

#[tauri::command]
pub async fn validate_json(raw_json: String) -> Result<(bool, Option<String>), String> {
    Ok(LargeFileEngine::validate_json(&raw_json))
}

#[tauri::command]
pub async fn compare_files(path_a: String, path_b: String) -> Result<DiffResult, String> {
    tokio::task::spawn_blocking(move || {
        let text_a = std::fs::read_to_string(&path_a)
            .map_err(|e| format!("Failed to read {path_a}: {e}"))?;
        let text_b = std::fs::read_to_string(&path_b)
            .map_err(|e| format!("Failed to read {path_b}: {e}"))?;
        let name_a = std::path::Path::new(&path_a).file_name().map(|n| n.to_string_lossy().to_string()).unwrap_or(path_a);
        let name_b = std::path::Path::new(&path_b).file_name().map(|n| n.to_string_lossy().to_string()).unwrap_or(path_b);
        Ok(LargeFileEngine::compare_texts(&text_a, &text_b, &name_a, &name_b))
    })
    .await
    .map_err(|e| e.to_string())?
}

// ---------------- SEARCH ---------------- //

#[tauri::command]
pub async fn search_file(
    path: String,
    query: String,
    case_sensitive: bool,
    is_regex: bool,
    whole_word: bool,
    max_matches: usize,
) -> Result<SearchResult, String> {
    tokio::task::spawn_blocking(move || {
        SearchEngine::search_file(&path, &query, case_sensitive, is_regex, whole_word, max_matches)
    })
    .await
    .map_err(|e| e.to_string())?
}

// ---------------- ANALYSIS ---------------- //

#[tauri::command]
pub async fn analyze_xml_file(path: String) -> Result<XmlAnalysisResult, String> {
    tokio::task::spawn_blocking(move || DeveloperAnalyzer::analyze_xml_file(&path))
        .await
        .map_err(|e| e.to_string())
}

#[tauri::command]
pub async fn get_xml_tag_values(
    path: String,
    tag: String,
    max_values: Option<usize>,
) -> Result<Vec<XmlValueStat>, String> {
    tokio::task::spawn_blocking(move || {
        DeveloperAnalyzer::get_xml_tag_values(&path, &tag, max_values.unwrap_or(50))
    })
    .await
    .map_err(|e| e.to_string())
}

#[tauri::command]
pub async fn analyze_json_file(path: String) -> Result<JsonAnalysisResult, String> {
    tokio::task::spawn_blocking(move || DeveloperAnalyzer::analyze_json_file(&path))
        .await
        .map_err(|e| e.to_string())
}

#[tauri::command]
pub async fn analyze_job_feed(path: String) -> Result<JobFeedAnalysisResult, String> {
    tokio::task::spawn_blocking(move || DeveloperAnalyzer::analyze_job_feed(&path))
        .await
        .map_err(|e| e.to_string())
}

// ---------------- BENCHMARKS ---------------- //

#[tauri::command]
pub async fn run_performance_benchmark(path: Option<String>) -> Result<Vec<BenchmarkResult>, String> {
    tokio::task::spawn_blocking(move || {
        let mut results = Vec::new();

        // Benchmark 1: Memory Mapped Read Throughput
        let sample_data = vec![b'A'; 20 * 1024 * 1024]; // 20 MB buffer
        let temp_dir = std::env::temp_dir();
        let test_file = temp_dir.join("serverdock_bench.tmp");
        let _ = std::fs::write(&test_file, &sample_data);

        let t0 = Instant::now();
        if let Ok(chunk) = LargeFileEngine::read_chunk(&test_file.to_string_lossy(), 0, 10 * 1024 * 1024) {
            let elapsed = t0.elapsed();
            let mb = 10.0;
            let mb_s = mb / elapsed.as_secs_f64();
            results.push(BenchmarkResult {
                task_name: "Mmap 10MB Chunk Read".to_string(),
                duration_ms: elapsed.as_millis() as u64,
                throughput_mb_s: Some(mb_s),
                details: format!("Read {} bytes in {:?}", chunk.chunk_size, elapsed),
            });
        }

        // Benchmark 2: Regex Engine Scan
        let t1 = Instant::now();
        let search_res = SearchEngine::search_file(
            &test_file.to_string_lossy(),
            "AAAA",
            false,
            false,
            false,
            5000,
        );
        let elapsed1 = t1.elapsed();
        if let Ok(sr) = search_res {
            results.push(BenchmarkResult {
                task_name: "Mmap Regex Search (20MB)".to_string(),
                duration_ms: elapsed1.as_millis() as u64,
                throughput_mb_s: Some(20.0 / elapsed1.as_secs_f64()),
                details: format!("Found {} matches in {:?}", sr.total_matches, elapsed1),
            });
        }

        // Benchmark 3: Line Counting / Indexing
        let t2 = Instant::now();
        let lines_res = LargeFileEngine::read_lines(&test_file.to_string_lossy(), 1, 500);
        let elapsed2 = t2.elapsed();
        if let Ok(lr) = lines_res {
            results.push(BenchmarkResult {
                task_name: "Line Index Seek (500 lines)".to_string(),
                duration_ms: elapsed2.as_millis() as u64,
                throughput_mb_s: None,
                details: format!("Found {} lines in {:?}", lr.line_count, elapsed2),
            });
        }

        let _ = std::fs::remove_file(&test_file);

        // Benchmark 4: If user provided a specific path to test
        if let Some(user_path) = path {
            if std::path::Path::new(&user_path).exists() {
                let t_user = Instant::now();
                if let Ok(meta) = std::fs::metadata(&user_path) {
                    let size_mb = meta.len() as f64 / (1024.0 * 1024.0);
                    let res = LargeFileEngine::read_lines(&user_path, 1, 100);
                    let el = t_user.elapsed();
                    if let Ok(r) = res {
                        results.push(BenchmarkResult {
                            task_name: format!("Target File Quick Peek ({:.1} MB)", size_mb),
                            duration_ms: el.as_millis() as u64,
                            throughput_mb_s: Some(size_mb.min(10.0) / el.as_secs_f64()),
                            details: format!("Seeked and read {} lines in {:?}", r.line_count, el),
                        });
                    }
                }
            }
        }

        Ok(results)
    })
    .await
    .map_err(|e| e.to_string())?
}
