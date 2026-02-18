use crate::models::{DataRun, NtfsVolumeInfo};
use crate::error::AppResult;

/// 打开 NTFS 卷句柄（辅助函数）
#[cfg(windows)]
fn open_volume_handle(drive: &str, admin_hint: bool) -> AppResult<windows::Win32::Foundation::HANDLE> {
    use windows::Win32::Storage::FileSystem::*;
    use std::os::windows::ffi::OsStrExt;
    use std::ffi::OsStr;

    let volume_path = format!("\\\\.\\{}", drive);
    let wide_path: Vec<u16> = OsStr::new(&volume_path)
        .encode_wide()
        .chain(std::iter::once(0))
        .collect();

    unsafe {
        let hint = if admin_hint { "Please make sure to run as administrator" } else { "" };
        CreateFileW(
            windows::core::PCWSTR(wide_path.as_ptr()),
            FILE_READ_DATA.0,
            FILE_SHARE_READ | FILE_SHARE_WRITE | FILE_SHARE_DELETE,
            None,
            OPEN_EXISTING,
            FILE_FLAG_NO_BUFFERING | FILE_FLAG_SEQUENTIAL_SCAN,
            None,
        ).map_err(|e| crate::error::AppError::Ntfs(format!("Cannot open volume: {:?}. {}.", e, hint)))
    }
}

