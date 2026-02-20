mod commands;
mod error;
mod mft_parser;
mod mft_scanner;
mod models;
mod ntfs_io;
mod snapshot;
mod tree_builder;

#[global_allocator]
static GLOBAL: mimalloc::MiMalloc = mimalloc::MiMalloc;

use mft_scanner::MftScanner;
use parking_lot::Mutex;
use std::collections::HashMap;
use std::sync::Arc;

pub use models::{GitHubLatestRelease, GitHubRelease};

pub struct ScannerState {
    pub scanners: Arc<Mutex<HashMap<String, Arc<MftScanner>>>>,
}

impl Default for ScannerState {
    fn default() -> Self {
        Self {
            scanners: Arc::new(Mutex::new(HashMap::new())),
        }
    }
}

#[cfg_attr(mobile, tauri::mobile_entry_point)]
pub fn run() {
    tauri::Builder::default()
        .plugin(tauri_plugin_opener::init())
        .manage(ScannerState::default())
        .invoke_handler(tauri::generate_handler![
            commands::start_scan,
            commands::get_scan_progress,
            commands::cancel_scan,
            commands::get_drives,
            commands::get_cpu_count,
            commands::get_disk_info,
            commands::open_in_explorer,
            commands::set_webview_memory_level,
            commands::get_latest_release,
            commands::get_releases,
            commands::save_snapshot,
            commands::list_snapshots,
            commands::delete_snapshot,
            commands::diff_snapshots,
            commands::get_snapshot_file_sizes
        ])
        .run(tauri::generate_context!())
        .unwrap_or_else(|e| eprintln!("Tauri runtime error: {e}"));
}
