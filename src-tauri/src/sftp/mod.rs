use std::collections::HashMap;
use std::sync::Arc;
use std::time::Instant;
use async_trait::async_trait;
use russh::client::{self, Handler};
use russh_keys::key::PrivateKeyWithHashAlg;
use russh_keys::PublicKey;
use russh_sftp::client::RawSftpSession;
use tokio::sync::Mutex;
use crate::types::{ConnectionTestResult, FileItem, TestStep};

struct ClientHandler;

#[async_trait]
impl Handler for ClientHandler {
    type Error = russh::Error;

    async fn check_server_key(
        &mut self,
        _server_public_key: &PublicKey,
    ) -> Result<bool, Self::Error> {
        // Accept host key in developer environment
        Ok(true)
    }
}

pub struct ActiveSftpConnection {
    pub client: Arc<RawSftpSession>,
    pub remote_path: String,
    pub profile_id: String,
    pub host: String,
    pub username: String,
}

#[derive(Clone)]
pub struct SftpManager {
    sessions: Arc<Mutex<HashMap<String, ActiveSftpConnection>>>,
    active_profile_id: Arc<Mutex<Option<String>>>,
    dir_cache: Arc<Mutex<HashMap<String, (Instant, Vec<FileItem>)>>>,
    logger: Arc<std::sync::RwLock<Option<crate::logger::Logger>>>,
}

impl SftpManager {
    pub fn new() -> Self {
        Self {
            sessions: Arc::new(Mutex::new(HashMap::new())),
            active_profile_id: Arc::new(Mutex::new(None)),
            dir_cache: Arc::new(Mutex::new(HashMap::new())),
            logger: Arc::new(std::sync::RwLock::new(None)),
        }
    }

    pub fn set_logger(&self, logger: crate::logger::Logger) {
        if let Ok(mut l) = self.logger.write() {
            *l = Some(logger);
        }
    }

    pub async fn log(&self, level: &str, category: &str, msg: &str) {
        let logger_opt = self.logger.read().ok().and_then(|l| l.clone());
        if let Some(l) = logger_opt {
            l.log(level, category, msg).await;
        } else {
            println!("[{level}] [{category}] {msg}");
        }
    }

    pub async fn is_connected(&self) -> bool {
        !self.sessions.lock().await.is_empty()
    }

    pub async fn get_current_info(&self) -> (Option<String>, Option<String>, Option<String>) {
        let active = self.active_profile_id.lock().await;
        if let Some(ref pid) = *active {
            let sessions = self.sessions.lock().await;
            if let Some(conn) = sessions.get(pid) {
                return (Some(conn.profile_id.clone()), Some(conn.host.clone()), Some(conn.username.clone()));
            }
        }
        (None, None, None)
    }

    pub async fn list_active_sessions(&self) -> Vec<crate::types::ActiveSessionInfo> {
        let sessions = self.sessions.lock().await;
        let active = self.active_profile_id.lock().await;
        let active_id = active.as_deref();

        sessions
            .values()
            .map(|conn| crate::types::ActiveSessionInfo {
                profile_id: conn.profile_id.clone(),
                host: conn.host.clone(),
                username: conn.username.clone(),
                current_remote_dir: conn.remote_path.clone(),
                is_active: active_id == Some(&conn.profile_id),
            })
            .collect()
    }

    pub async fn switch_session(&self, profile_id: &str) -> Result<String, String> {
        let sessions = self.sessions.lock().await;
        if let Some(conn) = sessions.get(profile_id) {
            let mut active = self.active_profile_id.lock().await;
            *active = Some(profile_id.to_string());
            let path = conn.remote_path.clone();
            self.log("INFO", "SFTP", &format!("Switched active session to profile '{profile_id}' at '{path}'.")).await;
            Ok(path)
        } else {
            Err(format!("No active session found for profile '{profile_id}'"))
        }
    }

    pub async fn disconnect(&self, profile_id: Option<&str>) {
        let mut sessions = self.sessions.lock().await;
        let mut active = self.active_profile_id.lock().await;

        if let Some(pid) = profile_id {
            sessions.remove(pid);
            if active.as_deref() == Some(pid) {
                *active = sessions.keys().next().cloned();
            }
            self.log("INFO", "SFTP", &format!("Disconnected session for profile '{pid}'.")).await;
        } else {
            sessions.clear();
            *active = None;
            self.log("INFO", "SFTP", "Disconnected all SFTP sessions.").await;
        }

        let mut cache = self.dir_cache.lock().await;
        if let Some(pid) = profile_id {
            cache.retain(|k, _| !k.starts_with(pid));
        } else {
            cache.clear();
        }
    }

