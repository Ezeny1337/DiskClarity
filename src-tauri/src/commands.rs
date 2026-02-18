use crate::error::AppResult;
use crate::models::{ScanConfig, ScanProgress, DiskInfo};
use crate::mft_scanner::MftScanner;
use crate::snapshot::{SnapshotMeta, DiffResult};
use crate::ScannerState;
use tauri::State;
use std::sync::Arc;
use tokio::task;

fn github_token_from_env() -> Option<String> {
    std::env::var("DISKCLARITY_GITHUB_TOKEN")
        .ok()
        .filter(|v| !v.trim().is_empty())
}

#[tauri::command]
pub async fn start_scan(
    path: String,
    config: ScanConfig,
    state: State<'_, ScannerState>,
) -> AppResult<Vec<u8>> {
    let scanner = Arc::new(MftScanner::new());
    
    {
        let mut scanner_lock = state.scanner.lock();
        *scanner_lock = Some(scanner.clone());
    }

    let result = task::spawn_blocking(move || {
        scanner.scan(&path, config)
    })
    .await??;
    
    // 序列化
    let msgpack_data = rmp_serde::to_vec_named(&result)
        .map_err(|e| crate::error::AppError::Serialization(e.to_string()))?;
    
    use flate2::write::GzEncoder;
    use flate2::Compression;
    use std::io::Write;
    
    let mut encoder = GzEncoder::new(Vec::new(), Compression::fast());
    encoder.write_all(&msgpack_data)
        .map_err(|e| crate::error::AppError::Compression(e.to_string()))?;
    let compressed_data = encoder.finish()
        .map_err(|e| crate::error::AppError::Compression(e.to_string()))?;
    
    {
        let mut scanner_lock = state.scanner.lock();
        *scanner_lock = None;
    }
    
    Ok(compressed_data)
}

#[tauri::command]
pub async fn get_scan_progress(state: State<'_, ScannerState>) -> AppResult<ScanProgress> {
    let scanner_lock = state.scanner.lock();
    if let Some(scanner) = scanner_lock.as_ref() {
        Ok(scanner.get_progress())
    } else {
        Err(crate::error::AppError::NoActiveScan)
    }
}

#[tauri::command]
pub async fn cancel_scan(state: State<'_, ScannerState>) -> AppResult<()> {
    let scanner_lock = state.scanner.lock();
    if let Some(scanner) = scanner_lock.as_ref() {
        scanner.cancel();
        Ok(())
    } else {
        Err(crate::error::AppError::NoActiveScan)
    }
}

