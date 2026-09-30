use std::collections::HashMap;
use std::fs::File;
use std::io::{Read, Seek, SeekFrom};
use std::sync::Arc;
use std::time::{Duration, Instant};
use tauri::{AppHandle, Emitter};
use tokio::sync::{Mutex, RwLock};
use uuid::Uuid;
use crate::database::Database;
use crate::sftp::SftpManager;
use crate::types::{TransferDirection, TransferItem, TransferStatus};

#[derive(Clone)]
pub struct TransferEngine {
    app_handle: AppHandle,
    sftp_manager: SftpManager,
    database: Database,
    transfers: Arc<RwLock<HashMap<String, TransferItem>>>,
    paused_or_cancelled: Arc<RwLock<HashMap<String, TransferStatus>>>,
    max_concurrent: Arc<Mutex<usize>>,
    active_count: Arc<Mutex<usize>>,
}

impl TransferEngine {
    pub fn new(app_handle: AppHandle, sftp_manager: SftpManager, database: Database) -> Self {
        Self {
            app_handle,
            sftp_manager,
            database,
            transfers: Arc::new(RwLock::new(HashMap::new())),
            paused_or_cancelled: Arc::new(RwLock::new(HashMap::new())),
            max_concurrent: Arc::new(Mutex::new(3)),
            active_count: Arc::new(Mutex::new(0)),
        }
    }

    pub async fn set_concurrency(&self, limit: usize) {
        let mut max = self.max_concurrent.lock().await;
        *max = limit.max(1);
    }

    pub async fn get_concurrency(&self) -> usize {
        *self.max_concurrent.lock().await
    }

    pub async fn get_transfers(&self) -> Vec<TransferItem> {
        let map = self.transfers.read().await;
        let mut list: Vec<TransferItem> = map.values().cloned().collect();
        list.sort_by(|a, b| b.created_at.cmp(&a.created_at));
        list
    }

    pub async fn shutdown(&self) {
        let ids: Vec<String> = {
            let map = self.transfers.read().await;
            map.keys().cloned().collect()
        };
        let mut flags = self.paused_or_cancelled.write().await;
        for id in ids {
            flags.insert(id, TransferStatus::Cancelled);
        }
        let mut active = self.active_count.lock().await;
        *active = 0;
    }

    pub async fn queue_transfer(
        &self,
        file_name: String,
        direction: TransferDirection,
        source_path: String,
        dest_path: String,
        total_bytes: u64,
    ) -> String {
        let id = Uuid::new_v4().to_string();
        let now = chrono::Utc::now().timestamp_millis();

        let item = TransferItem {
            id: id.clone(),
            file_name,
            direction,
            source_path,
            dest_path,
            total_bytes,
            transferred_bytes: 0,
            speed_bytes_per_sec: 0,
            eta_seconds: None,
            status: TransferStatus::Queued,
            error: None,
            retry_count: 0,
            created_at: now,
            completed_at: None,
        };

        {
            let mut map = self.transfers.write().await;
            map.insert(id.clone(), item.clone());
        }

        self.emit_update(&item).await;
        self.trigger_next_transfer();
        id
    }

    pub async fn pause_transfer(&self, id: &str) {
        let mut flags = self.paused_or_cancelled.write().await;
        flags.insert(id.to_string(), TransferStatus::Paused);

        let mut map = self.transfers.write().await;
        if let Some(item) = map.get_mut(id) {
            if item.status == TransferStatus::Running || item.status == TransferStatus::Queued {
                item.status = TransferStatus::Paused;
                let clone = item.clone();
                drop(map);
                self.emit_update(&clone).await;
            }
        }
    }

    pub async fn resume_transfer(&self, id: &str) {
        {
            let mut flags = self.paused_or_cancelled.write().await;
            flags.remove(id);
        }
        {
            let mut map = self.transfers.write().await;
            if let Some(item) = map.get_mut(id) {
                if item.status == TransferStatus::Paused {
                    item.status = TransferStatus::Queued;
                    let clone = item.clone();
                    drop(map);
                    self.emit_update(&clone).await;
                }
            }
        }
        self.trigger_next_transfer();
    }

