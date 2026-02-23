use crate::error::AppResult;
use crate::models::{DataRun, NtfsVolumeInfo};

/// HANDLE 的 RAII 包装，Drop 时自动关闭句柄
#[cfg(windows)]
struct OwnedHandle(windows::Win32::Foundation::HANDLE);

#[cfg(windows)]
impl Drop for OwnedHandle {
    fn drop(&mut self) {
        unsafe {
            let _ = windows::Win32::Foundation::CloseHandle(self.0);
        }
    }
}

#[cfg(windows)]
impl std::ops::Deref for OwnedHandle {
    type Target = windows::Win32::Foundation::HANDLE;
    fn deref(&self) -> &Self::Target {
        &self.0
    }
}

/// 打开 NTFS 卷句柄
#[cfg(windows)]
fn open_volume_handle(drive: &str, admin_hint: bool) -> AppResult<OwnedHandle> {
    use std::ffi::OsStr;
    use std::os::windows::ffi::OsStrExt;
    use windows::Win32::Storage::FileSystem::*;

    let volume_path = format!("\\\\.\\{}", drive);
    let wide_path: Vec<u16> = OsStr::new(&volume_path)
        .encode_wide()
        .chain(std::iter::once(0))
        .collect();

    unsafe {
        let hint = if admin_hint {
            " Run as administrator."
        } else {
            ""
        };
        CreateFileW(
            windows::core::PCWSTR(wide_path.as_ptr()),
            FILE_READ_DATA.0,
            FILE_SHARE_READ | FILE_SHARE_WRITE | FILE_SHARE_DELETE,
            None,
            OPEN_EXISTING,
            FILE_FLAG_NO_BUFFERING | FILE_FLAG_SEQUENTIAL_SCAN,
            None,
        )
            .map(OwnedHandle)
            .map_err(|e| crate::error::AppError::Ntfs(format!("Cannot open volume: {}.{}", e, hint)))
    }
}

#[cfg(windows)]
#[inline(always)]
fn read_u16_le(buf: &[u8], off: usize) -> Option<u16> {
    buf.get(off..off + 2)
        .map(|b| u16::from_le_bytes([b[0], b[1]]))
}

#[cfg(windows)]
#[inline(always)]
fn read_u32_le(buf: &[u8], off: usize) -> Option<u32> {
    buf.get(off..off + 4)
        .map(|b| u32::from_le_bytes([b[0], b[1], b[2], b[3]]))
}

#[cfg(windows)]
#[inline(always)]
fn read_u64_le(buf: &[u8], off: usize) -> Option<u64> {
    buf.get(off..off + 8)
        .map(|b| u64::from_le_bytes([b[0], b[1], b[2], b[3], b[4], b[5], b[6], b[7]]))
}

/// 获取 NTFS 卷参数，优先使用 FSCTL_GET_NTFS_VOLUME_DATA，失败则回退到引导扇区解析
#[cfg(windows)]
pub fn get_volume_info(drive: &str) -> AppResult<NtfsVolumeInfo> {
    use windows::Win32::System::Ioctl::FSCTL_GET_NTFS_VOLUME_DATA;
    use windows::Win32::System::IO::DeviceIoControl;

    let handle = open_volume_handle(drive, true)?;

    let mut vol_data = [0u8; 512];
    let mut bytes_returned = 0u32;

    // NTFS_VOLUME_DATA_BUFFER 偏移：
    //   40: BytesPerSector, 44: BytesPerCluster, 48: BytesPerFileRecordSegment
    //   56: MftValidDataLength, 64: MftStartLcn
    let ok = unsafe {
        DeviceIoControl(
            *handle,
            FSCTL_GET_NTFS_VOLUME_DATA,
            None,
            0,
            Some(vol_data.as_mut_ptr() as *mut std::ffi::c_void),
            vol_data.len() as u32,
            Some(&mut bytes_returned),
            None,
        )
            .is_ok()
    };

    if ok && bytes_returned >= 72 {
        return Ok(NtfsVolumeInfo {
            bytes_per_sector: read_u32_le(&vol_data, 40).unwrap_or(512) as u64,
            bytes_per_cluster: read_u32_le(&vol_data, 44).unwrap_or(4096) as u64,
            bytes_per_mft_record: read_u32_le(&vol_data, 48).unwrap_or(1024) as u64,
            mft_start_lcn: read_u64_le(&vol_data, 64).unwrap_or(0),
        });
    }

    // OwnedHandle drop 自动关闭，无需手动 CloseHandle
    drop(handle);
    get_volume_info_from_boot_sector(drive)
}