#[tauri::command]
pub async fn get_drives() -> AppResult<Vec<String>> {
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
pub fn get_cpu_count() -> usize {
    std::thread::available_parallelism()
        .map(|n| n.get())
        .unwrap_or(1)
}

#[tauri::command]
pub fn open_in_explorer(path: String) -> AppResult<()> {
    #[cfg(target_os = "windows")]
    {
        use std::process::Command;
        let p = std::path::Path::new(&path);
        let normalized_path = p.canonicalize()?;
        let is_file = p.is_file();
        
        let mut cmd = Command::new("explorer");
        if is_file {
            cmd.args(["/select,", normalized_path.to_string_lossy().as_ref()]);
        } else {
            cmd.arg(normalized_path);
        }
        cmd.spawn()?;
        Ok(())
    }
    #[cfg(not(target_os = "windows"))]
    {
        Ok(())
    }
}

#[tauri::command]
pub async fn get_disk_info(path: String) -> AppResult<DiskInfo> {
    task::spawn_blocking(move || {
        #[cfg(target_os = "windows")]
        {
            use windows::Win32::Storage::FileSystem::GetDiskFreeSpaceExW;
            use windows::core::PCWSTR;
            use std::os::windows::ffi::OsStrExt;
            
            let wide_path: Vec<u16> = std::ffi::OsStr::new(&path)
                .encode_wide()
                .chain(std::iter::once(0))
                .collect();
            
            let mut available_bytes: u64 = 0;
            let mut total_bytes: u64 = 0;
            let mut free_bytes: u64 = 0;
            
            unsafe {
                GetDiskFreeSpaceExW(
                    PCWSTR(wide_path.as_ptr()),
                    Some(&mut available_bytes),
                    Some(&mut total_bytes),
                    Some(&mut free_bytes),
                ).map_err(|e| crate::error::AppError::Ntfs(format!("GetDiskFreeSpaceExW failed: {}", e)))?;
            }
            
            Ok(DiskInfo {
                path: path.clone(),
                total_space: total_bytes,
                available_space: available_bytes,
                used_space: total_bytes.saturating_sub(free_bytes),
            })
        }
        #[cfg(not(target_os = "windows"))]
        {
            Err(crate::error::AppError::Ntfs("Not implemented for non-windows".to_string()))
        }
    }).await?
}

#[tauri::command]
pub async fn save_snapshot(
    root_data: Vec<u8>,
    drive: String,
    label: Option<String>,
) -> AppResult<SnapshotMeta> {
    task::spawn_blocking(move || {
        use flate2::read::GzDecoder;
        use std::io::Read;
        let mut decoder = GzDecoder::new(&root_data[..]);
        let mut msgpack_data = Vec::new();
        decoder.read_to_end(&mut msgpack_data)
            .map_err(|e| crate::error::AppError::Compression(e.to_string()))?;

        let root: crate::models::FileNode = rmp_serde::from_slice(&msgpack_data)
            .map_err(|e| crate::error::AppError::Serialization(e.to_string()))?;

        crate::snapshot::save_snapshot(&root, &drive, label)
            .map_err(crate::error::AppError::Snapshot)
    }).await?
}

#[tauri::command]
pub async fn list_snapshots(drive: Option<String>) -> AppResult<Vec<SnapshotMeta>> {
    task::spawn_blocking(move || {
        crate::snapshot::list_snapshots(drive.as_deref())
            .map_err(crate::error::AppError::Snapshot)
    })
    .await?
}

#[tauri::command]
pub async fn delete_snapshot(id: String) -> AppResult<()> {
    task::spawn_blocking(move || crate::snapshot::delete_snapshot(&id).map_err(crate::error::AppError::Snapshot))
        .await?
}

#[tauri::command]
pub async fn diff_snapshots(id_a: String, id_b: String) -> AppResult<DiffResult> {
    task::spawn_blocking(move || crate::snapshot::diff_snapshots(&id_a, &id_b).map_err(crate::error::AppError::Snapshot))
        .await?
}

#[tauri::command]
pub async fn get_snapshot_file_sizes(id: String) -> AppResult<std::collections::HashMap<String, u64>> {
    task::spawn_blocking(move || crate::snapshot::get_snapshot_file_sizes(&id).map_err(crate::error::AppError::Snapshot))
        .await?
}

#[tauri::command]
pub async fn get_latest_release(repo: String) -> AppResult<crate::GitHubLatestRelease> {
    let atom_url = format!("https://github.com/{}/releases.atom", repo.trim());
    task::spawn_blocking(move || {
        let agent = ureq::Agent::config_builder()
            .timeout_global(Some(std::time::Duration::from_secs(10)))
            .build()
            .new_agent();

        let response = agent.get(&atom_url)
            .header("User-Agent", "DiskClarity")
            .call()?;

        let text = response.into_body().read_to_string()?;
        let marker = "/releases/tag/";
        let idx = text.find(marker).ok_or_else(|| crate::error::AppError::Network("Cannot parse releases feed".to_string()))?;
        let start = idx + marker.len();
        let rest = &text[start..];
        let end = rest.find('"').or_else(|| rest.find('<')).unwrap_or(rest.len());
        let tag = rest[..end].trim().to_string();
        let html_url = format!("https://github.com/{}/releases/tag/{}", repo.trim(), tag);

        Ok(crate::GitHubLatestRelease {
            tag_name: tag,
            html_url: Some(html_url),
            body: None,
        })
    }).await?
}

#[tauri::command]
pub async fn get_releases(repo: String, limit: Option<u32>) -> AppResult<Vec<crate::models::GitHubRelease>> {
    let repo_trimmed = repo.trim().to_string();
    let per_page = limit.unwrap_or(20).clamp(1, 100);
    let url = format!("https://api.github.com/repos/{}/releases?per_page={}", repo_trimmed, per_page);
    let token = github_token_from_env();

    task::spawn_blocking(move || {
        let agent = ureq::Agent::config_builder()
            .timeout_global(Some(std::time::Duration::from_secs(12)))
            .build()
            .new_agent();

        let mut request = agent
            .get(&url)
            .header("User-Agent", "DiskClarity")
            .header("Accept", "application/vnd.github+json");

        if let Some(token) = token {
            let auth_header = format!("Bearer {}", token.trim());
            request = request.header("Authorization", &auth_header);
        }

        let response = request.call()?;
        let text = response.into_body().read_to_string()?;

        serde_json::from_str::<Vec<crate::models::GitHubRelease>>(&text)
            .map_err(|e| crate::error::AppError::Network(format!("Parse releases failed: {}", e)))
    }).await?
}
