use crate::db::init_db;
use crate::models::{FolderPair, Profile};
use rusqlite::params;

#[tauri::command]
pub fn create_profile(
    name: String,
    drive_uuid: String,
    folder_pairs: Vec<(String, String)>,
    exclude_rules: Vec<String>,
    append_only: bool,
    verify_after_copy: bool,
    auto_backup: bool,
) -> Result<Profile, String> {
    let conn = init_db().map_err(|e| e.to_string())?;

    let exclude_json = serde_json::to_string(&exclude_rules).map_err(|e| e.to_string())?;

    conn.execute(
        "INSERT INTO profiles (name, drive_uuid, exclude_rules, append_only, verify_after_copy, auto_backup)
         VALUES (?1, ?2, ?3, ?4, ?5, ?6)",
        params![name, drive_uuid, exclude_json, append_only, verify_after_copy, auto_backup],
    ).map_err(|e| e.to_string())?;

    let profile_id = conn.last_insert_rowid();

    for (source, dest) in &folder_pairs {
        conn.execute(
            "INSERT INTO folder_pairs (profile_id, source_path, dest_path) VALUES (?1, ?2, ?3)",
            params![profile_id, source, dest],
        ).map_err(|e| e.to_string())?;
    }

    get_profile_by_id(profile_id)
}

#[tauri::command]
pub fn get_all_profiles() -> Result<Vec<Profile>, String> {
    let conn = init_db().map_err(|e| e.to_string())?;

    let mut stmt = conn.prepare(
        "SELECT id, name, drive_uuid, exclude_rules, append_only, verify_after_copy, auto_backup FROM profiles"
    ).map_err(|e| e.to_string())?;

    let profile_ids: Vec<i64> = stmt.query_map([], |row| row.get(0))
        .map_err(|e| e.to_string())?
        .filter_map(|r| r.ok())
        .collect();

    profile_ids.into_iter().map(get_profile_by_id).collect()
}

#[tauri::command]
pub fn delete_profile(profile_id: i64) -> Result<(), String> {
    let conn = init_db().map_err(|e| e.to_string())?;
    conn.execute("DELETE FROM profiles WHERE id = ?1", params![profile_id])
        .map_err(|e| e.to_string())?;
    Ok(())
}

pub fn get_profile_by_id(profile_id: i64) -> Result<Profile, String> {
    let conn = init_db().map_err(|e| e.to_string())?;

    let (name, drive_uuid, exclude_json, append_only, verify_after_copy, auto_backup): 
        (String, String, String, bool, bool, bool) = conn.query_row(
        "SELECT name, drive_uuid, exclude_rules, append_only, verify_after_copy, auto_backup
         FROM profiles WHERE id = ?1",
        params![profile_id],
        |row| Ok((
            row.get(0)?, row.get(1)?, row.get(2)?,
            row.get(3)?, row.get(4)?, row.get(5)?
        )),
    ).map_err(|e| e.to_string())?;

    let exclude_rules: Vec<String> = serde_json::from_str(&exclude_json).unwrap_or_default();

    let mut pair_stmt = conn.prepare(
        "SELECT id, source_path, dest_path FROM folder_pairs WHERE profile_id = ?1"
    ).map_err(|e| e.to_string())?;

    let folder_pairs: Vec<FolderPair> = pair_stmt.query_map(params![profile_id], |row| {
        Ok(FolderPair {
            id: row.get(0)?,
            profile_id,
            source_path: row.get(1)?,
            dest_path: row.get(2)?,
        })
    }).map_err(|e| e.to_string())?
    .filter_map(|r| r.ok())
    .collect();

    Ok(Profile {
        id: profile_id,
        name,
        drive_uuid,
        folder_pairs,
        exclude_rules,
        append_only,
        verify_after_copy,
        auto_backup,
    })
}