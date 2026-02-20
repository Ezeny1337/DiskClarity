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

/** 差异类型 */
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
