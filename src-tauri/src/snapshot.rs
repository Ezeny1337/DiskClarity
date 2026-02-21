use flate2::read::GzDecoder;
use flate2::write::GzEncoder;
use flate2::Compression;
use serde::{Deserialize, Serialize};
use std::collections::HashMap;
use std::io::{Read, Write};
use std::path::PathBuf;
use std::time::{SystemTime, UNIX_EPOCH};

use crate::error::{AppError, AppResult};
use crate::models::FileNode;

// 格式：magic(8) + meta_len(4, LE) + msgpack(meta) + gzip(msgpack(root))
const DCSHOT_MAGIC: &[u8; 8] = b"DCSHOT02";

// 快照元数据（存储在列表中，不包含完整树）
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct SnapshotMeta {
    pub id: String,
    pub drive: String,
    pub created_at: u64, // Unix 时间戳（秒）
    pub file_count: u64,
    pub dir_count: u64,
    pub total_size: u64,
    pub label: Option<String>,
}

// Diff 结果中单个条目的变化类型
#[derive(Debug, Clone, Serialize, Deserialize, PartialEq)]
#[serde(rename_all = "snake_case")]
pub enum DiffKind {
    Added,
    Removed,
    Grown,
    Shrunk,
}

// Diff 结果条目
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct DiffEntry {
    pub path: String,
    pub name: String,
    pub is_dir: bool,
    pub kind: DiffKind,
    pub size_a: u64,
    pub size_b: u64,
    pub size_delta: i64,
    pub modified_time_b: u64,
}

// Diff 汇总结果
#[derive(Debug, Serialize, Deserialize)]
pub struct DiffResult {
    pub snapshot_a_id: String,
    pub snapshot_b_id: String,
    pub entries: Vec<DiffEntry>,
    pub total_added_size: u64,
    pub total_removed_size: u64,
    pub total_grown_delta: i64,
    pub total_shrunk_delta: i64,
    pub added_count: u64,
    pub removed_count: u64,
    pub changed_count: u64,
}

fn get_snapshot_dir() -> AppResult<PathBuf> {
    let appdata = std::env::var("APPDATA")
        .or_else(|_| std::env::var("HOME"))
        .map_err(|_| AppError::Io("APPDATA/HOME environment variable not set".to_string()))?;

    let dir = PathBuf::from(appdata).join("DiskClarity").join("snapshots");

    if !dir.exists() {
        std::fs::create_dir_all(&dir)?;
    }

    Ok(dir)
}

pub fn save_snapshot(
    root: &FileNode,
    drive: &str,
    label: Option<String>,
) -> AppResult<SnapshotMeta> {
    let dir = get_snapshot_dir()?;

    let now = SystemTime::now()
        .duration_since(UNIX_EPOCH)
        .map_err(|e| AppError::Io(e.to_string()))?
        .as_secs();

    let id = format!("{}-{}", drive.trim_end_matches('\\').replace(':', ""), now);

    let meta = SnapshotMeta {
        id: id.clone(),
        drive: drive.to_string(),
        created_at: now,
        file_count: root.file_count,
        dir_count: root.dir_count,
        total_size: root.size,
        label,
    };

    // 序列化元数据（不压缩，用于快速读取）
    let meta_bytes = rmp_serde::to_vec_named(&meta)?;
    let meta_len = meta_bytes.len() as u32;

    let root_bytes = rmp_serde::to_vec_named(root)?;
    let mut enc = GzEncoder::new(Vec::new(), Compression::fast());
    enc.write_all(&root_bytes)
        .map_err(|e| AppError::Compression(e.to_string()))?;
    let compressed_root = enc
        .finish()
        .map_err(|e| AppError::Compression(e.to_string()))?;

    let file_path = dir.join(format!("{id}.dcshot"));
    let total = DCSHOT_MAGIC.len() + 4 + meta_bytes.len() + compressed_root.len();
    let mut file_data = Vec::with_capacity(total);
    file_data.extend_from_slice(DCSHOT_MAGIC);
    file_data.extend_from_slice(&meta_len.to_le_bytes());
    file_data.extend_from_slice(&meta_bytes);
    file_data.extend_from_slice(&compressed_root);

    std::fs::write(&file_path, &file_data)?;

    Ok(meta)
}

