use crate::error::{AppError, AppResult};
use crate::mft_scanner::MftScanner;
use crate::models::{DiskInfo, ScanConfig, ScanProgress};
use crate::snapshot::{DiffResult, SnapshotMeta};
use crate::ScannerState;
use flate2::write::GzEncoder;
use flate2::Compression;
use std::io::Write;
use std::sync::Arc;
use tauri::State;
use tokio::task;

fn github_token_from_env() -> Option<String> {
    std::env::var("DISKCLARITY_GITHUB_TOKEN")
        .ok()
        .filter(|v| !v.trim().is_empty())
}

/// 将字节切片 gzip 压缩后返回
fn gzip_compress(data: &[u8]) -> AppResult<Vec<u8>> {
    let mut enc = GzEncoder::new(Vec::new(), Compression::fast());
    enc.write_all(data)
        .map_err(|e| AppError::Compression(e.to_string()))?;
    enc.finish()
        .map_err(|e| AppError::Compression(e.to_string()))
}

#[tauri::command]
pub async fn start_scan(
    path: String,
    config: ScanConfig,
    task_id: String,
    state: State<'_, ScannerState>,
) -> AppResult<Vec<u8>> {
    let scanner = Arc::new(MftScanner::new());

    state
        .scanners
        .lock()
        .insert(task_id.clone(), scanner.clone());

    let scan_result = task::spawn_blocking(move || scanner.scan(&path, config)).await;

    state.scanners.lock().remove(&task_id);

    let result = scan_result??;

    // msgpack 序列化后 gzip 压缩，利用 From<rmp_serde::encode::Error> 自动转换
    let msgpack_data = rmp_serde::to_vec_named(&result)?;
    gzip_compress(&msgpack_data)
}

#[tauri::command]
pub async fn get_scan_progress(
    task_id: String,
    state: State<'_, ScannerState>,
) -> AppResult<ScanProgress> {
    let scanners = state.scanners.lock();
    if let Some(scanner) = scanners.get(&task_id) {
        Ok(scanner.get_progress())
    } else {
        Err(AppError::NoActiveScan)
    }
}

#[tauri::command]
pub async fn cancel_scan(task_id: String, state: State<'_, ScannerState>) -> AppResult<()> {
    let scanners = state.scanners.lock();
    if let Some(scanner) = scanners.get(&task_id) {
        scanner.cancel();
        Ok(())
    } else {
        Err(AppError::NoActiveScan)
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
        return Ok(drives);
    };
}

#[tauri::command]
pub fn get_cpu_count() -> usize {
    std::thread::available_parallelism()
        .map(|n| n.get())
        .unwrap_or(1)
}

/// 当页面最小化时时设置 WebView2 内存使用目标为 Low
#[tauri::command]
pub fn set_webview_memory_level(low: bool, window: tauri::WebviewWindow) -> AppResult<()> {
    #[cfg(windows)]
    {
        use webview2_com::Microsoft::Web::WebView2::Win32::{
            ICoreWebView2_19, COREWEBVIEW2_MEMORY_USAGE_TARGET_LEVEL_LOW,
            COREWEBVIEW2_MEMORY_USAGE_TARGET_LEVEL_NORMAL,
        };
        use windows_core::Interface as _;
        window
            .with_webview(move |wv| unsafe {
                let core = match wv.controller().CoreWebView2() {
                    Ok(c) => c,
                    Err(_) => return,
                };
                let core19: ICoreWebView2_19 = match core.cast() {
                    Ok(c) => c,
                    Err(_) => return,
                };
                let level = if low {
                    COREWEBVIEW2_MEMORY_USAGE_TARGET_LEVEL_LOW
                } else {
                    COREWEBVIEW2_MEMORY_USAGE_TARGET_LEVEL_NORMAL
                };
                let _ = core19.SetMemoryUsageTargetLevel(level);
            })
            .ok();
    }
    Ok(())
}

