/** 默认扫描配置 */
export const DEFAULT_SCAN_CONFIG = {
    max_threads: undefined,
};

/** 默认排序配置 */
export const DEFAULT_SORT_CONFIG = {
    field: 'size' as const,
    order: 'desc' as const,
};

/** 默认分组配置 */
export const DEFAULT_GROUP_CONFIG = {
    groupBy: 'none' as const,
    flatGrouping: false,
};

/** 默认快照设置 */
export const DEFAULT_SNAPSHOT_CONFIG = {
    topNCount: 10,
    showFilesOnly: false,
};

/** 文件大小单位转换 */
export const SIZE_UNITS = {
    B: 1,
    KB: 1024,
    MB: 1024 * 1024,
    GB: 1024 * 1024 * 1024,
} as const;

/** 默认主页标签配置 */
export const DEFAULT_HOME_TAB = {
    type: 'home' as const,
    title: 'Home',
};
