use serde::{Deserialize, Serialize};
use chrono::{DateTime, Utc};

#[derive(Debug, Serialize, Deserialize, Clone)]
pub struct Drive {
    pub uuid: String,
    pub name: String,
    pub mount_point: String,
    pub total_space: u64,
    pub available_space: u64,
    pub is_removable: bool,
}

#[derive(Debug, Serialize, Deserialize, Clone)]
pub struct FolderPair {
    pub id: i64,
    pub profile_id: i64,
    pub source_path: String,
    pub dest_path: String,
}

#[derive(Debug, Serialize, Deserialize, Clone)]
pub struct Profile {
    pub id: i64,
    pub name: String,
    pub drive_uuid: String,
    pub folder_pairs: Vec<FolderPair>,
    pub exclude_rules: Vec<String>,
    pub append_only: bool,
    pub verify_after_copy: bool,
    pub auto_backup: bool,
}

#[derive(Debug, Serialize, Deserialize, Clone, PartialEq)]
#[serde(rename_all = "snake_case")]
pub enum DiffStatus {
    Added,
    Modified,
    Deleted,
    Renamed,
    Unchanged,
}

#[derive(Debug, Serialize, Deserialize, Clone)]
pub struct DiffEntry {
    pub status: DiffStatus,
    pub relative_path: String,
    pub old_path: Option<String>,   // for renames
    pub size_bytes: u64,
    pub size_delta: i64,
    pub modified_at: DateTime<Utc>,
    pub hash: Option<String>,
}

#[derive(Debug, Serialize, Deserialize)]
pub struct DiffResult {
    pub profile_id: i64,
    pub pair_index: usize,
    pub entries: Vec<DiffEntry>,
    pub total_added_bytes: u64,
    pub total_modified_bytes: u64,
    pub scanned_at: DateTime<Utc>,
}

#[derive(Debug, Serialize, Deserialize)]
pub struct BackupProgress {
    pub file_path: String,
    pub files_done: usize,
    pub files_total: usize,
    pub bytes_done: u64,
    pub bytes_total: u64,
    pub speed_bps: u64,
    pub eta_seconds: u64,
}

#[derive(Debug, Serialize, Deserialize)]
pub struct BackupManifest {
    pub profile_name: String,
    pub drive_uuid: String,
    pub completed_at: DateTime<Utc>,
    pub files_added: usize,
    pub files_modified: usize,
    pub files_deleted: usize,
    pub bytes_transferred: u64,
    pub verified: bool,
}