#[tauri::command]
pub fn open_in_explorer(path: String) -> AppResult<()> {
    #[cfg(target_os = "windows")]
    {
        use std::path::Path;
        use std::process::Command;

        let original = Path::new(&path);

        let (target, use_select) = if original.exists() {
            let canonical = original.canonicalize()?;
            let is_file = canonical.is_file();
            (canonical, is_file)
        } else {
            let mut ancestor = original.parent();
            loop {
                match ancestor {
                    Some(p) if p.exists() => break (p.canonicalize()?, false),
                    Some(p) => ancestor = p.parent(),
                    None => return Ok(()),
                }
            }
        };

        let mut cmd = Command::new("explorer");
        if use_select {
            cmd.args(["/select,", target.to_string_lossy().as_ref()]);
        } else {
            cmd.arg(&target);
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
            use std::os::windows::ffi::OsStrExt;
            use windows::core::PCWSTR;
            use windows::Win32::Storage::FileSystem::GetDiskFreeSpaceExW;

            let wide_path: Vec<u16> = std::ffi::OsStr::new(&path)
                .encode_wide()
                .chain(std::iter::once(0))
                .collect();

            let mut available_bytes = 0u64;
            let mut total_bytes = 0u64;
            let mut free_bytes = 0u64;

            unsafe {
                GetDiskFreeSpaceExW(
                    PCWSTR(wide_path.as_ptr()),
                    Some(&mut available_bytes),
                    Some(&mut total_bytes),
                    Some(&mut free_bytes),
                )
                    .map_err(|e| AppError::Ntfs(format!("GetDiskFreeSpaceExW: {}", e)))?;
            }

            Ok(DiskInfo {
                path,
                total_space: total_bytes,
                available_space: available_bytes,
                used_space: total_bytes.saturating_sub(free_bytes),
            })
        }
        #[cfg(not(target_os = "windows"))]
        {
            Err(AppError::Ntfs("Not implemented on non-Windows".to_string()))
        }
    })
        .await?
}

#[tauri::command]
pub async fn save_snapshot(
    root_data: Vec<u8>,
    drive: String,
    label: Option<String>,
) -> AppResult<SnapshotMeta> {
    use flate2::read::GzDecoder;
    use std::io::Read;
    task::spawn_blocking(move || {
        let mut dec = GzDecoder::new(&root_data[..]);
        let mut msgpack_data = Vec::new();
        dec.read_to_end(&mut msgpack_data)
            .map_err(|e| AppError::Compression(e.to_string()))?;

        let root: crate::models::FileNode = rmp_serde::from_slice(&msgpack_data)?;

        crate::snapshot::save_snapshot(&root, &drive, label)
    })
        .await?
}

#[tauri::command]
pub async fn list_snapshots(drive: Option<String>) -> AppResult<Vec<SnapshotMeta>> {
    task::spawn_blocking(move || crate::snapshot::list_snapshots(drive.as_deref())).await?
}

#[tauri::command]
pub async fn delete_snapshot(id: String) -> AppResult<()> {
    task::spawn_blocking(move || crate::snapshot::delete_snapshot(&id)).await?
}

#[tauri::command]
pub async fn diff_snapshots(id_a: String, id_b: String) -> AppResult<DiffResult> {
    task::spawn_blocking(move || crate::snapshot::diff_snapshots(&id_a, &id_b)).await?
}

#[tauri::command]
pub async fn get_snapshot_file_sizes(
    id: String,
) -> AppResult<std::collections::HashMap<String, u64>> {
    task::spawn_blocking(move || crate::snapshot::get_snapshot_file_sizes(&id)).await?
}

#[tauri::command]
pub async fn get_latest_release(repo: String) -> AppResult<crate::GitHubLatestRelease> {
    let atom_url = format!("https://github.com/{}/releases.atom", repo.trim());
    task::spawn_blocking(move || {
        let agent = ureq::Agent::config_builder()
            .timeout_global(Some(std::time::Duration::from_secs(10)))
            .build()
            .new_agent();

        let response = agent
            .get(&atom_url)
            .header("User-Agent", "DiskClarity")
            .call()?;

        let text = response.into_body().read_to_string()?;
        let marker = "/releases/tag/";
        let idx = text
            .find(marker)
            .ok_or_else(|| AppError::Network("Cannot parse releases feed".to_string()))?;
        let start = idx + marker.len();
        let rest = &text[start..];
        let end = rest
            .find('"')
            .or_else(|| rest.find('<'))
            .unwrap_or(rest.len());
        let tag = rest[..end].trim().to_string();
        let html_url = format!("https://github.com/{}/releases/tag/{}", repo.trim(), tag);

        Ok(crate::GitHubLatestRelease {
            tag_name: tag,
            html_url: Some(html_url),
            body: None,
        })
    })
        .await?
}

#[tauri::command]
pub async fn get_releases(
    repo: String,
    limit: Option<u32>,
) -> AppResult<Vec<crate::models::GitHubRelease>> {
    let repo_trimmed = repo.trim().to_string();
    let per_page = limit.unwrap_or(20).clamp(1, 100);
    let url = format!(
        "https://api.github.com/repos/{}/releases?per_page={}",
        repo_trimmed, per_page
    );
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
            .map_err(|e| AppError::Network(format!("Parse releases failed: {}", e)))
    })
        .await?
}