/// 从引导扇区解析 NTFS BPB（FSCTL 失败时的回退路径）
#[cfg(windows)]
pub fn get_volume_info_from_boot_sector(drive: &str) -> AppResult<NtfsVolumeInfo> {
    use windows::Win32::Storage::FileSystem::ReadFile;

    let handle = open_volume_handle(drive, false)?;

    let mut boot_sector = [0u8; 512];
    let mut bytes_read = 0u32;

    unsafe {
        ReadFile(*handle, Some(&mut boot_sector), Some(&mut bytes_read), None)
            .map_err(|_| crate::error::AppError::Ntfs("Unable to read boot sector".to_string()))?;
    }

    let bytes_per_sector = read_u16_le(&boot_sector, 0x0B).unwrap_or(512) as u64;
    let sectors_per_cluster = boot_sector[0x0D] as u64;
    let bytes_per_cluster = bytes_per_sector * sectors_per_cluster;

    let clusters_per_record = boot_sector[0x40] as i8;
    let bytes_per_mft_record = if clusters_per_record < 0 {
        1u64 << (-(clusters_per_record as i32)) as u32
    } else {
        (clusters_per_record as u64) * bytes_per_cluster
    };

    let mft_start_lcn = read_u64_le(&boot_sector, 0x30).unwrap_or(0);

    Ok(NtfsVolumeInfo {
        bytes_per_sector,
        bytes_per_cluster,
        bytes_per_mft_record,
        mft_start_lcn,
    })
}

/// 扇区对齐读取，直接写入 out 的预留空间
#[cfg(windows)]
fn read_aligned_direct(
    h: &OwnedHandle,
    byte_offset: u64,
    byte_len: usize,
    out: &mut Vec<u8>,
    out_start: usize,
    sector_size: usize,
) -> usize {
    use windows::Win32::Storage::FileSystem::{ReadFile, SetFilePointerEx, FILE_BEGIN};

    let aligned_off = (byte_offset as usize / sector_size) * sector_size;
    let inner_off = byte_offset as usize - aligned_off;
    let aligned_len = (byte_len + inner_off).div_ceil(sector_size) * sector_size;

    // 若对齐后大小等于 byte_len 且无内部偏移，直接读入目标切片
    if inner_off == 0 && aligned_len == byte_len && out_start + byte_len <= out.len() {
        let mut n = 0u32;
        unsafe {
            if SetFilePointerEx(**h, aligned_off as i64, None, FILE_BEGIN).is_err() {
                return 0;
            }
            let slice = &mut out[out_start..out_start + byte_len];
            if ReadFile(**h, Some(slice), Some(&mut n), None).is_err() {
                return 0;
            }
        }
        return n as usize;
    }

    // 需要对齐缓冲：分配临时 buf，但只在有内部偏移或尾部填充时才需要
    let mut buf = vec![0u8; aligned_len];
    let mut n = 0u32;
    unsafe {
        if SetFilePointerEx(**h, aligned_off as i64, None, FILE_BEGIN).is_err() {
            return 0;
        }
        if ReadFile(**h, Some(&mut buf), Some(&mut n), None).is_err() {
            return 0;
        }
    }
    let to_copy = (n as usize).saturating_sub(inner_off).min(byte_len);
    if out_start + to_copy <= out.len() {
        out[out_start..out_start + to_copy].copy_from_slice(&buf[inner_off..inner_off + to_copy]);
    }
    to_copy
}

