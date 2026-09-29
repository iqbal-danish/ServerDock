use std::sync::Arc;
use chrono::Local;
use tauri::{AppHandle, Emitter};
use tokio::sync::RwLock;
use uuid::Uuid;
use crate::types::LogEntry;

const MAX_LOG_HISTORY: usize = 1000;

#[derive(Clone)]
pub struct Logger {
    app_handle: AppHandle,
    entries: Arc<RwLock<Vec<LogEntry>>>,
}

impl Logger {
    pub fn new(app_handle: AppHandle) -> Self {
        Self {
            app_handle,
            entries: Arc::new(RwLock::new(Vec::new())),
        }
    }

    pub async fn log(&self, level: &str, category: &str, message: &str) {
        let timestamp = Local::now().format("%H:%M:%S").to_string();
        let entry = LogEntry {
            id: Uuid::new_v4().to_string(),
            timestamp: timestamp.clone(),
            level: level.to_uppercase(),
            category: category.to_uppercase(),
            message: message.to_string(),
        };

        println!("[{timestamp}] [{level}] [{category}] {message}");

        {
            let mut lock = self.entries.write().await;
            if lock.len() >= MAX_LOG_HISTORY {
                lock.remove(0);
            }
            lock.push(entry.clone());
        }

        // Emit to frontend in real time
        let _ = self.app_handle.emit("connection-log", &entry);
    }

    pub async fn get_logs(&self) -> Vec<LogEntry> {
        self.entries.read().await.clone()
    }

    pub async fn clear(&self) {
        self.entries.write().await.clear();
    }
}
