use serde::{Deserialize, Serialize};

#[derive(serde::Serialize, serde::Deserialize)]
pub struct GitHubLatestRelease {
    pub tag_name: String,
    pub html_url: Option<String>,
    pub body: Option<String>,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct GitHubRelease {
    pub tag_name: String,
    pub name: Option<String>,
    pub body: Option<String>,
    pub html_url: Option<String>,
    pub published_at: Option<String>,
    pub prerelease: Option<bool>,
    pub draft: Option<bool>,
}

// 文件树节点结构，用于序列化和前端展示
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct FileNode {
    pub name: String,
    pub size: u64,
    pub is_dir: bool,
    #[serde(skip_serializing_if = "Vec::is_empty", default)]
    pub children: Vec<FileNode>,
    pub file_count: u64,
    pub dir_count: u64,
    #[serde(skip_serializing_if = "is_zero", default)]
    pub modified_time: u64,
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
    pub duration_ms: u64,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub stage: Option<String>, // 扫描阶段：scanning | fetching_sizes | building_tree | serializing | complete
}

#[derive(Debug, Clone, Copy, Serialize, Deserialize, Default)]
pub struct ScanConfig {
    /// 最大并行线程数
    pub max_threads: Option<usize>,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct DiskInfo {
    pub path: String,
    pub total_space: u64,
    pub available_space: u64,
    pub used_space: u64,
}

// MFT 解析后的节点信息
#[derive(Clone, Debug)]
pub struct MftNode {
    pub file_ref: u64,
    pub parent_ref: u64,
    pub name: String,
    pub size: u64,
    pub is_dir: bool,
    pub modified_time: u64,
    pub link_count: u16,
    pub needs_size_fallback: bool, // 是否需要从文件系统获取大小
}

// MFT 文件条目
#[derive(Clone)]
pub struct MftFileEntry {
    pub file_ref: u64,
    pub parent_ref: u64,
    pub name: String,
    pub size: u64,
    pub is_dir: bool,
    pub modified_time: u64,
    pub needs_size_fallback: bool, // 是否需要从文件系统获取大小
}

// Data Run 结构
#[derive(Debug, Clone)]
pub struct DataRun {
    pub start_cluster: u64,
    pub cluster_count: u64,
}

// 文件名信息
#[derive(Debug, Clone)]
pub struct FileNameInfo {
    pub name: String,
    pub parent_ref: u64,
    pub is_win32: bool,
    pub is_dir: bool,
}

// NTFS 卷参数
#[derive(Debug, Clone)]
pub struct NtfsVolumeInfo {
    pub bytes_per_sector: u64,
    pub bytes_per_cluster: u64,
    pub bytes_per_mft_record: u64,
    pub mft_start_lcn: u64,
    pub mft_valid_data_length: u64,
}
