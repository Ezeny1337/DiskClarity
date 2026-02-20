import type {
    ExtensionMode,
    FileNode,
    GroupBy,
    NodeType,
    ScanProgress,
    ScanStage,
    SearchMode,
    SizeUnit,
    SortField,
    SortOrder
} from './scan';
import type {DiffResult} from './snapshot';

/** 标签页类型 */
export type TabType = 'home' | 'disk-scan' | 'snapshot-analysis' | 'snapshot-diff';

/** 标签页数据接口 */
export interface TabData {
    id: string;
    type: TabType;
    title: string;
    data?: {
        // Disk Scan 相关数据
        drive?: string;
        scanResult?: FileNode;
        scanProgress?: ScanProgress;
        isScanning?: boolean;
        scanStage?: ScanStage;
        scanTaskId?: string;
        error?: string | null;

        // 文件浏览相关状态
        selectedPath?: string;
        currentNode?: FileNode | null;
        breadcrumbs?: FileNode[];
        sortField?: SortField;
        sortOrder?: SortOrder;
        groupBy?: GroupBy;
        flatGrouping?: boolean;

        // Disk Scan 搜索筛选
        diskSearchQuery?: string;
        diskSearchMode?: SearchMode;
        diskSearchCaseSensitive?: boolean;
        diskSearchNodeType?: NodeType;
        diskSearchMinSizeMb?: string;
        diskSearchMaxSizeMb?: string;
        diskSearchMinSizeUnit?: SizeUnit;
        diskSearchMaxSizeUnit?: SizeUnit;
        diskSearchExtensions?: string[];
        diskSearchExtensionMode?: ExtensionMode;

        // Disk Scan 快照保存状态
        snapshotSaved?: boolean;
        rawScanData?: Uint8Array | null;

        // Snapshot Analysis Tab 差异分析进度状态
        isAnalyzingDiff?: boolean;
        analyzeStartedAt?: number | null;

        // Snapshot Diff 相关数据
        snapshotAId?: string;
        snapshotBId?: string;
        diffTaskId?: string;
        diffResult?: DiffResult | null;
        diffError?: string | null;
        isDiffing?: boolean;
    };
}
