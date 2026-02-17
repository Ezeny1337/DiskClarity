use crate::models::{FileNode, MftFileEntry};
use std::collections::HashMap;
use std::fs;
use rayon::prelude::*;

/// 从平面 MFT 条目构建树形结构
pub fn build_tree(entries: Vec<MftFileEntry>, root_path: &str) -> Result<FileNode, String> {
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
        children_map.entry(parent_ref).or_default().push(file_ref);
    }
    
    // 处理需要回退的文件（并行获取大小）
    if !fallback_entries.is_empty() {
        let sizes: Vec<_> = fallback_entries
            .par_iter()
            .map(|(file_ref, _name)| {
                // 从 entry_map 中获取文件的完整信息
                let size = if let Some(_entry) = entry_map.get(file_ref) {
                    get_file_size_from_entry(&entry_map, root_path, *file_ref)
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
                    entry.size = size;
                }
            }
        }
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
    build_node_recursive(&entry_map, &children_map, root_ref, root_path)
}

fn build_node_recursive(
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
            // 跳过自引用（防止无限递归）
            if child_ref == file_ref {
                continue;
            }

            if let Some(child_entry) = entry_map.get(&child_ref) {
                // 构建子项的完整路径
                let child_path = if path.is_empty() {
                    // 根目录情况
                    format!("{}\\{}", entry.name, child_entry.name)
                } else {
                    // 非根目录情况
                    format!("{}\\{}", path, child_entry.name)
                };
                
                if let Ok(child_node) = build_node_recursive(entry_map, children_map, child_ref, &child_path) {
                    total_size += child_node.size;
                    file_count += child_node.file_count;
                    if child_node.is_dir {
                        dir_count += 1 + child_node.dir_count;
                    }
                    children.push(child_node);
                }
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

/// 从 MFT 条目获取文件大小（通过构建完整路径）
fn get_file_size_from_entry(
    entry_map: &HashMap<u64, MftFileEntry>,
    root_path: &str,
    file_ref: u64,
) -> Result<u64, String> {
    // 构建文件的完整路径
    let mut path_parts = Vec::new();
    let mut current_ref = file_ref;
    let root_ref = 5u64;
    
    // 从文件向上遍历到根目录，收集路径部分
    while let Some(entry) = entry_map.get(&current_ref) {
        path_parts.push(entry.name.clone());
        if current_ref == root_ref || entry.parent_ref == current_ref {
            break;
        }
        current_ref = entry.parent_ref;
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