    pub async fn clear_dir_cache(&self) {
        self.clear_dir_cache_for(None).await;
    }

    pub async fn clear_dir_cache_for(&self, profile_id: Option<&str>) {
        let mut cache = self.dir_cache.lock().await;
        if let Some(pid) = profile_id {
            cache.retain(|k, _| !k.starts_with(pid));
        } else {
            cache.clear();
        }
    }

    pub async fn get_client_and_key(&self, profile_id: Option<&str>) -> Result<(Arc<RawSftpSession>, String), String> {
        let sessions = self.sessions.lock().await;
        let active = self.active_profile_id.lock().await;

        let key = profile_id
            .or_else(|| active.as_deref())
            .ok_or("Not connected to any SFTP server")?;

        let conn = sessions.get(key).ok_or_else(|| format!("No active connection for '{key}'"))?;
        Ok((Arc::clone(&conn.client), key.to_string()))
    }

    pub async fn test_connection(
        &self,
        host: &str,
        port: u16,
        username: &str,
        auth_type: &str,
        password: Option<&str>,
        key_path: Option<&str>,
    ) -> ConnectionTestResult {
        let mut steps = Vec::new();

        self.log("INFO", "SFTP", &format!("Testing connection to {host}:{port} as user '{username}'...")).await;

        if port == 21 || port == 20 {
            self.log("WARN", "SFTP", "Port 21/20 detected: Standard unencrypted FTP runs on port 21. ServerDock connects via SFTP (SSH subsystem, default port 22). If this is an FTP server, SFTP will fail.").await;
        }

        // Step 1: Reachability & Handshake
        steps.push(TestStep {
            title: "Host reachable & SSH handshake".to_string(),
            status: "pending".to_string(),
            message: None,
        });

        let mut config = client::Config::default();
        config.inactivity_timeout = Some(std::time::Duration::from_secs(30));
        config.window_size = 8 * 1024 * 1024; // 8 MB flow control window
        config.maximum_packet_size = 65536; // 64 KB packet size
        let config = Arc::new(config);
        let handler = ClientHandler;

        let addr = format!("{}:{}", host, port);
        let mut session = match client::connect(config, &addr, handler).await {
            Ok(s) => {
                steps[0].status = "success".to_string();
                steps[0].message = Some(format!("Connected to {}:{}", host, port));
                self.log("SUCCESS", "SFTP", &format!("TCP connected to {addr}. SSH handshake successful.")).await;
                s
            }
            Err(e) => {
                steps[0].status = "failed".to_string();
                steps[0].message = Some(format!("Could not reach host: {e}"));
                self.log("ERROR", "SFTP", &format!("Connection failed to {addr}: {e}")).await;
                return ConnectionTestResult {
                    success: false,
                    steps,
                    error_details: Some(format!("TCP/SSH connect error: {e}")),
                };
            }
        };

        // Step 2: Authentication
        steps.push(TestStep {
            title: "Authentication".to_string(),
            status: "pending".to_string(),
            message: None,
        });

        self.log("INFO", "AUTH", &format!("Authenticating user '{username}' via {auth_type}...")).await;

        let auth_res = if auth_type == "key" {
            if let Some(path) = key_path {
                match russh_keys::load_secret_key(path, None) {
                    Ok(key) => {
                        match PrivateKeyWithHashAlg::new(Arc::new(key), None) {
                            Ok(key_alg) => session.authenticate_publickey(username, key_alg).await,
                            Err(e) => {
                                steps[1].status = "failed".to_string();
                                steps[1].message = Some(format!("Key configuration error: {e}"));
                                self.log("ERROR", "AUTH", &format!("Key configuration error: {e}")).await;
                                return ConnectionTestResult {
                                    success: false,
                                    steps,
                                    error_details: Some(format!("Key alg error: {e}")),
                                };
                            }
                        }
                    }
                    Err(e) => {
                        steps[1].status = "failed".to_string();
                        steps[1].message = Some(format!("Failed to load private key: {e}"));
                        self.log("ERROR", "AUTH", &format!("Failed to load private key '{path}': {e}")).await;
                        return ConnectionTestResult {
                            success: false,
                            steps,
                            error_details: Some(format!("Key file error: {e}")),
                        };
                    }
                }
            } else {
                steps[1].status = "failed".to_string();
                steps[1].message = Some("Private key path not provided".to_string());
                self.log("ERROR", "AUTH", "Private key path not provided").await;
                return ConnectionTestResult {
                    success: false,
                    steps,
                    error_details: Some("No key path".to_string()),
                };
            }
        } else {
            let pass = password.unwrap_or("");
            if pass.is_empty() {
                self.log("WARN", "AUTH", "No password provided. Testing empty password...").await;
            }
            session.authenticate_password(username, pass).await
        };

        match auth_res {
            Ok(true) => {
                steps[1].status = "success".to_string();
                steps[1].message = Some("Authentication successful".to_string());
                self.log("SUCCESS", "AUTH", &format!("Authentication accepted for user '{username}'.")).await;
            }
            Ok(false) => {
                steps[1].status = "failed".to_string();
                steps[1].message = Some("Authentication denied by server".to_string());
                self.log("ERROR", "AUTH", &format!("Server rejected credentials for user '{username}'.")).await;
                return ConnectionTestResult {
                    success: false,
                    steps,
                    error_details: Some("Server rejected credentials".to_string()),
                };
            }
            Err(e) => {
                steps[1].status = "failed".to_string();
                steps[1].message = Some(format!("Authentication error: {e}"));
                self.log("ERROR", "AUTH", &format!("Authentication protocol error: {e}")).await;
                return ConnectionTestResult {
                    success: false,
                    steps,
                    error_details: Some(format!("Auth error: {e}")),
                };
            }
        }

        // Step 3: SFTP Subsystem
        steps.push(TestStep {
            title: "SFTP connection established".to_string(),
            status: "pending".to_string(),
            message: None,
        });

        self.log("INFO", "SFTP", "Opening SSH session channel and requesting SFTP subsystem...").await;

        let channel = match session.channel_open_session().await {
            Ok(c) => c,
            Err(e) => {
                steps[2].status = "failed".to_string();
                steps[2].message = Some(format!("Failed to open SSH channel: {e}"));
                self.log("ERROR", "SFTP", &format!("Failed to open SSH channel: {e}")).await;
                return ConnectionTestResult {
                    success: false,
                    steps,
                    error_details: Some(e.to_string()),
                };
            }
        };

        if let Err(e) = channel.request_subsystem(true, "sftp").await {
            steps[2].status = "failed".to_string();
            steps[2].message = Some(format!("Failed to request SFTP subsystem: {e}"));
            self.log("ERROR", "SFTP", &format!("SFTP subsystem request failed: {e}. Check server sshd_config.")).await;
            return ConnectionTestResult {
                success: false,
                steps,
                error_details: Some(e.to_string()),
            };
        }

        let raw_sftp = RawSftpSession::new(channel.into_stream());
        match raw_sftp.init().await {
            Ok(_) => {
                let _ = raw_sftp.close_session();
                steps[2].status = "success".to_string();
                steps[2].message = Some("SFTP session established successfully".to_string());
                self.log("SUCCESS", "SFTP", "SFTP subsystem initialized successfully.").await;
                ConnectionTestResult {
                    success: true,
                    steps,
                    error_details: None,
                }
            }
            Err(e) => {
                steps[2].status = "failed".to_string();
                steps[2].message = Some(format!("SFTP protocol error: {e}"));
                self.log("ERROR", "SFTP", &format!("SFTP protocol error: {e}")).await;
                ConnectionTestResult {
                    success: false,
                    steps,
                    error_details: Some(e.to_string()),
                }
            }
        }
    }

