use crate::error::{AppError, AppResult};
use crate::mft_parser;
use crate::models::{FileNode, MftEntry, ScanConfig, ScanProgress, ScanStage};
use crate::ntfs_io;
use crate::tree_builder;
use parking_lot::Mutex;
use rayon::prelude::*;
use std::sync::atomic::{AtomicBool, AtomicU64, Ordering};
use std::time::{SystemTime, UNIX_EPOCH};

pub struct MftScanner {
    scanned_files: AtomicU64,
    scanned_dirs: AtomicU64,
    total_size: AtomicU64,
    should_cancel: AtomicBool,
    start_time: AtomicU64,
    pub current_stage: Mutex<ScanStage>,
}

impl MftScanner {
    pub fn new() -> Self {
        Self {
            scanned_files: AtomicU64::new(0),
            scanned_dirs: AtomicU64::new(0),
            total_size: AtomicU64::new(0),
            should_cancel: AtomicBool::new(false),
            start_time: AtomicU64::new(0),
            current_stage: Mutex::new(ScanStage::Scanning),
        }
    }

    pub fn cancel(&self) {
        self.should_cancel.store(true, Ordering::Relaxed);
    }

    pub fn get_progress(&self) -> ScanProgress {
        let start = self.start_time.load(Ordering::Relaxed);
        let duration_ms = if start > 0 {
            (SystemTime::now()
                .duration_since(UNIX_EPOCH)
                .unwrap_or_default()
                .as_millis() as u64)
                .saturating_sub(start)
        } else {
            0
        };

        ScanProgress {
            scanned_files: self.scanned_files.load(Ordering::Relaxed),
            scanned_dirs: self.scanned_dirs.load(Ordering::Relaxed),
            total_size: self.total_size.load(Ordering::Relaxed),
            current_path: String::new(),
            is_complete: false,
            duration_ms,
            stage: Some(*self.current_stage.lock()),
        }
    }

    pub fn scan(&self, root_path: &str, _config: ScanConfig) -> AppResult<FileNode> {
        // 重置计数器和状态
        self.scanned_files.store(0, Ordering::Relaxed);
        self.scanned_dirs.store(0, Ordering::Relaxed);
        self.total_size.store(0, Ordering::Relaxed);
        self.should_cancel.store(false, Ordering::Relaxed);
        *self.current_stage.lock() = ScanStage::Scanning;
        let start_ms = SystemTime::now()
            .duration_since(UNIX_EPOCH)
            .unwrap_or_default()
            .as_millis() as u64;
        self.start_time.store(start_ms, Ordering::Relaxed);

        // 提取驱动器号
        let drive = root_path
            .get(0..2)
            .filter(|s| s.chars().nth(1) == Some(':'))
            .ok_or_else(|| AppError::InvalidPath("Drive letter required, e.g. C:\\".to_string()))?;

        let entries = self.scan_mft(drive)?;

        // 阶段 III: 构建文件树
        *self.current_stage.lock() = ScanStage::BuildingTree;
        let root_node = tree_builder::build_tree(entries, root_path)?;

        Ok(root_node)
    }

    #[cfg(windows)]
    fn scan_mft(&self, drive: &str) -> AppResult<Vec<MftEntry>> {
        // 获取卷参数
        let vol_info = ntfs_io::get_volume_info(drive)?;

        // 阶段 I: 读取原始 MFT 数据
        let mft_data = ntfs_io::read_mft_raw(drive, &vol_info)?;

        // 阶段 II: 并行解析 MFT 记录
        let record_size = vol_info.bytes_per_mft_record as usize;
        let entries: Vec<MftEntry> = {
            let result = mft_data
                .par_chunks_exact(record_size)
                .enumerate()
                .filter_map(|(idx, record_bytes)| {
                    if self.should_cancel.load(Ordering::Relaxed) {
                        return None;
                    }
                    let entry = mft_parser::parse_mft_record(record_bytes, idx as u64)?;
                    if entry.is_dir {
                        self.scanned_dirs.fetch_add(1, Ordering::Relaxed);
                    } else {
                        self.scanned_files.fetch_add(1, Ordering::Relaxed);
                        self.total_size.fetch_add(entry.size, Ordering::Relaxed);
                    }
                    Some(entry)
                })
                .collect();
            drop(mft_data); // 立即释放原始 MFT 缓冲区
            result
        };

        Ok(entries)
    }

    #[cfg(not(windows))]
    fn scan_mft(&self, _drive: &str) -> AppResult<Vec<MftEntry>> {
        Err(AppError::Ntfs(
            "MFT scanning is only supported on Windows".to_string(),
        ))
    }
}
