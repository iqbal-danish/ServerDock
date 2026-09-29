use std::collections::HashMap;
use std::fs::File;
use std::io::BufReader;
use quick_xml::events::Event;
use quick_xml::reader::Reader;
use crate::types::{
    JobFeedAnalysisResult, JsonAnalysisResult, JsonKeyStat, XmlAnalysisResult, XmlAttributeStat,
    XmlElementStat, XmlValueStat,
};

pub struct DeveloperAnalyzer;

fn resolve_and_open_file(file_path: &str) -> Result<File, String> {
    let clean = file_path.trim().trim_matches('"').trim_matches('\'');
    let path = std::path::Path::new(clean);

    if let Ok(f) = File::open(path) {
        return Ok(f);
    }

    if path.is_relative() {
        if let Ok(cur) = std::env::current_dir() {
            let joined = cur.join(clean);
            if let Ok(f) = File::open(&joined) {
                return Ok(f);
            }
        }
        if let Ok(exe) = std::env::current_exe() {
            if let Some(parent) = exe.parent() {
                let joined = parent.join(clean);
                if let Ok(f) = File::open(&joined) {
                    return Ok(f);
                }
            }
        }
    }

    File::open(path).map_err(|e| format!("Could not open file '{clean}': {e}"))
}

impl DeveloperAnalyzer {
    pub fn analyze_xml_file(file_path: &str) -> XmlAnalysisResult {
        let file = match resolve_and_open_file(file_path) {
            Ok(f) => f,
            Err(e) => {
                return XmlAnalysisResult {
                    total_elements: 0,
                    unique_element_names: 0,
                    top_elements: Vec::new(),
                    top_attributes: Vec::new(),
                    element_value_frequencies: HashMap::new(),
                    is_valid: false,
                    error: Some(e),
                }
            }
        };

        let mut reader = Reader::from_reader(BufReader::new(file));
        reader.config_mut().trim_text(true);

        let mut element_counts: HashMap<String, usize> = HashMap::new();
        let mut attribute_counts: HashMap<String, usize> = HashMap::new();
        let mut element_value_counts: HashMap<String, HashMap<String, usize>> = HashMap::new();
        let mut total_elements = 0;
        let mut buf = Vec::new();
        let mut error = None;
        let mut is_valid = true;

        let mut current_open_tag: Option<String> = None;
        let mut current_text = String::new();

        loop {
            match reader.read_event_into(&mut buf) {
                Ok(Event::Start(ref e)) => {
                    total_elements += 1;
                    let raw_name = String::from_utf8_lossy(e.name().as_ref()).to_string();
                    let name = raw_name.trim_matches(|c| c == '<' || c == '>').to_string();
                    *element_counts.entry(name.clone()).or_insert(0) += 1;

                    for attr in e.attributes().flatten() {
                        let raw_attr = String::from_utf8_lossy(attr.key.as_ref()).to_string();
                        let attr_name = raw_attr.trim_matches(|c| c == '<' || c == '>').to_string();
                        *attribute_counts.entry(attr_name).or_insert(0) += 1;
                    }

                    current_open_tag = Some(name);
                    current_text.clear();
                }
                Ok(Event::Empty(ref e)) => {
                    total_elements += 1;
                    let raw_name = String::from_utf8_lossy(e.name().as_ref()).to_string();
                    let name = raw_name.trim_matches(|c| c == '<' || c == '>').to_string();
                    *element_counts.entry(name.clone()).or_insert(0) += 1;

                    for attr in e.attributes().flatten() {
                        let raw_attr = String::from_utf8_lossy(attr.key.as_ref()).to_string();
                        let attr_name = raw_attr.trim_matches(|c| c == '<' || c == '>').to_string();
                        *attribute_counts.entry(attr_name).or_insert(0) += 1;
                    }

                    current_open_tag = None;
                    current_text.clear();
                }
                Ok(Event::Text(ref e)) => {
                    if current_open_tag.is_some() {
                        if let Ok(t) = e.unescape() {
                            current_text.push_str(t.trim());
                        }
                    }
                }
                Ok(Event::CData(ref e)) => {
                    if current_open_tag.is_some() {
                        let text = String::from_utf8_lossy(e.as_ref());
                        current_text.push_str(text.trim());
                    }
                }
                Ok(Event::End(ref e)) => {
                    let raw_name = String::from_utf8_lossy(e.name().as_ref()).to_string();
                    let name = raw_name.trim_matches(|c| c == '<' || c == '>').to_string();

                    if let Some(ref open_tag) = current_open_tag {
                        if open_tag == &name {
                            let val = current_text.trim();
                            // Collect categorical values (<= 250 characters) to avoid huge HTML bloat
                            if val.len() <= 250 {
                                let display_val = if val.is_empty() {
                                    "(empty)".to_string()
                                } else {
                                    val.to_string()
                                };
                                let map = element_value_counts.entry(name.clone()).or_insert_with(HashMap::new);
                                if map.len() < 500 || map.contains_key(&display_val) {
                                    *map.entry(display_val).or_insert(0) += 1;
                                }
                            }
                        }
                    }
                    current_open_tag = None;
                    current_text.clear();
                }
                Ok(Event::Eof) => break,
                Err(e) => {
                    is_valid = false;
                    error = Some(format!("XML parsing error: {e}"));
                    break;
                }
                _ => {}
            }
            buf.clear();
        }

        let mut top_elements: Vec<XmlElementStat> = element_counts
            .into_iter()
            .map(|(name, count)| XmlElementStat { name, count })
            .collect();
        top_elements.sort_by(|a, b| b.count.cmp(&a.count));

        let mut top_attributes: Vec<XmlAttributeStat> = attribute_counts
            .into_iter()
            .map(|(name, count)| XmlAttributeStat { name, count })
            .collect();
        top_attributes.sort_by(|a, b| b.count.cmp(&a.count));

        // Format top element value frequencies
        let mut element_value_frequencies = HashMap::new();
        for (tag_name, val_map) in element_value_counts {
            let total_tag_occurrences: usize = val_map.values().sum();
            let mut val_stats: Vec<XmlValueStat> = val_map
                .into_iter()
                .map(|(value, count)| {
                    let pct = if total_tag_occurrences > 0 {
                        (count as f64 / total_tag_occurrences as f64) * 100.0
                    } else {
                        0.0
                    };
                    XmlValueStat {
                        value,
                        count,
                        percentage: (pct * 10.0).round() / 10.0,
                    }
                })
                .collect();
            val_stats.sort_by(|a, b| b.count.cmp(&a.count));
            val_stats.truncate(50);
            element_value_frequencies.insert(tag_name, val_stats);
        }

        let unique = top_elements.len();

        XmlAnalysisResult {
            total_elements,
            unique_element_names: unique,
            top_elements: top_elements.into_iter().take(50).collect(),
            top_attributes: top_attributes.into_iter().take(50).collect(),
            element_value_frequencies,
            is_valid,
            error,
        }
    }

