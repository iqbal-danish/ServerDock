use std::path::PathBuf;
use std::sync::{Arc, Mutex};
use rusqlite::{params, Connection};
use crate::types::{ConnectionProfile, TransferItem, TransferDirection, TransferStatus};

#[derive(Clone)]
pub struct Database {
    conn: Arc<Mutex<Connection>>,
}

impl Database {
    pub fn new(app_data_dir: PathBuf) -> Result<Self, String> {
        std::fs::create_dir_all(&app_data_dir).map_err(|e| e.to_string())?;
        let legacy_db = app_data_dir.join("byteflow.db");
        let db_path = app_data_dir.join("serverdock.db");

        let legacy_bundle_db = app_data_dir
            .parent()
            .map(|p| p.join("com.byteflow.app").join("byteflow.db"));

        if !db_path.exists() {
            if legacy_db.exists() {
                let _ = std::fs::copy(&legacy_db, &db_path);
            } else if let Some(ref legacy) = legacy_bundle_db {
                if legacy.exists() {
                    let _ = std::fs::copy(legacy, &db_path);
                }
            }
        }
        let conn = Connection::open(&db_path).map_err(|e| format!("Failed to open SQLite database: {e}"))?;

        // Initialize schema
        conn.execute_batch(
            "
            CREATE TABLE IF NOT EXISTS connections (
                id TEXT PRIMARY KEY,
                name TEXT NOT NULL,
                protocol TEXT NOT NULL,
                host TEXT NOT NULL,
                port INTEGER NOT NULL,
                username TEXT NOT NULL,
                auth_type TEXT NOT NULL,
                key_path TEXT,
                remote_dir TEXT,
                local_dir TEXT,
                last_connected TEXT
            );

            CREATE TABLE IF NOT EXISTS transfer_history (
                id TEXT PRIMARY KEY,
                file_name TEXT NOT NULL,
                direction TEXT NOT NULL,
                source_path TEXT NOT NULL,
                dest_path TEXT NOT NULL,
                total_bytes INTEGER NOT NULL,
                transferred_bytes INTEGER NOT NULL,
                status TEXT NOT NULL,
                error TEXT,
                created_at INTEGER NOT NULL,
                completed_at INTEGER
            );

            CREATE TABLE IF NOT EXISTS preferences (
                key TEXT PRIMARY KEY,
                value TEXT NOT NULL
            );

            CREATE TABLE IF NOT EXISTS recent_locations (
                id INTEGER PRIMARY KEY AUTOINCREMENT,
                is_remote INTEGER NOT NULL,
                path TEXT NOT NULL,
                last_visited INTEGER NOT NULL
            );
            ",
        )
        .map_err(|e| format!("Failed to initialize database schema: {e}"))?;

        // Fallback: If connections table is empty, check legacy sources and import
        let count: i64 = conn
            .query_row("SELECT COUNT(*) FROM connections", [], |row| row.get(0))
            .unwrap_or(0);
        if count == 0 {
            let mut candidates = Vec::new();
            if legacy_db.exists() {
                candidates.push(legacy_db);
            }
            if let Some(legacy) = legacy_bundle_db {
                if legacy.exists() {
                    candidates.push(legacy);
                }
            }
            for candidate in candidates {
                if candidate != db_path {
                    let path_str = candidate.to_string_lossy().replace('\'', "''");
                    if conn.execute(&format!("ATTACH DATABASE '{path_str}' AS legacy_db"), []).is_ok() {
                        let _ = conn.execute(
                            "INSERT OR IGNORE INTO connections SELECT * FROM legacy_db.connections",
                            [],
                        );
                        let _ = conn.execute(
                            "INSERT OR IGNORE INTO transfer_history SELECT * FROM legacy_db.transfer_history",
                            [],
                        );
                        let _ = conn.execute("DETACH DATABASE legacy_db", []);
                        break;
                    }
                }
            }
        }

        Ok(Self {
            conn: Arc::new(Mutex::new(conn)),
        })
    }

    pub fn list_profiles(&self) -> Result<Vec<ConnectionProfile>, String> {
        let conn = self.conn.lock().map_err(|e| e.to_string())?;
        let mut stmt = conn
            .prepare("SELECT id, name, protocol, host, port, username, auth_type, key_path, remote_dir, local_dir, last_connected FROM connections ORDER BY name ASC")
            .map_err(|e| e.to_string())?;

        let rows = stmt
            .query_map([], |row| {
                Ok(ConnectionProfile {
                    id: row.get(0)?,
                    name: row.get(1)?,
                    protocol: row.get(2)?,
                    host: row.get(3)?,
                    port: row.get(4)?,
                    username: row.get(5)?,
                    auth_type: row.get(6)?,
                    key_path: row.get(7)?,
                    remote_dir: row.get(8)?,
                    local_dir: row.get(9)?,
                    last_connected: row.get(10)?,
                    has_saved_password: None,
                })
            })
            .map_err(|e| e.to_string())?;

        let mut list = Vec::new();
        for r in rows {
            if let Ok(item) = r {
                list.push(item);
            }
        }
        Ok(list)
    }

