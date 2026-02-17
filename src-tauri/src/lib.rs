mod models;
mod ntfs_io;
mod mft_parser;
mod tree_builder;
mod mft_scanner;

#[global_allocator]
static GLOBAL: mimalloc::MiMalloc = mimalloc::MiMalloc;

use mft_scanner::MftScanner;
use models::{ScanConfig, ScanProgress};

use parking_lot::Mutex;
use std::sync::Arc;
use tauri::State;

#[derive(serde::Serialize, serde::Deserialize)]
struct GitHubLatestRelease {
    tag_name: String,
    html_url: Option<String>,
    body: Option<String>,
}

// 全局扫描器状态
struct ScannerState {
    scanner: Arc<Mutex<Option<Arc<MftScanner>>>>,
}

#[tauri::command]
async fn get_latest_release(repo: String) -> Result<GitHubLatestRelease, String> {
    let atom_url = format!("https://github.com/{}/releases.atom", repo.trim());

    // 使用 spawn_blocking 因为 ureq 是同步的，避免阻塞异步运行时
    tokio::task::spawn_blocking(move || {
        let agent = ureq::Agent::config_builder()
            .timeout_global(Some(std::time::Duration::from_secs(10)))
            .build()
            .new_agent();

        let response = agent.get(&atom_url)
            .header("User-Agent", "DiskClarity")
            .call()
            .map_err(|e: ureq::Error| e.to_string())?;

        let text = response.into_body().read_to_string().map_err(|e: ureq::Error| e.to_string())?;

        let marker = "/releases/tag/";
        let idx = text
            .find(marker)
            .ok_or_else(|| "Cannot parse releases feed".to_string())?;

        let start = idx + marker.len();
        let rest = &text[start..];
        let end = rest
            .find('"')
            .or_else(|| rest.find('<'))
            .unwrap_or(rest.len());
        let tag = rest[..end].trim().to_string();

        let html_url = format!("https://github.com/{}/releases/tag/{}", repo.trim(), tag);

        Ok(GitHubLatestRelease {
            tag_name: tag,
            html_url: Some(html_url),
            body: None,
        })
    })
    .await
    .map_err(|e: tokio::task::JoinError| e.to_string())?
}

impl ScannerState {
    fn new() -> Self {
        Self {
            scanner: Arc::new(Mutex::new(None)),
        }
    }
}

#[tauri::command]
async fn start_scan(
    path: String,
    config: ScanConfig,
    state: State<'_, ScannerState>,
) -> Result<Vec<u8>, String> {
    // 创建扫描器实例
    let scanner = Arc::new(MftScanner::new());
    
    // 将扫描器存储在状态中以追踪进度
    {
        let mut scanner_lock = state.scanner.lock();
        *scanner_lock = Some(scanner.clone());
    }

    // 在阻塞任务中运行扫描
    let scan_start = std::time::Instant::now();
    let result = tokio::task::spawn_blocking(move || {
        scanner.scan(&path, config)
    })
    .await
    .map_err(|e| format!("Scan task failed: {}", e))??;
    
    let _scan_duration = scan_start.elapsed();
    
    // 更新阶段为序列化
    {
        let scanner_lock = state.scanner.lock();
        if let Some(ref scanner) = *scanner_lock {
            *scanner.current_stage.lock() = String::from("serializing");
        }
    }
    
    // 序列化为 MessagePack 并压缩
    let msgpack_data = rmp_serde::to_vec_named(&result)
        .map_err(|e| format!("MessagePack serialization failed: {}", e))?;
    
    // 使用 gzip 压缩
    use flate2::write::GzEncoder;
    use flate2::Compression;
    use std::io::Write;
    
    let mut encoder = GzEncoder::new(Vec::new(), Compression::fast());
    encoder.write_all(&msgpack_data)
        .map_err(|e| format!("Compression write failed: {}", e))?;
    let compressed_data = encoder.finish()
        .map_err(|e| format!("Compression finish failed: {}", e))?;
    
    // 从状态中清除扫描器
    {
        let mut scanner_lock = state.scanner.lock();
        *scanner_lock = None;
    }
    
    Ok(compressed_data)
}

#[tauri::command]
async fn get_scan_progress(state: State<'_, ScannerState>) -> Result<ScanProgress, String> {
    let scanner_lock = state.scanner.lock();
    
    if let Some(scanner) = scanner_lock.as_ref() {
        Ok(scanner.get_progress())
    } else {
        Err("No active scan".to_string())
    }
}

#[tauri::command]
async fn cancel_scan(state: State<'_, ScannerState>) -> Result<(), String> {
    let scanner_lock = state.scanner.lock();
    
    if let Some(scanner) = scanner_lock.as_ref() {
        scanner.cancel();
        Ok(())
    } else {
        Err("No active scan".to_string())
    }
}

