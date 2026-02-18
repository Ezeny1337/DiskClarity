use serde::{Deserialize, Serialize};
use std::collections::HashMap;
use std::path::PathBuf;

use crate::models::FileNode;

// .dcshot 文件的魔数标识
const DCSHOT_MAGIC: &[u8; 8] = b"DCSHOT01";

// 快照元数据（存储在列表中，不包含完整树）
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct SnapshotMeta {
    pub id: String,
    pub drive: String,
    pub created_at: u64,   // Unix 时间戳（秒）
    pub file_count: u64,
    pub dir_count: u64,
    pub total_size: u64,
    pub label: Option<String>,
}

// .dcshot 文件完整结构
#[derive(Debug, Serialize, Deserialize)]
pub struct SnapshotFile {
    pub meta: SnapshotMeta,
    pub root: FileNode,
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

/// 获取快照存储目录（%APPDATA%\DiskClarity\snapshots）
pub fn get_snapshot_dir() -> Result<PathBuf, String> {
    let appdata = std::env::var("APPDATA")
        .or_else(|_| std::env::var("HOME"))
        .map_err(|_| "Cannot find APPDATA/HOME directory".to_string())?;

    let dir = PathBuf::from(appdata)
        .join("DiskClarity")
        .join("snapshots");

    if !dir.exists() {
        std::fs::create_dir_all(&dir)
            .map_err(|e| format!("Cannot create snapshot directory: {}", e))?;
    }

    Ok(dir)
}

/// 保存快照到 .dcshot 文件
pub fn save_snapshot(root: &FileNode, drive: &str, label: Option<String>) -> Result<SnapshotMeta, String> {
    let dir = get_snapshot_dir()?;

    let now = std::time::SystemTime::now()
        .duration_since(std::time::UNIX_EPOCH)
        .map_err(|e| e.to_string())?
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

    let snapshot = SnapshotFile {
        meta: meta.clone(),
        root: root.clone(),
    };

    // 序列化为 MessagePack
    let msgpack_data = rmp_serde::to_vec_named(&snapshot)
        .map_err(|e| format!("Serialization failed: {}", e))?;

    // gzip 压缩
    use flate2::write::GzEncoder;
    use flate2::Compression;
    use std::io::Write;

    let mut encoder = GzEncoder::new(Vec::new(), Compression::default());
    encoder.write_all(&msgpack_data)
        .map_err(|e| format!("Compression failed: {}", e))?;
    let compressed = encoder.finish()
        .map_err(|e| format!("Compression finish failed: {}", e))?;

    // 写入文件：魔数 + 数据
    let file_path = dir.join(format!("{}.dcshot", id));
    let mut file_data = Vec::with_capacity(DCSHOT_MAGIC.len() + compressed.len());
    file_data.extend_from_slice(DCSHOT_MAGIC);
    file_data.extend_from_slice(&compressed);

    std::fs::write(&file_path, &file_data)
        .map_err(|e| format!("Failed to write snapshot file: {}", e))?;

    Ok(meta)
}

/// 列举快照的元数据
pub fn list_snapshots(drive_filter: Option<&str>) -> Result<Vec<SnapshotMeta>, String> {
    let dir = get_snapshot_dir()?;

    let mut metas: Vec<SnapshotMeta> = Vec::new();

    let entries = std::fs::read_dir(&dir)
        .map_err(|e| format!("Cannot read snapshot directory: {}", e))?;

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
            },
            Err(_) => continue, // 跳过损坏的文件
        }
    }

    // 按创建时间降序排列（最新的在前）
    metas.sort_by(|a, b| b.created_at.cmp(&a.created_at));

    Ok(metas)
}

/// 仅加载快照元数据
fn load_snapshot_meta(path: &PathBuf) -> Result<SnapshotMeta, String> {
    let snapshot = load_snapshot_file(path)?;
    Ok(snapshot.meta)
}

/// 加载完整快照文件
pub fn load_snapshot_by_id(id: &str) -> Result<SnapshotFile, String> {
    let dir = get_snapshot_dir()?;
    let file_path = dir.join(format!("{}.dcshot", id));
    load_snapshot_file(&file_path)
}

