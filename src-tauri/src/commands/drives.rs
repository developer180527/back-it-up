use sysinfo::Disks;
use crate::models::Drive;

#[tauri::command]
pub fn get_connected_drives() -> Vec<Drive> {
    let disks = Disks::new_with_refreshed_list();
    let mut drives = Vec::new();

    for disk in disks.list() {
        let mount = disk.mount_point().to_string_lossy().to_string();

        #[cfg(target_os = "macos")]
        {
            // only show drives mounted under /Volumes/, skip system mounts
            if !mount.starts_with("/Volumes/") {
                continue;
            }
            // skip macOS recovery and VM volumes
            if mount.contains("Recovery") || mount.contains("VM") {
                continue;
            }
        }

        #[cfg(target_os = "windows")]
        if mount == "C:\\" {
            continue;
        }

        #[cfg(target_os = "linux")]
        if mount == "/" || mount.starts_with("/boot") || mount.starts_with("/sys") || mount.starts_with("/proc") {
            continue;
        }

        let uuid = format!(
            "{}-{}",
            disk.name().to_string_lossy(),
            disk.total_space()
        );

        drives.push(Drive {
            uuid,
            name: disk.name().to_string_lossy().to_string(),
            mount_point: mount,
            total_space: disk.total_space(),
            available_space: disk.available_space(),
            is_removable: disk.is_removable(),
        });
    }

    drives
}