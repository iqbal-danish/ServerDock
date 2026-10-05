use std::fs::File;
use std::io::Cursor;
use memmap2::MmapOptions;
use quick_xml::events::Event;
use quick_xml::reader::Reader;
use quick_xml::writer::Writer;
use similar::{ChangeTag, TextDiff};
use crate::types::{DiffLine, DiffResult, FileChunkResponse};

pub struct LargeFileEngine;

impl LargeFileEngine {
    /// Read specific lines from a file without loading the whole file into RAM.
    /// Uses memory mapping for instant seek performance.
    pub fn read_lines(
        file_path: &str,
        start_line: usize,
        line_count: usize,
    ) -> Result<FileChunkResponse, String> {
        let file = File::open(file_path).map_err(|e| format!("Failed to open file: {e}"))?;
        let metadata = file.metadata().map_err(|e| e.to_string())?;
        let total_size = metadata.len();

        if total_size == 0 {
            return Ok(FileChunkResponse {
                content: String::new(),
                byte_offset: 0,
                chunk_size: 0,
                total_size: 0,
                eof: true,
                start_line: 1,
                line_count: 0,
                total_lines: Some(0),
            });
        }

        // Memory map file (read-only)
        let mmap = unsafe {
            MmapOptions::new()
                .map(&file)
                .map_err(|e| format!("Failed to mmap file: {e}"))?
        };

        let bytes = &mmap[..];
        let mut current_line = 1usize;
        let mut start_byte_offset = 0usize;
        let mut end_byte_offset = bytes.len();
        let mut lines_found = 0usize;
        let target_start = start_line.max(1);

        // Find the start offset for target_start line
        if target_start > 1 {
            let mut line = 1usize;
            for (idx, &b) in bytes.iter().enumerate() {
                if b == b'\n' {
                    line += 1;
                    if line == target_start {
                        start_byte_offset = idx + 1;
                        break;
                    }
                }
            }
            current_line = target_start;
        }

        // Collect lines up to line_count
        let mut pos = start_byte_offset;
        while pos < bytes.len() && lines_found < line_count {
            if bytes[pos] == b'\n' {
                lines_found += 1;
                if lines_found == line_count {
                    end_byte_offset = pos + 1;
                    break;
                }
            }
            pos += 1;
        }
        if lines_found < line_count {
            end_byte_offset = bytes.len();
            lines_found += 1;
        }

        let slice = &bytes[start_byte_offset..end_byte_offset.min(bytes.len())];
        let content = String::from_utf8_lossy(slice).to_string();

        let eof = end_byte_offset >= bytes.len();

        // Count total lines (fast scan) if file size <= 50MB, else estimate
        let total_lines = if total_size <= 50 * 1024 * 1024 {
            let count = bytes.iter().filter(|&&b| b == b'\n').count() + 1;
            Some(count)
        } else {
            None
        };

        Ok(FileChunkResponse {
            content,
            byte_offset: start_byte_offset as u64,
            chunk_size: slice.len(),
            total_size,
            eof,
            start_line: current_line,
            line_count: lines_found,
            total_lines,
        })
    }

    /// Read raw byte chunk for preview/hex/raw
    pub fn read_chunk(file_path: &str, offset: u64, length: usize) -> Result<FileChunkResponse, String> {
        let file = File::open(file_path).map_err(|e| format!("Failed to open file: {e}"))?;
        let metadata = file.metadata().map_err(|e| e.to_string())?;
        let total_size = metadata.len();

        if total_size == 0 || offset >= total_size {
            return Ok(FileChunkResponse {
                content: String::new(),
                byte_offset: offset,
                chunk_size: 0,
                total_size,
                eof: true,
                start_line: 1,
                line_count: 0,
                total_lines: None,
            });
        }

        let mmap = unsafe {
            MmapOptions::new()
                .map(&file)
                .map_err(|e| format!("Failed to mmap file: {e}"))?
        };

        let start = offset as usize;
        let end = (start + length).min(mmap.len());
        let slice = &mmap[start..end];
        let content = String::from_utf8_lossy(slice).to_string();
        let eof = end >= mmap.len();

        Ok(FileChunkResponse {
            content,
            byte_offset: offset,
            chunk_size: slice.len(),
            total_size,
            eof,
            start_line: 1,
            line_count: 0,
            total_lines: None,
        })
    }

    /// Format XML with streaming indent
    pub fn format_xml(raw_xml: &str) -> Result<String, String> {
        let mut reader = Reader::from_str(raw_xml);
        reader.config_mut().trim_text(true);

        let mut writer = Writer::new_with_indent(Cursor::new(Vec::new()), b' ', 2);
        let mut buf = Vec::new();

        loop {
            match reader.read_event_into(&mut buf) {
                Ok(Event::Eof) => break,
                Ok(event) => {
                    writer
                        .write_event(event)
                        .map_err(|e| format!("Error formatting XML: {e}"))?;
                }
                Err(e) => return Err(format!("XML syntax error: {e}")),
            }
            buf.clear();
        }

        let result = writer.into_inner().into_inner();
        String::from_utf8(result).map_err(|e| format!("UTF-8 encoding error: {e}"))
    }