    pub async fn connect(
        &self,
        profile_id: Option<String>,
        host: &str,
        port: u16,
        username: &str,
        auth_type: &str,
        password: Option<&str>,
        key_path: Option<&str>,
        initial_dir: Option<&str>,
    ) -> Result<String, String> {
        self.log("INFO", "SFTP", &format!("Connecting to {host}:{port} as user '{username}'...")).await;

        if port == 21 || port == 20 {
            self.log("WARN", "SFTP", "Port 21 detected: Standard unencrypted FTP runs on port 21. ServerDock connects via SFTP (SSH subsystem on port 22). If your server is FTP/FTPS, SFTP connection will fail.").await;
        }

        let mut config = client::Config::default();
        config.inactivity_timeout = None; // Never drop connection due to local inactivity
        config.window_size = 8 * 1024 * 1024; // 8 MB flow control window for maximum throughput
        config.maximum_packet_size = 65536; // 64 KB packet size
        let config = Arc::new(config);
        let handler = ClientHandler;
        let addr = format!("{}:{}", host, port);

        let mut session = match client::connect(config, &addr, handler).await {
            Ok(s) => {
                self.log("SUCCESS", "SFTP", &format!("Connected to {addr}. Negotiated SSH-2.0 transport.")).await;
                s
            }
            Err(e) => {
                let msg = format!("Failed to connect to {addr}: {e}");
                self.log("ERROR", "SFTP", &format!("{msg}. Check hostname, port, and firewall rules.")).await;
                return Err(msg);
            }
        };

        let auth_res = if auth_type == "key" {
            let path = key_path.ok_or_else(|| {
                let err = "Private key path missing".to_string();
                err
            })?;
            self.log("INFO", "AUTH", &format!("Loading private key from '{path}'...")).await;
            let key = match russh_keys::load_secret_key(path, None) {
                Ok(k) => k,
                Err(e) => {
                    let msg = format!("Failed to load private key '{path}': {e}");
                    self.log("ERROR", "AUTH", &msg).await;
                    return Err(msg);
                }
            };
            let key_alg = match PrivateKeyWithHashAlg::new(Arc::new(key), None) {
                Ok(ka) => ka,
                Err(e) => {
                    let msg = format!("Key configuration error: {e}");
                    self.log("ERROR", "AUTH", &msg).await;
                    return Err(msg);
                }
            };
            self.log("INFO", "AUTH", &format!("Authenticating with public key for user '{username}'...")).await;
            match session.authenticate_publickey(username, key_alg).await {
                Ok(res) => res,
                Err(e) => {
                    let msg = format!("Public key authentication failed: {e}");
                    self.log("ERROR", "AUTH", &msg).await;
                    return Err(msg);
                }
            }
        } else {
            let pass = password.unwrap_or("");
            if pass.is_empty() {
                self.log("WARN", "AUTH", &format!("No password supplied for user '{username}'. Attempting empty password...")).await;
            } else {
                self.log("INFO", "AUTH", &format!("Authenticating user '{username}' with password...")).await;
            }
            match session.authenticate_password(username, pass).await {
                Ok(res) => res,
                Err(e) => {
                    let msg = format!("Password authentication failed: {e}");
                    self.log("ERROR", "AUTH", &msg).await;
                    return Err(msg);
                }
            }
        };

        if !auth_res {
            let err_msg = format!("Server rejected authentication for user '{username}'. Check your password or SSH key.");
            self.log("ERROR", "AUTH", &err_msg).await;
            return Err(err_msg);
        }
        self.log("SUCCESS", "AUTH", &format!("User '{username}' authenticated successfully.")).await;

        self.log("INFO", "SFTP", "Opening SSH channel and requesting SFTP subsystem...").await;
        let channel = match session.channel_open_session().await {
            Ok(c) => c,
            Err(e) => {
                let msg = format!("Failed to open session channel: {e}");
                self.log("ERROR", "SFTP", &msg).await;
                return Err(msg);
            }
        };

        if let Err(e) = channel.request_subsystem(true, "sftp").await {
            let msg = format!("Failed to request SFTP subsystem: {e}. Check if SFTP is enabled on the server.");
            self.log("ERROR", "SFTP", &msg).await;
            return Err(msg);
        }

        let mut sftp_config = russh_sftp::client::Config::default();
        sftp_config.max_packet_len = 256 * 1024;
        sftp_config.max_concurrent_writes = 32;
        let raw_sftp = RawSftpSession::new_with_config(channel.into_stream(), sftp_config);
        let _version = match raw_sftp.init().await {
            Ok(v) => v,
            Err(e) => {
                let msg = format!("Failed to initialize SFTP client: {e}");
                self.log("ERROR", "SFTP", &msg).await;
                return Err(msg);
            }
        };

        let default_dir = initial_dir.unwrap_or(".").to_string();
        let session_key = profile_id.clone().unwrap_or_else(|| format!("{}:{}", host, port));
        let client_arc = Arc::new(raw_sftp);

        {
            let mut sessions = self.sessions.lock().await;
            sessions.insert(
                session_key.clone(),
                ActiveSftpConnection {
                    client: Arc::clone(&client_arc),
                    remote_path: default_dir.clone(),
                    profile_id: session_key.clone(),
                    host: host.to_string(),
                    username: username.to_string(),
                },
            );
        }

        {
            let mut active = self.active_profile_id.lock().await;
            *active = Some(session_key.clone());
        }

        // Spawn background keepalive heartbeat task (pings every 15s to keep connection alive when app is minimized or idle)
        let keepalive_client = Arc::clone(&client_arc);
        let keepalive_key = session_key.clone();
        let sessions_ref = Arc::clone(&self.sessions);
        let active_profile_ref = Arc::clone(&self.active_profile_id);
        let logger_ref = Arc::clone(&self.logger);

        tokio::spawn(async move {
            let mut interval = tokio::time::interval(std::time::Duration::from_secs(15));
            loop {
                interval.tick().await;

                // Stop keepalive if session has been explicitly closed or removed
                {
                    let sessions = sessions_ref.lock().await;
                    if !sessions.contains_key(&keepalive_key) {
                        break;
                    }
                }

                // Send lightweight keepalive query to server to prevent idle timeout
                if let Err(e) = keepalive_client.realpath(".").await {
                    let err_str = e.to_string();
                    if err_str.contains("closed") || err_str.contains("Broken pipe") || err_str.contains("eof") {
                        let logger_opt = logger_ref.read().ok().and_then(|l| l.clone());
                        if let Some(l) = logger_opt {
                            l.log("WARN", "SFTP", &format!("Keepalive detected disconnected session for '{keepalive_key}'. Cleaning up.")).await;
                        }
                        let mut sessions = sessions_ref.lock().await;
                        sessions.remove(&keepalive_key);
                        let mut active = active_profile_ref.lock().await;
                        if active.as_deref() == Some(&keepalive_key) {
                            *active = None;
                        }
                        break;
                    }
                }
            }
        });

        self.log("SUCCESS", "SFTP", &format!("SFTP connection established for '{session_key}'. Keepalive active. Ready at '{default_dir}'.")).await;

        Ok(default_dir)
    }

