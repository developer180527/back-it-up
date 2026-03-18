#![cfg_attr(not(debug_assertions), windows_subsystem = "windows")]

mod models;
mod db;
mod commands;

use std::sync::atomic::AtomicBool;
use std::sync::{Arc, Mutex};

pub struct ScanState {
    pub current: Mutex<Option<Arc<AtomicBool>>>,
}


fn main() {
    tauri::Builder::default()
        .manage(ScanState { current: Mutex::new(None) })
        .plugin(tauri_plugin_dialog::init())
        .invoke_handler(tauri::generate_handler![
            commands::drives::get_connected_drives,
            commands::profiles::create_profile,
            commands::profiles::get_all_profiles,
            commands::profiles::delete_profile,
            commands::diff::compute_diff,
            commands::diff::cancel_scan,
            commands::backup::run_backup,
        ])
        .run(tauri::generate_context!())
        .expect("error while running tauri application");
}