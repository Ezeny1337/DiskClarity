use crate::models::{FileNameInfo, MftNode};

/// 解析单个 MFT 记录 - 应用 Fixup Array 修复并提取属性
#[cfg(windows)]
pub fn parse_mft_record(record_bytes: &[u8], record_idx: u64) -> Option<MftNode> {
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
            win32_names[0]
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