/// 列举快照的元数据
pub fn list_snapshots(drive_filter: Option<&str>) -> AppResult<Vec<SnapshotMeta>> {
    let dir = get_snapshot_dir()?;

    let mut metas: Vec<SnapshotMeta> = Vec::new();

    let entries = std::fs::read_dir(&dir)?;

    for entry in entries.flatten() {
        let path = entry.path();
        if path.extension().and_then(|e| e.to_str()) != Some("dcshot") {
            continue;
        }

        match load_snapshot_meta(&path) {
            Ok(meta) => {
                if let Some(drive) = drive_filter {
                    if meta.drive == drive {
                        metas.push(meta);
                    }
                } else {
                    metas.push(meta);
                }
            }
            Err(_) => continue, // 跳过损坏的文件
        }
    }

    // 按创建时间降序排列（最新的在前）
    metas.sort_by(|a, b| b.created_at.cmp(&a.created_at));

    Ok(metas)
}

/// 仅加载快照元数据
fn load_snapshot_meta(path: &PathBuf) -> AppResult<SnapshotMeta> {
    use std::io::Read;
    let mut f = std::fs::File::open(path)?;

    // 读取定长头部：magic(8) + meta_len(4)
    let mut header = [0u8; 12];
    f.read_exact(&mut header)
        .map_err(|_| AppError::Snapshot("Invalid snapshot file format".to_string()))?;

    if &header[..8] != DCSHOT_MAGIC {
        return Err(AppError::Snapshot(
            "Invalid snapshot file format".to_string(),
        ));
    }

    let meta_len = u32::from_le_bytes([header[8], header[9], header[10], header[11]]) as usize;

    // 只读取 meta 字节，忽略后续压缩树数据
    let mut meta_bytes = vec![0u8; meta_len];
    f.read_exact(&mut meta_bytes)
        .map_err(|_| AppError::Snapshot("Truncated snapshot file".to_string()))?;

    Ok(rmp_serde::from_slice(&meta_bytes)?)
}

/// 加载完整快照文件
pub fn load_snapshot_by_id(id: &str) -> AppResult<(SnapshotMeta, FileNode)> {
    let dir = get_snapshot_dir()?;
    let file_path = dir.join(format!("{id}.dcshot"));
    let file_data = std::fs::read(&file_path)?;

    if file_data.len() < 12 || &file_data[..8] != DCSHOT_MAGIC {
        return Err(AppError::Snapshot(
            "Invalid snapshot file format".to_string(),
        ));
    }

    let meta_len = u32::from_le_bytes(
        file_data[8..12]
            .try_into()
            .map_err(|_| AppError::Snapshot("Invalid snapshot header".to_string()))?,
    ) as usize;
    if file_data.len() < 12 + meta_len {
        return Err(AppError::Snapshot("Truncated snapshot file".to_string()));
    }

    let meta: SnapshotMeta = rmp_serde::from_slice(&file_data[12..12 + meta_len])?;

    let compressed_root = &file_data[12 + meta_len..];
    let mut dec = GzDecoder::new(compressed_root);
    let mut root_bytes = Vec::new();
    dec.read_to_end(&mut root_bytes)
        .map_err(|e| AppError::Compression(e.to_string()))?;

    let root: FileNode = rmp_serde::from_slice(&root_bytes)?;

    Ok((meta, root))
}

pub fn delete_snapshot(id: &str) -> AppResult<()> {
    let dir = get_snapshot_dir()?;
    let file_path = dir.join(format!("{id}.dcshot"));
    if file_path.exists() {
        std::fs::remove_file(&file_path)?;
    }
    Ok(())
}

/// 迭代展平 FileNode 树为 path -> node 映射，优化路径字符串分配
fn flatten_tree<'a>(root: &'a FileNode) -> HashMap<String, &'a FileNode> {
    let capacity = (root.file_count + root.dir_count + 1) as usize;
    let mut map = HashMap::with_capacity(capacity);
    let mut stack: Vec<(&'a FileNode, usize)> = Vec::with_capacity(64); // (node, path_depth)
    let mut path_parts: Vec<&str> = Vec::with_capacity(32); // 重用路径组件

    stack.push((root, 0));
    while let Some((node, depth)) = stack.pop() {
        // 调整路径栈深度
        path_parts.truncate(depth);
        path_parts.push(&node.name);

        // 构建完整路径（只分配一次）
        let path = if path_parts.len() == 1 {
            path_parts[0].to_string()
        } else {
            path_parts.join("\\")
        };

        map.insert(path, node);

        // 子节点入栈（逆序保持遍历顺序）
        for child in node.children.iter().rev() {
            stack.push((child, path_parts.len()));
        }
    }
    map
}

