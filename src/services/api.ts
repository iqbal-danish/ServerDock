import { invoke } from "@tauri-apps/api/core";
import { listen, UnlistenFn } from "@tauri-apps/api/event";
import {
  ConnectionProfile,
  ConnectionStatus,
  ConnectionTestResult,
  FileItem,
  TransferItem,
  FileChunkResponse,
  SearchResult,
  DiffResult,
  XmlAnalysisResult,
  XmlValueStat,
  JsonAnalysisResult,
  JobFeedAnalysisResult,
  BenchmarkResult,
  LogEntry,
} from "../types";

export const api = {
  // Profiles & Connection
  listProfiles: () => invoke<ConnectionProfile[]>("list_profiles"),
  saveProfile: (profile: ConnectionProfile, secret?: string) =>
    invoke<void>("save_profile", { profile, secret }),
  deleteProfile: (id: string) => invoke<void>("delete_profile", { id }),
  deleteSavedPassword: (id: string) => invoke<void>("delete_saved_password", { id }),
  clearAllSavedPasswords: () => invoke<void>("clear_all_saved_passwords"),
  testSftpConnection: (
    host: string,
    port: number,
    username: string,
    authType: string,
    password?: string,
    keyPath?: string
  ) =>
    invoke<ConnectionTestResult>("test_sftp_connection", {
      host,
      port,
      username,
      authType,
      password,
      keyPath,
    }),
  connectSftp: (
    profileId?: string,
    host?: string,
    port?: number,
    username?: string,
    authType?: string,
    password?: string,
    keyPath?: string,
    remoteDir?: string
  ) =>
    invoke<string>("connect_sftp", {
      profileId,
      host,
      port,
      username,
      authType,
      password,
      keyPath,
      remoteDir,
    }),
  disconnectSftp: () => invoke<void>("disconnect_sftp"),
  exitApp: () => invoke<void>("exit_app"),
  getConnectionStatus: () => invoke<ConnectionStatus>("get_connection_status"),
  getConnectionLogs: () => invoke<LogEntry[]>("get_connection_logs"),
  clearConnectionLogs: () => invoke<void>("clear_connection_logs"),
  onConnectionLog: (callback: (entry: LogEntry) => void) =>
    listen<LogEntry>("connection-log", (e) => callback(e.payload)),

  // Filesystem (Local)
  getDefaultLocalDirectory: () => invoke<string>("get_default_local_directory"),
  listLocalDirectory: (path: string) => invoke<FileItem[]>("list_local_directory", { path }),
  createLocalDirectory: (path: string) => invoke<void>("create_local_directory", { path }),
  deleteLocalFile: (path: string) => invoke<void>("delete_local_file", { path }),
  renameLocalFile: (oldPath: string, newPath: string) =>
    invoke<void>("rename_local_file", { oldPath, newPath }),
  calculateLocalChecksum: (path: string) =>
    invoke<string>("calculate_local_checksum", { path }),

  listRemoteDirectory: (path: string, forceRefresh?: boolean) =>
    invoke<FileItem[]>("list_remote_directory", { path, forceRefresh: forceRefresh ?? false }),
  createRemoteDirectory: (path: string) =>
    invoke<void>("create_remote_directory", { path }),
  deleteRemoteFile: (path: string, isDir: boolean) =>
    invoke<void>("delete_remote_file", { path, isDir }),
  renameRemoteFile: (oldPath: string, newPath: string) =>
    invoke<void>("rename_remote_file", { oldPath, newPath }),

  // Transfers
  queueTransfer: (
    fileName: string,
    direction: "Upload" | "Download",
    sourcePath: string,
    destPath: string,
    totalBytes: number
  ) =>
    invoke<string>("queue_transfer", {
      fileName,
      direction,
      sourcePath,
      destPath,
      totalBytes,
    }),
  getTransfers: () => invoke<TransferItem[]>("get_transfers"),
  pauseTransfer: (id: string) => invoke<void>("pause_transfer", { id }),
  resumeTransfer: (id: string) => invoke<void>("resume_transfer", { id }),
  cancelTransfer: (id: string) => invoke<void>("cancel_transfer", { id }),
  retryTransfer: (id: string) => invoke<void>("retry_transfer", { id }),
  clearCompletedTransfers: () => invoke<void>("clear_completed_transfers"),
  setTransferConcurrency: (limit: number) =>
    invoke<void>("set_transfer_concurrency", { limit }),
  getTransferConcurrency: () => invoke<number>("get_transfer_concurrency"),
  getTransferHistory: (limit?: number) =>
    invoke<TransferItem[]>("get_transfer_history", { limit }),

  // Transfer Event Listener
  onTransferUpdate: (callback: (item: TransferItem) => void): Promise<UnlistenFn> => {
    return listen<TransferItem>("transfer-update", (event) => {
      callback(event.payload);
    });
  },

  // Editor & Large File
  readFileLines: (path: string, startLine: number, lineCount: number) =>
    invoke<FileChunkResponse>("read_file_lines", { path, startLine, lineCount }),
  readFileChunk: (path: string, offset: number, length: number) =>
    invoke<FileChunkResponse>("read_file_chunk", { path, offset, length }),
  readRemoteChunk: (path: string, offset: number, length: number) =>
    invoke<FileChunkResponse>("read_remote_chunk", { path, offset, length }),
  saveLocalFile: (path: string, content: string) =>
    invoke<void>("save_local_file", { path, content }),
  formatXml: (rawXml: string) => invoke<string>("format_xml", { rawXml }),
  validateXml: (rawXml: string) => invoke<[boolean, string | null]>("validate_xml", { rawXml }),
  formatJson: (rawJson: string) => invoke<string>("format_json", { rawJson }),
  validateJson: (rawJson: string) => invoke<[boolean, string | null]>("validate_json", { rawJson }),
  compareFiles: (pathA: string, pathB: string) =>
    invoke<DiffResult>("compare_files", { pathA, pathB }),

  // Search
  searchFile: (
    path: string,
    query: string,
    caseSensitive: boolean,
    isRegex: boolean,
    wholeWord: boolean,
    maxMatches: number
  ) =>
    invoke<SearchResult>("search_file", {
      path,
      query,
      caseSensitive,
      isRegex,
      wholeWord,
      maxMatches,
    }),

  // Analysis
  analyzeXmlFile: (path: string) => invoke<XmlAnalysisResult>("analyze_xml_file", { path }),
  getXmlTagValues: (path: string, tag: string, maxValues?: number) =>
    invoke<XmlValueStat[]>("get_xml_tag_values", { path, tag, maxValues }),
  analyzeJsonFile: (path: string) => invoke<JsonAnalysisResult>("analyze_json_file", { path }),
  analyzeJobFeed: (path: string) => invoke<JobFeedAnalysisResult>("analyze_job_feed", { path }),

  // Benchmarks
  runPerformanceBenchmark: (path?: string) =>
    invoke<BenchmarkResult[]>("run_performance_benchmark", { path }),
};
