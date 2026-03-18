use std::collections::HashMap;
use std::path::Path;
use walkdir::WalkDir;
use chrono::Utc;
use crate::models::{DiffEntry, DiffResult, DiffStatus};
use crate::db::init_db;
use rusqlite::params;
use std::sync::atomic::Ordering;
use tauri::State;
use crate::ScanState;

fn hash_file(path: &Path) -> Option<String> {
    let bytes = std::fs::read(path).ok()?;
    Some(blake3::hash(&bytes).to_hex().to_string())
}

fn should_exclude(relative_path: &str, rules: &[String]) -> bool {
    rules.iter().any(|rule| {
        relative_path.contains(rule.as_str())
    })
}

fn scan_directory(root: &Path, exclude_rules: &[String]) -> HashMap<String, (u64, u64, String)> {
    // returns: relative_path -> (size, modified_secs, hash)
    let mut map = HashMap::new();

    for entry in WalkDir::new(root).min_depth(1).into_iter().filter_map(|e| e.ok()) {
        if !entry.file_type().is_file() { continue; }

        let relative = entry.path()
            .strip_prefix(root)
            .unwrap()
            .to_string_lossy()
            .to_string();

        if should_exclude(&relative, exclude_rules) { continue; }

        let meta = match entry.metadata() { Ok(m) => m, Err(_) => continue };
        let size = meta.len();
        let modified = meta.modified().ok()
            .and_then(|t| t.duration_since(std::time::UNIX_EPOCH).ok())
            .map(|d| d.as_secs())
            .unwrap_or(0);

        let hash = hash_file(entry.path()).unwrap_or_default();
        map.insert(relative, (size, modified, hash));
    }

    map
}

#[tauri::command]
pub fn cancel_scan(state: State<'_, ScanState>) {
    state.cancelled.store(true, Ordering::SeqCst);
}

