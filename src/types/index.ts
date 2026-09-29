export interface ConnectionProfile {
  id: string;
  name: string;
  protocol: string; // "sftp"
  host: string;
  port: number;
  username: string;
  auth_type: string; // "password" | "key"
  key_path?: string;
  remote_dir?: string;
  local_dir?: string;
  last_connected?: string;
  has_saved_password?: boolean;
}

export interface ConnectionStatus {
  connected: boolean;
  profile_id?: string;
  host?: string;
  username?: string;
  current_remote_dir: string;
  error?: string;
}

export interface TestStep {
  title: string;
  status: "success" | "failed" | "pending";
  message?: string;
}

export interface ConnectionTestResult {
  success: boolean;
  steps: TestStep[];
  error_details?: string;
}

export interface FileItem {
  name: string;
  path: string;
  is_dir: boolean;
  is_symlink: boolean;
  size: number;
  modified?: number; // unix timestamp in seconds
  permissions?: string;
  owner?: string;
  group?: string;
  extension?: string;
}

export type TransferDirection = "Upload" | "Download";
export type TransferStatus = "Queued" | "Running" | "Paused" | "Completed" | "Failed" | "Cancelled";

export interface TransferItem {
  id: string;
  file_name: string;
  direction: TransferDirection;
  source_path: string;
  dest_path: string;
  total_bytes: number;
  transferred_bytes: number;
  speed_bytes_per_sec: number;
  eta_seconds?: number;
  status: TransferStatus;
  error?: string;
  retry_count: number;
  created_at: number;
  completed_at?: number;
}

export interface FileChunkResponse {
  content: string;
  byte_offset: number;
  chunk_size: number;
  total_size: number;
  eof: boolean;
  start_line: number;
  line_count: number;
  total_lines?: number;
}

export interface SearchMatch {
  line_number: number;
  byte_offset: number;
  line_content: string;
  match_start: number;
  match_end: number;
}

export interface SearchResult {
  query: string;
  total_matches: number;
  matches: SearchMatch[];
  duration_ms: number;
}

export interface DiffLine {
  tag: "equal" | "insert" | "delete";
  old_line_num?: number;
  new_line_num?: number;
  content: string;
}

export interface DiffResult {
  file_a: string;
  file_b: string;
  lines: DiffLine[];
  additions: number;
  deletions: number;
  unchanged: number;
}

export interface XmlElementStat {
  name: string;
  count: number;
}

export interface XmlAttributeStat {
  name: string;
  count: number;
}

export interface XmlValueStat {
  value: string;
  count: number;
  percentage: number;
}

export interface XmlAnalysisResult {
  total_elements: number;
  unique_element_names: number;
  top_elements: XmlElementStat[];
  top_attributes: XmlAttributeStat[];
  element_value_frequencies?: Record<string, XmlValueStat[]>;
  is_valid: boolean;
  error?: string;
}

export interface JsonKeyStat {
  path: string;
  count: number;
  data_type: string;
}

export interface JsonAnalysisResult {
  is_valid: boolean;
  total_keys: number;
  top_keys: JsonKeyStat[];
  array_count: number;
  object_count: number;
  error?: string;
}

export interface JobFeedAnalysisResult {
  total_jobs: number;
  unique_companies: number;
  unique_locations: number;
  jobs_with_salary: number;
  remote_jobs: number;
  duplicate_titles: number;
  top_companies: [string, number][];
  top_locations: [string, number][];
  sample_titles: string[];
}

export interface BenchmarkResult {
  task_name: string;
  duration_ms: number;
  throughput_mb_s?: number;
  details: string;
}

export interface LogEntry {
  id: string;
  timestamp: string;
  level: "INFO" | "WARN" | "ERROR" | "SUCCESS";
  category: "SFTP" | "AUTH" | "TRANSFER" | "SYSTEM";
  message: string;
}

export type ActiveTab = "files" | "editor" | "diff" | "settings";