    /// Validate XML syntax
    pub fn validate_xml(raw_xml: &str) -> (bool, Option<String>) {
        let mut reader = Reader::from_str(raw_xml);
        reader.config_mut().check_end_names = true;
        let mut buf = Vec::new();

        loop {
            match reader.read_event_into(&mut buf) {
                Ok(Event::Eof) => break,
                Ok(_) => {}
                Err(e) => return (false, Some(format!("XML Error at position {}: {e}", reader.error_position()))),
            }
            buf.clear();
        }
        (true, None)
    }

    /// Format JSON
    pub fn format_json(raw_json: &str) -> Result<String, String> {
        let val: serde_json::Value =
            serde_json::from_str(raw_json).map_err(|e| format!("JSON syntax error: {e}"))?;
        serde_json::to_string_pretty(&val).map_err(|e| format!("Failed to serialize JSON: {e}"))
    }

    /// Validate JSON
    pub fn validate_json(raw_json: &str) -> (bool, Option<String>) {
        match serde_json::from_str::<serde_json::Value>(raw_json) {
            Ok(_) => (true, None),
            Err(e) => (false, Some(format!("Invalid JSON: {e}"))),
        }
    }

    /// Compare two files or texts and return diff hunks
    pub fn compare_texts(text_a: &str, text_b: &str, file_a_name: &str, file_b_name: &str) -> DiffResult {
        let diff = TextDiff::from_lines(text_a, text_b);
        let mut diff_lines = Vec::new();
        let mut additions = 0;
        let mut deletions = 0;
        let mut unchanged = 0;

        let mut old_idx = 1usize;
        let mut new_idx = 1usize;

        for change in diff.iter_all_changes() {
            let (tag_str, old_num, new_num) = match change.tag() {
                ChangeTag::Equal => {
                    unchanged += 1;
                    let o = old_idx;
                    let n = new_idx;
                    old_idx += 1;
                    new_idx += 1;
                    ("equal", Some(o), Some(n))
                }
                ChangeTag::Delete => {
                    deletions += 1;
                    let o = old_idx;
                    old_idx += 1;
                    ("delete", Some(o), None)
                }
                ChangeTag::Insert => {
                    additions += 1;
                    let n = new_idx;
                    new_idx += 1;
                    ("insert", None, Some(n))
                }
            };

            diff_lines.push(DiffLine {
                tag: tag_str.to_string(),
                old_line_num: old_num,
                new_line_num: new_num,
                content: change.value().trim_end_matches(&['\r', '\n'][..]).to_string(),
            });
        }

        DiffResult {
            file_a: file_a_name.to_string(),
            file_b: file_b_name.to_string(),
            lines: diff_lines,
            additions,
            deletions,
            unchanged,
        }
    }
}

#[cfg(test)]
mod tests {
    use super::*;
    use std::io::Write;

    #[test]
    fn test_format_xml() {
        let raw = "<root><child id=\"1\">test</child></root>";
        let formatted = LargeFileEngine::format_xml(raw).unwrap();
        assert!(formatted.contains("<root>"));
        assert!(formatted.contains("  <child id=\"1\">test</child>"));
    }

    #[test]
    fn test_validate_xml() {
        let valid = "<job><title>Engineer</title></job>";
        let (is_val, err) = LargeFileEngine::validate_xml(valid);
        assert!(is_val);
        assert!(err.is_none());

        let invalid = "<job><title>Engineer</job>";
        let (is_val2, err2) = LargeFileEngine::validate_xml(invalid);
        assert!(!is_val2);
        assert!(err2.is_some());
    }

    #[test]
    fn test_format_and_validate_json() {
        let valid = r#"{"name":"ServerDock","version":1}"#;
        let (is_val, _) = LargeFileEngine::validate_json(valid);
        assert!(is_val);

        let formatted = LargeFileEngine::format_json(valid).unwrap();
        assert!(formatted.contains("\n  \"name\": \"ServerDock\""));
    }

    #[test]
    fn test_compare_texts() {
        let a = "line1\nline2\nline3\n";
        let b = "line1\nmodified2\nline3\nline4\n";
        let diff = LargeFileEngine::compare_texts(a, b, "a.txt", "b.txt");
        assert_eq!(diff.unchanged, 2);
        assert_eq!(diff.deletions, 1);
        assert_eq!(diff.additions, 2);
    }

    #[test]
    fn test_mmap_read_lines() {
        let temp_dir = std::env::temp_dir();
        let path = temp_dir.join("test_read_lines.txt");
        let mut f = File::create(&path).unwrap();
        for i in 1..=50 {
            writeln!(f, "Line number {}", i).unwrap();
        }
        drop(f);

        let chunk = LargeFileEngine::read_lines(&path.to_string_lossy(), 10, 5).unwrap();
        assert_eq!(chunk.start_line, 10);
        assert_eq!(chunk.line_count, 5);
        assert!(chunk.content.contains("Line number 10"));
        assert!(chunk.content.contains("Line number 14"));

        let _ = std::fs::remove_file(path);
    }
}
