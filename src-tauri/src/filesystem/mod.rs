use std::fs::{self, File};
use std::path::Path;
use std::time::UNIX_EPOCH;
use sha2::{Digest, Sha256};
use crate::types::FileItem;

pub struct LocalFilesystem;

impl LocalFilesystem {
    pub fn get_default_directory() -> String {
        dirs::home_dir()
            .map(|p| p.to_string_lossy().to_string())
            .unwrap_or_else(|| ".".to_string())
    }

    pub fn list_directory(dir_path: &str) -> Result<Vec<FileItem>, String> {
        let path = Path::new(dir_path);
        if !path.exists() {
            return Err(format!("Directory does not exist: {}", dir_path));
        }
        if !path.is_dir() {
            return Err(format!("Path is not a directory: {}", dir_path));
        }

        let entries = fs::read_dir(path).map_err(|e| format!("Failed to read directory: {e}"))?;
        let mut items = Vec::new();

        for entry_res in entries {
            let entry = match entry_res {
                Ok(e) => e,
                Err(_) => continue,
            };

            let file_name = entry.file_name().to_string_lossy().to_string();
            let full_path = entry.path().to_string_lossy().to_string();
            let metadata = match entry.metadata() {
                Ok(m) => m,
                Err(_) => continue,
            };

            let is_dir = metadata.is_dir();
            let is_symlink = metadata.is_symlink();
            let size = if is_dir { 0 } else { metadata.len() };

            let modified = metadata
                .modified()
                .ok()
                .and_then(|t| t.duration_since(UNIX_EPOCH).ok())
                .map(|d| d.as_secs() as i64);

            let extension = if !is_dir {
                entry.path().extension().map(|e| e.to_string_lossy().to_string())
            } else {
                None
            };

            let permissions = Some(format!("{:?}", metadata.permissions()));

            items.push(FileItem {
                name: file_name,
                path: full_path,
                is_dir,
                is_symlink,
                size,
                modified,
                permissions,
                owner: None,
                group: None,
                extension,
            });
        }

        // Sort: directories first, then alphabetical by name
        items.sort_by(|a, b| {
            if a.is_dir != b.is_dir {
                b.is_dir.cmp(&a.is_dir)
            } else {
                a.name.to_lowercase().cmp(&b.name.to_lowercase())
            }
        });

        Ok(items)
    }

    pub fn create_directory(path: &str) -> Result<(), String> {
        fs::create_dir_all(path).map_err(|e| format!("Failed to create directory: {e}"))
    }

    pub fn delete_file(path: &str) -> Result<(), String> {
        let p = Path::new(path);
        if p.is_dir() {
            fs::remove_dir_all(p).map_err(|e| format!("Failed to remove directory: {e}"))
        } else {
            fs::remove_file(p).map_err(|e| format!("Failed to remove file: {e}"))
        }
    }

    pub fn rename_file(old_path: &str, new_path: &str) -> Result<(), String> {
        fs::rename(old_path, new_path).map_err(|e| format!("Failed to rename: {e}"))
    }

    pub fn calculate_sha256(path: &str) -> Result<String, String> {
        let mut file = File::open(path).map_err(|e| format!("Failed to open file: {e}"))?;
        let mut hasher = Sha256::new();
        std::io::copy(&mut file, &mut hasher).map_err(|e| format!("Failed to read file for hash: {e}"))?;
        let hash = hasher.finalize();
        Ok(hex::encode(hash))
    }

    pub fn read_bytes_chunk(path: &str, offset: u64, length: usize) -> Result<Vec<u8>, String> {
        use std::io::{Read, Seek, SeekFrom};
        let mut file = File::open(path).map_err(|e| format!("Failed to open file: {e}"))?;
        file.seek(SeekFrom::Start(offset)).map_err(|e| format!("Failed to seek file: {e}"))?;
        let mut buffer = vec![0u8; length];
        let bytes_read = file.read(&mut buffer).map_err(|e| format!("Failed to read chunk: {e}"))?;
        buffer.truncate(bytes_read);
        Ok(buffer)
    }

    pub fn write_file_content(path: &str, content: &[u8]) -> Result<(), String> {
        fs::write(path, content).map_err(|e| format!("Failed to write file: {e}"))
    }
}