#[tauri::command]
#[allow(unused_must_use)]
async fn get_drives() -> Result<Vec<String>, String> {
    #[cfg(target_os = "windows")]
    {
        use std::path::Path;
        let mut drives = Vec::new();
        for letter in b'A'..=b'Z' {
            let drive = format!("{}:\\", letter as char);
            if Path::new(&drive).exists() {
                drives.push(drive);
            }
        }
        Ok(drives)
    }
    
    #[cfg(not(target_os = "windows"))]
    {
        Ok(vec!["/".to_string()])
    }
}

#[tauri::command]
fn get_cpu_count() -> usize {
    num_cpus::get()
}

#[tauri::command]
fn open_in_explorer(path: String) -> Result<(), String> {
    #[cfg(target_os = "windows")]
    {
        use std::process::Command;
        
        // 规范化路径
        let normalized_path = match std::path::Path::new(&path).canonicalize() {
            Ok(p) => p.to_string_lossy().to_string(),
            Err(e) => {
                return Err(format!("Failed to canonicalize path: {}", e));
            }
        };
        
        let is_file = std::path::Path::new(&path).is_file();
        
        if is_file {
            Command::new("explorer")
                .args(["/select,", normalized_path.as_str()])
                .spawn()
                .map_err(|e| format!("Failed to spawn explorer: {}", e))?;
        } else {
            Command::new("explorer")
                .arg(&normalized_path)
                .spawn()
                .map_err(|e| format!("Failed to spawn explorer: {}", e))?;
        }
        
        Ok(())
    }
}

#[derive(serde::Serialize)]
struct DiskInfo {
    path: String,
    total_space: u64,
    available_space: u64,
    used_space: u64,
}

#[tauri::command]
async fn get_disk_info(path: String) -> Result<DiskInfo, String> {
    tokio::task::spawn_blocking(move || {
        #[cfg(target_os = "windows")]
        {
            use windows::Win32::Storage::FileSystem::GetDiskFreeSpaceExW;
            use windows::core::PCWSTR;
            use std::os::windows::ffi::OsStrExt;
            
            let wide_path: Vec<u16> = std::ffi::OsStr::new(&path)
                .encode_wide()
                .chain(std::iter::once(0))
                .collect();
            
            let mut free_bytes: u64 = 0;
            let mut total_bytes: u64 = 0;
            let mut available_bytes: u64 = 0;
            
            unsafe {
                GetDiskFreeSpaceExW(
                    PCWSTR(wide_path.as_ptr()),
                    Some(&mut available_bytes),
                    Some(&mut total_bytes),
                    Some(&mut free_bytes),
                ).map_err(|e| format!("Failed to get disk space information: {}", e))?;
            }
            
            let used_bytes = total_bytes.saturating_sub(free_bytes);
            
            Ok(DiskInfo {
                path: path.clone(),
                total_space: total_bytes,
                available_space: available_bytes,
                used_space: used_bytes,
            })
        }
        
        #[cfg(not(target_os = "windows"))]
        {
            use std::fs;
            
            match fs::metadata(&path) {
                Ok(_) => {
                    // 在 Unix 系统上，可以使用 statvfs
                    #[cfg(unix)]
                    {
                        use libc::{c_char, statvfs};
                        use std::ffi::CString;
                        
                        let c_path = CString::new(path.as_bytes()).map_err(|e| e.to_string())?;
                        let mut stat: statvfs = unsafe { std::mem::zeroed() };
                        
                        if unsafe { statvfs(c_path.as_ptr() as *const c_char, &mut stat) } == 0 {
                            let total_bytes = stat.f_blocks * stat.f_frsize;
                            let available_bytes = stat.f_bavail * stat.f_frsize;
                            let free_bytes = stat.f_bfree * stat.f_frsize;
                            let used_bytes = total_bytes.saturating_sub(free_bytes);
                            
                            return Ok(DiskInfo {
                                path: path.clone(),
                                total_space: total_bytes,
                                available_space: available_bytes,
                                used_space: used_bytes,
                            });
                        }
                    }
                    
                    Err("Failed to get disk space information".to_string())
                }
                Err(e) => Err(format!("Failed to access path: {}", e)),
            }
        }
    })
    .await
    .map_err(|e| format!("Task failed: {}", e))?
}

#[cfg_attr(mobile, tauri::mobile_entry_point)]
pub fn run() {
    tauri::Builder::<tauri::Wry>::default()
        .plugin(tauri_plugin_opener::init())
        .manage(ScannerState::new())
        .invoke_handler(tauri::generate_handler![
            start_scan,
            get_scan_progress,
            cancel_scan,
            get_drives,
            get_cpu_count,
            get_disk_info,
            open_in_explorer,
            get_latest_release
        ])
        .run(tauri::generate_context!())
        .expect("error while running tauri application");
}