    pub async fn list_directory(&self, path: &str, profile_id: Option<&str>, force_refresh: bool) -> Result<Vec<FileItem>, String> {
        let clean_path = path.replace('\\', "/");
        let norm_path = if clean_path.is_empty() || clean_path == "." {
            "."
        } else if clean_path == "/" {
            "/"
        } else {
            let trimmed = clean_path.trim_end_matches('/');
            if trimmed.is_empty() { "/" } else { trimmed }
        };

        let (client, session_key) = self.get_client_and_key(profile_id).await?;
        let cache_key = format!("{session_key}:{norm_path}");

        // Check cache if not forcing refresh; if forcing refresh, ensure previous cache entry is dropped
        if force_refresh {
            let mut cache = self.dir_cache.lock().await;
            cache.remove(&cache_key);
        } else {
            let cache = self.dir_cache.lock().await;
            if let Some((timestamp, items)) = cache.get(&cache_key) {
                if timestamp.elapsed() < std::time::Duration::from_secs(30) {
                    return Ok(items.clone());
                }
            }
        }

        let target_dir = if norm_path == "." { "." } else { norm_path };
        let open_res = client
            .opendir(target_dir)
            .await
            .map_err(|e| format!("Failed to list remote directory {norm_path}: {e}"))?;
        let handle = open_res.handle;

        let mut raw_files = Vec::new();
        loop {
            match client.readdir(&handle).await {
                Ok(name) => {
                    raw_files.extend(name.files);
                }
                Err(russh_sftp::client::error::Error::Status(status))
                    if status.status_code == russh_sftp::protocol::StatusCode::Eof => {
                        break;
                    }
                Err(err) => {
                    let _ = client.close(&handle).await;
                    return Err(format!("Failed to readdir {norm_path}: {err}"));
                }
            }
        }
        let _ = client.close(&handle).await;

        let mut items = Vec::new();
        for entry in raw_files {
            let name = entry.filename;
            // Ignore current and parent dir aliases if returned by some SFTP servers
            if name == "." || name == ".." {
                continue;
            }

            // Always format remote SFTP paths with Unix forward slashes (never use entry.path() which uses Windows backslashes)
            let full_path = if norm_path == "." {
                name.clone()
            } else if norm_path == "/" {
                format!("/{}", name)
            } else if norm_path.ends_with('/') {
                format!("{}{}", norm_path, name)
            } else {
                format!("{}/{}", norm_path, name)
            };

            let attrs = entry.attrs;
            let is_dir = attrs.is_dir();
            let is_symlink = attrs.is_symlink();
            let size = attrs.size.unwrap_or(0);
            let modified = attrs.mtime.map(|t| t as i64);

            let extension = if !is_dir {
                std::path::Path::new(&name)
                    .extension()
                    .map(|e| e.to_string_lossy().to_string())
            } else {
                None
            };

            let permissions = attrs.permissions.map(|p| format!("{:o}", p));

            items.push(FileItem {
                name,
                path: full_path,
                is_dir,
                is_symlink,
                size,
                modified,
                permissions,
                owner: attrs.uid.map(|u| u.to_string()),
                group: attrs.gid.map(|g| g.to_string()),
                extension,
            });
        }

        // Sort: directories first, then alphabetical
        items.sort_by(|a, b| {
            if a.is_dir != b.is_dir {
                b.is_dir.cmp(&a.is_dir)
            } else {
                a.name.to_lowercase().cmp(&b.name.to_lowercase())
            }
        });

        // Cache the result
        {
            let mut cache = self.dir_cache.lock().await;
            cache.insert(cache_key, (Instant::now(), items.clone()));
        }

        // Update current remote path for session
        {
            let mut sessions = self.sessions.lock().await;
            if let Some(conn) = sessions.get_mut(&session_key) {
                conn.remote_path = norm_path.to_string();
            }
        }

        Ok(items)
    }

