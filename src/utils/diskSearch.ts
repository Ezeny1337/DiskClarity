import type {FileNode} from '../types';
import {SIZE_UNITS} from '../constants';

export interface DiskSearchCriteria {
    query: string;
    mode: 'contains' | 'regex' | 'exclude';
    caseSensitive: boolean;
    nodeType: 'all' | 'file' | 'dir';
    minSizeMb: string;
    maxSizeMb: string;
    minSizeUnit: 'B' | 'KB' | 'MB' | 'GB';
    maxSizeUnit: 'B' | 'KB' | 'MB' | 'GB';
    extensions: string[];
    extensionMode: 'include' | 'exclude';
}

function toSizeBytes(value: string, unit: 'B' | 'KB' | 'MB' | 'GB'): number | null {
    const trimmed = value.trim();
    if (!trimmed) return null;
    const parsed = Number(trimmed);
    if (!Number.isFinite(parsed) || parsed < 0) return null;

    return parsed * SIZE_UNITS[unit];
}

function buildQueryMatcher(criteria: DiskSearchCriteria): ((target: string) => boolean) | null {
    const q = criteria.query.trim();
    if (!q) return null;

    if (criteria.mode === 'regex') {
        try {
            const regex = new RegExp(q, criteria.caseSensitive ? '' : 'i');
            return (target: string) => regex.test(target);
        } catch {
            return () => false;
        }
    }

    let matcher: (target: string) => boolean;
    if (criteria.caseSensitive) {
        matcher = (target: string) => target.includes(q);
    } else {
        const lowered = q.toLowerCase();
        matcher = (target: string) => target.toLowerCase().includes(lowered);
    }

    // 如果是排除模式，反转匹配结果
    if (criteria.mode === 'exclude') {
        return (target: string) => !matcher(target);
    }

    return matcher;
}

function recalcCounts(node: FileNode): { fileCount: number; dirCount: number; size: number } {
    if (!node.is_dir) {
        return {fileCount: 1, dirCount: 0, size: node.size};
    }

    // 如果没有子节点，直接返回原始统计信息
    if (!node.children?.length) {
        return {
            fileCount: node.file_count || 0,
            dirCount: node.dir_count || 0,
            size: node.size
        };
    }

    let fileCount = 0;
    let dirCount = 0;
    let size = 0;

    // 使用缓存的统计信息来避免深度递归
    for (const child of node.children) {
        if (!child.is_dir) {
            fileCount += 1;
            size += child.size;
        } else {
            // 对于目录，使用已缓存的统计信息
            fileCount += child.file_count || 0;
            dirCount += (child.dir_count || 0) + 1;
            size += child.size;
        }
    }

    return {fileCount, dirCount, size};
}

function buildExtensionMatcher(criteria: DiskSearchCriteria): ((fileName: string) => boolean) | null {
    if (!criteria.extensions?.length) return null;

    const extensions = criteria.extensions.map(ext =>
        ext.startsWith('.') ? ext.toLowerCase() : `.${ext.toLowerCase()}`
    );

    const matcher = (fileName: string) => {
        const fileExt = fileName.toLowerCase().substring(fileName.lastIndexOf('.'));
        return extensions.includes(fileExt);
    };

    return criteria.extensionMode === 'exclude'
        ? (fileName: string) => !matcher(fileName)
        : matcher;
}


export function filterFileTree(root: FileNode, criteria: DiskSearchCriteria): FileNode | null {
    const matcher = buildQueryMatcher(criteria);
    const extensionMatcher = buildExtensionMatcher(criteria);
    const minSizeBytes = toSizeBytes(criteria.minSizeMb, criteria.minSizeUnit);
    const maxSizeBytes = toSizeBytes(criteria.maxSizeMb, criteria.maxSizeUnit);

    const walk = (node: FileNode): FileNode | null => {
        // 早期退出条件检查
        if (criteria.nodeType === 'file' && node.is_dir) {
            if (!node.children?.length) {
                return null;
            }
        }

        if (criteria.nodeType === 'dir' && !node.is_dir) {
            return null;
        }

        // 大小过滤的早期检查
        if (minSizeBytes !== null && node.size < minSizeBytes && !node.is_dir) {
            return null;
        }

        if (maxSizeBytes !== null && node.size > maxSizeBytes && !node.is_dir) {
            return null;
        }

        // 处理子节点（如果有的话）
        const childMatches: FileNode[] = [];
        if (node.children && node.children.length > 0) {
            for (const child of node.children) {
                const childResult = walk(child);
                if (childResult) {
                    childMatches.push(childResult);
                }
            }
        }

        // 检查目录的大小过滤条件
        if (criteria.nodeType === 'file' && node.is_dir && !childMatches.length) {
            return null;
        }

        if (minSizeBytes !== null && node.size < minSizeBytes && !childMatches.length) {
            return null;
        }

        if (maxSizeBytes !== null && node.size > maxSizeBytes && !childMatches.length) {
            return null;
        }

        // 文本和扩展名匹配检查
        const target = `${node.name} ${node.path}`;
        const selfMatched = matcher ? matcher(target) : true;
        const extensionMatched = extensionMatcher ? extensionMatcher(node.name) : true;

        if ((!selfMatched || !extensionMatched) && !childMatches.length) {
            return null;
        }

        // 创建结果节点
        const nextNode: FileNode = {
            ...node,
            children: childMatches,
        };

        // 只有在需要时才重新计算统计信息
        if (childMatches.length !== (node.children?.length || 0)) {
            const stats = recalcCounts(nextNode);
            return {
                ...nextNode,
                size: stats.size,
                file_count: stats.fileCount,
                dir_count: stats.dirCount,
            };
        }
        return nextNode;
    };

    return walk(root);
}

export function findNodeByPath(root: FileNode, targetPath: string): FileNode | null {
    if (root.path === targetPath) return root;
    const stack: { node: FileNode; parentPath: string }[] = (root.children || []).map(child => ({
        node: child,
        parentPath: root.path || root.name
    }));

    while (stack.length > 0) {
        const {node, parentPath} = stack.pop()!;
        if (!node) continue;

        const currentPath = node.path || `${parentPath}\\${node.name}`;

        if (currentPath === targetPath) {
            return {...node, path: currentPath};
        }

        if (node.children && node.children.length) {
            stack.push(...node.children.map(child => ({
                node: child,
                parentPath: currentPath
            })));
        }
    }
    return null;
}

export function hasDiskSearchFilter(criteria: DiskSearchCriteria): boolean {
    return Boolean(
        criteria.query.trim() ||
        criteria.minSizeMb.trim() ||
        criteria.maxSizeMb.trim() ||
        criteria.nodeType !== 'all' ||
        criteria.extensions.length > 0
    );
}
