use std::fs::File;
use std::time::Instant;
use memmap2::MmapOptions;
use regex::RegexBuilder;
use crate::types::{SearchMatch, SearchResult};

pub struct SearchEngine;

impl SearchEngine {
    pub fn search_file(
        file_path: &str,
        query: &str,
        case_sensitive: bool,
        is_regex: bool,
        whole_word: bool,
        max_matches: usize,
    ) -> Result<SearchResult, String> {
        let start_time = Instant::now();

        if query.is_empty() {
            return Ok(SearchResult {
                query: query.to_string(),
                total_matches: 0,
                matches: Vec::new(),
                duration_ms: 0,
            });
        }

        let file = File::open(file_path).map_err(|e| format!("Failed to open file: {e}"))?;
        let metadata = file.metadata().map_err(|e| e.to_string())?;
        if metadata.len() == 0 {
            return Ok(SearchResult {
                query: query.to_string(),
                total_matches: 0,
                matches: Vec::new(),
                duration_ms: 0,
            });
        }

        let mmap = unsafe {
            MmapOptions::new()
                .map(&file)
                .map_err(|e| format!("Failed to mmap file: {e}"))?
        };

        // Build regex pattern
        let pattern_str = if is_regex {
            query.to_string()
        } else {
            let escaped = regex::escape(query);
            if whole_word {
                format!(r"\b{}\b", escaped)
            } else {
                escaped
            }
        };

        let regex = RegexBuilder::new(&pattern_str)
            .case_insensitive(!case_sensitive)
            .build()
            .map_err(|e| format!("Invalid search pattern: {e}"))?;

        let bytes = &mmap[..];
        let mut matches = Vec::new();
        let mut line_number = 1usize;
        let mut line_start = 0usize;
        let max_results = if max_matches == 0 { 1000 } else { max_matches };

        let mut i = 0;
        while i < bytes.len() {
            if bytes[i] == b'\n' || i == bytes.len() - 1 {
                let line_end = if bytes[i] == b'\n' { i } else { i + 1 };
                let line_bytes = &bytes[line_start..line_end];
                let line_str = String::from_utf8_lossy(line_bytes);

                for mat in regex.find_iter(&line_str) {
                    matches.push(SearchMatch {
                        line_number,
                        byte_offset: (line_start + mat.start()) as u64,
                        line_content: line_str.to_string(),
                        match_start: mat.start(),
                        match_end: mat.end(),
                    });

                    if matches.len() >= max_results {
                        break;
                    }
                }

                line_number += 1;
                line_start = i + 1;

                if matches.len() >= max_results {
                    break;
                }
            }
            i += 1;
        }

        let duration_ms = start_time.elapsed().as_millis() as u64;

        Ok(SearchResult {
            query: query.to_string(),
            total_matches: matches.len(),
            matches,
            duration_ms,
        })
    }
}