/// 读取完整的原始 MFT 数据
#[cfg(windows)]
pub fn read_mft_raw(drive: &str, vol_info: &NtfsVolumeInfo) -> AppResult<Vec<u8>> {
    let handle = open_volume_handle(drive, false)?;
    let sector_size = vol_info.bytes_per_sector as usize;

    // 读取 MFT 记录 0
    let record_size = vol_info.bytes_per_mft_record as usize;
    let mut record0_bytes = vec![0u8; record_size];
    let n = read_aligned_direct(
        &handle,
        vol_info.mft_start_lcn * vol_info.bytes_per_cluster,
        record_size,
        &mut record0_bytes,
        0,
        sector_size,
    );
    if n < record_size {
        return Err(crate::error::AppError::Ntfs(
            "Unable to read MFT record 0".to_string(),
        ));
    }

    let mft_size = get_mft_size_from_record0(&record0_bytes)?;
    let data_runs = parse_data_runs_from_record0(&record0_bytes)?;
    drop(record0_bytes);

    // 预分配目标缓冲区，逐个 Run 直接写入
    let mut mft_data = vec![0u8; mft_size as usize];
    let mut write_pos: usize = 0;

    for run in &data_runs {
        if write_pos >= mft_size as usize {
            break;
        }
        let frag_off = run.start_cluster * vol_info.bytes_per_cluster;
        let frag_size = (run.cluster_count * vol_info.bytes_per_cluster) as usize;
        let to_read = frag_size.min(mft_size as usize - write_pos);
        let written = read_aligned_direct(
            &handle,
            frag_off,
            to_read,
            &mut mft_data,
            write_pos,
            sector_size,
        );
        write_pos += written;
    }

    mft_data.truncate(write_pos.min(mft_size as usize));
    Ok(mft_data)
}

/// 从 MFT 记录 0 的 $DATA 属性读取 ValidDataLength（即 MFT 实际字节数）
#[cfg(windows)]
pub fn get_mft_size_from_record0(record_bytes: &[u8]) -> AppResult<u64> {
    if record_bytes.len() < 42 || &record_bytes[0..4] != b"FILE" {
        return Err(crate::error::AppError::Ntfs(
            "Invalid MFT record 0".to_string(),
        ));
    }

    let first_attr = read_u16_le(record_bytes, 0x14)
        .ok_or_else(|| crate::error::AppError::Ntfs("Cannot read attribute offset".to_string()))?
        as usize;

    let mut off = first_attr;
    while off + 8 <= record_bytes.len() {
        let attr_type = read_u32_le(record_bytes, off).unwrap_or(0xFFFF_FFFF);
        if attr_type == 0xFFFF_FFFF {
            break;
        }
        let attr_len = read_u32_le(record_bytes, off + 4).unwrap_or(0) as usize;
        if attr_len == 0 || off + attr_len > record_bytes.len() {
            break;
        }

        // $DATA (0x80) 非驻留：ValidDataLength 在 +0x38
        if attr_type == 0x80 && record_bytes[off + 8] != 0 {
            if let Some(sz) = read_u64_le(record_bytes, off + 0x38) {
                return Ok(sz);
            }
        }
        off += attr_len;
    }

    Err(crate::error::AppError::Ntfs(
        "$DATA attribute not found in MFT record 0".to_string(),
    ))
}

/// 从 MFT 记录 0 的 $DATA 属性解析 Data Runs
#[cfg(windows)]
pub fn parse_data_runs_from_record0(record_bytes: &[u8]) -> AppResult<Vec<DataRun>> {
    if record_bytes.len() < 42 || &record_bytes[0..4] != b"FILE" {
        return Err(crate::error::AppError::Ntfs(
            "Invalid MFT record 0".to_string(),
        ));
    }

    let first_attr = read_u16_le(record_bytes, 0x14)
        .ok_or_else(|| crate::error::AppError::Ntfs("Cannot read attribute offset".to_string()))?
        as usize;

    let mut off = first_attr;
    while off + 8 <= record_bytes.len() {
        let attr_type = read_u32_le(record_bytes, off).unwrap_or(0xFFFF_FFFF);
        if attr_type == 0xFFFF_FFFF {
            break;
        }
        let attr_len = read_u32_le(record_bytes, off + 4).unwrap_or(0) as usize;
        if attr_len == 0 || off + attr_len > record_bytes.len() {
            break;
        }

        // $DATA (0x80) 非驻留：Data Runs 偏移在 +0x20
        if attr_type == 0x80 && record_bytes[off + 8] != 0 {
            let runs_off = read_u16_le(record_bytes, off + 0x20).unwrap_or(0) as usize;
            return parse_data_runs_bytes(&record_bytes[off + runs_off..]);
        }
        off += attr_len;
    }

    Err(crate::error::AppError::Ntfs(
        "$DATA attribute not found in MFT record 0".to_string(),
    ))
}

/// 解析 Data Runs 字节数组
#[cfg(windows)]
pub fn parse_data_runs_bytes(data: &[u8]) -> AppResult<Vec<DataRun>> {
    let mut runs = Vec::new();
    let mut offset = 0;
    let mut current_cluster = 0u64;

    while offset < data.len() {
        let first_byte = data[offset];
        if first_byte == 0 {
            break;
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
