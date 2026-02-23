use crate::models::{FileNameInfo, MftEntry};

/// 从字节切片读取 u16
#[inline(always)]
fn read_u16(buf: &[u8], offset: usize) -> Option<u16> {
    buf.get(offset..offset + 2)
        .map(|b| u16::from_le_bytes([b[0], b[1]]))
}

/// 从字节切片读取 u32
#[inline(always)]
fn read_u32(buf: &[u8], offset: usize) -> Option<u32> {
    buf.get(offset..offset + 4)
        .map(|b| u32::from_le_bytes([b[0], b[1], b[2], b[3]]))
}

/// 从字节切片读取 u64
#[inline(always)]
fn read_u64(buf: &[u8], offset: usize) -> Option<u64> {
    buf.get(offset..offset + 8)
        .map(|b| u64::from_le_bytes([b[0], b[1], b[2], b[3], b[4], b[5], b[6], b[7]]))
}

/// 解析单个 MFT 记录 - 应用 Fixup Array 修复并提取属性
#[cfg(windows)]
pub fn parse_mft_record(record_bytes: &[u8], record_idx: u64) -> Option<MftEntry> {
    if record_bytes.len() < 42 {
        return None;
    }

    // MFT 记录签名检查
    if &record_bytes[0..4] != b"FILE" {
        return None;
    }

    // 应用 Fixup Array：将每个 512B 扇区末尾的校验值替换为正确数据
    // USN 偏移 0x04，条目数 0x06
    let usn_offset = read_u16(record_bytes, 0x04)? as usize;
    let usn_size = read_u16(record_bytes, 0x06)? as usize;

    // 检查是否需要 fixup 修复
    let fixup_data;
    let record_bytes =
        if usn_offset > 0 && usn_size > 1 && usn_offset + usn_size * 2 <= record_bytes.len() {
            let fixup_value = read_u16(record_bytes, usn_offset)?;

            // 快速检查第一个扇区是否需要修复
            let first_sector_off = 512 - 2;
            if first_sector_off + 2 <= record_bytes.len()
                && read_u16(record_bytes, first_sector_off) == Some(fixup_value)
            {
                // 需要修复，分配buffer并修复所有扇区
                fixup_data = {
                    let mut data = record_bytes.to_vec();
                    for i in 1..usn_size {
                        let sector_off = i * 512 - 2;
                        let fixup_off = usn_offset + i * 2;
                        if fixup_off + 1 < data.len() && sector_off + 1 < data.len() {
                            let v = u16::from_le_bytes([data[fixup_off], data[fixup_off + 1]]);
                            data[sector_off] = v as u8;
                            data[sector_off + 1] = (v >> 8) as u8;
                        }
                    }
                    data
                };
                &fixup_data
            } else {
                record_bytes
            }
        } else {
            record_bytes
        };

    // 记录标志：bit0=在用，bit1=目录，bit4=索引视图
    let flags = read_u16(record_bytes, 0x16)?;
    if (flags & 0x0001) == 0 {
        return None;
    }
    let is_dir_from_flags = (flags & 0x0002) != 0 || (flags & 0x0010) != 0;

    // 获取第一个属性的偏移（0x14）
    let first_attr_offset = read_u16(record_bytes, 0x14)? as usize;
    if first_attr_offset >= record_bytes.len() {
        return None;
    }

    let mut name = String::new();
    let mut parent_ref = 0u64;
    let mut size = 0u64;
    let mut is_dir = false;
    let mut modified_time = 0u64;
    let mut best_fn: Option<FileNameInfo> = None;

    let mut offset = first_attr_offset;
    let mut attr_count = 0usize;

    while offset + 8 <= record_bytes.len() {
        let attr_type = read_u32(record_bytes, offset)?;
        if attr_type == 0xFFFF_FFFF {
            break;
        }

        let attr_len = read_u32(record_bytes, offset + 4)? as usize;
        if attr_len == 0 || offset + attr_len > record_bytes.len() {
            break;
        }

        attr_count += 1;
        let is_resident = record_bytes[offset + 8] == 0;

        match attr_type {
            // $STANDARD_INFORMATION (0x10) — 修改时间
            0x10 if is_resident => {
                let val_off = read_u16(record_bytes, offset + 0x14)? as usize;
                let base = offset + val_off;
                if let Some(ft) = read_u64(record_bytes, base + 24) {
                    if ft > 0 {
                        // Windows FILETIME → Unix 秒
                        modified_time = (ft / 10_000_000).saturating_sub(11_644_473_600);
                    }
                }
            }
            // $FILE_NAME (0x30) — 父目录引用、名称、目录标志
            0x30 if is_resident => {
                let val_off = read_u16(record_bytes, offset + 0x14)? as usize;
                let base = offset + val_off;
                if base + 8 > record_bytes.len() {
                    offset += attr_len;
                    continue;
                }

                let current_parent_ref = read_u64(record_bytes, base)? & 0x0000_FFFF_FFFF_FFFF;

                let current_is_dir = read_u32(record_bytes, base + 56)
                    .map(|fa| is_dir_from_flags || (fa & 0x10) != 0)
                    .unwrap_or(is_dir_from_flags);

                if base + 66 <= record_bytes.len() {
                    let name_len = record_bytes[base + 64] as usize;
                    let name_start = base + 66;
                    if name_len > 0
                        && name_len <= 255
                        && name_start + name_len * 2 <= record_bytes.len()
                    {
                        let units: Vec<u16> = record_bytes[name_start..name_start + name_len * 2]
                            .chunks_exact(2)
                            .map(|c| u16::from_le_bytes([c[0], c[1]]))
                            .collect();
                        let current_name = String::from_utf16_lossy(&units);
                        // namespace 字节：0=POSIX, 1=Win32, 2=DOS, 3=Win32&DOS
                        let namespace = record_bytes.get(base + 65).copied().unwrap_or(0);
                        let is_win32 = namespace == 1 || namespace == 3;
                        let candidate = FileNameInfo {
                            name: current_name,
                            parent_ref: current_parent_ref,
                            is_win32,
                            is_dir: current_is_dir,
                        };
                        // 一次扫描取最优
                        match &best_fn {
                            None => best_fn = Some(candidate),
                            Some(prev) if !prev.is_win32 && is_win32 => best_fn = Some(candidate),
                            _ => {}
                        }
                    }
                }
            }
            // $DATA (0x80) — 文件大小
            0x80 => {
                if is_resident {
                    // 驻留：值长度在偏移 0x10（u32）
                    if let Some(sz) = read_u32(record_bytes, offset + 0x10) {
                        size = sz as u64;
                    }
                } else {
                    // 非驻留：ValidDataLength 在偏移 0x38，AllocatedSize 在 0x30
                    size = read_u64(record_bytes, offset + 0x38)
                        .or_else(|| read_u64(record_bytes, offset + 0x30))
                        .unwrap_or(0);
                }
            }
            _ => {}
        }

        offset += attr_len;
    }

    // 优先选择 Win32 长文件名
    if let Some(chosen) = best_fn {
        name = chosen.name;
        parent_ref = chosen.parent_ref;
        is_dir = chosen.is_dir;
    }

    if attr_count == 0 || name.is_empty() {
        return None;
    }

    let needs_size_fallback = !is_dir && size == 0;

    Some(MftEntry {
        file_ref: record_idx & 0x0000_FFFF_FFFF_FFFF,
        parent_ref,
        name,
        size,
        is_dir,
        modified_time,
        needs_size_fallback,
    })
}
