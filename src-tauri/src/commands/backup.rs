use std::path::Path;
use std::time::Instant;
use chrono::Utc;
use rusqlite::params;
use tauri::{AppHandle, Emitter};
use crate::db::init_db;
use crate::models::{BackupManifest, BackupProgress, DiffEntry, DiffStatus};

fn copy_file_with_progress(
    src: &Path,
    dest: &Path,
) -> Result<u64, String> {
    if let Some(parent) = dest.parent() {
        std::fs::create_dir_all(parent).map_err(|e| e.to_string())?;
    }
    let bytes = std::fs::copy(src, dest).map_err(|e| e.to_string())?;
    Ok(bytes)
}

fn verify_file(src: &Path, dest: &Path) -> bool {
    let src_bytes = std::fs::read(src).unwrap_or_default();
    let dest_bytes = std::fs::read(dest).unwrap_or_default();
    blake3::hash(&src_bytes) == blake3::hash(&dest_bytes)
}

fn update_file_index(
    conn: &rusqlite::Connection,
    profile_id: i64,
    pair_index: usize,
    entry: &DiffEntry,
) -> rusqlite::Result<()> {
    let now = Utc::now().to_rfc3339();
    let hash = entry.hash.as_deref().unwrap_or("");

    conn.execute(
        "INSERT INTO file_index (profile_id, pair_index, relative_path, size_bytes, modified_at, hash, last_backed_up)
         VALUES (?1, ?2, ?3, ?4, ?5, ?6, ?7)
         ON CONFLICT(profile_id, pair_index, relative_path) DO UPDATE SET
           size_bytes=excluded.size_bytes,
           modified_at=excluded.modified_at,
           hash=excluded.hash,
           last_backed_up=excluded.last_backed_up",
        params![
            profile_id,
            pair_index as i64,
            entry.relative_path,
            entry.size_bytes as i64,
            entry.modified_at.to_rfc3339(),
            hash,
            now,
        ],
    )?;
    Ok(())
}

#[tauri::command]
pub async fn run_backup(
    app: AppHandle,
    profile_id: i64,
    pair_index: usize,
    source_path: String,
    dest_path: String,
    entries: Vec<DiffEntry>,
    append_only: bool,
    verify_after_copy: bool,
) -> Result<BackupManifest, String> {
    let source_root = Path::new(&source_path);
    let dest_root = Path::new(&dest_path);

    let to_transfer: Vec<&DiffEntry> = entries.iter()
        .filter(|e| matches!(e.status, DiffStatus::Added | DiffStatus::Modified | DiffStatus::Renamed))
        .collect();

    let to_delete: Vec<&DiffEntry> = entries.iter()
        .filter(|e| matches!(e.status, DiffStatus::Deleted))
        .collect();

    let files_total = to_transfer.len();
    let bytes_total: u64 = to_transfer.iter().map(|e| e.size_bytes).sum();

    let mut files_done = 0usize;
    let mut bytes_done = 0u64;
    let mut files_added = 0usize;
    let mut files_modified = 0usize;
    let mut files_deleted = 0usize;
    let start = Instant::now();

    let conn = init_db().map_err(|e| e.to_string())?;

    // copy added + modified + renamed
    for entry in &to_transfer {
        let src = source_root.join(&entry.relative_path);
        let dest = dest_root.join(&entry.relative_path);

        copy_file_with_progress(&src, &dest)?;

        if verify_after_copy && !verify_file(&src, &dest) {
            return Err(format!("Verification failed for {}", entry.relative_path));
        }

        update_file_index(&conn, profile_id, pair_index, entry)
            .map_err(|e| e.to_string())?;

        match entry.status {
            DiffStatus::Added => files_added += 1,
            DiffStatus::Modified | DiffStatus::Renamed => files_modified += 1,
            _ => {}
        }

        bytes_done += entry.size_bytes;
        files_done += 1;

        let elapsed = start.elapsed().as_secs_f64();
        let speed_bps = if elapsed > 0.0 { (bytes_done as f64 / elapsed) as u64 } else { 0 };
        let remaining = bytes_total.saturating_sub(bytes_done);
        let eta_seconds = if speed_bps > 0 { remaining / speed_bps } else { 0 };

        let _ = app.emit("backup_progress", &BackupProgress {
            file_path: entry.relative_path.clone(),
            files_done,
            files_total,
            bytes_done,
            bytes_total,
            speed_bps,
            eta_seconds,
        });
    }

    // handle deletions
    if !append_only {
        for entry in &to_delete {
            let dest = dest_root.join(&entry.relative_path);
            if dest.exists() {
                std::fs::remove_file(&dest).map_err(|e| e.to_string())?;
            }
            conn.execute(
                "DELETE FROM file_index WHERE profile_id=?1 AND pair_index=?2 AND relative_path=?3",
                params![profile_id, pair_index as i64, entry.relative_path],
            ).map_err(|e| e.to_string())?;
            files_deleted += 1;
        }
    }

    // write manifest to drive root
    let manifest = BackupManifest {
        profile_name: String::new(),
        drive_uuid: String::new(),
        completed_at: Utc::now(),
        files_added,
        files_modified,
        files_deleted,
        bytes_transferred: bytes_done,
        verified: verify_after_copy,
    };

    let manifest_path = dest_root
        .parent()
        .unwrap_or(dest_root)
        .join("backup_manifest.json");

    std::fs::write(
        &manifest_path,
        serde_json::to_string_pretty(&manifest).map_err(|e| e.to_string())?,
    ).map_err(|e| e.to_string())?;

    // save to history
    conn.execute(
        "INSERT INTO backup_history (profile_id, completed_at, files_added, files_modified, files_deleted, bytes_transferred, verified)
         VALUES (?1, ?2, ?3, ?4, ?5, ?6, ?7)",
        params![
            profile_id,
            manifest.completed_at.to_rfc3339(),
            files_added as i64,
            files_modified as i64,
            files_deleted as i64,
            bytes_done as i64,
            verify_after_copy,
        ],
    ).map_err(|e| e.to_string())?;

    Ok(manifest)
}