    pub async fn cancel_transfer(&self, id: &str) {
        let mut flags = self.paused_or_cancelled.write().await;
        flags.insert(id.to_string(), TransferStatus::Cancelled);

        let mut map = self.transfers.write().await;
        if let Some(item) = map.get_mut(id) {
            item.status = TransferStatus::Cancelled;
            let clone = item.clone();
            drop(map);
            self.emit_update(&clone).await;
        }
    }

    pub async fn retry_transfer(&self, id: &str) {
        {
            let mut flags = self.paused_or_cancelled.write().await;
            flags.remove(id);
        }
        {
            let mut map = self.transfers.write().await;
            if let Some(item) = map.get_mut(id) {
                if item.status == TransferStatus::Failed || item.status == TransferStatus::Cancelled {
                    item.status = TransferStatus::Queued;
                    item.error = None;
                    item.retry_count += 1;
                    let clone = item.clone();
                    drop(map);
                    self.emit_update(&clone).await;
                }
            }
        }
        self.trigger_next_transfer();
    }

    pub async fn clear_completed(&self) {
        let mut map = self.transfers.write().await;
        map.retain(|_, v| v.status != TransferStatus::Completed && v.status != TransferStatus::Cancelled);
    }

    async fn emit_update(&self, item: &TransferItem) {
        let _ = self.app_handle.emit("transfer-update", item);
    }

    fn trigger_next_transfer(&self) {
        let engine = self.clone();
        tokio::spawn(async move {
            engine.process_queue().await;
        });
    }

    async fn process_queue(&self) {
        let max = *self.max_concurrent.lock().await;
        let mut active = self.active_count.lock().await;
        if *active >= max {
            return;
        }

        // Find next queued item
        let next_id = {
            let map = self.transfers.read().await;
            map.values()
                .find(|t| t.status == TransferStatus::Queued)
                .map(|t| t.id.clone())
        };

        if let Some(id) = next_id {
            *active += 1;
            drop(active);

            let engine = self.clone();
            tokio::spawn(async move {
                engine.run_single_transfer(id).await;
                let mut act = engine.active_count.lock().await;
                *act = act.saturating_sub(1);
                drop(act);
                engine.trigger_next_transfer();
            });
        }
    }

    async fn run_single_transfer(&self, id: String) {
        // Mark as running
        {
            let mut map = self.transfers.write().await;
            if let Some(item) = map.get_mut(&id) {
                item.status = TransferStatus::Running;
                let clone = item.clone();
                drop(map);
                self.emit_update(&clone).await;
            } else {
                return;
            }
        }

        let item = {
            let map = self.transfers.read().await;
            match map.get(&id) {
                Some(i) => i.clone(),
                None => return,
            }
        };

        let result = match item.direction {
            TransferDirection::Upload => self.execute_upload(&item).await,
            TransferDirection::Download => self.execute_download(&item).await,
        };

        let now = chrono::Utc::now().timestamp_millis();
        let mut map = self.transfers.write().await;
        if let Some(cur) = map.get_mut(&id) {
            match result {
                Ok(_) => {
                    cur.status = TransferStatus::Completed;
                    cur.transferred_bytes = cur.total_bytes;
                    cur.speed_bytes_per_sec = 0;
                    cur.eta_seconds = Some(0);
                    cur.completed_at = Some(now);
                }
                Err(e) => {
                    let flags = self.paused_or_cancelled.read().await;
                    if let Some(st) = flags.get(&id) {
                        cur.status = st.clone();
                    } else {
                        cur.status = TransferStatus::Failed;
                        cur.error = Some(e);
                    }
                    cur.speed_bytes_per_sec = 0;
                }
            }
            let clone = cur.clone();
            drop(map);
            self.emit_update(&clone).await;
            let _ = self.database.save_transfer_history(&clone);
        }
    }

