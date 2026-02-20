import type {FileNode, GroupBy, SortField, SortOrder} from '../types';
import {getFileType} from './fileTypeClassifier';

/** 文件类型显示名称映射 */
const FILE_TYPE_DISPLAY_MAP: Record<string, { fallbackLabel: string; emoji: string }> = {
    'video': {fallbackLabel: 'Video', emoji: '🎬'},
    'image': {fallbackLabel: 'Image', emoji: '🖼️'},
    'audio': {fallbackLabel: 'Audio', emoji: '🎵'},
    'document': {fallbackLabel: 'Document', emoji: '📄'},
    'archive': {fallbackLabel: 'Archive', emoji: '📦'},
    'code': {fallbackLabel: 'Code', emoji: '💻'},
    'config': {fallbackLabel: 'Config', emoji: '⚙️'},
    'executable': {fallbackLabel: 'Executable', emoji: '⚙️'},
    'other': {fallbackLabel: 'Other', emoji: '🛠️'},
};

const FILE_TYPE_I18N_KEY_MAP: Record<string, string> = {
    video: 'fileType.video',
    image: 'fileType.image',
    audio: 'fileType.audio',
    document: 'fileType.document',
    archive: 'fileType.archive',
    code: 'fileType.code',
    config: 'fileType.config',
    executable: 'fileType.executable',
    other: 'fileType.other',
};

/**
 * 获取文件的分组键
 * @param fileName 文件名
 * @param isDir 是否为目录
 * @param groupBy 分组方式
 * @returns 分组键
 */
export function getGroupKey(fileName: string, isDir: boolean, groupBy: GroupBy): string {
    if (groupBy === 'none') {
        return '';
    }

    if (isDir) {
        return '__folder__';
    }

    if (groupBy === 'type') {
        return getFileType(fileName);
    }

    if (groupBy === 'extension') {
        const ext = fileName.split('.').pop()?.toUpperCase() || 'NO_EXT';
        return ext === '' ? 'NO_EXT' : ext;
    }

    return '';
}

export function getGroupDisplayName(groupKey: string, groupBy: GroupBy, t?: (key: string) => string): string {
    if (groupBy === 'none') return '';

    if (groupKey === '__folder__') {
        const label = t ? t('grouping.folder') : 'Folder';
        return label === 'grouping.folder' ? '📁 Folder' : `📁 ${label}`;
    }

    if (groupBy === 'type') {
        const typeInfo = FILE_TYPE_DISPLAY_MAP[groupKey] ?? FILE_TYPE_DISPLAY_MAP['other'];
        const i18nKey = FILE_TYPE_I18N_KEY_MAP[groupKey] ?? 'fileType.other';
        let label = typeInfo.fallbackLabel;

        if (t) {
            const translated = t(i18nKey);
            if (translated !== i18nKey) {
                label = translated;
            }
        }

        return `${typeInfo.emoji} ${label}`;
    }

    if (groupBy === 'extension') {
        if (groupKey === 'NO_EXT') {
            const label = t ? t('grouping.noExtension') : 'No Extension';
            return label === 'grouping.noExtension' ? 'No Extension' : label;
        }
        return `.${groupKey}`;
    }

    return groupKey;
}

/**
 * 获取快照分析中的文件类型键
 * @param fileName 文件名
 * @returns 类型键
 */
export function getSnapshotTypeKey(fileName: string): string {
    return getGroupKey(fileName, false, 'type');
}

/**
 * 解析虚拟分组路径
 * @param path 虚拟路径
 * @returns 解析结果
 */
export function parseVirtualGroupPath(path: string): { groupBy: GroupBy; scopePath: string; groupKey: string } | null {
    if (!path.startsWith('__group__:')) return null;
    const parts = path.split(':');
    if (parts.length !== 4) return null;
    return {
        groupBy: parts[1] as GroupBy,
        scopePath: parts[2],
        groupKey: parts[3],
    };
}

