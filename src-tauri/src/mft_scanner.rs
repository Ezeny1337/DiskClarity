use crate::models::{FileNode, MftFileEntry, ScanConfig, ScanProgress, MftNode};
use crate::ntfs_io;
use crate::mft_parser;
use crate::tree_builder;
use std::sync::atomic::{AtomicBool, AtomicU64, Ordering};
use std::sync::Arc;
use std::time::{SystemTime, UNIX_EPOCH};
use rayon::prelude::*;

pub struct MftScanner {
    scanned_files: Arc<AtomicU64>,
    scanned_dirs: Arc<AtomicU64>,
    total_size: Arc<AtomicU64>,
    should_cancel: Arc<AtomicBool>,
    start_time: Arc<AtomicU64>,
    pub current_stage: Arc<parking_lot::Mutex<String>>,
    config: Arc<parking_lot::Mutex<ScanConfig>>,
}

impl MftScanner {
    pub fn new() -> Self {
        Self {
            scanned_files: Arc::new(AtomicU64::new(0)),
            scanned_dirs: Arc::new(AtomicU64::new(0)),
            total_size: Arc::new(AtomicU64::new(0)),
            should_cancel: Arc::new(AtomicBool::new(false)),
            start_time: Arc::new(AtomicU64::new(0)),
            current_stage: Arc::new(parking_lot::Mutex::new(String::from("idle"))),
            config: Arc::new(parking_lot::Mutex::new(ScanConfig::default())),
        }
    }

    pub fn cancel(&self) {
        self.should_cancel.store(true, Ordering::Relaxed);
    }

    pub fn get_progress(&self) -> ScanProgress {
        let start = self.start_time.load(Ordering::Relaxed);
        let duration_ms = if start > 0 {
            SystemTime::now()
                .duration_since(UNIX_EPOCH)
                .unwrap()
                .as_millis() as u64
                - start
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
            stage: Some(self.current_stage.lock().clone()),
        }
    }

    pub fn scan(&self, root_path: &str, config: ScanConfig) -> Result<FileNode, String> {
        // 保存配置
        *self.config.lock() = config;
        
        // 配置 Rayon 线程池
        if let Some(threads) = config.max_threads {
            rayon::ThreadPoolBuilder::new()
                .num_threads(threads)
                .build_global()
                .ok();
        }
        
        // 重置计数器和状态
        self.scanned_files.store(0, Ordering::Relaxed);
        self.scanned_dirs.store(0, Ordering::Relaxed);
        self.total_size.store(0, Ordering::Relaxed);
        self.should_cancel.store(false, Ordering::Relaxed);
        *self.current_stage.lock() = String::from("scanning");

        // 记录扫描开始时间
        let start_time = SystemTime::now()
            .duration_since(UNIX_EPOCH)
            .unwrap()
            .as_millis() as u64;
        self.start_time.store(start_time, Ordering::Relaxed);

        // 提取驱动器号
        let drive = if root_path.len() >= 2 && root_path.chars().nth(1) == Some(':') {
            &root_path[0..2]
        } else {
            return Err("Invalid path: You must specify a drive letter (for example, C:\\)".to_string());
        };

        // 通过 MFT 扫描磁盘
        let entries = self.scan_mft(drive)?;

        // 构建文件树结构
        let root_node = tree_builder::build_tree(entries, root_path)?;

        Ok(root_node)
    }

    /// MFT 扫描
    /// 高效原始 IO - 直接读取 NTFS 卷中的 $MFT 数据（无缓冲 IO）
    /// 并行解析 - 使用 Rayon 并行处理 MFT 记录
    #[cfg(windows)]
    fn scan_mft(&self, drive: &str) -> Result<Vec<MftFileEntry>, String> {
        // 获取卷参数
        let vol_info = ntfs_io::get_volume_info(drive)?;

        // 阶段 I: 读取原始 MFT 数据
        let mft_data = ntfs_io::read_mft_raw(drive, &vol_info)?;

        // 阶段 II: 并行解析 MFT 记录
        let record_size = vol_info.bytes_per_mft_record as usize;
        let nodes: Vec<Option<MftNode>> = mft_data
            .par_chunks_exact(record_size)
            .enumerate()
            .map(|(idx, record_bytes)| {
                if self.should_cancel.load(Ordering::Relaxed) {
                    return None;
                }
                mft_parser::parse_mft_record(record_bytes, idx as u64)
            })
            .collect();

        // 统计已解析的记录
        let parsed_count = nodes.iter().filter(|n| n.is_some()).count();

        // 转换为 MftFileEntry 并更新原子计数器
        let mut entries = Vec::with_capacity(parsed_count);
        for n in nodes.into_iter().flatten() {
            if n.is_dir {
                self.scanned_dirs.fetch_add(1, Ordering::Relaxed);
            } else {
                self.scanned_files.fetch_add(1, Ordering::Relaxed);
                self.total_size.fetch_add(n.size, Ordering::Relaxed);
            }
            entries.push(MftFileEntry {
                file_ref: n.file_ref,
                parent_ref: n.parent_ref,
                name: n.name,
                size: n.size,
                is_dir: n.is_dir,
                modified_time: n.modified_time,
                needs_size_fallback: n.needs_size_fallback,
            });
        }

        Ok(entries)
    }
}