/// 获取 NTFS 卷参数
#[cfg(windows)]
pub fn get_volume_info(drive: &str) -> AppResult<NtfsVolumeInfo> {
    use windows::Win32::Foundation::*;
    use windows::Win32::System::IO::DeviceIoControl;
    use windows::Win32::System::Ioctl::FSCTL_GET_NTFS_VOLUME_DATA;

    unsafe {
        let handle = open_volume_handle(drive, true)?;

        // 尝试 FSCTL_GET_NTFS_VOLUME_DATA
        let mut vol_data = [0u8; 512];
        let mut bytes_returned = 0u32;

        let ioctl_result = DeviceIoControl(
            handle,
            FSCTL_GET_NTFS_VOLUME_DATA,
            None,
            0,
            Some(vol_data.as_mut_ptr() as *mut std::ffi::c_void),
            vol_data.len() as u32,
            Some(&mut bytes_returned),
            None,
        );

        if ioctl_result.is_ok() && bytes_returned >= 72 {
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
        get_volume_info_from_boot_sector(drive)
    }
}

/// 从引导扇区解析 NTFS BPB
#[cfg(windows)]
pub fn get_volume_info_from_boot_sector(drive: &str) -> AppResult<NtfsVolumeInfo> {
    use windows::Win32::Storage::FileSystem::*;
    use windows::Win32::Foundation::*;

    unsafe {
        let handle = open_volume_handle(drive, false)?;

        let mut boot_sector = [0u8; 512];
        let mut bytes_read = 0u32;
        
        if ReadFile(handle, Some(&mut boot_sector), Some(&mut bytes_read), None).is_err() {
            let _ = CloseHandle(handle);
            return Err(crate::error::AppError::Ntfs("Unable to read the boot sector".to_string()));
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
#[cfg(windows)]
pub fn read_mft_raw(drive: &str, vol_info: &NtfsVolumeInfo) -> AppResult<Vec<u8>> {
    use windows::Win32::Storage::FileSystem::*;
    use windows::Win32::Foundation::*;

    unsafe {
        let handle = open_volume_handle(drive, false)?;

        // 计算 MFT 记录 0 的物理偏移
        let mft_record0_offset = vol_info.mft_start_lcn * vol_info.bytes_per_cluster;
        
        // 必须对齐到扇区大小
        let sector_size = vol_info.bytes_per_sector;
        let aligned_offset = (mft_record0_offset / sector_size) * sector_size;
        let offset_within_sector = mft_record0_offset - aligned_offset;
        
        let mut new_pos: i64 = 0;
        if SetFilePointerEx(handle, aligned_offset as i64, Some(&mut new_pos), FILE_BEGIN).is_err() {
            let _ = CloseHandle(handle);
            return Err(crate::error::AppError::Ntfs(format!("Unable to locate MFT record 0 (alignment offset: {})", aligned_offset)));
        }

        // 读取 MFT 记录 0 以获取 $DATA 属性和实际大小
        let record_size = vol_info.bytes_per_mft_record as usize;
        
        // 计算对齐后的读取大小，确保读取的数据量是扇区大小的整数倍
        let aligned_read_size = (record_size + offset_within_sector as usize)
            .div_ceil(sector_size as usize)
            * sector_size as usize;
        let mut read_buffer = vec![0u8; aligned_read_size];
        let mut bytes_read = 0u32;
        
        if ReadFile(handle, Some(&mut read_buffer), Some(&mut bytes_read), None).is_err() {
            let _ = CloseHandle(handle);
            return Err(crate::error::AppError::Ntfs("Unable to read MFT record 0".to_string()));
        }
        
        // 从对齐的缓冲区中提取实际的 MFT 记录 0
        let first_record = if offset_within_sector as usize + record_size <= read_buffer.len() {
            read_buffer[offset_within_sector as usize..offset_within_sector as usize + record_size].to_vec()
        } else {
            let _ = CloseHandle(handle);
            return Err(crate::error::AppError::Ntfs("Insufficient data read".to_string()));
        };

        // 从 MFT 记录 0 解析 $DATA 属性获取实际大小
        let mft_size = get_mft_size_from_record0(&first_record)?;

        // 解析 Data Runs 以获取 MFT 的所有片段
        let data_runs = parse_data_runs_from_record0(&first_record)?;

        // 按 Data Run 顺序读取所有 MFT 片段
        let mut mft_data = Vec::with_capacity(mft_size as usize);
        
        for run in data_runs.iter() {
            let fragment_offset = run.start_cluster * vol_info.bytes_per_cluster;
            let fragment_size = run.cluster_count * vol_info.bytes_per_cluster;
            
            // 对齐到扇区大小
            let aligned_offset = (fragment_offset / sector_size) * sector_size;
            let offset_within_sector = fragment_offset - aligned_offset;
            let aligned_read_size = (fragment_size as usize + offset_within_sector as usize)
                .div_ceil(sector_size as usize)
                * sector_size as usize;
            
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
pub fn get_mft_size_from_record0(record_bytes: &[u8]) -> AppResult<u64> {
    if record_bytes.len() < 42 || &record_bytes[0..4] != b"FILE" {
        return Err(crate::error::AppError::Ntfs("无效的 MFT 记录".to_string()));
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

        if attr_type == 0xFFFFFFFF { break; }

        let attr_len = u32::from_le_bytes([
            record_bytes[attr_offset + 4],
            record_bytes[attr_offset + 5],
            record_bytes[attr_offset + 6],
            record_bytes[attr_offset + 7],
        ]) as usize;

        if attr_len == 0 || attr_offset + attr_len > record_bytes.len() { break; }

        // $DATA 属性 (0x80) - 非驻留
        if attr_type == 0x80 && record_bytes[attr_offset + 8] != 0 {
            // offset 0x30-0x37: AllocationSize（分配大小，对齐到簇）
            // offset 0x38-0x3F: ValidDataLength（有效数据长度，实际大小）
            if attr_offset + 0x40 < record_bytes.len() {
                let actual_size = u64::from_le_bytes([
                    record_bytes[attr_offset + 0x38], record_bytes[attr_offset + 0x39],
                    record_bytes[attr_offset + 0x3A], record_bytes[attr_offset + 0x3B],
                    record_bytes[attr_offset + 0x3C], record_bytes[attr_offset + 0x3D],
                    record_bytes[attr_offset + 0x3E], record_bytes[attr_offset + 0x3F],
                ]);
                return Ok(actual_size);
            }
        }
        attr_offset += attr_len;
    }

    Err(crate::error::AppError::Ntfs("未找到 $DATA 属性".to_string()))
}

/// 从 MFT 记录 0 解析 Data Runs
#[cfg(windows)]
pub fn parse_data_runs_from_record0(record_bytes: &[u8]) -> AppResult<Vec<DataRun>> {
    if record_bytes.len() < 42 || &record_bytes[0..4] != b"FILE" {
        return Err(crate::error::AppError::Ntfs("无效的 MFT 记录".to_string()));
    }

    let first_attr_offset = u16::from_le_bytes([record_bytes[0x14], record_bytes[0x15]]) as usize;
    let mut attr_offset = first_attr_offset;

    while attr_offset + 8 < record_bytes.len() {
        let attr_type = u32::from_le_bytes([
            record_bytes[attr_offset], record_bytes[attr_offset + 1],
            record_bytes[attr_offset + 2], record_bytes[attr_offset + 3],
        ]);

        if attr_type == 0xFFFFFFFF { break; }

        let attr_len = u32::from_le_bytes([
            record_bytes[attr_offset + 4], record_bytes[attr_offset + 5],
            record_bytes[attr_offset + 6], record_bytes[attr_offset + 7],
        ]) as usize;

        if attr_len == 0 || attr_offset + attr_len > record_bytes.len() { break; }

        // $DATA 属性 (0x80) - 非驻留
        if attr_type == 0x80 && record_bytes[attr_offset + 8] != 0 {
            // Data Runs 偏移在 offset 0x20 (2 字节)
            let runs_offset = u16::from_le_bytes([
                record_bytes[attr_offset + 0x20], record_bytes[attr_offset + 0x21],
            ]) as usize;

            return parse_data_runs_bytes(&record_bytes[attr_offset + runs_offset..]);
        }
        attr_offset += attr_len;
    }
    
    Err(crate::error::AppError::Ntfs("未找到 $DATA 属性".to_string()))
}

/// 解析 Data Runs 字节数组
#[cfg(windows)]
pub fn parse_data_runs_bytes(data: &[u8]) -> AppResult<Vec<DataRun>> {
    let mut runs = Vec::new();
    let mut offset = 0;
    let mut current_cluster = 0u64;

    while offset < data.len() {
        let first_byte = data[offset];
        if first_byte == 0 { break; }

        let size_len = (first_byte & 0x0F) as usize;
        let offset_len = ((first_byte >> 4) & 0x0F) as usize;

        if size_len == 0 || offset_len == 0 || offset + 1 + size_len + offset_len > data.len() { break; }

        offset += 1;

        // 读取簇计数
        let mut cluster_count = 0u64;
        for i in 0..size_len { cluster_count |= (data[offset + i] as u64) << (i * 8); }
        offset += size_len;

        // 读取簇偏移 (有符号)
        let mut cluster_offset = 0i64;
        for i in 0..offset_len { cluster_offset |= (data[offset + i] as i64) << (i * 8); }
        offset += offset_len;

        // 处理有符号偏移
        if offset_len > 0 {
            let sign_bit = 1i64 << (offset_len * 8 - 1);
            if cluster_offset & sign_bit != 0 { cluster_offset -= sign_bit << 1; }
        }

        current_cluster = (current_cluster as i64 + cluster_offset) as u64;
        if cluster_count > 0 {
            runs.push(DataRun { start_cluster: current_cluster, cluster_count });
        }
    }

    Ok(runs)
}
