import type {DiffEntry, SnapshotGroupBy} from '../types';
import {
    getGroupDisplayName,
    getSnapshotTypeKey as getTypeKey,
    isVirtualGroupPath as isVirtualPath,
    parseVirtualGroupPath as parseVirtualPath
} from './groupingUtils';

export interface BreadcrumbItem {
    label: string;
    path: string;
}

/** 快照面包屑路径解析 */
export function buildSnapshotBreadcrumbs(path: string, t?: (key: string) => string): BreadcrumbItem[] {
    if (!path) return [];
    const virtual = parseVirtualGroupPath(path);
    if (virtual) {
        const base = buildSnapshotBreadcrumbs(virtual.scopePath, t);
        return [...base, {label: getGroupDisplayName(virtual.groupKey, virtual.groupBy, t), path}];
    }
    const parts = path.replace(/\\/g, '/').split('/').filter(Boolean);
    const crumbs: BreadcrumbItem[] = [];
    let cur = '';
    for (const p of parts) {
        cur = cur ? cur + '/' + p : p;
        if (/^[A-Za-z]:$/.test(p)) continue;
        crumbs.push({label: p, path: cur});
    }
    return crumbs;
}

/** 统一路径分隔符为 '/'，处理连续斜杠，去掉末尾斜杠 */
export function normPath(p: string): string {
    if (!p) return '';
    let res = p.split('\\').join('/');
    while (res.includes('//')) {
        res = res.split('//').join('/');
    }
    if (res.length > 1 && res.endsWith('/')) {
        res = res.slice(0, -1);
    }
    return res;
}

export const isVirtualGroupPath = isVirtualPath;

/** 解析虚拟分组路径 */
export function parseVirtualGroupPath(path: string): {
    groupBy: SnapshotGroupBy;
    scopePath: string;
    groupKey: string
} | null {
    const raw = parseVirtualPath(path);
    if (!raw) return null;
    return {
        ...raw,
        scopePath: raw.scopePath === '__root__' ? '' : decodeURIComponent(raw.scopePath),
    };
}

export const getSnapshotTypeKey = getTypeKey;

/** 获取当前层级的虚拟直接子项 */
export function getDirectChildren(entries: DiffEntry[], currentPath: string): DiffEntry[] {
    if (!entries.length) return [];

    let cur = currentPath;

    if (!cur) {
        // 找所有条目路径的公共根前缀
        const paths = entries
            .filter(e => !isVirtualGroupPath(e.path))
            .map(e => e.path.split('/'));

        if (paths.length > 0) {
            const minLen = Math.min(...paths.map(p => p.length));
            let commonDepth = 0;
            for (let d = 0; d < minLen; d++) {
                const val = paths[0][d];
                if (paths.every(p => p[d] === val)) {
                    commonDepth = d + 1;
                } else {
                    break;
                }
            }
            if (commonDepth > 0) {
                cur = paths[0].slice(0, commonDepth).join('/');
            }
        }
    }

    const prefix = cur ? cur + '/' : '';
    const groups = new Map<string, { entries: DiffEntry[]; isDir: boolean; name: string }>();

    for (const e of entries) {
        const p = e.path;
        if (!p.startsWith(prefix) && prefix !== '') continue;

        const suffix = p.slice(prefix.length);
        if (!suffix) {
            // 当前节点就是 prefix 本身，此时它没有子路径后缀，直接当做单文件或自身返回
            if (!groups.has(p)) {
                groups.set(p, {entries: [], isDir: e.is_dir, name: e.name});
            }
            groups.get(p)!.entries.push(e);
            continue;
        }

        const slashIdx = suffix.indexOf('/');
        const childName = slashIdx >= 0 ? suffix.slice(0, slashIdx) : suffix;
        const childPath = prefix + childName;
        const isDir = slashIdx >= 0 || e.is_dir; // 有子路径说明是目录

        if (!groups.has(childPath)) {
            groups.set(childPath, {entries: [], isDir, name: childName});
        }
        groups.get(childPath)!.entries.push(e);
    }

    // 每组合并为一个虚拟 DiffEntry
    const result: DiffEntry[] = [];
    for (const [childPath, group] of groups) {
        const {entries: grpEntries, isDir, name} = group;

        if (grpEntries.length === 1 && !isDir) {
            // 单个文件，直接用原始条目
            result.push(grpEntries[0]);
        } else {
            // 多个条目或目录：合并 size_delta，kind 取变化最大的
            const totalDelta = grpEntries.reduce((s, e) => s + e.size_delta, 0);
            const dominant = grpEntries.reduce((a, b) =>
                Math.abs(b.size_delta) > Math.abs(a.size_delta) ? b : a
            );
            result.push({
                path: childPath,
                name,
                is_dir: isDir,
                kind: dominant.kind,
                size_a: grpEntries.reduce((s, e) => s + e.size_a, 0),
                size_b: grpEntries.reduce((s, e) => s + e.size_b, 0),
                size_delta: totalDelta,
                modified_time_b: dominant.modified_time_b,
            });
        }
    }

    // 按 size_delta 绝对值降序
    return result.sort((a, b) => Math.abs(b.size_delta) - Math.abs(a.size_delta));
}