    pub fn get_xml_tag_values(file_path: &str, tag_name: &str, max_values: usize) -> Vec<XmlValueStat> {
        let file = match resolve_and_open_file(file_path) {
            Ok(f) => f,
            Err(_) => return Vec::new(),
        };

        let target_tag = tag_name.trim_matches(|c| c == '<' || c == '>').to_lowercase();
        let mut reader = Reader::from_reader(BufReader::new(file));
        reader.config_mut().trim_text(true);

        let mut counts: HashMap<String, usize> = HashMap::new();
        let mut in_target = false;
        let mut current_text = String::new();
        let mut buf = Vec::new();

        loop {
            match reader.read_event_into(&mut buf) {
                Ok(Event::Start(ref e)) => {
                    let name = String::from_utf8_lossy(e.name().as_ref()).to_lowercase();
                    let clean = name.trim_matches(|c| c == '<' || c == '>').to_string();
                    if clean == target_tag {
                        in_target = true;
                        current_text.clear();
                    }
                }
                Ok(Event::Empty(ref e)) => {
                    let name = String::from_utf8_lossy(e.name().as_ref()).to_lowercase();
                    let clean = name.trim_matches(|c| c == '<' || c == '>').to_string();
                    if clean == target_tag {
                        *counts.entry("(empty)".to_string()).or_insert(0) += 1;
                    }
                }
                Ok(Event::Text(ref e)) => {
                    if in_target {
                        if let Ok(t) = e.unescape() {
                            current_text.push_str(t.trim());
                        }
                    }
                }
                Ok(Event::CData(ref e)) => {
                    if in_target {
                        let text = String::from_utf8_lossy(e.as_ref());
                        current_text.push_str(text.trim());
                    }
                }
                Ok(Event::End(ref e)) => {
                    let name = String::from_utf8_lossy(e.name().as_ref()).to_lowercase();
                    let clean = name.trim_matches(|c| c == '<' || c == '>').to_string();
                    if clean == target_tag && in_target {
                        let val = current_text.trim();
                        let display_val = if val.is_empty() {
                            "(empty)".to_string()
                        } else if val.len() > 300 {
                            format!("{}...", &val[..300])
                        } else {
                            val.to_string()
                        };

                        if counts.len() < 1000 || counts.contains_key(&display_val) {
                            *counts.entry(display_val).or_insert(0) += 1;
                        }
                        in_target = false;
                        current_text.clear();
                    }
                }
                Ok(Event::Eof) => break,
                Err(_) => break,
                _ => {}
            }
            buf.clear();
        }

        let total_count: usize = counts.values().sum();
        let mut results: Vec<XmlValueStat> = counts
            .into_iter()
            .map(|(value, count)| {
                let pct = if total_count > 0 {
                    (count as f64 / total_count as f64) * 100.0
                } else {
                    0.0
                };
                XmlValueStat {
                    value,
                    count,
                    percentage: (pct * 10.0).round() / 10.0,
                }
            })
            .collect();

        results.sort_by(|a, b| b.count.cmp(&a.count));
        results.truncate(max_values);
        results
    }

