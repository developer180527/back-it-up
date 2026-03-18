use rusqlite::{Connection, Result};
use std::path::PathBuf;

pub fn get_db_path() -> PathBuf {
    let mut path = dirs::data_dir()
        .unwrap_or_else(|| PathBuf::from("."));
    path.push("back-it-up");
    std::fs::create_dir_all(&path).ok();
    path.push("app.db");
    path
}

pub fn init_db() -> Result<Connection> {
    let conn = Connection::open(get_db_path())?;

    conn.execute_batch("
        CREATE TABLE IF NOT EXISTS profiles (
            id              INTEGER PRIMARY KEY AUTOINCREMENT,
            name            TEXT NOT NULL,
            drive_uuid      TEXT NOT NULL,
            exclude_rules   TEXT NOT NULL DEFAULT '[]',
            append_only     INTEGER NOT NULL DEFAULT 1,
            verify_after_copy INTEGER NOT NULL DEFAULT 0,
            auto_backup     INTEGER NOT NULL DEFAULT 0
        );

        CREATE TABLE IF NOT EXISTS folder_pairs (
            id              INTEGER PRIMARY KEY AUTOINCREMENT,
            profile_id      INTEGER NOT NULL REFERENCES profiles(id) ON DELETE CASCADE,
            source_path     TEXT NOT NULL,
            dest_path       TEXT NOT NULL
        );

        CREATE TABLE IF NOT EXISTS file_index (
            id              INTEGER PRIMARY KEY AUTOINCREMENT,
            profile_id      INTEGER NOT NULL,
            pair_index      INTEGER NOT NULL,
            relative_path   TEXT NOT NULL,
            size_bytes      INTEGER NOT NULL,
            modified_at     TEXT NOT NULL,
            hash            TEXT NOT NULL,
            last_backed_up  TEXT NOT NULL,
            UNIQUE(profile_id, pair_index, relative_path)
        );

        CREATE TABLE IF NOT EXISTS backup_history (
            id                  INTEGER PRIMARY KEY AUTOINCREMENT,
            profile_id          INTEGER NOT NULL,
            completed_at        TEXT NOT NULL,
            files_added         INTEGER NOT NULL DEFAULT 0,
            files_modified      INTEGER NOT NULL DEFAULT 0,
            files_deleted       INTEGER NOT NULL DEFAULT 0,
            bytes_transferred   INTEGER NOT NULL DEFAULT 0,
            verified            INTEGER NOT NULL DEFAULT 0
        );
    ")?;

    Ok(conn)
}