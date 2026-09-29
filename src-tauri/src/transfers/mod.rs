use std::collections::HashMap;
use std::fs::File;
use std::io::{Read, Seek, SeekFrom, Write};
use std::sync::Arc;
use std::time::{Duration, Instant};
use tauri::{AppHandle, Emitter};
use tokio::sync::{Mutex, RwLock};
use uuid::Uuid;
use crate::database::Database;
use crate::sftp::SftpManager;
use crate::types::{TransferDirection, TransferItem, TransferStatus};

const CHUNK_SIZE: usize = 256 * 1024; // 256 KB chunks for high-speed streaming

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
        use tokio::io::AsyncWriteExt;
        let sftp_client = self.sftp_manager.get_sftp_client().await?;

        let mut local_file = File::open(&item.source_path)
            .map_err(|e| format!("Failed to open local file: {e}"))?;

        // Determine total size if 0
        let total_size = if item.total_bytes > 0 {
            item.total_bytes
        } else {
            local_file.metadata().map(|m| m.len()).unwrap_or(0)
        };

        let clean_dest = item.dest_path.replace('\\', "/");
        let mut remote_file = sftp_client
            .create(&clean_dest)
            .await
            .map_err(|e| format!("Failed to create remote file {clean_dest}: {e}"))?;

        let mut buffer = vec![0u8; CHUNK_SIZE];
        let mut transferred = item.transferred_bytes;
        if transferred > 0 {
            local_file
                .seek(SeekFrom::Start(transferred))
                .map_err(|e| format!("Failed to seek local file: {e}"))?;
        }

        let mut buffered_local = std::io::BufReader::with_capacity(CHUNK_SIZE, local_file);

        let mut last_sample_time = Instant::now();
        let mut bytes_since_sample = 0u64;

        loop {
            // Check pause or cancel
            {
                let flags = self.paused_or_cancelled.read().await;
                if let Some(status) = flags.get(&item.id) {
                    match status {
                        TransferStatus::Paused => return Err("Transfer paused".to_string()),
                        TransferStatus::Cancelled => return Err("Transfer cancelled".to_string()),
                        _ => {}
                    }
                }
            }

            let bytes_read = buffered_local
                .read(&mut buffer)
                .map_err(|e| format!("Error reading local file: {e}"))?;

            if bytes_read == 0 {
                break; // EOF
            }

            remote_file
                .write_all(&buffer[..bytes_read])
                .await
                .map_err(|e| format!("Error writing to remote file: {e}"))?;

            transferred += bytes_read as u64;
            bytes_since_sample += bytes_read as u64;

            let elapsed = last_sample_time.elapsed();
            if elapsed >= Duration::from_millis(400) {
                let speed = ((bytes_since_sample as f64) / elapsed.as_secs_f64()) as u64;
                let remaining_bytes = total_size.saturating_sub(transferred);
                let eta = if speed > 0 {
                    Some(remaining_bytes / speed)
                } else {
                    None
                };

                {
                    let mut map = self.transfers.write().await;
                    if let Some(t) = map.get_mut(&item.id) {
                        t.transferred_bytes = transferred;
                        t.total_bytes = total_size;
                        t.speed_bytes_per_sec = speed;
                        t.eta_seconds = eta;
                        let clone = t.clone();
                        drop(map);
                        self.emit_update(&clone).await;
                    }
                }

                last_sample_time = Instant::now();
                bytes_since_sample = 0;
            }
        }

        remote_file
            .flush()
            .await
            .map_err(|e| format!("Failed to flush remote file: {e}"))?;

        self.sftp_manager.clear_dir_cache().await;

        Ok(())
    }

    async fn execute_download(&self, item: &TransferItem) -> Result<(), String> {
        // Ensure parent directory exists locally
        if let Some(parent) = std::path::Path::new(&item.dest_path).parent() {
            let _ = std::fs::create_dir_all(parent);
        }

        let sftp_client = self.sftp_manager.get_sftp_client().await?;

        // Determine total size
        let total_size = if item.total_bytes > 0 {
            item.total_bytes
        } else {
            match sftp_client.metadata(&item.source_path).await {
                Ok(meta) => meta.size.unwrap_or(0),
                Err(_) => 0,
            }
        };

        // If file >= 2 MB and starting fresh, use parallel multi-stream segmented download for 5x-10x speedup
        if total_size >= 2 * 1024 * 1024 && item.transferred_bytes == 0 {
            match self.execute_multi_stream_download(item, total_size).await {
                Ok(()) => return Ok(()),
                Err(e) => {
                    // Check if cancelled or paused
                    let flags = self.paused_or_cancelled.read().await;
                    if let Some(status) = flags.get(&item.id) {
                        if *status == TransferStatus::Paused || *status == TransferStatus::Cancelled {
                            return Err(e);
                        }
                    }
                    // Server may restrict multiple handles; log and fall back to single stream
                    self.sftp_manager
                        .log("WARN", "TRANSFER", &format!("Multi-stream download note: {e}. Falling back to single-stream pipeline..."))
                        .await;
                }
            }
        }

        self.execute_single_stream_download(item, total_size).await
    }

    async fn execute_multi_stream_download(
        &self,
        item: &TransferItem,
        total_size: u64,
    ) -> Result<(), String> {
        use tokio::fs::OpenOptions;
        use tokio::io::{AsyncReadExt, AsyncSeekExt, AsyncWriteExt};

        let sftp_client = self.sftp_manager.get_sftp_client().await?;

        // Preallocate destination file locally to prevent disk fragmentation
        {
            let std_file = std::fs::OpenOptions::new()
                .create(true)
                .write(true)
                .truncate(true)
                .open(&item.dest_path)
                .map_err(|e| format!("Failed to create local destination file: {e}"))?;
            let _ = std_file.set_len(total_size);
        }

        // 4 concurrent segments
        let num_workers: u64 = 4;
        let segment_size = (total_size + num_workers - 1) / num_workers;

        let (tx, mut rx) = tokio::sync::mpsc::channel::<(u64, Vec<u8>)>(64);
        let dest_path = item.dest_path.clone();

        // Dedicated disk writer task
        let writer_handle = tokio::spawn(async move {
            let mut file = OpenOptions::new()
                .write(true)
                .open(&dest_path)
                .await
                .map_err(|e| format!("Failed to open local destination for writing: {e}"))?;

            while let Some((offset, chunk)) = rx.recv().await {
                file.seek(SeekFrom::Start(offset))
                    .await
                    .map_err(|e| format!("Failed to seek local file: {e}"))?;
                file.write_all(&chunk)
                    .await
                    .map_err(|e| format!("Failed to write to local file: {e}"))?;
            }
            file.flush().await.map_err(|e| format!("Failed to flush local file: {e}"))?;
            Ok::<(), String>(())
        });

        let transferred_atomic = Arc::new(std::sync::atomic::AtomicU64::new(0));
        let cancel_flag = Arc::new(std::sync::atomic::AtomicBool::new(false));

        let mut worker_tasks = Vec::new();

        for worker_id in 0..num_workers {
            let start_offset = worker_id * segment_size;
            let end_offset = (start_offset + segment_size).min(total_size);
            if start_offset >= end_offset {
                continue;
            }

            let client = sftp_client.clone();
            let source_path = item.source_path.clone();
            let item_id = item.id.clone();
            let paused_flags = self.paused_or_cancelled.clone();
            let worker_tx = tx.clone();
            let transferred = transferred_atomic.clone();
            let cancel = cancel_flag.clone();

            worker_tasks.push(tokio::spawn(async move {
                let mut remote_file = client
                    .open(&source_path)
                    .await
                    .map_err(|e| format!("Worker {worker_id} failed to open file: {e}"))?;

                remote_file
                    .seek(SeekFrom::Start(start_offset))
                    .await
                    .map_err(|e| format!("Worker {worker_id} seek failed: {e}"))?;

                let mut current_offset = start_offset;
                let mut buffer = vec![0u8; CHUNK_SIZE];

                while current_offset < end_offset {
                    if cancel.load(std::sync::atomic::Ordering::Relaxed) {
                        return Err("Cancelled".to_string());
                    }

                    {
                        let flags = paused_flags.read().await;
                        if let Some(status) = flags.get(&item_id) {
                            match status {
                                TransferStatus::Paused => {
                                    cancel.store(true, std::sync::atomic::Ordering::Relaxed);
                                    return Err("Transfer paused".to_string());
                                }
                                TransferStatus::Cancelled => {
                                    cancel.store(true, std::sync::atomic::Ordering::Relaxed);
                                    return Err("Transfer cancelled".to_string());
                                }
                                _ => {}
                            }
                        }
                    }

                    let remaining = (end_offset - current_offset) as usize;
                    let to_read = remaining.min(buffer.len());

                    let bytes_read = remote_file
                        .read(&mut buffer[..to_read])
                        .await
                        .map_err(|e| format!("Worker {worker_id} read error: {e}"))?;

                    if bytes_read == 0 {
                        break; // EOF
                    }

                    let chunk = buffer[..bytes_read].to_vec();
                    if worker_tx.send((current_offset, chunk)).await.is_err() {
                        return Err("Writer channel closed".to_string());
                    }

                    current_offset += bytes_read as u64;
                    transferred.fetch_add(bytes_read as u64, std::sync::atomic::Ordering::Relaxed);
                }

                Ok::<(), String>(())
            }));
        }

        // Drop initial tx sender so receiver terminates when all workers finish
        drop(tx);

        // Progress monitor loop
        let monitor_handle = {
            let item_id = item.id.clone();
            let transfers = self.transfers.clone();
            let transferred = transferred_atomic.clone();
            let app_handle = self.app_handle.clone();
            let cancel = cancel_flag.clone();

            tokio::spawn(async move {
                let mut last_sample_time = Instant::now();
                let mut last_bytes = 0u64;

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
                    if current >= total_size {
                        break;
                    }
                }
            })
        };

        // Wait for workers
        let mut first_err = None;
        for task in worker_tasks {
            match task.await {
                Ok(Ok(())) => {}
                Ok(Err(e)) => {
                    cancel_flag.store(true, std::sync::atomic::Ordering::Relaxed);
                    if first_err.is_none() {
                        first_err = Some(e);
                    }
                }
                Err(join_err) => {
                    cancel_flag.store(true, std::sync::atomic::Ordering::Relaxed);
                    if first_err.is_none() {
                        first_err = Some(join_err.to_string());
                    }
                }
            }
        }

        cancel_flag.store(true, std::sync::atomic::Ordering::Relaxed);
        let _ = monitor_handle.await;

        let writer_res = writer_handle
            .await
            .map_err(|e| format!("Writer task join error: {e}"))??;

        if let Some(e) = first_err {
            return Err(e);
        }

        Ok(writer_res)
    }

    async fn execute_single_stream_download(
        &self,
        item: &TransferItem,
        total_size: u64,
    ) -> Result<(), String> {
        use tokio::io::{AsyncReadExt, AsyncSeekExt};
        let sftp_client = self.sftp_manager.get_sftp_client().await?;

        let mut remote_file = sftp_client
            .open(&item.source_path)
            .await
            .map_err(|e| format!("Failed to open remote file: {e}"))?;

        let local_file = std::fs::OpenOptions::new()
            .create(true)
            .write(true)
            .truncate(item.transferred_bytes == 0)
            .open(&item.dest_path)
            .map_err(|e| format!("Failed to open local destination file: {e}"))?;

        let mut buffered_local = std::io::BufWriter::with_capacity(CHUNK_SIZE, local_file);

        let mut transferred = item.transferred_bytes;
        if transferred > 0 {
            buffered_local
                .seek(SeekFrom::Start(transferred))
                .map_err(|e| format!("Failed to seek local file: {e}"))?;

            remote_file
                .seek(SeekFrom::Start(transferred))
                .await
                .map_err(|e| format!("Failed to seek remote file: {e}"))?;
        }

        let mut buffer = vec![0u8; CHUNK_SIZE];
        let mut last_sample_time = Instant::now();
        let mut bytes_since_sample = 0u64;

        loop {
            // Check pause or cancel
            {
                let flags = self.paused_or_cancelled.read().await;
                if let Some(status) = flags.get(&item.id) {
                    match status {
                        TransferStatus::Paused => return Err("Transfer paused".to_string()),
                        TransferStatus::Cancelled => return Err("Transfer cancelled".to_string()),
                        _ => {}
                    }
                }
            }

            let bytes_read = remote_file
                .read(&mut buffer)
                .await
                .map_err(|e| format!("Error reading remote file: {e}"))?;

            if bytes_read == 0 {
                break; // EOF
            }

            buffered_local
                .write_all(&buffer[..bytes_read])
                .map_err(|e| format!("Error writing local file: {e}"))?;

            transferred += bytes_read as u64;
            bytes_since_sample += bytes_read as u64;

            let elapsed = last_sample_time.elapsed();
            if elapsed >= Duration::from_millis(300) {
                let speed = ((bytes_since_sample as f64) / elapsed.as_secs_f64()) as u64;
                let remaining_bytes = total_size.saturating_sub(transferred);
                let eta = if speed > 0 {
                    Some(remaining_bytes / speed)
                } else {
                    None
                };

                {
                    let mut map = self.transfers.write().await;
                    if let Some(t) = map.get_mut(&item.id) {
                        t.transferred_bytes = transferred;
                        t.total_bytes = total_size;
                        t.speed_bytes_per_sec = speed;
                        t.eta_seconds = eta;
                        let clone = t.clone();
                        drop(map);
                        self.emit_update(&clone).await;
                    }
                }

                last_sample_time = Instant::now();
                bytes_since_sample = 0;
            }
        }

        buffered_local.flush().map_err(|e| format!("Failed to flush local file: {e}"))?;
        Ok(())
    }
}