fn load_snapshot_file(path: &PathBuf) -> Result<SnapshotFile, String> {
    let file_data = std::fs::read(path)
        .map_err(|e| format!("Cannot read snapshot file: {}", e))?;

    // 验证魔数
    if file_data.len() < DCSHOT_MAGIC.len() || &file_data[..DCSHOT_MAGIC.len()] != DCSHOT_MAGIC {
        return Err("Invalid snapshot file format".to_string());
    }

    let compressed = &file_data[DCSHOT_MAGIC.len()..];

    // gzip 解压
    use flate2::read::GzDecoder;
    use std::io::Read;

    let mut decoder = GzDecoder::new(compressed);
    let mut msgpack_data = Vec::new();
    decoder.read_to_end(&mut msgpack_data)
        .map_err(|e| format!("Decompression failed: {}", e))?;

    // 反序列化
    let snapshot: SnapshotFile = rmp_serde::from_slice(&msgpack_data)
        .map_err(|e| format!("Deserialization failed: {}", e))?;

    Ok(snapshot)
}

/// 删除快照
pub fn delete_snapshot(id: &str) -> Result<(), String> {
    let dir = get_snapshot_dir()?;
    let file_path = dir.join(format!("{}.dcshot", id));

    if file_path.exists() {
        std::fs::remove_file(&file_path)
            .map_err(|e| format!("Failed to delete snapshot: {}", e))?;
    }

    Ok(())
}

/// 将 FileNode 树展平为路径->节点的 HashMap
fn flatten_tree<'a>(node: &'a FileNode, parent_path: &str, map: &mut HashMap<String, &'a FileNode>) {
    let current_path = if parent_path.is_empty() {
        node.name.clone()
    } else {
        format!("{}\\{}", parent_path, node.name)
    };
    
    map.insert(current_path.clone(), node);
    for child in &node.children {
        flatten_tree(child, &current_path, map);
    }
}

/// 获取快照中所有节点的路径->大小映射，用于前端历史趋势分析
pub fn get_snapshot_file_sizes(id: &str) -> Result<HashMap<String, u64>, String> {
    let snapshot = load_snapshot_by_id(id)?;
    let mut size_map: HashMap<String, u64> = HashMap::new();
    collect_sizes(&snapshot.root, "", &mut size_map);
    Ok(size_map)
}

/// 递归收集文件树中所有节点的路径->大小
fn collect_sizes(node: &FileNode, parent_path: &str, map: &mut HashMap<String, u64>) {
    let current_path = if parent_path.is_empty() {
        node.name.clone()
    } else {
        format!("{}\\{}", parent_path, node.name)
    };
    map.insert(current_path.clone(), node.size);
    for child in &node.children {
        collect_sizes(child, &current_path, map);
    }
}

/// 对比两个快照，返回差异结果
pub fn diff_snapshots(id_a: &str, id_b: &str) -> Result<DiffResult, String> {
    let snap_a = load_snapshot_by_id(id_a)?;
    let snap_b = load_snapshot_by_id(id_b)?;

    diff_trees(&snap_a.root, &snap_b.root, id_a, id_b)
}

/// 对比两棵文件树
pub fn diff_trees(root_a: &FileNode, root_b: &FileNode, id_a: &str, id_b: &str) -> Result<DiffResult, String> {
    let mut map_a: HashMap<String, &FileNode> = HashMap::new();
    let mut map_b: HashMap<String, &FileNode> = HashMap::new();

    flatten_tree(root_a, "", &mut map_a);
    flatten_tree(root_b, "", &mut map_b);

    let mut entries: Vec<DiffEntry> = Vec::new();
    let mut total_added_size: u64 = 0;
    let mut total_removed_size: u64 = 0;
    let mut total_grown_delta: i64 = 0;
    let mut total_shrunk_delta: i64 = 0;
    let mut added_count: u64 = 0;
    let mut removed_count: u64 = 0;
    let mut changed_count: u64 = 0;

    // 检查 B 中的所有节点
    for (path, node_b) in &map_b {
        if let Some(node_a) = map_a.get(path) {
            // 两边都有 - 检查大小变化
            if node_b.size != node_a.size {
                let delta = node_b.size as i64 - node_a.size as i64;
                let kind = if delta > 0 { DiffKind::Grown } else { DiffKind::Shrunk };

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

    // 检查 A 中有但 B 中没有的节点 - 已删除
    for (path, node_a) in &map_a {
        if !map_b.contains_key(path) {
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
    entries.sort_by(|a, b| b.size_delta.unsigned_abs().cmp(&a.size_delta.unsigned_abs()));

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
