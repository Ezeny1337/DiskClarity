use crate::error::{AppError, AppResult};
use crate::models::{FileNode, MftEntry};
use rayon::prelude::*;
use std::collections::HashMap;
use std::fs;

const ROOT_REF: u64 = 5;

/// 从平面 MFT 条目列表构建文件树
pub fn build_tree(entries: Vec<MftEntry>, root_path: &str) -> AppResult<FileNode> {
    let capacity = entries.len();
    let mut entry_map: HashMap<u64, MftEntry> = HashMap::with_capacity(capacity);
    let mut children_map: HashMap<u64, Vec<u64>> = HashMap::with_capacity(capacity / 4);
    let mut fallback_refs: Vec<u64> = Vec::new();

    for mut entry in entries {
        let file_ref = entry.file_ref;
        let parent_ref = entry.parent_ref;

        // $BadClus 的 sparse 流大小不应计入磁盘占用
        if entry.name.eq_ignore_ascii_case("$BadClus") {
            entry.size = 0;
        }

        if entry.needs_size_fallback {
            fallback_refs.push(file_ref);
        }

        entry_map.insert(file_ref, entry);
        children_map.entry(parent_ref).or_default().push(file_ref);
    }

    // 并行回退：通过文件系统 API 补全 MFT 中大小为 0 的文件
    if !fallback_refs.is_empty() {
        let sizes: Vec<(u64, u64)> = fallback_refs
            .par_iter()
            .filter_map(|&fref| {
                let size = resolve_file_size(&entry_map, root_path, fref).unwrap_or(0);
                if size > 0 {
                    Some((fref, size))
                } else {
                    None
                }
            })
            .collect();

        for (fref, size) in sizes {
            if let Some(e) = entry_map.get_mut(&fref) {
                e.size = size;
            }
        }
    }

    // 插入虚拟根节点
    let root_name = root_path
        .get(0..2)
        .filter(|s| s.chars().nth(1) == Some(':'))
        .unwrap_or(root_path)
        .to_string();

    entry_map.insert(
        ROOT_REF,
        MftEntry {
            file_ref: ROOT_REF,
            parent_ref: ROOT_REF,
            name: root_name,
            size: 0,
            is_dir: true,
            modified_time: 0,
            needs_size_fallback: false,
        },
    );

    let root_node = build_node_iterative(&mut entry_map, &children_map, ROOT_REF);
    drop(entry_map);
    drop(children_map);
    root_node.ok_or_else(|| AppError::Ntfs("Failed to build root node".to_string()))
}

/// 后序迭代建树：边释放 entry_map，边构建 FileNode 树
fn build_node_iterative(
    entry_map: &mut HashMap<u64, MftEntry>,
    children_map: &HashMap<u64, Vec<u64>>,
    root_ref: u64,
) -> Option<FileNode> {
    let mut stack: Vec<(u64, bool)> = Vec::with_capacity(256);
    // 已构建完成的节点暂存表
    let mut built: HashMap<u64, FileNode> = HashMap::with_capacity(entry_map.len());

    stack.push((root_ref, false));

    while let Some((file_ref, exiting)) = stack.pop() {
        if exiting {
            let entry = match entry_map.remove(&file_ref) {
                Some(e) => e,
                None => continue, // 孤立/重复节点，跳过
            };

            let mut total_size = entry.size;
            // 使用饱和加法防止理论上的溢出
            let mut file_count: u32 = if entry.is_dir { 0 } else { 1 };
            let mut dir_count: u32 = 0;

            // 收集所有已就绪的子节点
            let children: Vec<FileNode> = children_map
                .get(&file_ref)
                .map(|refs| {
                    refs.iter()
                        .filter(|&&r| r != file_ref) // 防自环
                        .filter_map(|&r| built.remove(&r))
                        .map(|child| {
                            total_size += child.size;
                            file_count = file_count.saturating_add(child.file_count);
                            if child.is_dir {
                                dir_count =
                                    dir_count.saturating_add(1).saturating_add(child.dir_count);
                            }
                            child
                        })
                        .collect()
                })
                .unwrap_or_default();

            let node = FileNode {
                name: entry.name,
                size: total_size,
                is_dir: entry.is_dir,
                children,
                file_count,
                dir_count,
                modified_time: entry.modified_time as u32,
            };

            built.insert(file_ref, node);
        } else {
            if !entry_map.contains_key(&file_ref) {
                continue;
            }

            // 放回自身
            stack.push((file_ref, true));

            // 将子节点以 Enter 阶段压入栈
            if let Some(child_refs) = children_map.get(&file_ref) {
                for &child_ref in child_refs.iter().rev() {
                    if child_ref != file_ref && entry_map.contains_key(&child_ref) {
                        stack.push((child_ref, false));
                    }
                }
            }
        }
    }

    built.remove(&root_ref)
}

/// 通过向上遍历 entry_map 构建完整路径，再用 fs::metadata 获取文件大小
fn resolve_file_size(
    entry_map: &HashMap<u64, MftEntry>,
    root_path: &str,
    file_ref: u64,
) -> Result<u64, String> {
    let mut parts: Vec<&str> = Vec::new();
    let mut cur = file_ref;

    // 向上追溯到根节点，收集路径分量
    for _ in 0..256 {
        let entry = entry_map
            .get(&cur)
            .ok_or_else(|| format!("Entry {} not found", cur))?;
        parts.push(&entry.name);
        if cur == ROOT_REF || entry.parent_ref == cur {
            break;
        }
        cur = entry.parent_ref;
    }

    parts.reverse();
    // 跳过驱动器根名称
    let rel_parts = if parts.len() > 1 {
        &parts[1..]
    } else {
        &parts[..]
    };

    let mut full_path = String::from(root_path);
    for part in rel_parts {
        full_path.push('\\');
        full_path.push_str(part);
    }

    fs::metadata(&full_path)
        .map_err(|e| format!("metadata({full_path}): {e}"))
        .and_then(|m| {
            if m.is_file() {
                Ok(m.len())
            } else {
                Err(format!("Not a file: {full_path}"))
            }
        })
}
