export interface Drive {
  uuid: string;
  name: string;
  mount_point: string;
  total_space: number;
  available_space: number;
  is_removable: boolean;
}

export interface FolderPair {
  id: number;
  profile_id: number;
  source_path: string;
  dest_path: string;
}

export interface Profile {
  id: number;
  name: string;
  drive_uuid: string;
  folder_pairs: FolderPair[];
  exclude_rules: string[];
  append_only: boolean;
  verify_after_copy: boolean;
  auto_backup: boolean;
}

export type DiffStatus = 'added' | 'modified' | 'deleted' | 'renamed' | 'unchanged';

export interface DiffEntry {
  status: DiffStatus;
  relative_path: string;
  old_path: string | null;
  size_bytes: number;
  size_delta: number;
  modified_at: string;
  hash: string | null;
}

export interface DiffResult {
  profile_id: number;
  pair_index: number;
  entries: DiffEntry[];
  total_added_bytes: number;
  total_modified_bytes: number;
  scanned_at: string;
}

export interface BackupProgress {
  file_path: string;
  files_done: number;
  files_total: number;
  bytes_done: number;
  bytes_total: number;
  speed_bps: number;
  eta_seconds: number;
}

export interface BackupManifest {
  profile_name: string;
  drive_uuid: string;
  completed_at: string;
  files_added: number;
  files_modified: number;
  files_deleted: number;
  bytes_transferred: number;
  verified: boolean;
}

export function formatBytes(bytes: number): string {
  if (bytes === 0) return '0 B';
  const k = 1024;
  const sizes = ['B', 'KB', 'MB', 'GB', 'TB'];
  const i = Math.floor(Math.log(bytes) / Math.log(k));
  return `${parseFloat((bytes / Math.pow(k, i)).toFixed(1))} ${sizes[i]}`;
}

export function formatSpeed(bps: number): string {
  return `${formatBytes(bps)}/s`;
}

export function formatEta(seconds: number): string {
  if (seconds < 60) return `${seconds}s`;
  if (seconds < 3600) return `${Math.floor(seconds / 60)}m ${seconds % 60}s`;
  return `${Math.floor(seconds / 3600)}h ${Math.floor((seconds % 3600) / 60)}m`;
}