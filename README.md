# ByteFlow — High-Performance File Transfer & Large-File Workspace

> **Transfer. Inspect. Edit. Ship.**

ByteFlow is a modern, high-performance developer desktop workspace that combines an SFTP file transfer client, dual-pane local/remote manager, virtualized large-file streaming viewer/editor, XML/JSON developer tools, side-by-side file diffing, and job-feed analytics.

---

## Key Differentiators & Architecture

- **Zero-Copy Memory-Mapped Streaming (`memmap2`)**: Reads, indexes, and searches multi-gigabyte (1GB - 10GB+) files using virtual memory page offsets. React never loads large buffers into browser memory.
- **Virtualized DOM (`@tanstack/react-virtual`)**: Directory listings with 100,000+ files and millions of lines of text render with a smooth 60 FPS viewport.
- **Asynchronous Rust SFTP Engine (`russh` + `russh-sftp`)**: Pure Rust asynchronous SSH handshake, password and SSH private key authentication, channel streaming, directory scanning, and chunked uploads/downloads.
- **Dedicated Transfer Engine**:
  - Configurable concurrency limit (1 to 10 simultaneous transfers)
  - Byte-level chunked streaming (128 KB blocks)
  - Real-time rolling speed estimation (MB/s) and ETA countdowns
  - Pause, resume, cancel, retry, and clear completed transfers
- **Embedded SQLite Persistence (`rusqlite`)**:
  - Connection profiles
  - Transfer history log
  - User preferences
- **OS-Level Credential Protection (`keyring`)**:
  - Passwords and SSH private key passphrases are stored in the Operating System's secure credential manager (Windows Credential Manager / macOS Keychain / Secret Service).
  - No passwords or private keys are ever stored in plaintext or logged.
- **Developer Tools**:
  - **XML / JSON Editor**: Streaming syntax indentation and validation via `quick-xml`.
  - **Large File Search**: Regex, whole-word, and case-sensitive search over memory-mapped chunks with line jump navigation.
  - **File Diff Engine**: Line-by-line comparison using `similar` with addition/deletion/unchanged statistics.
  - **Job Feed Analyzer**: Real-time extraction of total jobs, unique companies, locations, salary detection, remote job flags, and duplicate titles.
  - **Live Diagnostics & Benchmarks**: Real-time throughput (MB/s) testing for chunk reads, regex scans, and line indexing.

---

## Tech Stack

| Layer | Technology |
|---|---|
| **Desktop Shell** | Tauri 2 |
| **Native Engine** | Rust 1.98 (`tokio`, `russh`, `russh-sftp`, `rusqlite`, `memmap2`, `quick-xml`, `similar`, `keyring`) |
| **Frontend** | React 19 + TypeScript + Vite |
| **Styling** | Tailwind CSS v4 (Modern developer dark mode) |
| **State** | Zustand |
| **Icons** | Lucide React |
| **Virtualization** | `@tanstack/react-virtual` |

---

## Directory Structure

```text
ByteFlow/
├── sample_data/                    # Sample XML, JSON feeds and diff comparison files
│   ├── jobs.xml
│   ├── jobs-production.xml
│   └── jobs.json
├── src/                            # React 19 + TypeScript UI
│   ├── components/
│   │   ├── Analysis/               # XML, JSON & Job Feed analyzers
│   │   ├── Benchmark/              # Live throughput & memory benchmarks
│   │   ├── ConnectionDialog/       # Add/Edit Connection modal with 3-step test
│   │   ├── Diff/                   # Side-by-side and unified diff comparison
│   │   ├── Editor/                 # Large-file viewer, formatter & search
│   │   ├── FileBrowser/            # Dual-pane file manager & virtualized lists
│   │   ├── Header.tsx              # Top navigation tabs & status pill
│   │   ├── Settings/               # Concurrency controls, diagnostics & logs
│   │   ├── Sidebar/                # Persistent connection profiles sidebar
│   │   └── TransferQueue/          # Bottom queue drawer with progress & speed
│   ├── services/
│   │   └── api.ts                  # Typed Tauri IPC commands & event listeners
│   ├── stores/                     # Lightweight Zustand stores
│   └── types/                      # TypeScript data definitions
└── src-tauri/                      # Rust Native Backend
    ├── src/
    │   ├── analysis/               # Streaming XML, JSON & Job Feed analysis
    │   ├── commands/               # Tauri IPC handlers
    │   ├── database/               # Bundled SQLite database schema & queries
    │   ├── editor/                 # Memory-mapped line reader & diff engine
    │   ├── filesystem/             # Local file directory listing & SHA-256
    │   ├── search/                 # High-performance regex search engine
    │   ├── security/               # OS credential manager & path traversal guards
    │   ├── sftp/                   # Russh async SSH/SFTP client manager
    │   ├── transfers/              # Background transfer queue & worker engine
    │   ├── lib.rs                  # Module registration & setup
    │   └── types.rs                # Rust data models
    └── Cargo.toml
```

---

## Development & Testing

### Run Backend Unit Tests

```bash
cargo test --lib
```

All 5 core engine tests pass in `< 0.02s`:
- `test_format_xml`
- `test_validate_xml`
- `test_format_and_validate_json`
- `test_compare_texts`
- `test_mmap_read_lines`

### Run Frontend Build

```bash
npm run build
```

### Launch Desktop Application in Dev Mode

```bash
npm run tauri dev
```