/** 根据分组方式对差异条目进行分组 */
export function groupDiffEntriesWithScope(entries: DiffEntry[], groupBy: SnapshotGroupBy, scopePath: string, t: (key: string) => string): DiffEntry[] {
    if (groupBy === 'none' || entries.length === 0) return entries;

    const files = entries.filter((e) => !e.is_dir && !isVirtualGroupPath(e.path));
    const dirs = entries.filter((e) => e.is_dir && !isVirtualGroupPath(e.path));
    if (files.length === 0) return dirs;

    const groups = new Map<string, DiffEntry[]>();
    for (const file of files) {
        const key = getSnapshotTypeKey(file.name);
        if (!groups.has(key)) groups.set(key, []);
        groups.get(key)!.push(file);
    }

    const groupedNodes: DiffEntry[] = [];
    const encodedScope = scopePath ? encodeURIComponent(scopePath) : '__root__';
    for (const [groupKey, children] of groups.entries()) {
        const totalSizeA = children.reduce((s, e) => s + e.size_a, 0);
        const totalSizeB = children.reduce((s, e) => s + e.size_b, 0);
        const totalDelta = children.reduce((s, e) => s + e.size_delta, 0);
        const dominant = children.reduce((a, b) => (Math.abs(b.size_delta) > Math.abs(a.size_delta) ? b : a));
        const latest = Math.max(...children.map((e) => e.modified_time_b || 0), 0);

        // 使用统一的显示名称函数
        const displayName = getGroupDisplayName(groupKey, groupBy, t);

        groupedNodes.push({
            path: `__group__:${groupBy}:${encodedScope}:${groupKey}`,
            name: displayName,
            is_dir: true,
            kind: dominant.kind,
            size_a: totalSizeA,
            size_b: totalSizeB,
            size_delta: totalDelta,
            modified_time_b: latest,
        });
    }

    return [...groupedNodes, ...dirs].sort((a, b) => Math.abs(b.size_delta) - Math.abs(a.size_delta));
}

/** 获取虚拟分组中的条目 */
export function getEntriesInVirtualGroup(entries: DiffEntry[], virtualPath: string): DiffEntry[] {
    const parsed = parseVirtualGroupPath(virtualPath);
    if (!parsed) return [];

    return entries
        .filter((e) => !e.is_dir && !isVirtualGroupPath(e.path))
        .filter((e) => {
            // 使用统一的分组键获取逻辑
            const key = parsed.groupBy === 'type'
                ? getSnapshotTypeKey(e.name)
                : (e.name.split('.').pop()?.toUpperCase() || 'NO_EXT');
            return key === parsed.groupKey;
        })
        .sort((a, b) => Math.abs(b.size_delta) - Math.abs(a.size_delta));
}

/** 计算当前路径下应渲染的 diff 条目 */
export function computeVisibleDiffEntries(
    entries: DiffEntry[],
    currentPath: string,
    showFilesOnly: boolean,
    groupBy: SnapshotGroupBy,
    flatGrouping: boolean,
    t: (key: string) => string,
): DiffEntry[] {
    const virtual = parseVirtualGroupPath(currentPath);
    if (virtual) {
        const allEntries = (showFilesOnly || flatGrouping)
            ? getFlatFiles(entries, virtual.scopePath)
            : getDirectChildren(entries, virtual.scopePath);
        return getEntriesInVirtualGroup(allEntries, currentPath);
    }
    const base = (showFilesOnly || flatGrouping)
        ? getFlatFiles(entries, currentPath)
        : getDirectChildren(entries, currentPath);
    return groupDiffEntriesWithScope(base, groupBy, currentPath, t);
}

/** 获取扁平文件列表 */
export function getFlatFiles(entries: DiffEntry[], currentPath: string): DiffEntry[] {
    if (!currentPath) return entries.filter((e) => !e.is_dir && !isVirtualGroupPath(e.path));
    const prefix = currentPath + '/';
    return entries.filter((e) => !e.is_dir && !isVirtualGroupPath(e.path) && e.path.startsWith(prefix));
}