    async fn execute_upload(&self, item: &TransferItem) -> Result<(), String> {
        let sftp_client = self.sftp_manager.get_sftp_client().await?;

        let mut local_file = File::open(&item.source_path)
            .map_err(|e| format!("Failed to open local file: {e}"))?;

        let total_size = if item.total_bytes > 0 {
            item.total_bytes
        } else {
            local_file.metadata().map(|m| m.len()).unwrap_or(0)
        };

        let clean_dest = item.dest_path.replace('\\', "/");
        let handle_pkt = sftp_client
            .open(
                &clean_dest,
                russh_sftp::protocol::OpenFlags::CREATE | russh_sftp::protocol::OpenFlags::TRUNCATE | russh_sftp::protocol::OpenFlags::WRITE,
                russh_sftp::protocol::FileAttributes::empty(),
            )
            .await
            .map_err(|e| format!("Failed to create remote file {clean_dest}: {e}"))?;
        let handle = Arc::new(handle_pkt.handle);

        let transferred = item.transferred_bytes;
        if transferred > 0 {
            local_file
                .seek(SeekFrom::Start(transferred))
                .map_err(|e| format!("Failed to seek local file: {e}"))?;
        }

        let mut buffered_local = std::io::BufReader::with_capacity(256 * 1024, local_file);

        let transferred_atomic = Arc::new(std::sync::atomic::AtomicU64::new(transferred));
        let cancel_flag = Arc::new(std::sync::atomic::AtomicBool::new(false));

        // 16 in-flight pipelined writes
        let in_flight_concurrency = 16;
        let semaphore = Arc::new(tokio::sync::Semaphore::new(in_flight_concurrency));
        let mut write_tasks = tokio::task::JoinSet::new();

        let monitor_handle = {
            let item_id = item.id.clone();
            let transfers = self.transfers.clone();
            let transferred = transferred_atomic.clone();
            let app_handle = self.app_handle.clone();
            let cancel = cancel_flag.clone();

            tokio::spawn(async move {
                let mut last_sample_time = Instant::now();
                let mut last_bytes = transferred.load(std::sync::atomic::Ordering::Relaxed);

                while !cancel.load(std::sync::atomic::Ordering::Relaxed) {
                    tokio::time::sleep(Duration::from_millis(300)).await;
                    let current = transferred.load(std::sync::atomic::Ordering::Relaxed);
                    let elapsed = last_sample_time.elapsed();
                    if elapsed >= Duration::from_millis(300) {
                        let delta = current.saturating_sub(last_bytes);
                        let speed = ((delta as f64) / elapsed.as_secs_f64()) as u64;
                        let rem = total_size.saturating_sub(current);
                        let eta = if speed > 0 { Some(rem / speed) } else { None };

                        {
                            let mut map = transfers.write().await;
                            if let Some(t) = map.get_mut(&item_id) {
                                t.transferred_bytes = current;
                                t.total_bytes = total_size;
                                t.speed_bytes_per_sec = speed;
                                t.eta_seconds = eta;
                                let clone = t.clone();
                                drop(map);
                                let _ = app_handle.emit("transfer-update", &clone);
                            }
                        }

                        last_sample_time = Instant::now();
                        last_bytes = current;
                    }
                    if current >= total_size && total_size > 0 {
                        break;
                    }
                }
            })
        };

        let mut current_offset = transferred;
        let mut buffer = vec![0u8; 64 * 1024];
        let mut upload_error: Option<String> = None;

        loop {
            // Check pause or cancel
            {
                let flags = self.paused_or_cancelled.read().await;
                if let Some(status) = flags.get(&item.id) {
                    match status {
                        TransferStatus::Paused => {
                            cancel_flag.store(true, std::sync::atomic::Ordering::Relaxed);
                            upload_error = Some("Transfer paused".to_string());
                            break;
                        }
                        TransferStatus::Cancelled => {
                            cancel_flag.store(true, std::sync::atomic::Ordering::Relaxed);
                            upload_error = Some("Transfer cancelled".to_string());
                            break;
                        }
                        _ => {}
                    }
                }
            }

            let bytes_read = match buffered_local.read(&mut buffer) {
                Ok(n) => n,
                Err(e) => {
                    cancel_flag.store(true, std::sync::atomic::Ordering::Relaxed);
                    upload_error = Some(format!("Error reading local file: {e}"));
                    break;
                }
            };

            if bytes_read == 0 {
                break; // EOF
            }

            let permit = match semaphore.clone().acquire_owned().await {
                Ok(p) => p,
                Err(_) => break,
            };

            let chunk = buffer[..bytes_read].to_vec();
            let chunk_len = bytes_read as u64;
            let offset = current_offset;
            current_offset += chunk_len;

            let client = sftp_client.clone();
            let file_handle = handle.clone();
            let transferred = transferred_atomic.clone();

            write_tasks.spawn(async move {
                let _permit = permit;
                client.write(file_handle.as_str(), offset, chunk).await
                    .map_err(|e| format!("Remote write error at offset {offset}: {e}"))?;
                transferred.fetch_add(chunk_len, std::sync::atomic::Ordering::Relaxed);
                Ok::<(), String>(())
            });

            // Drain completed write tasks
            while write_tasks.len() >= in_flight_concurrency * 2 {
                if let Some(res) = write_tasks.join_next().await {
                    match res {
                        Ok(Ok(())) => {}
                        Ok(Err(e)) => {
                            cancel_flag.store(true, std::sync::atomic::Ordering::Relaxed);
                            upload_error = Some(e);
                            break;
                        }
                        Err(je) => {
                            cancel_flag.store(true, std::sync::atomic::Ordering::Relaxed);
                            upload_error = Some(je.to_string());
                            break;
                        }
                    }
                }
            }

            if upload_error.is_some() {
                break;
            }
        }

        // Wait for all remaining write tasks to complete
        while let Some(res) = write_tasks.join_next().await {
            match res {
                Ok(Ok(())) => {}
                Ok(Err(e)) => {
                    if upload_error.is_none() {
                        upload_error = Some(e);
                    }
                }
                Err(je) => {
                    if upload_error.is_none() {
                        upload_error = Some(je.to_string());
                    }
                }
            }
        }

        // Stop monitor
        cancel_flag.store(true, std::sync::atomic::Ordering::Relaxed);
        let _ = monitor_handle.await;

        // Close remote handle
        let _ = sftp_client.close(handle.as_str()).await;
        self.sftp_manager.clear_dir_cache().await;

        if let Some(e) = upload_error {
            return Err(e);
        }

        Ok(())
    }