    pub fn analyze_json_file(file_path: &str) -> JsonAnalysisResult {
        let file = match resolve_and_open_file(file_path) {
            Ok(f) => f,
            Err(e) => {
                return JsonAnalysisResult {
                    is_valid: false,
                    total_keys: 0,
                    top_keys: Vec::new(),
                    array_count: 0,
                    object_count: 0,
                    error: Some(e),
                }
            }
        };

        let val: serde_json::Value = match serde_json::from_reader(BufReader::new(file)) {
            Ok(v) => v,
            Err(e) => {
                return JsonAnalysisResult {
                    is_valid: false,
                    total_keys: 0,
                    top_keys: Vec::new(),
                    array_count: 0,
                    object_count: 0,
                    error: Some(format!("JSON parse error: {e}")),
                }
            }
        };

        let mut key_counts: HashMap<String, (usize, String)> = HashMap::new();
        let mut array_count = 0;
        let mut object_count = 0;

        fn traverse(
            v: &serde_json::Value,
            path: &str,
            counts: &mut HashMap<String, (usize, String)>,
            arrays: &mut usize,
            objects: &mut usize,
        ) {
            match v {
                serde_json::Value::Object(map) => {
                    *objects += 1;
                    for (k, child) in map {
                        let cur_path = if path.is_empty() {
                            k.clone()
                        } else {
                            format!("{}.{}", path, k)
                        };
                        let type_str = match child {
                            serde_json::Value::Null => "null",
                            serde_json::Value::Bool(_) => "boolean",
                            serde_json::Value::Number(_) => "number",
                            serde_json::Value::String(_) => "string",
                            serde_json::Value::Array(_) => "array",
                            serde_json::Value::Object(_) => "object",
                        };

                        let entry = counts.entry(cur_path.clone()).or_insert((0, type_str.to_string()));
                        entry.0 += 1;

                        traverse(child, &cur_path, counts, arrays, objects);
                    }
                }
                serde_json::Value::Array(arr) => {
                    *arrays += 1;
                    for child in arr {
                        let arr_path = format!("{}[]", path);
                        traverse(child, &arr_path, counts, arrays, objects);
                    }
                }
                _ => {}
            }
        }

        traverse(&val, "", &mut key_counts, &mut array_count, &mut object_count);

        let mut top_keys: Vec<JsonKeyStat> = key_counts
            .into_iter()
            .map(|(path, (count, data_type))| JsonKeyStat {
                path,
                count,
                data_type,
            })
            .collect();
        top_keys.sort_by(|a, b| b.count.cmp(&a.count));

        let total = top_keys.len();

        JsonAnalysisResult {
            is_valid: true,
            total_keys: total,
            top_keys: top_keys.into_iter().take(50).collect(),
            array_count,
            object_count,
            error: None,
        }
    }