/// 迭代收集所有节点的 path -> size 映射
pub fn get_snapshot_file_sizes(id: &str) -> AppResult<HashMap<String, u64>> {
    let (_meta, root) = load_snapshot_by_id(id)?;
    let map = flatten_tree(&root)
        .into_iter()
        .map(|(k, v)| (k, v.size))
        .collect();
    Ok(map)
}

/// 对比两个快照，返回差异结果（并行加载两个快照文件）
pub fn diff_snapshots(id_a: &str, id_b: &str) -> AppResult<DiffResult> {
    use std::thread;
    let id_a_owned = id_a.to_string();

    let handle_a = thread::spawn(move || load_snapshot_by_id(&id_a_owned));
    let (_meta_b, root_b) = load_snapshot_by_id(id_b)?;
    let (_meta_a, root_a) = handle_a
        .join()
        .map_err(|_| AppError::TaskFailed("Thread panicked loading snapshot A".to_string()))??;

    diff_trees(&root_a, &root_b, id_a, id_b)
}

pub fn diff_trees(
    root_a: &FileNode,
    root_b: &FileNode,
    id_a: &str,
    id_b: &str,
) -> AppResult<DiffResult> {
    let map_a = flatten_tree(root_a);
    let map_b = flatten_tree(root_b);

    let mut entries: Vec<DiffEntry> = Vec::new();
    let mut total_added_size: u64 = 0;
    let mut total_removed_size: u64 = 0;
    let mut total_grown_delta: i64 = 0;
    let mut total_shrunk_delta: i64 = 0;
    let mut added_count: u64 = 0;
    let mut removed_count: u64 = 0;
    let mut changed_count: u64 = 0;

    use std::collections::HashSet;
    let mut processed_paths = HashSet::with_capacity(map_b.len());

    // 检查 B 中的所有节点
    for (path, node_b) in &map_b {
        processed_paths.insert(path);

        if let Some(node_a) = map_a.get(path) {
            // 两边都有 - 检查大小变化
            if node_b.size != node_a.size {
                let delta = node_b.size as i64 - node_a.size as i64;
                let kind = if delta > 0 {
                    DiffKind::Grown
                } else {
                    DiffKind::Shrunk
                };

                if delta > 0 {
                    total_grown_delta += delta;
                } else {
                    total_shrunk_delta += delta;
                }
                changed_count += 1;

                entries.push(DiffEntry {
                    path: path.clone(),
                    name: node_b.name.clone(),
                    is_dir: node_b.is_dir,
                    kind,
                    size_a: node_a.size,
                    size_b: node_b.size,
                    size_delta: delta,
                    modified_time_b: node_b.modified_time,
                });
            }
        } else {
            // 仅在 B 中存在 - 新增
            total_added_size += node_b.size;
            added_count += 1;

            entries.push(DiffEntry {
                path: path.clone(),
                name: node_b.name.clone(),
                is_dir: node_b.is_dir,
                kind: DiffKind::Added,
                size_a: 0,
                size_b: node_b.size,
                size_delta: node_b.size as i64,
                modified_time_b: node_b.modified_time,
            });
        }
    }

    // 只遍历 A 中未处理的路径
    for (path, node_a) in &map_a {
        if !processed_paths.contains(path) {
            total_removed_size += node_a.size;
            removed_count += 1;

            entries.push(DiffEntry {
                path: path.clone(),
                name: node_a.name.clone(),
                is_dir: node_a.is_dir,
                kind: DiffKind::Removed,
                size_a: node_a.size,
                size_b: 0,
                size_delta: -(node_a.size as i64),
                modified_time_b: 0,
            });
        }
    }

    // 按 size_delta 绝对值降序排列
    entries.sort_by(|a, b| {
        b.size_delta
            .unsigned_abs()
            .cmp(&a.size_delta.unsigned_abs())
    });

    Ok(DiffResult {
        snapshot_a_id: id_a.to_string(),
        snapshot_b_id: id_b.to_string(),
        entries,
        total_added_size,
        total_removed_size,
        total_grown_delta,
        total_shrunk_delta,
        added_count,
        removed_count,
        changed_count,
    })
}
