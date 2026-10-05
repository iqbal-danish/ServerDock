# ServerDock — High-Performance File Transfer & Large-File Workspace

> **Transfer. Inspect. Edit. Ship.**

ServerDock is a modern, high-performance developer desktop workspace that combines an ultra-fast pipelined SFTP client, multi-server session manager, dual-pane local/remote explorer, virtualized large-file streaming viewer/editor, XML/JSON validation tools, and side-by-side file diffing.

---

## Quick Start (How to Run)

### Option 1: Standalone Portable Binary (Windows)
If you just want to run ServerDock without setting up a developer environment:
1. Double-click **`ServerDock.exe`** in the root of the repository.
2. The application will launch immediately—no external dependencies or installations required.

---

### Option 2: Running from Source (Development Mode)

#### 1. Prerequisites

Ensure you have the following installed on your machine:

- **Node.js**: `v18.0.0` or later (LTS recommended) & **npm**
  - Download from: [nodejs.org](https://nodejs.org/)
- **Rust & Cargo**: Latest stable Rust toolchain (`rustc --version` >= 1.75)
  - Install via [rustup.rs](https://rustup.rs/):
    ```bash
    curl --proto '=https' --tlsv1.2 -sSf https://sh.rustup.rs | sh
    ```
    *(On Windows, download and run `rustup-init.exe`)*
- **C++ Build Tools**:
  - **Windows**: Microsoft Visual Studio C++ Build Tools (included with Visual Studio or "Desktop development with C++" workload via VS Installer).
  - **Linux (Ubuntu/Debian)**:
    ```bash
    sudo apt update
    sudo apt install build-essential curl wget libssl-dev libgtk-3-dev libwebkit2gtk-4.1-dev libappindicator3-dev librsvg2-dev
    ```
  - **macOS**: Xcode Command Line Tools:
    ```bash
    xcode-select --install
    ```
- **WebView2 (Windows)**:
  - Pre-installed by default on Windows 10 and Windows 11. If using Windows Server or older versions, download the [Evergreen Bootstrapper](https://developer.microsoft.com/en-us/microsoft-edge/webview2/).

---

#### 2. Install Frontend Dependencies

```bash
npm install
```

#### 3. Run in Development Mode

Launches the frontend Vite dev server with hot module reloading (HMR) and compiles the Tauri native Rust backend with auto-reload:

```bash
npm run tauri dev
```

---

### Option 3: Building a Release Executable

To compile a standalone, highly optimized release binary:

```bash
npx tauri build --no-bundle
```

The compiled executable will be generated at:
```text
src-tauri/target/release/serverdock.exe    # Windows
src-tauri/target/release/serverdock        # Linux / macOS
```

---

## Key Features & Architecture

- **High-Throughput Pipelined SFTP Engine (`russh` + `russh-sftp`)**:
  - **8 MB Sliding Window**: Pipelining with up to 256 in-flight requests (32 KB chunks) saturates high-speed connections (17+ MB/s) even over high-latency networks.
  - **Deep Asynchronous Disk Writer**: Dedicated blocking thread pool with a 512-chunk (16 MB) queue eliminates disk I/O bottlenecks.
  - **Integrity Verification**: Automatic byte-count verification to prevent silent truncated transfers.
  - Pure Rust async SSH handshake, password & SSH key authentication (`.pem`, OpenSSH private keys).
- **Multi-Server Concurrent Sessions**:
  - Connect to multiple remote servers simultaneously.
  - Seamlessly switch between active servers with dedicated tab navigation.
- **Controlled Remote Uploads**:
  - Interactive upload dialog with remote target folder selector, file rename options, and overwrite conflict warnings.
- **Zero-Copy Memory-Mapped Streaming (`memmap2`)**:
  - Reads, indexes, and searches multi-gigabyte (1 GB - 10 GB+) files using virtual memory page offsets. React never loads giant buffers into browser RAM.
- **Virtualized DOM (`@tanstack/react-virtual`)**:
  - Directory listings with 100,000+ files and millions of lines of text render at a smooth 60 FPS viewport.
- **Synchronized Large-File Editor**:
  - Integrated line numbers with synchronized scrolling, regex/exact search, and jump-to-line navigation.
  - Syntax formatting and validation for XML & JSON.
- **Embedded SQLite Persistence (`rusqlite`)**:
  - Connection profiles, preferences, and transfer history saved locally in `serverdock.db`.
- **OS-Level Credential Protection (`keyring`)**:
  - Passwords and SSH private key passphrases are stored in the OS Credential Manager (Windows Credential Manager / macOS Keychain / Secret Service). No plaintext secrets.
- **Native Windows Styling**:
  - Seamless dark title bar and production icons for Windows taskbar and start menu.

---

## Tech Stack

| Layer | Technology |
|---|---|
| **Desktop Shell** | Tauri 2 |
| **Native Engine** | Rust (`tokio`, `russh`, `russh-sftp`, `rusqlite`, `memmap2`, `quick-xml`, `similar`, `keyring`) |
| **Frontend** | React 19 + TypeScript + Vite |
| **Styling** | Tailwind CSS v4 |
| **State** | Zustand |
| **Icons** | Lucide React |
| **Virtualization** | `@tanstack/react-virtual` |

---

## Project Structure

```text
ServerDock/
├── ServerDock.exe                  # Pre-compiled standalone portable Windows executable
├── sample_data/                    # Sample XML, JSON feeds and diff comparison files
│   ├── jobs.xml
│   ├── jobs-production.xml
│   └── jobs.json
├── src/                            # React 19 + TypeScript UI
│   ├── components/
│   │   ├── ConnectionDialog/       # Connection manager modal with 3-step test
│   │   ├── Diff/                   # Side-by-side and unified diff comparison
│   │   ├── Editor/                 # Large-file viewer, formatter & search
│   │   ├── FileBrowser/            # Dual-pane file manager & virtualized lists
│   │   ├── Header.tsx              # Top navigation bar, session tabs & status
│   │   ├── Settings/               # Concurrency controls, diagnostics & logs
│   │   ├── Sidebar/                # Saved connection profiles & servers
│   │   └── TransferQueue/          # Bottom queue drawer with speed & ETA
│   ├── services/
│   │   └── api.ts                  # Typed Tauri IPC commands & event listeners
│   ├── stores/                     # Zustand state stores
│   └── types/                      # TypeScript definitions
└── src-tauri/                      # Rust Native Backend
    ├── src/
    │   ├── analysis/               # Streaming XML, JSON analysis
    │   ├── commands/               # Tauri IPC command handlers
    │   ├── database/               # Bundled SQLite database schema & queries
    │   ├── editor/                 # Memory-mapped line reader & diff engine
    │   ├── filesystem/             # Local file directory listing & SHA-256
    │   ├── search/                 # High-performance regex search engine
    │   ├── security/               # OS credential manager & path traversal guards
    │   ├── sftp/                   # Multi-session SSH/SFTP client manager
    │   ├── transfers/              # Pipelined transfer queue & worker engine
    │   ├── lib.rs                  # Module registration & setup
    │   └── types.rs                # Rust data models
    └── Cargo.toml
```

---

## Running Backend Tests

Run the native Rust unit test suite:

```bash
cargo test --manifest-path src-tauri/Cargo.toml --lib
```

All core engine tests pass:
- `test_format_xml`
- `test_validate_xml`
- `test_format_and_validate_json`
- `test_compare_texts`
- `test_mmap_read_lines`

---

## Repository

- **GitHub:** [https://github.com/iqbal-danish/ServerDock](https://github.com/iqbal-danish/ServerDock)

---

## License

MIT
