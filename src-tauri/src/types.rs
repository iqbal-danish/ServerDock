use serde::{Deserialize, Serialize};

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct ConnectionProfile {
    pub id: String,
    pub name: String,
    pub protocol: String, // "sftp", future: "ftp", "ftps"
    pub host: String,
    pub port: u16,
    pub username: String,
    pub auth_type: String, // "password" or "key"
    pub key_path: Option<String>,
    pub remote_dir: Option<String>,
    pub local_dir: Option<String>,
    pub last_connected: Option<String>,
    #[serde(default)]
    pub has_saved_password: Option<bool>,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct ConnectionStatus {
    pub connected: bool,
    pub profile_id: Option<String>,
    pub host: Option<String>,
    pub username: Option<String>,
    pub current_remote_dir: String,
    pub error: Option<String>,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct ActiveSessionInfo {
    pub profile_id: String,
    pub host: String,
    pub username: String,
    pub current_remote_dir: String,
    pub is_active: bool,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct ConnectionTestResult {
    pub success: bool,
    pub steps: Vec<TestStep>,
    pub error_details: Option<String>,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct TestStep {
    pub title: String,
    pub status: String, // "success", "failed", "pending"
    pub message: Option<String>,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct FileItem {
    pub name: String,
    pub path: String,
    pub is_dir: bool,
    pub is_symlink: bool,
    pub size: u64,
    pub modified: Option<i64>, // Unix timestamp in seconds
    pub permissions: Option<String>,
    pub owner: Option<String>,
    pub group: Option<String>,
    pub extension: Option<String>,
}

#[derive(Debug, Clone, Serialize, Deserialize, PartialEq, Eq)]
pub enum TransferDirection {
    Upload,
    Download,
}

#[derive(Debug, Clone, Serialize, Deserialize, PartialEq, Eq)]
pub enum TransferStatus {
    Queued,
    Running,
    Paused,
    Completed,
    Failed,
    Cancelled,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct TransferItem {
    pub id: String,
    pub file_name: String,
    pub direction: TransferDirection,
    pub source_path: String,
    pub dest_path: String,
    pub total_bytes: u64,
    pub transferred_bytes: u64,
    pub speed_bytes_per_sec: u64,
    pub eta_seconds: Option<u64>,
    pub status: TransferStatus,
    pub error: Option<String>,
    pub retry_count: u32,
    pub created_at: i64,
    pub completed_at: Option<i64>,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct FileChunkResponse {
    pub content: String,
    pub byte_offset: u64,
    pub chunk_size: usize,
    pub total_size: u64,
    pub eof: bool,
    pub start_line: usize,
    pub line_count: usize,
    pub total_lines: Option<usize>,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct SearchMatch {
    pub line_number: usize,
    pub byte_offset: u64,
    pub line_content: String,
    pub match_start: usize,
    pub match_end: usize,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct SearchResult {
    pub query: String,
    pub total_matches: usize,
    pub matches: Vec<SearchMatch>,
    pub duration_ms: u64,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct DiffLine {
    pub tag: String, // "equal", "insert", "delete"
    pub old_line_num: Option<usize>,
    pub new_line_num: Option<usize>,
    pub content: String,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct DiffResult {
    pub file_a: String,
    pub file_b: String,
    pub lines: Vec<DiffLine>,
    pub additions: usize,
    pub deletions: usize,
    pub unchanged: usize,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct XmlElementStat {
    pub name: String,
    pub count: usize,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct XmlAttributeStat {
    pub name: String,
    pub count: usize,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct XmlValueStat {
    pub value: String,
    pub count: usize,
    pub percentage: f64,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct XmlAnalysisResult {
    pub total_elements: usize,
    pub unique_element_names: usize,
    pub top_elements: Vec<XmlElementStat>,
    pub top_attributes: Vec<XmlAttributeStat>,
    #[serde(default)]
    pub element_value_frequencies: std::collections::HashMap<String, Vec<XmlValueStat>>,
    pub is_valid: bool,
    pub error: Option<String>,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct JsonKeyStat {
    pub path: String,
    pub count: usize,
    pub data_type: String,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct JsonAnalysisResult {
    pub is_valid: bool,
    pub total_keys: usize,
    pub top_keys: Vec<JsonKeyStat>,
    pub array_count: usize,
    pub object_count: usize,
    pub error: Option<String>,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct JobFeedAnalysisResult {
    pub total_jobs: usize,
    pub unique_companies: usize,
    pub unique_locations: usize,
    pub jobs_with_salary: usize,
    pub remote_jobs: usize,
    pub duplicate_titles: usize,
    pub top_companies: Vec<(String, usize)>,
    pub top_locations: Vec<(String, usize)>,
    pub sample_titles: Vec<String>,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct BenchmarkResult {
    pub task_name: String,
    pub duration_ms: u64,
    pub throughput_mb_s: Option<f64>,
    pub details: String,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct LogEntry {
    pub id: String,
    pub timestamp: String,
    pub level: String,      // "INFO", "WARN", "ERROR", "SUCCESS"
    pub category: String,   // "SFTP", "AUTH", "TRANSFER", "SYSTEM"
    pub message: String,
}
