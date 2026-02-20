import {invoke} from '@tauri-apps/api/core';

/** 快照元数据 */
export interface SnapshotMeta {
    id: string;
    drive: string;
    created_at: number;
    file_count: number;
    dir_count: number;
    total_size: number;
    label?: string;
}

export type DiffKind = 'added' | 'removed' | 'grown' | 'shrunk';

/** 单条差异记录 */
export interface DiffEntry {
    path: string;
    name: string;
    is_dir: boolean;
    kind: DiffKind;
    size_a: number;         // OLD 快照中的大小 Byte，added 时为 0
    size_b: number;         // NEW 快照中的大小 Byte，removed 时为 0
    size_delta: number;     // size_b - size_a
    modified_time_b: number; // NEW 快照中的修改时间（Unix 秒）
}

/** 完整差异结果 */
export interface DiffResult {
    snapshot_a_id: string;
    snapshot_b_id: string;
    entries: DiffEntry[];
    total_added_size: number;
    total_removed_size: number;
    total_grown_delta: number;
    total_shrunk_delta: number;
    added_count: number;
    removed_count: number;
    changed_count: number;
}

/**
 * 保存快照
 */
export async function saveSnapshot(
    rootData: Uint8Array,
    drive: string,
    label?: string
): Promise<SnapshotMeta> {
    return await invoke<SnapshotMeta>('save_snapshot', {
        rootData: Array.from(rootData),
        drive,
        label: label ?? null,
    });
}

/**
 * 列举已保存的快照
 */
export async function listSnapshots(drive?: string): Promise<SnapshotMeta[]> {
    return await invoke<SnapshotMeta[]>('list_snapshots', {drive: drive ?? null});
}

/**
 * 删除指定快照
 */
export async function deleteSnapshot(id: string): Promise<void> {
    await invoke<void>('delete_snapshot', {id});
}

/**
 * 对比两个快照
 */
export async function diffSnapshots(idA: string, idB: string): Promise<DiffResult> {
    return await invoke<DiffResult>('diff_snapshots', {idA, idB});
}