    async fn execute_download(&self, item: &TransferItem) -> Result<(), String> {
        // Ensure parent directory exists locally
        if let Some(parent) = std::path::Path::new(&item.dest_path).parent() {
            let _ = std::fs::create_dir_all(parent);
        }

        let sftp_client = self.sftp_manager.get_sftp_client().await?;
        let clean_source = item.source_path.replace('\\', "/");

        // Determine total size
        let total_size = if item.total_bytes > 0 {
            item.total_bytes
        } else {
            match sftp_client.stat(&clean_source).await {
                Ok(attrs) => attrs.attrs.size.unwrap_or(0),
                Err(_) => 0,
            }
        };

        // Open remote file handle
        let handle_pkt = sftp_client
            .open(
                &clean_source,
                russh_sftp::protocol::OpenFlags::READ,
                russh_sftp::protocol::FileAttributes::empty(),
            )
            .await
            .map_err(|e| format!("Failed to open remote file {clean_source}: {e}"))?;
        let handle = Arc::new(handle_pkt.handle);

        // Preallocate or prepare local file
        let dest_path = item.dest_path.clone();
        {
            let local_file = std::fs::OpenOptions::new()
                .create(true)
                .write(true)
                .truncate(item.transferred_bytes == 0)
                .open(&dest_path)
                .map_err(|e| format!("Failed to open local destination file: {e}"))?;
            if total_size > 0 {
                let _ = local_file.set_len(total_size);
            }
        }

        // Dedicated disk writer task on blocking thread pool
        let (tx, mut rx) = tokio::sync::mpsc::channel::<(u64, Vec<u8>)>(64);
        let writer_dest = dest_path.clone();

        let writer_handle = tokio::task::spawn_blocking(move || -> Result<(), String> {
            use std::fs::OpenOptions;
            use std::io::{Seek, SeekFrom, Write};

            let mut file = OpenOptions::new()
                .write(true)
                .open(&writer_dest)
                .map_err(|e| format!("Failed to open local destination for writing: {e}"))?;

            while let Some((offset, chunk)) = rx.blocking_recv() {
                file.seek(SeekFrom::Start(offset))
                    .map_err(|e| format!("Failed to seek local file: {e}"))?;
                file.write_all(&chunk)
                    .map_err(|e| format!("Failed to write to local file: {e}"))?;
            }

            file.flush()
                .map_err(|e| format!("Failed to flush local file: {e}"))?;
            Ok(())
        });

        // 32 in-flight pipelined requests of 64 KB each (2 MB sliding window across the wire)
        let chunk_size: u64 = 64 * 1024;
        let in_flight_concurrency = 32;
        let semaphore = Arc::new(tokio::sync::Semaphore::new(in_flight_concurrency));

        let transferred_atomic = Arc::new(std::sync::atomic::AtomicU64::new(item.transferred_bytes));
        let cancel_flag = Arc::new(std::sync::atomic::AtomicBool::new(false));
        let eof_reached = Arc::new(std::sync::atomic::AtomicBool::new(false));

        let monitor_handle = {
            let item_id = item.id.clone();
            let transfers = self.transfers.clone();
            let transferred = transferred_atomic.clone();
            let app_handle = self.app_handle.clone();
            let cancel = cancel_flag.clone();

            tokio::spawn(async move {
                let mut last_sample_time = Instant::now();
                let mut last_bytes = transferred.load(std::sync::atomic::Ordering::Relaxed);

                while !cancel.load(std::sync::atomic::Ordering::Relaxed) {
                    tokio::time::sleep(Duration::from_millis(300)).await;
                    let current = transferred.load(std::sync::atomic::Ordering::Relaxed);
                    let elapsed = last_sample_time.elapsed();
                    if elapsed >= Duration::from_millis(300) {
                        let delta = current.saturating_sub(last_bytes);
                        let speed = ((delta as f64) / elapsed.as_secs_f64()) as u64;
                        let rem = total_size.saturating_sub(current);
                        let eta = if speed > 0 { Some(rem / speed) } else { None };

                        {
                            let mut map = transfers.write().await;
                            if let Some(t) = map.get_mut(&item_id) {
                                t.transferred_bytes = current;
                                t.total_bytes = total_size;
                                t.speed_bytes_per_sec = speed;
                                t.eta_seconds = eta;
                                let clone = t.clone();
                                drop(map);
                                let _ = app_handle.emit("transfer-update", &clone);
                            }
                        }

                        last_sample_time = Instant::now();
                        last_bytes = current;
                    }
                    if current >= total_size && total_size > 0 {
                        break;
                    }
                }
            })
        };

        let mut current_offset = item.transferred_bytes;
        let mut tasks = tokio::task::JoinSet::new();
        let mut download_error: Option<String> = None;

        // Loop to dispatch pipelined read packets
        while current_offset < total_size || (total_size == 0 && current_offset == 0) {
            if cancel_flag.load(std::sync::atomic::Ordering::Relaxed) {
                break;
            }
            if eof_reached.load(std::sync::atomic::Ordering::Relaxed) {
                break;
            }

            // Check pause or cancel
            {
                let flags = self.paused_or_cancelled.read().await;
                if let Some(status) = flags.get(&item.id) {
                    match status {
                        TransferStatus::Paused => {
                            cancel_flag.store(true, std::sync::atomic::Ordering::Relaxed);
                            download_error = Some("Transfer paused".to_string());
                            break;
                        }
                        TransferStatus::Cancelled => {
                            cancel_flag.store(true, std::sync::atomic::Ordering::Relaxed);
                            download_error = Some("Transfer cancelled".to_string());
                            break;
                        }
                        _ => {}
                    }
                }
            }

            let permit = match semaphore.clone().acquire_owned().await {
                Ok(p) => p,
                Err(_) => break,
            };

            let read_len = if total_size > 0 {
                ((total_size - current_offset) as usize).min(chunk_size as usize)
            } else {
                chunk_size as usize
            };

            let offset = current_offset;
            current_offset += read_len as u64;

            let client = sftp_client.clone();
            let file_handle = handle.clone();
            let tx_clone = tx.clone();
            let transferred = transferred_atomic.clone();
            let eof = eof_reached.clone();
            let cancel = cancel_flag.clone();

            tasks.spawn(async move {
                let _permit = permit;
                if cancel.load(std::sync::atomic::Ordering::Relaxed) {
                    return Ok::<(), String>(());
                }

                let res = client.read(file_handle.as_str(), offset, read_len as u32).await;
                match res {
                    Ok(data) => {
                        if data.data.is_empty() {
                            eof.store(true, std::sync::atomic::Ordering::Relaxed);
                            return Ok(());
                        }
                        let len = data.data.len();
                        if tx_clone.send((offset, data.data.to_vec())).await.is_err() {
                            return Err("Disk writer channel closed".to_string());
                        }
                        transferred.fetch_add(len as u64, std::sync::atomic::Ordering::Relaxed);
                        if len < read_len {
                            eof.store(true, std::sync::atomic::Ordering::Relaxed);
                        }
                        Ok(())
                    }
                    Err(russh_sftp::client::error::Error::Status(status))
                        if status.status_code == russh_sftp::protocol::StatusCode::Eof => {
                            eof.store(true, std::sync::atomic::Ordering::Relaxed);
                            Ok(())
                        }
                    Err(e) => Err(format!("SFTP read error at offset {offset}: {e}")),
                }
            });

            // Drain finished tasks periodically to check for errors and free memory
            while tasks.len() >= in_flight_concurrency * 2 {
                if let Some(join_res) = tasks.join_next().await {
                    match join_res {
                        Ok(Ok(())) => {}
                        Ok(Err(e)) => {
                            cancel_flag.store(true, std::sync::atomic::Ordering::Relaxed);
                            download_error = Some(e);
                            break;
                        }
                        Err(join_err) => {
                            cancel_flag.store(true, std::sync::atomic::Ordering::Relaxed);
                            download_error = Some(join_err.to_string());
                            break;
                        }
                    }
                }
            }

            if download_error.is_some() {
                break;
            }
        }

        // Wait for all remaining in-flight tasks to complete
        while let Some(join_res) = tasks.join_next().await {
            match join_res {
                Ok(Ok(())) => {}
                Ok(Err(e)) => {
                    if download_error.is_none() {
                        download_error = Some(e);
                    }
                }
                Err(join_err) => {
                    if download_error.is_none() {
                        download_error = Some(join_err.to_string());
                    }
                }
            }
        }

        // Stop monitor
        cancel_flag.store(true, std::sync::atomic::Ordering::Relaxed);
        let _ = monitor_handle.await;

        // Close remote handle
        let _ = sftp_client.close(handle.as_str()).await;

        // Close disk writer channel and wait for disk writes to finish
        drop(tx);
        let writer_res = writer_handle
            .await
            .map_err(|e| format!("Disk writer task join error: {e}"))?;

        if let Err(e) = writer_res {
            return Err(e);
        }

        if let Some(e) = download_error {
            return Err(e);
        }

        // Ensure final file size matches actual transferred bytes if EOF happened early
        let final_bytes = transferred_atomic.load(std::sync::atomic::Ordering::Relaxed);
        if total_size > 0 && final_bytes < total_size {
            if let Ok(file) = std::fs::OpenOptions::new().write(true).open(&dest_path) {
                let _ = file.set_len(final_bytes);
            }
        }

        Ok(())
    }
}