    pub async fn create_directory(&self, path: &str, profile_id: Option<&str>) -> Result<(), String> {
        let clean = path.replace('\\', "/");
        let (client, session_key) = self.get_client_and_key(profile_id).await?;
        client
            .mkdir(&clean, russh_sftp::protocol::FileAttributes::empty())
            .await
            .map_err(|e| format!("Failed to create remote directory {clean}: {e}"))?;
        self.clear_dir_cache_for(Some(&session_key)).await;
        Ok(())
    }

    pub async fn delete_file(&self, path: &str, is_dir: bool, profile_id: Option<&str>) -> Result<(), String> {
        let clean = path.replace('\\', "/");
        let (client, session_key) = self.get_client_and_key(profile_id).await?;
        let res = if is_dir {
            client
                .rmdir(&clean)
                .await
                .map_err(|e| format!("Failed to remove remote directory {clean}: {e}"))
        } else {
            client
                .remove(&clean)
                .await
                .map_err(|e| format!("Failed to remove remote file {clean}: {e}"))
        };
        self.clear_dir_cache_for(Some(&session_key)).await;
        res.map(|_| ())
    }

    pub async fn rename(&self, old_path: &str, new_path: &str, profile_id: Option<&str>) -> Result<(), String> {
        let clean_old = old_path.replace('\\', "/");
        let clean_new = new_path.replace('\\', "/");
        let (client, session_key) = self.get_client_and_key(profile_id).await?;
        let res = client
            .rename(&clean_old, &clean_new)
            .await
            .map_err(|e| format!("Failed to rename remote file: {e}"));
        self.clear_dir_cache_for(Some(&session_key)).await;
        res.map(|_| ())
    }

    pub async fn read_file_chunk(&self, path: &str, offset: u64, length: usize, profile_id: Option<&str>) -> Result<Vec<u8>, String> {
        let clean = path.replace('\\', "/");
        let (client, _) = self.get_client_and_key(profile_id).await?;

        let handle_pkt = client
            .open(&clean, russh_sftp::protocol::OpenFlags::READ, russh_sftp::protocol::FileAttributes::empty())
            .await
            .map_err(|e| format!("Failed to open remote file {clean}: {e}"))?;

        let data_pkt = client
            .read(&handle_pkt.handle, offset, length as u32)
            .await
            .map_err(|e| format!("Failed to read remote chunk: {e}"))?;

        let _ = client.close(handle_pkt.handle).await;
        Ok(data_pkt.data.to_vec())
    }

    pub async fn get_sftp_client(&self) -> Result<Arc<RawSftpSession>, String> {
        self.get_sftp_client_for(None).await
    }

    pub async fn get_sftp_client_for(&self, profile_id: Option<&str>) -> Result<Arc<RawSftpSession>, String> {
        let (client, _) = self.get_client_and_key(profile_id).await?;
        Ok(client)
    }
}