    fn analyze_json_job_feed(val: serde_json::Value) -> JobFeedAnalysisResult {
        let items: &[serde_json::Value] = if let Some(arr) = val.as_array() {
            arr.as_slice()
        } else if let Some(obj) = val.as_object() {
            let candidate_key = obj
                .keys()
                .find(|k| {
                    let l = k.to_lowercase();
                    l == "jobs" || l == "positions" || l == "postings" || l == "items" || l == "data"
                })
                .or_else(|| obj.keys().find(|k| obj[*k].is_array()));

            if let Some(key) = candidate_key {
                obj[key].as_array().map(|a| a.as_slice()).unwrap_or(&[])
            } else {
                &[]
            }
        } else {
            &[]
        };

        let mut total_jobs = 0;
        let mut companies: HashMap<String, usize> = HashMap::new();
        let mut locations: HashMap<String, usize> = HashMap::new();
        let mut title_counts: HashMap<String, usize> = HashMap::new();
        let mut sample_titles: Vec<String> = Vec::new();
        let mut jobs_with_salary = 0;
        let mut remote_jobs = 0;

        for item in items {
            total_jobs += 1;

            let title = item.get("title")
                .or_else(|| item.get("job_title"))
                .or_else(|| item.get("position"))
                .or_else(|| item.get("name"))
                .and_then(|v| v.as_str())
                .unwrap_or("")
                .trim();

            if !title.is_empty() {
                *title_counts.entry(title.to_string()).or_insert(0) += 1;
                if sample_titles.len() < 10 {
                    sample_titles.push(title.to_string());
                }
            }

            let company = item.get("company")
                .or_else(|| item.get("company_name"))
                .or_else(|| item.get("employer"))
                .and_then(|v| v.as_str())
                .unwrap_or("")
                .trim();

            if !company.is_empty() {
                *companies.entry(company.to_string()).or_insert(0) += 1;
            }

            let location = item.get("location")
                .or_else(|| item.get("city"))
                .and_then(|v| v.as_str())
                .unwrap_or("")
                .trim();

            if !location.is_empty() {
                *locations.entry(location.to_string()).or_insert(0) += 1;
            }

            let has_salary = item.get("salary")
                .or_else(|| item.get("compensation"))
                .or_else(|| item.get("pay"))
                .is_some();

            if has_salary {
                jobs_with_salary += 1;
            }

            let is_remote = item.get("remote")
                .and_then(|v| v.as_bool())
                .unwrap_or_else(|| {
                    let full_str = item.to_string().to_lowercase();
                    full_str.contains("remote") || full_str.contains("work from home")
                });

            if is_remote {
                remote_jobs += 1;
            }
        }

        let duplicate_titles = title_counts.values().filter(|&&count| count > 1).count();
        let unique_companies = companies.len();
        let unique_locations = locations.len();

        let mut top_companies: Vec<(String, usize)> = companies.into_iter().collect();
        top_companies.sort_by(|a, b| b.1.cmp(&a.1));
        top_companies.truncate(15);

        let mut top_locations: Vec<(String, usize)> = locations.into_iter().collect();
        top_locations.sort_by(|a, b| b.1.cmp(&a.1));
        top_locations.truncate(15);

        JobFeedAnalysisResult {
            total_jobs,
            unique_companies,
            unique_locations,
            jobs_with_salary,
            remote_jobs,
            duplicate_titles,
            top_companies,
            top_locations,
            sample_titles,
        }
    }