    pub fn save_profile(&self, profile: &ConnectionProfile) -> Result<(), String> {
        let conn = self.conn.lock().map_err(|e| e.to_string())?;
        conn.execute(
            "INSERT INTO connections (id, name, protocol, host, port, username, auth_type, key_path, remote_dir, local_dir, last_connected)
             VALUES (?1, ?2, ?3, ?4, ?5, ?6, ?7, ?8, ?9, ?10, ?11)
             ON CONFLICT(id) DO UPDATE SET
                name = excluded.name,
                protocol = excluded.protocol,
                host = excluded.host,
                port = excluded.port,
                username = excluded.username,
                auth_type = excluded.auth_type,
                key_path = excluded.key_path,
                remote_dir = excluded.remote_dir,
                local_dir = excluded.local_dir,
                last_connected = excluded.last_connected",
            params![
                profile.id,
                profile.name,
                profile.protocol,
                profile.host,
                profile.port,
                profile.username,
                profile.auth_type,
                profile.key_path,
                profile.remote_dir,
                profile.local_dir,
                profile.last_connected,
            ],
        )
        .map_err(|e| e.to_string())?;
        Ok(())
    }

    pub fn delete_profile(&self, id: &str) -> Result<(), String> {
        let conn = self.conn.lock().map_err(|e| e.to_string())?;
        conn.execute("DELETE FROM connections WHERE id = ?1", params![id])
            .map_err(|e| e.to_string())?;
        Ok(())
    }

    pub fn save_transfer_history(&self, item: &TransferItem) -> Result<(), String> {
        let conn = self.conn.lock().map_err(|e| e.to_string())?;
        let dir_str = match item.direction {
            TransferDirection::Upload => "Upload",
            TransferDirection::Download => "Download",
        };
        let status_str = match item.status {
            TransferStatus::Queued => "Queued",
            TransferStatus::Running => "Running",
            TransferStatus::Paused => "Paused",
            TransferStatus::Completed => "Completed",
            TransferStatus::Failed => "Failed",
            TransferStatus::Cancelled => "Cancelled",
        };

        conn.execute(
            "INSERT INTO transfer_history (id, file_name, direction, source_path, dest_path, total_bytes, transferred_bytes, status, error, created_at, completed_at)
             VALUES (?1, ?2, ?3, ?4, ?5, ?6, ?7, ?8, ?9, ?10, ?11)
             ON CONFLICT(id) DO UPDATE SET
                transferred_bytes = excluded.transferred_bytes,
                status = excluded.status,
                error = excluded.error,
                completed_at = excluded.completed_at",
            params![
                item.id,
                item.file_name,
                dir_str,
                item.source_path,
                item.dest_path,
                item.total_bytes,
                item.transferred_bytes,
                status_str,
                item.error,
                item.created_at,
                item.completed_at,
            ],
        )
        .map_err(|e| e.to_string())?;
        Ok(())
    }

    pub fn get_transfer_history(&self, limit: usize) -> Result<Vec<TransferItem>, String> {
        let conn = self.conn.lock().map_err(|e| e.to_string())?;
        let mut stmt = conn
            .prepare("SELECT id, file_name, direction, source_path, dest_path, total_bytes, transferred_bytes, status, error, created_at, completed_at FROM transfer_history ORDER BY created_at DESC LIMIT ?1")
            .map_err(|e| e.to_string())?;

        let rows = stmt
            .query_map(params![limit as i64], |row| {
                let dir_str: String = row.get(2)?;
                let status_str: String = row.get(7)?;
                let direction = if dir_str == "Upload" {
                    TransferDirection::Upload
                } else {
                    TransferDirection::Download
                };
                let status = match status_str.as_str() {
                    "Running" => TransferStatus::Running,
                    "Paused" => TransferStatus::Paused,
                    "Completed" => TransferStatus::Completed,
                    "Failed" => TransferStatus::Failed,
                    "Cancelled" => TransferStatus::Cancelled,
                    _ => TransferStatus::Queued,
                };

                Ok(TransferItem {
                    id: row.get(0)?,
                    file_name: row.get(1)?,
                    direction,
                    source_path: row.get(3)?,
                    dest_path: row.get(4)?,
                    total_bytes: row.get(5)?,
                    transferred_bytes: row.get(6)?,
                    speed_bytes_per_sec: 0,
                    eta_seconds: None,
                    status,
                    error: row.get(8)?,
                    retry_count: 0,
                    created_at: row.get(9)?,
                    completed_at: row.get(10)?,
                })
            })
            .map_err(|e| e.to_string())?;

        let mut list = Vec::new();
        for r in rows {
            if let Ok(item) = r {
                list.push(item);
            }
        }
        Ok(list)
    }

    pub fn get_preference(&self, key: &str) -> Result<Option<String>, String> {
        let conn = self.conn.lock().map_err(|e| e.to_string())?;
        let mut stmt = conn
            .prepare("SELECT value FROM preferences WHERE key = ?1")
            .map_err(|e| e.to_string())?;
        let mut rows = stmt.query(params![key]).map_err(|e| e.to_string())?;
        if let Some(row) = rows.next().map_err(|e| e.to_string())? {
            Ok(Some(row.get(0).map_err(|e| e.to_string())?))
        } else {
            Ok(None)
        }
    }

    pub fn set_preference(&self, key: &str, value: &str) -> Result<(), String> {
        let conn = self.conn.lock().map_err(|e| e.to_string())?;
        conn.execute(
            "INSERT INTO preferences (key, value) VALUES (?1, ?2) ON CONFLICT(key) DO UPDATE SET value = excluded.value",
            params![key, value],
        )
        .map_err(|e| e.to_string())?;
        Ok(())
    }
}