#[tauri::command]
pub fn compute_diff(
    state: State<'_, ScanState>,
    profile_id: i64,
    pair_index: usize,
    source_path: String,
    dest_path: String,
    exclude_rules: Vec<String>,
) -> Result<DiffResult, String> {
    let source_root = Path::new(&source_path);
    let dest_root = Path::new(&dest_path);

    if !source_root.exists() {
        return Err(format!("Source path does not exist: {}", source_path));
    }

    // check if we have a stored index for this profile+pair
    let conn = init_db().map_err(|e| e.to_string())?;
    let index_count: i64 = conn.query_row(
        "SELECT COUNT(*) FROM file_index WHERE profile_id=?1 AND pair_index=?2",
        params![profile_id, pair_index as i64],
        |row| row.get(0),
    ).unwrap_or(0);

    let has_index = index_count > 0;

    // fast path: destination empty or doesn't exist — everything is Added, no hashing needed
    let dest_is_empty = !dest_root.exists() || {
        let mut rd = std::fs::read_dir(dest_root).map_err(|e| e.to_string())?;
        rd.next().is_none()
    };

    if dest_is_empty && !has_index {
        let mut entries: Vec<DiffEntry> = Vec::new();
        let mut total_added = 0u64;

        for entry in WalkDir::new(source_root).min_depth(1).into_iter().filter_map(|e| e.ok()) {
            if state.cancelled.load(Ordering::SeqCst) {
                return Err("Scan cancelled".to_string());
            }

            if !entry.file_type().is_file() { continue; }
            let relative = entry.path().strip_prefix(source_root).unwrap().to_string_lossy().to_string();
            if should_exclude(&relative, &exclude_rules) { continue; }
            let meta = match entry.metadata() { Ok(m) => m, Err(_) => continue };
            let size = meta.len();
            let modified_secs = meta.modified().ok()
                .and_then(|t| t.duration_since(std::time::UNIX_EPOCH).ok())
                .map(|d| d.as_secs()).unwrap_or(0);
            let modified_at = chrono::DateTime::from_timestamp(modified_secs as i64, 0)
                .unwrap_or_default().with_timezone(&Utc);
            entries.push(DiffEntry {
                status: DiffStatus::Added,
                relative_path: relative,
                old_path: None,
                size_bytes: size,
                size_delta: size as i64,
                modified_at,
                hash: None,
            });
            total_added += size;
        }

        return Ok(DiffResult {
            profile_id, pair_index, entries,
            total_added_bytes: total_added,
            total_modified_bytes: 0,
            scanned_at: Utc::now(),
        });
    }

    // index path: we have a stored index — only scan source, compare against index
    // never touch the drive directly
    if has_index {
        let mut indexed: HashMap<String, (u64, String)> = HashMap::new();
        {
            let mut stmt = conn.prepare(
                "SELECT relative_path, size_bytes, hash FROM file_index WHERE profile_id=?1 AND pair_index=?2"
            ).map_err(|e| e.to_string())?;
            let rows = stmt.query_map(params![profile_id, pair_index as i64], |row| {
                Ok((row.get::<_,String>(0)?, row.get::<_,i64>(1)? as u64, row.get::<_,String>(2)?))
            }).map_err(|e| e.to_string())?;
            for row in rows.filter_map(|r| r.ok()) {
                indexed.insert(row.0, (row.1, row.2));
            }
        }

        let mut entries: Vec<DiffEntry> = Vec::new();
        let mut total_added = 0u64;
        let mut total_modified = 0u64;
        let mut seen_paths: std::collections::HashSet<String> = std::collections::HashSet::new();

        // walk source only — no drive reads
        for entry in WalkDir::new(source_root).min_depth(1).into_iter().filter_map(|e| e.ok()) {
            if !entry.file_type().is_file() { continue; }
            let relative = entry.path().strip_prefix(source_root).unwrap().to_string_lossy().to_string();
            if should_exclude(&relative, &exclude_rules) { continue; }
            seen_paths.insert(relative.clone());

            let meta = match entry.metadata() { Ok(m) => m, Err(_) => continue };
            let size = meta.len();
            let modified_secs = meta.modified().ok()
                .and_then(|t| t.duration_since(std::time::UNIX_EPOCH).ok())
                .map(|d| d.as_secs()).unwrap_or(0);
            let modified_at = chrono::DateTime::from_timestamp(modified_secs as i64, 0)
                .unwrap_or_default().with_timezone(&Utc);

            if let Some((old_size, old_hash)) = indexed.get(&relative) {
                // size changed — definitely modified, no need to hash
                if size != *old_size {
                    let hash = hash_file(entry.path()).unwrap_or_default();
                    entries.push(DiffEntry {
                        status: DiffStatus::Modified,
                        relative_path: relative,
                        old_path: None,
                        size_bytes: size,
                        size_delta: size as i64 - *old_size as i64,
                        modified_at,
                        hash: Some(hash),
                    });
                    total_modified += size;
                } else {
                    // same size — check mtime before hashing
                    let stored_mtime: String = conn.query_row(
                        "SELECT modified_at FROM file_index WHERE profile_id=?1 AND pair_index=?2 AND relative_path=?3",
                        params![profile_id, pair_index as i64, &relative],
                        |row| row.get(0),
                    ).unwrap_or_default();

                    let mtime_str = modified_at.to_rfc3339();
                    if mtime_str != stored_mtime {
                        // mtime changed — hash to confirm
                        let hash = hash_file(entry.path()).unwrap_or_default();
                        if &hash != old_hash {
                            entries.push(DiffEntry {
                                status: DiffStatus::Modified,
                                relative_path: relative,
                                old_path: None,
                                size_bytes: size,
                                size_delta: 0,
                                modified_at,
                                hash: Some(hash),
                            });
                            total_modified += size;
                        }
                    }
                    // same size + same mtime = unchanged, skip
                }
            } else {
                // not in index = new file
                entries.push(DiffEntry {
                    status: DiffStatus::Added,
                    relative_path: relative,
                    old_path: None,
                    size_bytes: size,
                    size_delta: size as i64,
                    modified_at,
                    hash: None,
                });
                total_added += size;
            }
        }

        // files in index but not in source = deleted
        for (rel, (size, _)) in &indexed {
            if !seen_paths.contains(rel) {
                entries.push(DiffEntry {
                    status: DiffStatus::Deleted,
                    relative_path: rel.clone(),
                    old_path: None,
                    size_bytes: *size,
                    size_delta: -(*size as i64),
                    modified_at: Utc::now(),
                    hash: None,
                });
            }
        }

        return Ok(DiffResult {
            profile_id, pair_index, entries,
            total_added_bytes: total_added,
            total_modified_bytes: total_modified,
            scanned_at: Utc::now(),
        });
    }

    // fallback: no index, dest has files — full hash both sides (first time only)
    let source_files = scan_directory(source_root, &exclude_rules);
    let dest_files = scan_directory(dest_root, &exclude_rules);

    let mut entries: Vec<DiffEntry> = Vec::new();
    let mut total_added = 0u64;
    let mut total_modified = 0u64;

    for (rel, (size, modified_secs, hash)) in &source_files {
        let modified_at = chrono::DateTime::from_timestamp(*modified_secs as i64, 0)
            .unwrap_or_default().with_timezone(&Utc);

        if let Some((old_size, _, old_hash)) = dest_files.get(rel) {
            if old_hash != hash {
                entries.push(DiffEntry {
                    status: DiffStatus::Modified,
                    relative_path: rel.clone(),
                    old_path: None,
                    size_bytes: *size,
                    size_delta: *size as i64 - *old_size as i64,
                    modified_at,
                    hash: Some(hash.clone()),
                });
                total_modified += size;
            }
        } else {
            entries.push(DiffEntry {
                status: DiffStatus::Added,
                relative_path: rel.clone(),
                old_path: None,
                size_bytes: *size,
                size_delta: *size as i64,
                modified_at,
                hash: Some(hash.clone()),
            });
            total_added += size;
        }
    }

    for (rel, (size, _, _)) in &dest_files {
        if !source_files.contains_key(rel) {
            entries.push(DiffEntry {
                status: DiffStatus::Deleted,
                relative_path: rel.clone(),
                old_path: None,
                size_bytes: *size,
                size_delta: -(*size as i64),
                modified_at: Utc::now(),
                hash: None,
            });
        }
    }

    Ok(DiffResult {
        profile_id, pair_index, entries,
        total_added_bytes: total_added,
        total_modified_bytes: total_modified,
        scanned_at: Utc::now(),
    })
}