    pub fn analyze_job_feed(file_path: &str) -> JobFeedAnalysisResult {
        let clean = file_path.trim().trim_matches('"').trim_matches('\'');

        // Check for JSON feed
        if clean.to_lowercase().ends_with(".json") {
            if let Ok(file) = resolve_and_open_file(file_path) {
                if let Ok(val) = serde_json::from_reader::<_, serde_json::Value>(BufReader::new(file)) {
                    return Self::analyze_json_job_feed(val);
                }
            }
        }

        // Stream through XML detecting job feed items
        let file = match resolve_and_open_file(file_path) {
            Ok(f) => f,
            Err(_) => {
                return JobFeedAnalysisResult {
                    total_jobs: 0,
                    unique_companies: 0,
                    unique_locations: 0,
                    jobs_with_salary: 0,
                    remote_jobs: 0,
                    duplicate_titles: 0,
                    top_companies: Vec::new(),
                    top_locations: Vec::new(),
                    sample_titles: Vec::new(),
                }
            }
        };

        let mut reader = Reader::from_reader(BufReader::new(file));
        reader.config_mut().trim_text(true);

        let mut total_jobs = 0;
        let mut companies: HashMap<String, usize> = HashMap::new();
        let mut locations: HashMap<String, usize> = HashMap::new();
        let mut title_counts: HashMap<String, usize> = HashMap::new();
        let mut sample_titles: Vec<String> = Vec::new();
        let mut jobs_with_salary = 0;
        let mut remote_jobs = 0;

        let mut current_tag = String::new();
        let mut current_title = String::new();
        let mut current_company = String::new();
        let mut current_location = String::new();
        let mut in_salary = false;
        let mut has_salary_in_job = false;
        let mut is_remote_in_job = false;

        let mut buf = Vec::new();

        loop {
            match reader.read_event_into(&mut buf) {
                Ok(Event::Start(ref e)) => {
                    let tag = String::from_utf8_lossy(e.name().as_ref()).to_lowercase();
                    current_tag = tag.clone();

                    if tag == "job" || tag == "position" || tag == "vacancy" || tag == "posting" || tag == "item" || tag == "entry" {
                        total_jobs += 1;
                        current_title.clear();
                        current_company.clear();
                        current_location.clear();
                        has_salary_in_job = false;
                        is_remote_in_job = false;
                    } else if tag.contains("salary") || tag.contains("compensation") || tag.contains("pay") {
                        in_salary = true;
                    }
                }
                Ok(Event::Text(ref e)) => {
                    let text = match e.unescape() {
                        Ok(t) => t.trim().to_string(),
                        Err(_) => String::new(),
                    };
                    if !text.is_empty() {
                        Self::process_feed_text(
                            &current_tag,
                            &text,
                            in_salary,
                            &mut current_title,
                            &mut current_company,
                            &mut current_location,
                            &mut has_salary_in_job,
                            &mut is_remote_in_job,
                        );
                    }
                }
                Ok(Event::CData(ref e)) => {
                    let text = String::from_utf8_lossy(e.as_ref()).trim().to_string();
                    if !text.is_empty() {
                        Self::process_feed_text(
                            &current_tag,
                            &text,
                            in_salary,
                            &mut current_title,
                            &mut current_company,
                            &mut current_location,
                            &mut has_salary_in_job,
                            &mut is_remote_in_job,
                        );
                    }
                }
                Ok(Event::End(ref e)) => {
                    let tag = String::from_utf8_lossy(e.name().as_ref()).to_lowercase();
                    if tag == "job" || tag == "position" || tag == "vacancy" || tag == "posting" || tag == "item" || tag == "entry" {
                        if !current_title.is_empty() {
                            *title_counts.entry(current_title.clone()).or_insert(0) += 1;
                            if sample_titles.len() < 10 {
                                sample_titles.push(current_title.clone());
                            }
                        }
                        if !current_company.is_empty() {
                            *companies.entry(current_company.clone()).or_insert(0) += 1;
                        }
                        if !current_location.is_empty() {
                            *locations.entry(current_location.clone()).or_insert(0) += 1;
                        }
                        if has_salary_in_job {
                            jobs_with_salary += 1;
                        }
                        if is_remote_in_job {
                            remote_jobs += 1;
                        }
                    } else if tag.contains("salary") {
                        in_salary = false;
                    }
                    current_tag.clear();
                }
                Ok(Event::Eof) => break,
                Err(_) => break,
                _ => {}
            }
            buf.clear();
        }

        let duplicate_titles = title_counts.values().filter(|&&count| count > 1).count();
        let unique_companies = companies.len();
        let unique_locations = locations.len();

        let mut top_companies: Vec<(String, usize)> = companies.into_iter().collect();
        top_companies.sort_by(|a, b| b.1.cmp(&a.1));
        top_companies.truncate(15);

        let mut top_locations: Vec<(String, usize)> = locations.into_iter().collect();
        top_locations.sort_by(|a, b| b.1.cmp(&a.1));
        top_locations.truncate(15);

        JobFeedAnalysisResult {
            total_jobs,
            unique_companies,
            unique_locations,
            jobs_with_salary,
            remote_jobs,
            duplicate_titles,
            top_companies,
            top_locations,
            sample_titles,
        }
    }

