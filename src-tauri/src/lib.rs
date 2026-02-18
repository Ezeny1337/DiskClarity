mod models;
mod ntfs_io;
mod mft_parser;
mod tree_builder;
mod mft_scanner;
mod snapshot;
mod error;
mod commands;

#[global_allocator]
static GLOBAL: mimalloc::MiMalloc = mimalloc::MiMalloc;

use std::sync::Arc;
use parking_lot::Mutex;
use mft_scanner::MftScanner;

pub use models::{GitHubLatestRelease, GitHubRelease};

// 全局扫描器状态
pub struct ScannerState {
    pub scanner: Arc<Mutex<Option<Arc<MftScanner>>>>,
}

impl ScannerState {
    pub fn new() -> Self {
        Self {
            scanner: Arc::new(Mutex::new(None)),
        }
    }
}

#[cfg_attr(mobile, tauri::mobile_entry_point)]
pub fn run() {
    tauri::Builder::default()
        .plugin(tauri_plugin_opener::init())
        .manage(ScannerState::new())
        .invoke_handler(tauri::generate_handler![
            commands::start_scan,
            commands::get_scan_progress,
            commands::cancel_scan,
            commands::get_drives,
            commands::get_cpu_count,
            commands::get_disk_info,
            commands::open_in_explorer,
            commands::get_latest_release,
            commands::get_releases,
            commands::save_snapshot,
            commands::list_snapshots,
            commands::delete_snapshot,
            commands::diff_snapshots,
            commands::get_snapshot_file_sizes
        ])
        .run(tauri::generate_context!())
        .expect("error while running tauri application");
}