/**
 * 检查是否为虚拟分组路径
 * @param path 路径
 * @returns 是否为虚拟分组路径
 */
export function isVirtualGroupPath(path: string): boolean {
    return path.startsWith('__group__:');
}

/**
 * 获取 FileNode 的分组键
 * @param node 文件节点
 * @param groupBy 分组方式
 * @returns 分组键
 */
export function getGroupKeyFromNode(node: FileNode, groupBy: GroupBy): string {
    return getGroupKey(node.name, node.is_dir, groupBy);
}

/**
 * 使用迭代方式收集所有文件
 */
function collectAllFiles(nodes: FileNode[]): FileNode[] {
    const files: FileNode[] = [];
    const stack: FileNode[] = [...nodes];

    try {
        while (stack.length > 0) {
            const node = stack.pop();

            if (!node) continue;

            if (node.is_dir && node.children && node.children.length > 0) {
                stack.push(...node.children);
            } else if (!node.is_dir) {
                files.push(node);
            }
        }
    } catch (error) {
    }

    return files;
}

/**
 * 将文件节点按分组方式分组
 */
export function groupFileNodes(
    nodes: FileNode[],
    groupBy: GroupBy,
    parentPath?: string,
    flatGrouping: boolean = false,
    t?: (key: string) => string
): FileNode[] {
    if (groupBy === 'none' || !nodes?.length) {
        return nodes;
    }

    // 如果已经在一个分组内，不再进行分组
    if (parentPath && parentPath.startsWith('__group__:')) {
        return nodes;
    }

    let files = nodes.filter(n => !n.is_dir);
    const directories = nodes.filter(n => n.is_dir);

    if (flatGrouping) {
        files = collectAllFiles(nodes);
    }

    if (!files.length) {
        return directories;
    }

    const groups = new Map<string, FileNode[]>();

    for (const file of files) {
        const key = getGroupKeyFromNode(file, groupBy);
        if (!groups.has(key)) {
            groups.set(key, []);
        }
        groups.get(key)!.push(file);
    }

    const groupedNodes: FileNode[] = [];

    for (const [groupKey, groupedChildren] of groups.entries()) {
        let totalSize = 0;
        let maxModifiedTime = 0;
        for (const child of groupedChildren) {
            totalSize += child.size;
            if ((child.modified_time ?? 0) > maxModifiedTime) {
                maxModifiedTime = child.modified_time ?? 0;
            }
        }

        const displayName = getGroupDisplayName(groupKey, groupBy, t);
        const virtualPath = `__group__:${groupBy}:${parentPath ?? ''}:${groupKey}`;

        groupedNodes.push({
            name: displayName,
            path: virtualPath,
            size: totalSize,
            is_dir: true,
            children: groupedChildren,
            file_count: groupedChildren.length,
            dir_count: 0,
            modified_time: maxModifiedTime,
        });
    }

    // 扁平分组模式只返回分组节点
    // 普通分组模式将分组节点和目录合并返回
    return flatGrouping ? groupedNodes : [...groupedNodes, ...directories];
}

/**
 * 按排序字段和排序顺序排序分组节点
 */
export function sortGroupedNodes(
    nodes: FileNode[],
    sortField: SortField,
    sortOrder: SortOrder
): FileNode[] {
    return [...nodes].sort((a, b) => {
        if (sortField === 'name') {
            if (a.is_dir !== b.is_dir) {
                return a.is_dir ? -1 : 1;
            }
        }

        let comparison = 0;

        switch (sortField) {
            case 'name':
                comparison = a.name.localeCompare(b.name);
                break;
            case 'size':
                comparison = a.size - b.size;
                break;
            case 'modified':
                comparison = (a.modified_time || 0) - (b.modified_time || 0);
                break;
            case 'fileCount':
                comparison = a.file_count - b.file_count;
                break;
        }

        return sortOrder === 'asc' ? comparison : -comparison;
    });
}
