use serde::{Deserialize, Serialize};
use std::collections::HashMap;
use std::sync::atomic::{AtomicBool, AtomicU64, Ordering};
use std::sync::Arc;
use std::time::{SystemTime, UNIX_EPOCH};
use rayon::prelude::*;

// 文件树节点结构，用于序列化和前端展示
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct FileNode {
    pub name: String,
    #[serde(skip_serializing_if = "String::is_empty", default)]
    pub path: String,
    pub size: u64,
    pub is_dir: bool,
    #[serde(skip_serializing_if = "Vec::is_empty", default)]
    pub children: Vec<FileNode>,
    pub file_count: u64,
    pub dir_count: u64,
    #[serde(skip_serializing_if = "is_zero", default)]
    pub modified_time: u64, // Unix 时间戳（秒）
}

#[inline]
fn is_zero(n: &u64) -> bool {
    *n == 0
}

// 扫描进度信息，实时推送给前端
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct ScanProgress {
    pub scanned_files: u64,
    pub scanned_dirs: u64,
    pub total_size: u64,
    pub current_path: String,
    pub is_complete: bool,
    pub duration_ms: u64, // 扫描耗时（毫秒）
    #[serde(skip_serializing_if = "Option::is_none")]
    pub stage: Option<String>, // 扫描阶段：scanning | fetching_sizes | building_tree | serializing | complete
}

#[derive(Debug, Clone, Copy, Serialize, Deserialize)]
pub struct ScanConfig {
    /// 最大并行线程数（None 表示使用 CPU 核心数）
    pub max_threads: Option<usize>,
}

impl Default for ScanConfig {
    fn default() -> Self {
        Self {
            max_threads: None,
        }
    }
}

// 内部结构：MFT 解析后的节点信息
#[derive(Clone, Debug)]
struct MftNode {
    file_ref: u64,
    parent_ref: u64,
    name: String,
    size: u64,
    is_dir: bool,
    modified_time: u64,
    #[allow(dead_code)]
    link_count: u16,
    needs_size_fallback: bool, // 标记是否需要从文件系统获取大小
}

// 内部结构：MFT 文件条目（用于树构建）
#[derive(Clone)]
struct MftFileEntry {
    file_ref: u64,
    parent_ref: u64,
    name: String,
    size: u64,
    is_dir: bool,
    modified_time: u64,
    needs_size_fallback: bool, // 标记是否需要从文件系统获取大小
}

// Data Run 结构
#[derive(Debug, Clone)]
struct DataRun {
    start_cluster: u64,
    cluster_count: u64,
}

// 文件名信息（处理多个名称）
#[derive(Debug, Clone)]
struct FileNameInfo {
    name: String,
    parent_ref: u64,
    is_win32: bool,
    is_dir: bool,
}