    fn process_feed_text(
        current_tag: &str,
        text: &str,
        in_salary: bool,
        current_title: &mut String,
        current_company: &mut String,
        current_location: &mut String,
        has_salary_in_job: &mut bool,
        is_remote_in_job: &mut bool,
    ) {
        let tag = current_tag.to_lowercase();
        if tag == "title" || tag.contains("jobtitle") || tag == "role" {
            *current_title = text.to_string();
        } else if tag == "company" || tag == "employer" || tag.contains("organization") {
            *current_company = text.to_string();
        } else if tag == "location" || tag == "city" {
            *current_location = text.to_string();
        }

        if in_salary && !text.is_empty() {
            *has_salary_in_job = true;
        }

        let lower = text.to_lowercase();
        if lower.contains("remote") || lower.contains("telecommute") || lower.contains("work from home") {
            *is_remote_in_job = true;
        }
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn test_analyze_xml_sample() {
        let res = DeveloperAnalyzer::analyze_xml_file("../sample_data/jobs.xml");
        assert!(res.is_valid, "XML should be valid: {:?}", res.error);
        assert!(res.total_elements > 0, "Should count XML elements");
        assert!(!res.element_value_frequencies.is_empty(), "Should have element value frequencies");
        let vals = DeveloperAnalyzer::get_xml_tag_values("../sample_data/jobs.xml", "company", 10);
        assert!(!vals.is_empty(), "Should extract company values");
        assert_eq!(vals[0].value, "ByteFlow Labs");
    }

    #[test]
    fn test_analyze_monster() {
        let path = "C:/Users/diqbal/Downloads/monster.xml";
        if std::path::Path::new(path).exists() {
            let res = DeveloperAnalyzer::analyze_xml_file(path);
            println!("Unique elements in monster: {}", res.unique_element_names);
            if let Some(cats) = res.element_value_frequencies.get("category") {
                println!("Top categories from analyze_xml_file:");
                for cat in cats.iter().take(5) {
                    println!("  {} ({}%)", cat.value, cat.percentage);
                }
            }
        }
    }

    #[test]
    fn test_analyze_json_sample() {
        let res = DeveloperAnalyzer::analyze_json_file("../sample_data/jobs.json");
        assert!(res.is_valid, "JSON should be valid: {:?}", res.error);
        assert!(res.total_keys > 0, "Should count JSON keys");
    }

    #[test]
    fn test_analyze_job_feed_xml_sample() {
        let res = DeveloperAnalyzer::analyze_job_feed("../sample_data/jobs.xml");
        assert_eq!(res.total_jobs, 5, "Should find 5 jobs in sample_data/jobs.xml");
        assert!(res.unique_companies > 0, "Should find unique companies");
        assert!(res.unique_locations > 0, "Should find locations");
        assert!(res.jobs_with_salary > 0, "Should find jobs with salary");
    }

    #[test]
    fn test_analyze_job_feed_json_sample() {
        let res = DeveloperAnalyzer::analyze_job_feed("../sample_data/jobs.json");
        assert_eq!(res.total_jobs, 3, "Should find 3 jobs in sample_data/jobs.json");
        assert!(res.unique_companies > 0, "Should find companies in JSON feed");
    }
}
