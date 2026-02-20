/** 文件节点接口 */
export interface FileNode {
    name: string;
    path: string;
    size: number;
    is_dir: boolean;
    children: FileNode[];
    file_count: number;
    dir_count: number;
    modified_time: number;
}

/** 扫描进度接口 */
export interface ScanProgress {
    scanned_files: number;
    scanned_dirs: number;
    total_size: number;
    current_path: string;
    is_complete: boolean;
    duration_ms: number;
    stage?: ProgressStage;
}

/** 扫描配置接口 */
export interface ScanConfig {
    max_threads?: number;
}

/** 排序字段类型 */
export type SortField = 'name' | 'size' | 'modified' | 'fileCount';

/** 排序顺序类型 */
export type SortOrder = 'asc' | 'desc';

/** 分组方式类型 - 统一用于扫描和快照分析 */
export type GroupBy = 'none' | 'type' | 'extension';

/** 快照分组类型别名 - 保持向后兼容 */
export type SnapshotGroupBy = GroupBy;

/** 搜索模式类型 */
export type SearchMode = 'contains' | 'regex' | 'exclude';

/** 节点类型过滤 */
export type NodeType = 'all' | 'file' | 'dir';

/** 文件大小单位 */
export type SizeUnit = 'B' | 'KB' | 'MB' | 'GB';

/** 扩展名模式 */
export type ExtensionMode = 'include' | 'exclude';

/** tab 级别的扫描阶段 */
export type ScanStage = 'select' | 'scanning' | 'complete';

/** 后端 ScanProgress 中的扫描进度阶段（对应 Rust ScanStage 枚举） */
export type ProgressStage = 'scanning' | 'fetching_sizes' | 'building_tree' | 'serializing' | 'complete';