// NTFS 卷参数
#[derive(Debug, Clone)]
struct NtfsVolumeInfo {
    bytes_per_sector: u64,
    bytes_per_cluster: u64,
    bytes_per_mft_record: u64,
    mft_start_lcn: u64,
    #[allow(dead_code)]
    mft_valid_data_length: u64,
}

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
            return Err("无效路径：必须指定驱动器号（例如 C:\\）".to_string());
        };

        // 通过 MFT 扫描磁盘
        let entries = self.scan_mft(drive)?;

        // 构建文件树结构
        let root_node = self.build_tree(entries, root_path)?;

        Ok(root_node)
    }

    /// MFT 扫描
    /// 高效原始 IO - 直接读取 NTFS 卷中的 $MFT 数据（无缓冲 IO）
    /// 并行解析 - 使用 Rayon 并行处理 MFT 记录
    #[cfg(windows)]
    fn scan_mft(&self, drive: &str) -> Result<Vec<MftFileEntry>, String> {
        let scan_start = std::time::Instant::now();

        // 获取卷参数
        let vol_info = self.get_volume_info(drive)?;

        // 阶段 I: 读取原始 MFT 数据
        let io_start = std::time::Instant::now();
        let mft_data = self.read_mft_raw(drive, &vol_info)?;
        let _io_duration = io_start.elapsed();
        let _total_records = mft_data.len() / vol_info.bytes_per_mft_record as usize;

        // 阶段 II: 并行解析 MFT 记录
        let parse_start = std::time::Instant::now();
        
        let record_size = vol_info.bytes_per_mft_record as usize;
        let nodes: Vec<Option<MftNode>> = mft_data
            .par_chunks_exact(record_size)
            .enumerate()
            .map(|(idx, record_bytes)| {
                if self.should_cancel.load(Ordering::Relaxed) {
                    return None;
                }
                self.parse_mft_record(record_bytes, idx as u64)
            })
            .collect();

        let _parse_duration = parse_start.elapsed();

        // 统计已解析的记录
        let parsed_count = nodes.iter().filter(|n| n.is_some()).count();

        // 转换为 MftFileEntry 并更新原子计数器
        let mut entries = Vec::with_capacity(parsed_count);
        for node in nodes {
            if let Some(n) = node {
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
        }

        let _scan_duration = scan_start.elapsed();

        Ok(entries)
    }

    /// 获取 NTFS 卷参数
    /// 优先使用 FSCTL_GET_NTFS_VOLUME_DATA，失败则回退到引导扇区解析
    #[cfg(windows)]
    fn get_volume_info(&self, drive: &str) -> Result<NtfsVolumeInfo, String> {
        use windows::Win32::Storage::FileSystem::*;
        use windows::Win32::Foundation::*;
        use std::os::windows::ffi::OsStrExt;
        use std::ffi::OsStr;
        use winapi::um::ioapiset::DeviceIoControl;
        use winapi::um::winioctl::FSCTL_GET_NTFS_VOLUME_DATA;

        let volume_path = format!("\\\\.\\{}", drive);
        let wide_path: Vec<u16> = OsStr::new(&volume_path)
            .encode_wide()
            .chain(std::iter::once(0))
            .collect();

        unsafe {
            let handle = CreateFileW(
                windows::core::PCWSTR(wide_path.as_ptr()),
                FILE_READ_DATA.0,
                FILE_SHARE_READ | FILE_SHARE_WRITE | FILE_SHARE_DELETE,
                None,
                OPEN_EXISTING,
                FILE_FLAG_NO_BUFFERING | FILE_FLAG_SEQUENTIAL_SCAN,
                None,
            ).map_err(|e| format!("无法打开卷: {:?}。请确保以管理员身份运行。", e))?;

            // 尝试 FSCTL_GET_NTFS_VOLUME_DATA
            let mut vol_data = [0u8; 512];
            let mut bytes_returned = 0u32;
            
            let handle_ptr = handle.0 as *mut std::ffi::c_void;
            
            let ioctl_result = DeviceIoControl(
                handle_ptr,
                FSCTL_GET_NTFS_VOLUME_DATA,
                std::ptr::null_mut(),
                0,
                &mut vol_data as *mut _ as *mut std::ffi::c_void,
                vol_data.len() as u32,
                &mut bytes_returned,
                std::ptr::null_mut(),
            );
            
            if ioctl_result != 0 && bytes_returned >= 72 {
                // NTFS_VOLUME_DATA_BUFFER 结构布局
                // 偏移 40-43: BytesPerSector (4 字节，小端序)
                // 偏移 44-47: BytesPerCluster (4 字节，小端序)
                // 偏移 48-51: BytesPerFileRecordSegment (4 字节，小端序)
                // 偏移 56-63: MftValidDataLength (8 字节，小端序) - 实际 MFT 大小
                // 偏移 64-71: MftStartLcn (8 字节，小端序) - MFT 起始逻辑簇号
                
                let bytes_per_sector = u32::from_le_bytes([
                    vol_data[40], vol_data[41], vol_data[42], vol_data[43]
                ]) as u64;
                
                let bytes_per_cluster = u32::from_le_bytes([
                    vol_data[44], vol_data[45], vol_data[46], vol_data[47]
                ]) as u64;
                
                let bytes_per_mft_record = u32::from_le_bytes([
                    vol_data[48], vol_data[49], vol_data[50], vol_data[51]
                ]) as u64;
                
                let mft_valid_data_length = u64::from_le_bytes([
                    vol_data[56], vol_data[57], vol_data[58], vol_data[59],
                    vol_data[60], vol_data[61], vol_data[62], vol_data[63],
                ]);
                
                let mft_start_lcn = u64::from_le_bytes([
                    vol_data[64], vol_data[65], vol_data[66], vol_data[67],
                    vol_data[68], vol_data[69], vol_data[70], vol_data[71],
                ]);

                let _ = CloseHandle(handle);
                
                return Ok(NtfsVolumeInfo {
                    bytes_per_sector,
                    bytes_per_cluster,
                    bytes_per_mft_record,
                    mft_start_lcn,
                    mft_valid_data_length,
                });
            }

            let _ = CloseHandle(handle);
            
            // 回退
            self.get_volume_info_from_boot_sector(drive)
        }
    }

    /// 从引导扇区解析 NTFS BPB（BIOS 参数块）
    /// 通过读取卷的第一个扇区来获取参数
    #[cfg(windows)]
    fn get_volume_info_from_boot_sector(&self, drive: &str) -> Result<NtfsVolumeInfo, String> {
        use windows::Win32::Storage::FileSystem::*;
        use windows::Win32::Foundation::*;
        use std::os::windows::ffi::OsStrExt;
        use std::ffi::OsStr;

        let volume_path = format!("\\\\.\\{}", drive);
        let wide_path: Vec<u16> = OsStr::new(&volume_path)
            .encode_wide()
            .chain(std::iter::once(0))
            .collect();

        unsafe {
            let handle = CreateFileW(
                windows::core::PCWSTR(wide_path.as_ptr()),
                FILE_READ_DATA.0,
                FILE_SHARE_READ | FILE_SHARE_WRITE | FILE_SHARE_DELETE,
                None,
                OPEN_EXISTING,
                FILE_FLAG_NO_BUFFERING | FILE_FLAG_SEQUENTIAL_SCAN,
                None,
            ).map_err(|e| format!("无法打开卷: {:?}", e))?;

            let mut boot_sector = [0u8; 512];
            let mut bytes_read = 0u32;
            
            if ReadFile(handle, Some(&mut boot_sector), Some(&mut bytes_read), None).is_err() {
                let _ = CloseHandle(handle);
                return Err("无法读取引导扇区".to_string());
            }

            // 解析 NTFS BPB（引导参数块）
            let bytes_per_sector = u16::from_le_bytes([boot_sector[0x0B], boot_sector[0x0C]]) as u64;
            let sectors_per_cluster = boot_sector[0x0D] as u64;
            let bytes_per_cluster = bytes_per_sector * sectors_per_cluster;
            
            // 负数表示 2^(-value) 字节，正数表示 value * bytes_per_cluster
            let clusters_per_record = boot_sector[0x40] as i8;
            let bytes_per_mft_record = if clusters_per_record < 0 {
                1u64 << (-clusters_per_record as u32)  // 2^(-clusters_per_record)
            } else {
                (clusters_per_record as u64) * bytes_per_cluster
            };

            let mft_start_lcn = u64::from_le_bytes([
                boot_sector[0x30], boot_sector[0x31], boot_sector[0x32], boot_sector[0x33],
                boot_sector[0x34], boot_sector[0x35], boot_sector[0x36], boot_sector[0x37],
            ]);

            let _ = CloseHandle(handle);


            Ok(NtfsVolumeInfo {
                bytes_per_sector,
                bytes_per_cluster,
                bytes_per_mft_record,
                mft_start_lcn,
                mft_valid_data_length: 0, // 稍后从 MFT 记录 0 获取
            })
        }
    }

    /// 读取原始 MFT 数据
    /// 使用无缓冲 IO 直接从磁盘读取，绕过文件系统缓存
    #[cfg(windows)]
    fn read_mft_raw(&self, drive: &str, vol_info: &NtfsVolumeInfo) -> Result<Vec<u8>, String> {
        use windows::Win32::Storage::FileSystem::*;
        use windows::Win32::Foundation::*;
        use std::os::windows::ffi::OsStrExt;
        use std::ffi::OsStr;

        let volume_path = format!("\\\\.\\{}", drive);
        let wide_path: Vec<u16> = OsStr::new(&volume_path)
            .encode_wide()
            .chain(std::iter::once(0))
            .collect();

        unsafe {
            let handle = CreateFileW(
                windows::core::PCWSTR(wide_path.as_ptr()),
                FILE_READ_DATA.0,
                FILE_SHARE_READ | FILE_SHARE_WRITE | FILE_SHARE_DELETE,
                None,
                OPEN_EXISTING,
                FILE_FLAG_NO_BUFFERING | FILE_FLAG_SEQUENTIAL_SCAN,
                None,
            ).map_err(|e| format!("无法打开卷: {:?}", e))?;

            // 计算 MFT 记录 0 的物理偏移
            let mft_record0_offset = vol_info.mft_start_lcn * vol_info.bytes_per_cluster;
            
            // 必须对齐到扇区大小（通常 512 字节）
            let sector_size = vol_info.bytes_per_sector;
            let aligned_offset = (mft_record0_offset / sector_size) * sector_size;
            let offset_within_sector = mft_record0_offset - aligned_offset;
            
            let mut new_pos: i64 = 0;
            
            if SetFilePointerEx(handle, aligned_offset as i64, Some(&mut new_pos), FILE_BEGIN).is_err() {
                let _ = CloseHandle(handle);
                return Err(format!("无法定位到 MFT 记录 0 (对齐偏移: {})", aligned_offset));
            }

            // 读取 MFT 记录 0 以获取 $DATA 属性和实际大小
            let record_size = vol_info.bytes_per_mft_record as usize;
            
            // 计算对齐后的读取大小，确保读取的数据量是扇区大小的整数倍
            let aligned_read_size = ((record_size + offset_within_sector as usize + sector_size as usize - 1) / sector_size as usize) * sector_size as usize;
            let mut read_buffer = vec![0u8; aligned_read_size];
            let mut bytes_read = 0u32;
            
            if ReadFile(handle, Some(&mut read_buffer), Some(&mut bytes_read), None).is_err() {
                let _ = CloseHandle(handle);
                return Err("无法读取 MFT 记录 0".to_string());
            }
            
            // 从对齐的缓冲区中提取实际的 MFT 记录 0
            let first_record = if offset_within_sector as usize + record_size <= read_buffer.len() {
                read_buffer[offset_within_sector as usize..offset_within_sector as usize + record_size].to_vec()
            } else {
                let _ = CloseHandle(handle);
                return Err("读取的数据不足".to_string());
            };

            // 从 MFT 记录 0 解析 $DATA 属性获取实际大小
            let mft_size = self.get_mft_size_from_record0(&first_record)?;

            // 解析 Data Runs 以获取 MFT 的所有片段
            let data_runs = self.parse_data_runs_from_record0(&first_record)?;

            // 按 Data Run 顺序读取所有 MFT 片段
            let mut mft_data = Vec::with_capacity(mft_size as usize);
            let sector_size = vol_info.bytes_per_sector;
            
            for (_i, run) in data_runs.iter().enumerate() {
                let fragment_offset = run.start_cluster * vol_info.bytes_per_cluster;
                let fragment_size = run.cluster_count * vol_info.bytes_per_cluster;
                
                // 对齐到扇区大小
                let aligned_offset = (fragment_offset / sector_size) * sector_size;
                let offset_within_sector = fragment_offset - aligned_offset;
                let aligned_read_size = ((fragment_size as usize + offset_within_sector as usize + sector_size as usize - 1) / sector_size as usize) * sector_size as usize;
                
                let mut new_pos: i64 = 0;
                if SetFilePointerEx(handle, aligned_offset as i64, Some(&mut new_pos), FILE_BEGIN).is_err() {
                    continue;
                }
                
                let mut read_buffer = vec![0u8; aligned_read_size];
                let mut bytes_read = 0u32;
                
                if ReadFile(handle, Some(&mut read_buffer), Some(&mut bytes_read), None).is_ok() {
                    let actual_data = &read_buffer[offset_within_sector as usize..];
                    let to_copy = std::cmp::min(fragment_size as usize, actual_data.len());
                    mft_data.extend_from_slice(&actual_data[..to_copy]);
                }
            }

            // 截断到实际大小
            mft_data.truncate(mft_size as usize);
            
            let _ = CloseHandle(handle);
            
            Ok(mft_data)
        }
    }

    /// 从 MFT 记录 0 获取 $DATA 属性的实际大小
    #[cfg(windows)]
    fn get_mft_size_from_record0(&self, record_bytes: &[u8]) -> Result<u64, String> {
        if record_bytes.len() < 42 || &record_bytes[0..4] != b"FILE" {
            return Err("无效的 MFT 记录".to_string());
        }

        let first_attr_offset = u16::from_le_bytes([record_bytes[0x14], record_bytes[0x15]]) as usize;
        let mut attr_offset = first_attr_offset;

        while attr_offset + 8 < record_bytes.len() {
            let attr_type = u32::from_le_bytes([
                record_bytes[attr_offset],
                record_bytes[attr_offset + 1],
                record_bytes[attr_offset + 2],
                record_bytes[attr_offset + 3],
            ]);

            if attr_type == 0xFFFFFFFF {
                break;
            }

            let attr_len = u32::from_le_bytes([
                record_bytes[attr_offset + 4],
                record_bytes[attr_offset + 5],
                record_bytes[attr_offset + 6],
                record_bytes[attr_offset + 7],
            ]) as usize;

            if attr_len == 0 || attr_offset + attr_len > record_bytes.len() {
                break;
            }

            // $DATA 属性 (0x80) - 非驻留
            if attr_type == 0x80 && record_bytes[attr_offset + 8] != 0 {
                // offset 0x30-0x37: AllocationSize（分配大小，对齐到簇）
                // offset 0x38-0x3F: ValidDataLength（有效数据长度，实际大小）
                if attr_offset + 0x40 < record_bytes.len() {
                    let actual_size = u64::from_le_bytes([
                        record_bytes[attr_offset + 0x38],
                        record_bytes[attr_offset + 0x39],
                        record_bytes[attr_offset + 0x3A],
                        record_bytes[attr_offset + 0x3B],
                        record_bytes[attr_offset + 0x3C],
                        record_bytes[attr_offset + 0x3D],
                        record_bytes[attr_offset + 0x3E],
                        record_bytes[attr_offset + 0x3F],
                    ]);
                    return Ok(actual_size);
                }
            }

            attr_offset += attr_len;
        }

        Err("未找到 $DATA 属性".to_string())
    }

    // 从 MFT 记录 0 解析 Data Runs
    #[cfg(windows)]
    fn parse_data_runs_from_record0(&self, record_bytes: &[u8]) -> Result<Vec<DataRun>, String> {
        if record_bytes.len() < 42 || &record_bytes[0..4] != b"FILE" {
            return Err("无效的 MFT 记录".to_string());
        }

        let first_attr_offset = u16::from_le_bytes([record_bytes[0x14], record_bytes[0x15]]) as usize;
        let mut attr_offset = first_attr_offset;

        while attr_offset + 8 < record_bytes.len() {
            let attr_type = u32::from_le_bytes([
                record_bytes[attr_offset],
                record_bytes[attr_offset + 1],
                record_bytes[attr_offset + 2],
                record_bytes[attr_offset + 3],
            ]);

            if attr_type == 0xFFFFFFFF {
                break;
            }

            let attr_len = u32::from_le_bytes([
                record_bytes[attr_offset + 4],
                record_bytes[attr_offset + 5],
                record_bytes[attr_offset + 6],
                record_bytes[attr_offset + 7],
            ]) as usize;

            if attr_len == 0 || attr_offset + attr_len > record_bytes.len() {
                break;
            }

            // $DATA 属性 (0x80) - 非驻留
            if attr_type == 0x80 && record_bytes[attr_offset + 8] != 0 {
                // Data Runs 偏移在 offset 0x20 (2 字节)
                let runs_offset = u16::from_le_bytes([
                    record_bytes[attr_offset + 0x20],
                    record_bytes[attr_offset + 0x21],
                ]) as usize;

                let runs_start = attr_offset + runs_offset;
                return self.parse_data_runs_bytes(&record_bytes[runs_start..]);
            }

            attr_offset += attr_len;
        }

        Err("未找到 $DATA 属性".to_string())
    }

    // 解析 Data Runs 字节数组
    #[cfg(windows)]
    fn parse_data_runs_bytes(&self, data: &[u8]) -> Result<Vec<DataRun>, String> {
        let mut runs = Vec::new();
        let mut offset = 0;
        let mut current_cluster = 0u64;

        while offset < data.len() {
            let first_byte = data[offset];
            if first_byte == 0 {
                break; // Data Runs 结束
            }

            let size_len = (first_byte & 0x0F) as usize;
            let offset_len = ((first_byte >> 4) & 0x0F) as usize;

            if size_len == 0 || offset_len == 0 || offset + 1 + size_len + offset_len > data.len() {
                break;
            }

            offset += 1;

            // 读取簇计数
            let mut cluster_count = 0u64;
            for i in 0..size_len {
                cluster_count |= (data[offset + i] as u64) << (i * 8);
            }
            offset += size_len;

            // 读取簇偏移 (有符号)
            let mut cluster_offset = 0i64;
            for i in 0..offset_len {
                cluster_offset |= (data[offset + i] as i64) << (i * 8);
            }
            offset += offset_len;

            // 处理有符号偏移
            if offset_len > 0 {
                let sign_bit = 1i64 << (offset_len * 8 - 1);
                if cluster_offset & sign_bit != 0 {
                    cluster_offset -= sign_bit << 1;
                }
            }

            current_cluster = (current_cluster as i64 + cluster_offset) as u64;

            if cluster_count > 0 {
                runs.push(DataRun {
                    start_cluster: current_cluster,
                    cluster_count,
                });
            }
        }

        Ok(runs)
    }

    // 解析单个 MFT 记录 - 应用 Fixup Array 修复并提取属性
    #[cfg(windows)]
    fn parse_mft_record(&self, record_bytes: &[u8], record_idx: u64) -> Option<MftNode> {
        if record_bytes.len() < 42 {
            return None;
        }

        // MFT 记录签名检查
        if &record_bytes[0..4] != b"FILE" {
            return None;
        }

        // 应用 Fixup Array 修复记录
        // 偏移 0x04-0x05: USN 偏移
        // 偏移 0x06-0x07: fixup 条目数
        let usn_offset = u16::from_le_bytes([record_bytes[0x04], record_bytes[0x05]]) as usize;
        let usn_size = u16::from_le_bytes([record_bytes[0x06], record_bytes[0x07]]) as usize;
        
        // 创建可变副本用于应用 fixup
        let mut record_data = record_bytes.to_vec();
        
        if usn_offset > 0 && usn_offset < record_data.len() && usn_size > 1 {
            // 第一个 fixup 值是标记需要修复的扇区的修复值
            if usn_offset + 2 <= record_data.len() {
                let fixup_value = u16::from_le_bytes([
                    record_data[usn_offset],
                    record_data[usn_offset + 1],
                ]);
                
                // 将每个 512 字节扇区末尾的修复值替换为 fixup 数组中的对应值
                for i in 1..usn_size {
                    let sector_offset = i * 512 - 2; // 每个 512 字节扇区的最后 2 字节
                    let fixup_offset = usn_offset + i * 2;
                    
                    if sector_offset < record_data.len() && fixup_offset + 2 <= record_data.len() {
                        // 检查扇区末尾是否与修复值匹配
                        let sector_end = u16::from_le_bytes([
                            record_data[sector_offset],
                            record_data[sector_offset + 1],
                        ]);
                        
                        if sector_end == fixup_value {
                            let correct_value = u16::from_le_bytes([
                                record_data[fixup_offset],
                                record_data[fixup_offset + 1],
                            ]);
                            record_data[sector_offset] = correct_value as u8;
                            record_data[sector_offset + 1] = (correct_value >> 8) as u8;
                        }
                    }
                }
            }
        }
        
        // 使用修复后的记录数据进行解析
        let record_bytes = &record_data;

        // 检查记录是否在使用中（0x16 标志的第 0 位）
        let flags = u16::from_le_bytes([record_bytes[0x16], record_bytes[0x17]]);
        if (flags & 0x0001) == 0 {
            return None;
        }

        // 从 MFT 记录标志检查是否为目录（第 1 位）
        // 也检查第 4 位 (0x10)，在某些情况下也可能表示目录
        let is_dir_from_flags = (flags & 0x0002) != 0 || (flags & 0x0010) != 0;

        // 获取第一个属性的偏移（0x14）
        let first_attr_offset = u16::from_le_bytes([record_bytes[0x14], record_bytes[0x15]]) as usize;
        if first_attr_offset >= record_bytes.len() {
            return None;
        }

        let mut name = String::new();
        let mut parent_ref = 0u64;
        let mut size = 0u64;
        let mut is_dir = false;
        let mut modified_time = 0u64;
        let mut file_names: Vec<FileNameInfo> = Vec::new();

        // 解析属性
        let mut offset = first_attr_offset;
        let mut attr_count = 0;
        
        
        while offset + 4 < record_bytes.len() {
            let attr_type = u32::from_le_bytes([
                record_bytes[offset],
                record_bytes[offset + 1],
                record_bytes[offset + 2],
                record_bytes[offset + 3],
            ]);

            if attr_type == 0xFFFFFFFF {
                break;
            }

            let attr_len = u32::from_le_bytes([
                record_bytes[offset + 4],
                record_bytes[offset + 5],
                record_bytes[offset + 6],
                record_bytes[offset + 7],
            ]) as usize;

            if attr_len == 0 || offset + attr_len > record_bytes.len() {
                break;
            }
            
            attr_count += 1;

            // 标准信息属性 (0x10)
            if attr_type == 0x10 && offset + 80 < record_bytes.len() {
                // 对于驻留属性，跳转到值
                let is_resident = record_bytes[offset + 8] == 0;
                if is_resident && offset + 24 < record_bytes.len() {
                    // 对于驻留属性，值偏移在 0x14-0x15（相对于属性开始）
                    let value_offset = u16::from_le_bytes([
                        record_bytes[offset + 0x14],
                        record_bytes[offset + 0x15],
                    ]) as usize;
                    
                    if offset + value_offset + 48 < record_bytes.len() {
                        let attr_offset = offset + value_offset;
                        // 修改时间在偏移 24 处（8 字节，Windows FILETIME 格式）
                        let filetime = u64::from_le_bytes([
                            record_bytes[attr_offset + 24],
                            record_bytes[attr_offset + 25],
                            record_bytes[attr_offset + 26],
                            record_bytes[attr_offset + 27],
                            record_bytes[attr_offset + 28],
                            record_bytes[attr_offset + 29],
                            record_bytes[attr_offset + 30],
                            record_bytes[attr_offset + 31],
                        ]);
                        if filetime > 0 {
                            // 转换 Windows FILETIME 为 Unix 时间戳
                            modified_time = (filetime / 10_000_000).saturating_sub(11644473600);
                        }
                    }
                }
            }

            // 文件名属性 (0x30)
            if attr_type == 0x30 {
                let is_resident = record_bytes[offset + 8] == 0;
                if is_resident && offset + 24 < record_bytes.len() {
                    // 对于驻留属性，值偏移在 0x14-0x15（相对于属性开始）
                    let value_offset = u16::from_le_bytes([
                        record_bytes[offset + 0x14],
                        record_bytes[offset + 0x15],
                    ]) as usize;
                    
                    // 检查是否可以读取文件名属性的至少头部
                    if offset + value_offset + 8 < record_bytes.len() {
                        let attr_offset = offset + value_offset;
                        
                        // 父目录引用（前 48 位有效）
                        let current_parent_ref = u64::from_le_bytes([
                            record_bytes[attr_offset],
                            record_bytes[attr_offset + 1],
                            record_bytes[attr_offset + 2],
                            record_bytes[attr_offset + 3],
                            record_bytes[attr_offset + 4],
                            record_bytes[attr_offset + 5],
                            record_bytes[attr_offset + 6],
                            record_bytes[attr_offset + 7],
                        ]) & 0x0000_FFFF_FFFF_FFFF;

                        // 文件属性在偏移 56 处（4 字节，小端序）
                        // 第 4 位 (0x10) = FILE_ATTRIBUTE_DIRECTORY
                        let current_is_dir = if attr_offset + 60 < record_bytes.len() {
                            let file_attrs = u32::from_le_bytes([
                                record_bytes[attr_offset + 56],
                                record_bytes[attr_offset + 57],
                                record_bytes[attr_offset + 58],
                                record_bytes[attr_offset + 59],
                            ]);
                            
                            is_dir_from_flags || (file_attrs & 0x10) != 0
                        } else {
                            is_dir_from_flags
                        };

                        // 名称长度在偏移 64 处，名称从偏移 66 开始
                        if attr_offset + 65 < record_bytes.len() {
                            let name_len = record_bytes[attr_offset + 64] as usize;
                            let name_offset = attr_offset + 66;
                            
                            if name_len > 0 && name_len <= 255 && name_offset + name_len * 2 <= record_bytes.len() {
                                // UTF-16 LE 解码
                                let name_bytes = &record_bytes[name_offset..name_offset + name_len * 2];
                                let current_name = String::from_utf16_lossy(
                                    &name_bytes
                                        .chunks(2)
                                        .map(|c| u16::from_le_bytes([c[0], c[1]]))
                                        .collect::<Vec<_>>()
                                ).to_string();
                                
                                // 判断是否为 Win32 长文件名
                                let is_win32 = name_len > 8 && !current_name.contains('~');
                                
                                file_names.push(FileNameInfo {
                                    name: current_name,
                                    parent_ref: current_parent_ref,
                                    is_win32,
                                    is_dir: current_is_dir,
                                });
                            }
                        }
                    }
                }
            }

            // 数据属性 (0x80) - 获取文件大小
            if attr_type == 0x80 {
                let non_resident = record_bytes[offset + 8];
                
                if non_resident == 0 {
                    // 驻留数据 - 大小在偏移 16-19（4 字节）
                    if offset + 20 < record_bytes.len() {
                        let data_size = u32::from_le_bytes([
                            record_bytes[offset + 16],
                            record_bytes[offset + 17],
                            record_bytes[offset + 18],
                            record_bytes[offset + 19],
                        ]);
                        size = data_size as u64;
                    }
                } else {
                    // 非驻留数据 - 从偏移 56-63 获取 ValidDataLength
                    if offset + 64 < record_bytes.len() {
                        size = u64::from_le_bytes([
                            record_bytes[offset + 56],
                            record_bytes[offset + 57],
                            record_bytes[offset + 58],
                            record_bytes[offset + 59],
                            record_bytes[offset + 60],
                            record_bytes[offset + 61],
                            record_bytes[offset + 62],
                            record_bytes[offset + 63],
                        ]);
                    } else {
                        // 如果无法读取偏移 56-63，尝试读取分配大小
                        if offset + 56 < record_bytes.len() {
                            size = u64::from_le_bytes([
                                record_bytes[offset + 48],
                                record_bytes[offset + 49],
                                record_bytes[offset + 50],
                                record_bytes[offset + 51],
                                record_bytes[offset + 52],
                                record_bytes[offset + 53],
                                record_bytes[offset + 54],
                                record_bytes[offset + 55],
                            ]);
                        }
                    }
                }
            }

            offset += attr_len;
        }

        // 优先选择 Win32 长文件名
        if !file_names.is_empty() {
            let win32_names: Vec<_> = file_names.iter().filter(|n| n.is_win32).collect();
            let chosen_name = if !win32_names.is_empty() {
                &win32_names[0]
            } else {
                &file_names[0]
            };
            
            name = chosen_name.name.clone();
            parent_ref = chosen_name.parent_ref;
            is_dir = chosen_name.is_dir;
        }
        
        // 如果没有解析任何属性或名称为空，跳过该记录
        if attr_count == 0 || name.is_empty() {
            return None;
        }

        let link_count = 1u16;


        // 标记是否需要从文件系统获取大小
        let needs_size_fallback = !is_dir && size == 0;
        
        Some(MftNode {
            file_ref: record_idx & 0x0000_FFFF_FFFF_FFFF,
            parent_ref,
            name,
            size,
            is_dir,
            modified_time,
            link_count,
            needs_size_fallback,
        })
    }

    #[cfg(not(windows))]
    fn scan_mft(&self, _drive: &str) -> Result<Vec<MftFileEntry>, String> {
        Err("MFT 扫描仅在 Windows 上支持".to_string())
    }

    /// 从平面 MFT 条目构建树形结构
    fn build_tree(&self, entries: Vec<MftFileEntry>, root_path: &str) -> Result<FileNode, String> {
        *self.current_stage.lock() = String::from("building_tree");
        let tree_start = std::time::Instant::now();
        
        // 预分配映射容量
        let capacity = entries.len();
        let mut entry_map: HashMap<u64, MftFileEntry> = HashMap::with_capacity(capacity);
        let mut children_map: HashMap<u64, Vec<u64>> = HashMap::with_capacity(capacity / 4);
        
        // 收集需要回退获取大小的文件
        let mut fallback_entries: Vec<(u64, String)> = Vec::new();

        for mut entry in entries {
            let file_ref = entry.file_ref;
            let parent_ref = entry.parent_ref;
            
            // 特殊处理某些系统文件
            // $BadClus 文件的大小不应该被计入总大小
            if entry.name.eq_ignore_ascii_case("$BadClus") {
                entry.size = 0;
            }
            
            // 收集需要回退的文件
            if entry.needs_size_fallback {
                fallback_entries.push((file_ref, entry.name.clone()));
            }
            
            entry_map.insert(file_ref, entry);
            children_map.entry(parent_ref).or_insert_with(Vec::new).push(file_ref);
        }
        
        // 处理需要回退的文件（并行获取大小）
        if !fallback_entries.is_empty() {
            *self.current_stage.lock() = String::from("fetching_sizes");
                let fallback_start = std::time::Instant::now();
            
            let sizes: Vec<_> = fallback_entries
                .par_iter()
                .map(|(file_ref, _name)| {
                    // 从 entry_map 中获取文件的完整信息
                    let size = if let Some(_entry) = entry_map.get(file_ref) {
                        self.get_file_size_from_entry(&entry_map, root_path, *file_ref)
                            .unwrap_or(0)
                    } else {
                        0
                    };
                    (*file_ref, size)
                })
                .collect();
            
            // 更新 entry_map 中的大小
            for (file_ref, size) in sizes {
                if let Some(entry) = entry_map.get_mut(&file_ref) {
                    if size > 0 {
                        // 更新总大小统计
                        self.total_size.fetch_add(size - entry.size, Ordering::Relaxed);
                        entry.size = size;
                    }
                }
            }
            
            let _ = fallback_start.elapsed();
        }
        
        // NTFS 根目录引用号
        let root_ref = 5u64;
        
        // 为根目录名称提取驱动器号
        let root_name = if root_path.len() >= 2 && root_path.chars().nth(1) == Some(':') {
            root_path[0..2].to_string() // "C:"
        } else {
            root_path.to_string()
        };
        
        let root_entry = MftFileEntry {
            file_ref: root_ref,
            parent_ref: root_ref,
            name: root_name,
            size: 0,
            is_dir: true,
            modified_time: 0,
            needs_size_fallback: false,
        };
        
        entry_map.insert(root_ref, root_entry);
        
        // 递归生成树
        let result = self.build_node_recursive(&entry_map, &children_map, root_ref, root_path);
        
        let _ = tree_start.elapsed();
        result
    }

    fn build_node_recursive(
        &self,
        entry_map: &HashMap<u64, MftFileEntry>,
        children_map: &HashMap<u64, Vec<u64>>,
        file_ref: u64,
        path: &str,
    ) -> Result<FileNode, String> {
        let entry = entry_map.get(&file_ref)
            .ok_or_else(|| format!("Entry not found for file reference {}", file_ref))?;

        // 使用 MFT 条目中的文件大小
        let file_size = entry.size;

        let mut total_size = file_size;
        let mut file_count = if entry.is_dir { 0 } else { 1 };
        let mut dir_count = 0u64;

        // 处理子项
        let children = if let Some(child_refs) = children_map.get(&file_ref) {
            let mut children = Vec::with_capacity(child_refs.len());
            
            for &child_ref in child_refs {
                if self.should_cancel.load(Ordering::Relaxed) {
                    return Err("Scan cancelled".to_string());
                }

                // 跳过自引用（防止无限递归）
                if child_ref == file_ref {
                    continue;
                }

                if entry_map.get(&child_ref).is_none() {
                    continue;
                }

                // 跳过子项的路径构建
                let child_path = String::new();
                
                if let Ok(child_node) = self.build_node_recursive(entry_map, children_map, child_ref, &child_path) {
                    total_size += child_node.size;
                    file_count += child_node.file_count;
                    if child_node.is_dir {
                        dir_count += 1 + child_node.dir_count;
                    }
                    children.push(child_node);
                }
            }
            
            children
        } else {
            Vec::new()
        };

        Ok(FileNode {
            name: entry.name.clone(),
            path: path.to_string(),
            size: total_size,
            is_dir: entry.is_dir,
            children,
            file_count,
            dir_count,
            modified_time: entry.modified_time,
        })
    }
    
    // 从 MFT 条目获取文件大小（通过构建完整路径）
    fn get_file_size_from_entry(
        &self,
        entry_map: &HashMap<u64, MftFileEntry>,
        root_path: &str,
        file_ref: u64,
    ) -> Result<u64, String> {
        use std::fs;
        
        // 构建文件的完整路径
        let mut path_parts = Vec::new();
        let mut current_ref = file_ref;
        let root_ref = 5u64;
        
        // 从文件向上遍历到根目录，收集路径部分
        loop {
            if let Some(entry) = entry_map.get(&current_ref) {
                path_parts.push(entry.name.clone());
                if current_ref == root_ref || entry.parent_ref == current_ref {
                    break;
                }
                current_ref = entry.parent_ref;
            } else {
                break;
            }
        }
        
        // 反转路径部分（从根到文件）
        path_parts.reverse();
        
        // 跳过根目录名称，从第二个元素开始
        if path_parts.len() > 1 {
            path_parts.remove(0);
        }
        
        // 构建完整路径
        let mut full_path = root_path.to_string();
        for part in path_parts {
            full_path.push('\\');
            full_path.push_str(&part);
        }
        
        // 获取文件大小
        match fs::metadata(&full_path) {
            Ok(metadata) => {
                if metadata.is_file() {
                    Ok(metadata.len())
                } else {
                    Err(format!("Not a file: {}", full_path))
                }
            }
            Err(e) => {
                Err(format!("Failed to get size: {}", e))
            }
        }
    }
}
