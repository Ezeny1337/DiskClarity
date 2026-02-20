import React, {useCallback, useRef, useState} from 'react';
import {useVirtualizer} from '@tanstack/react-virtual';
import {alpha, Chip, Menu, MenuItem, Typography,} from '@mui/material';
import {ArrowDown, ArrowUp, ChevronDown, ChevronRight, File, Folder, FolderOpen} from 'lucide-react';
import {useTranslation} from 'react-i18next';
import type {FileNode} from '../types';
import {useTabStore} from '../store/tabStore';
import {DEFAULT_GROUP_CONFIG, DEFAULT_SORT_CONFIG} from '../constants';
import {formatBytes, formatPercentage} from '../utils/format';
import {invoke} from '@tauri-apps/api/core';
import {groupFileNodes, sortGroupedNodes} from '../utils/groupingUtils';
import {buildBreadcrumbs, updateCurrentTabData} from '../utils/tabNavigation';
import {PathBreadcrumb} from './ui/PathBreadcrumb';
import {filterFileTree, findNodeByPath, hasDiskSearchFilter} from '../utils/diskSearch';
import {useDiskSearchCriteria} from '../hooks/useDiskSearchCriteria';

// 格式化时间戳为相对日期字符串
function formatDate(timestamp: number, t: (key: string, options?: any) => string): string {
    if (!timestamp || timestamp === 0 || isNaN(timestamp)) return t('fileList.unknown');
    const date = new Date(timestamp * 1000);
    if (isNaN(date.getTime())) return t('fileList.unknown');

    const now = new Date();
    const diffMs = now.getTime() - date.getTime();
    const diffDays = Math.floor(diffMs / (1000 * 60 * 60 * 24));

    if (diffDays === 0) return t('fileList.today');
    if (diffDays === 1) return t('fileList.yesterday');
    if (diffDays < 7) return t('fileList.daysAgo', {days: diffDays});
    if (diffDays < 30) return t('fileList.weeksAgo', {weeks: Math.floor(diffDays / 7)});
    if (diffDays < 365) return t('fileList.monthsAgo', {months: Math.floor(diffDays / 30)});
    return t('fileList.yearsAgo', {years: Math.floor(diffDays / 365)});
}

interface TreeItemProps {
    node: FileNode;
    level: number;
    parentSize: number;
    onNavigate: (node: FileNode) => void;
    maxInitialChildren?: number;
    isExpanded?: boolean;
    onToggleExpand?: (path: string) => void;
}

const TreeItem = React.memo(({
                                 node,
                                 level,
                                 parentSize,
                                 onNavigate,
                                 maxInitialChildren = 100,
                                 isExpanded,
                                 onToggleExpand
                             }: TreeItemProps) => {
    const {t} = useTranslation();
    const tGrouping = useCallback((key: string) => t(key), [t]);
    const [localExpanded, setLocalExpanded] = useState(false);
    const expanded = isExpanded !== undefined ? isExpanded : localExpanded;
    const [displayCount, setDisplayCount] = useState(maxInitialChildren);
    const {getActiveTab, updateCurrentTab} = useTabStore();
    const activeTab = getActiveTab();
    const sortField = activeTab?.data?.sortField || DEFAULT_SORT_CONFIG.field;
    const sortOrder = activeTab?.data?.sortOrder || DEFAULT_SORT_CONFIG.order;
    const groupBy = activeTab?.data?.groupBy || DEFAULT_GROUP_CONFIG.groupBy;
    const flatGrouping = activeTab?.data?.flatGrouping || DEFAULT_GROUP_CONFIG.flatGrouping;
    const hasChildren = node.is_dir && node.children && node.children.length > 0;
    const [contextMenu, setContextMenu] = useState<{ mouseX: number; mouseY: number } | null>(null);

    // 根据存储设置分组和排序子项
    let sortedChildren = hasChildren ? [...node.children] : [];

    // 应用分组
    sortedChildren = groupFileNodes(sortedChildren, groupBy, node.path, flatGrouping, tGrouping);

    // 应用排序
    sortedChildren = sortGroupedNodes(sortedChildren, sortField, sortOrder);

    // 限制显示的子项数量
    const displayedChildren = sortedChildren.slice(0, displayCount);
    const hasMore = sortedChildren.length > displayCount;

    const handleClick = () => {
        if (node.is_dir) {
            if (hasChildren) {
                if (onToggleExpand) {
                    onToggleExpand(node.path);
                } else {
                    setLocalExpanded(v => !v);
                }
            } else {
                onNavigate(node);
            }
        }
    };

    const handleNavigate = (e: React.MouseEvent) => {
        e.stopPropagation();
        if (node.is_dir) {
            onNavigate(node);
        }
    };

    const handleContextMenu = (e: React.MouseEvent) => {
        e.preventDefault();
        e.stopPropagation();
        setContextMenu({mouseX: e.clientX, mouseY: e.clientY});
    };

    const handleCloseContextMenu = () => {
        setContextMenu(null);
    };

    const handleOpenInExplorer = async () => {
        try {
            await invoke('open_in_explorer', {path: node.path});
        } catch (error) {
            updateCurrentTab({
                data: {
                    ...activeTab?.data,
                    error: `${t('common.cannotOpenExplorer')}: ${error}`,
                },
            });
        }
        handleCloseContextMenu();
    };

    const rowBg = (idx: number) => idx % 2 === 0 ? alpha('#ffffff', 0.02) : 'transparent';

    return (
        <>
            {/* 行 */}
            <div
                onClick={handleClick}
                onDoubleClick={handleNavigate}
                onContextMenu={handleContextMenu}
                className="flex items-center px-3 py-1.5 text-sm cursor-pointer transition-colors group"
                style={{
                    paddingLeft: `${12 + level * 16}px`,
                    borderBottom: `1px solid ${alpha('#ffffff', 0.04)}`,
                    background: rowBg(level),
                }}
                onMouseEnter={e => {
                    (e.currentTarget as HTMLDivElement).style.background = alpha('#ffffff', 0.06);
                }}
                onMouseLeave={e => {
                    (e.currentTarget as HTMLDivElement).style.background = rowBg(level);
                }}
            >
                {/* 展开/折叠图标 */}
                <span className="shrink-0 w-5 flex items-center justify-center mr-1"
                      style={{color: alpha('#ffffff', 0.4)}}>
          {node.is_dir ? (
              hasChildren ? (
                  expanded
                      ? <ChevronDown size={16}/>
                      : <ChevronRight size={16}/>
              ) : (
                  <Folder size={14} style={{color: '#60a5fa'}}/>
              )
          ) : (
              <File size={14} style={{color: alpha('#ffffff', 0.3)}}/>
          )}
        </span>

                {/* 名称 */}
                <span className="flex-1 truncate font-medium"
                      style={{color: node.is_dir ? 'white' : alpha('#ffffff', 0.8)}}>
          {node.name}
        </span>

                {/* 大小 */}
                <span className="shrink-0 text-xs text-right w-20" style={{color: alpha('#ffffff', 0.6)}}>
          {formatBytes(node.size)}
        </span>

                {/* 占比 */}
                <span className="shrink-0 text-xs text-right w-14" style={{color: alpha('#ffffff', 0.4)}}>
          {node.is_dir ? formatPercentage(node.size, parentSize) : ''}
        </span>

                {/* 文件数 */}
                <span className="shrink-0 text-xs text-right w-20" style={{color: alpha('#ffffff', 0.4)}}>
          {node.is_dir ? `${(node.file_count || 0).toLocaleString()} ${t('fileList.files')}` : ''}
        </span>

                {/* 修改时间 */}
                <span className="shrink-0 text-xs text-right w-24" style={{color: alpha('#ffffff', 0.35)}}>
          {formatDate(node.modified_time, t)}
        </span>
            </div>

            {/* 展开的子项 */}
            {hasChildren && expanded && (
                <>
                    {displayedChildren.map((child) => (
                        <TreeItem
                            key={child.path}
                            node={child}
                            level={level + 1}
                            parentSize={node.size}
                            onNavigate={onNavigate}
                            maxInitialChildren={maxInitialChildren}
                        />
                    ))}
                    {hasMore && (
                        <div className="flex justify-center py-2" style={{paddingLeft: `${12 + (level + 1) * 16}px`}}>
                            <button
                                onClick={(e) => {
                                    e.stopPropagation();
                                    setDisplayCount(prev => Math.min(prev + 100, sortedChildren.length));
                                }}
                                className="text-xs px-3 py-1 rounded-lg border transition-all"
                                style={{
                                    color: alpha('#ffffff', 0.5),
                                    borderColor: alpha('#ffffff', 0.12),
                                    background: alpha('#ffffff', 0.04)
                                }}
                            >
                                {t('fileList.showMore', {count: sortedChildren.length - displayCount})}
                            </button>
                        </div>
                    )}
                </>
            )}

            {/* 右键菜单 */}
            <Menu
                open={contextMenu !== null}
                onClose={handleCloseContextMenu}
                anchorPosition={contextMenu ? {top: contextMenu.mouseY, left: contextMenu.mouseX} : undefined}
                anchorReference="anchorPosition"
                slotProps={{
                    paper: {
                        sx: {
                            bgcolor: alpha('#1c1c1e', 0.98),
                            border: `1px solid ${alpha('#ffffff', 0.1)}`,
                            borderRadius: 2
                        }
                    }
                }}
            >
                <MenuItem onClick={handleOpenInExplorer} sx={{
                    color: alpha('#ffffff', 0.8),
                    fontSize: 13,
                    gap: 1,
                    '&:hover': {bgcolor: alpha('#ffffff', 0.08)}
                }}>
                    <FolderOpen size={16}/>
                    {t('fileList.openInExplorer')}
                </MenuItem>
            </Menu>
        </>
    );
});

export const FileList: React.FC = () => {
    const {t} = useTranslation();
    const tGrouping = useCallback((key: string) => t(key), [t]);
    const activeTabId = useTabStore((state) => state.activeTabId);
    const tabs = useTabStore((state) => state.tabs);
    const activeTab = React.useMemo(() => tabs.find((tab) => tab.id === activeTabId) || null, [tabs, activeTabId]);

    const currentNode = activeTab?.data?.currentNode || null;
    const scanResult = activeTab?.data?.scanResult || null;
    const sortField = activeTab?.data?.sortField || DEFAULT_SORT_CONFIG.field;
    const sortOrder = activeTab?.data?.sortOrder || DEFAULT_SORT_CONFIG.order;
    const groupBy = activeTab?.data?.groupBy || DEFAULT_GROUP_CONFIG.groupBy;
    const flatGrouping = activeTab?.data?.flatGrouping || DEFAULT_GROUP_CONFIG.flatGrouping;
    const diskSearchCriteria = useDiskSearchCriteria();

    // 防止虚拟滚动时展开状态丢失
    const [expandedPaths, setExpandedPaths] = useState<Set<string>>(new Set());
    const handleToggleExpand = useCallback((path: string) => {
        setExpandedPaths(prev => {
            const next = new Set(prev);
            if (next.has(path)) next.delete(path); else next.add(path);
            return next;
        });
    }, []);
    const scrollRef = useRef<HTMLDivElement>(null);

    const setSortField = (field: any) => {
        updateCurrentTabData({sortField: field});
    };

    const setSortOrder = (order: any) => {
        updateCurrentTabData({sortOrder: order});
    };

    const filteredScanResult = React.useMemo(() => {
        if (!scanResult) return null;
        if (!hasDiskSearchFilter(diskSearchCriteria)) return scanResult;
        return filterFileTree(scanResult, diskSearchCriteria);
    }, [scanResult, diskSearchCriteria]);

    const displayNode = React.useMemo(() => {
        if (!filteredScanResult) return null;
        if (!currentNode?.path) return filteredScanResult;
        return findNodeByPath(filteredScanResult, currentNode.path) || filteredScanResult;
    }, [currentNode?.path, filteredScanResult]);

    const displayBreadcrumbs = React.useMemo(
        () => buildBreadcrumbs(filteredScanResult, displayNode?.path || ''),
        [filteredScanResult, displayNode?.path]
    );

    const handleNavigate = (node: FileNode) => {
        updateCurrentTabData({
            currentNode: node,
            breadcrumbs: buildBreadcrumbs(filteredScanResult, node.path),
        });
    };

    const handleBreadcrumbClick = (index: number) => {
        if (index === -1) {
            updateCurrentTabData({currentNode: filteredScanResult, breadcrumbs: []});
        } else {
            const newBreadcrumbs = displayBreadcrumbs.slice(0, index + 1);
            updateCurrentTabData({currentNode: newBreadcrumbs[index], breadcrumbs: newBreadcrumbs});
        }
    };

    // 应用分组和排序到顶级子项
    const sortedChildren = React.useMemo(() => {
        if (!displayNode?.children) return [];
        let arr = [...displayNode.children];
        arr = groupFileNodes(arr, groupBy, displayNode.path, flatGrouping, tGrouping);
        return sortGroupedNodes(arr, sortField, sortOrder);
    }, [displayNode, groupBy, flatGrouping, sortField, sortOrder, tGrouping]);

    const rowVirtualizer = useVirtualizer({
        count: sortedChildren.length,
        getScrollElement: () => scrollRef.current,
        estimateSize: () => 36,
        overscan: 8,
        measureElement: (el) => el?.getBoundingClientRect().height ?? 36,
    });

    if (!displayNode) {
        return (
            <div className="flex items-center justify-center h-full">
                <Typography sx={{color: alpha('#ffffff', 0.3)}}>{t('fileList.noData')}</Typography>
            </div>
        );
    }

    // 排序字段按钮列表
    const sortFields = [
        {value: 'size', label: t('sortOptions.size')},
        {value: 'name', label: t('sortOptions.name')},
        {value: 'modified', label: t('sortOptions.modified')},
        {value: 'fileCount', label: t('sortOptions.fileCount')},
    ];

    return (
        <div className="w-full h-full flex flex-col overflow-hidden">
            {/* 顶部工具栏 */}
            <div className="shrink-0 flex items-center gap-2 px-4 py-2 flex-wrap"
                 style={{borderBottom: `1px solid ${alpha('#ffffff', 0.07)}`, background: alpha('#ffffff', 0.03)}}>

                {/* 面包屑 */}
                <div className="flex-1 min-w-0">
                    <PathBreadcrumb
                        crumbs={displayBreadcrumbs.map(n => ({label: n.name, path: n.path}))}
                        onNavigate={(path) => {
                            if (!path) {
                                handleBreadcrumbClick(-1);
                            } else {
                                const idx = displayBreadcrumbs.findIndex(n => n.path === path);
                                if (idx !== -1) handleBreadcrumbClick(idx);
                            }
                        }}
                        currentPath={displayNode?.path || ''}
                        className="flex items-center gap-1 shrink-0 flex-wrap"
                    />
                </div>

                {/* 排序按钮组 */}
                <div className="flex items-center gap-1 shrink-0">
                    {sortFields.map(f => (
                        <button key={f.value}
                                onClick={() => {
                                    if (sortField === f.value) setSortOrder(sortOrder === 'asc' ? 'desc' : 'asc');
                                    else {
                                        setSortField(f.value);
                                        setSortOrder('desc');
                                    }
                                }}
                                className="flex items-center gap-0.5 text-xs px-2 py-1 rounded-lg transition-all"
                                style={{
                                    color: sortField === f.value ? 'white' : alpha('#ffffff', 0.4),
                                    background: sortField === f.value ? alpha('#8b5cf6', 0.2) : 'transparent',
                                    border: `1px solid ${sortField === f.value ? alpha('#8b5cf6', 0.4) : 'transparent'}`,
                                }}
                        >
                            {f.label}
                            {sortField === f.value && (
                                sortOrder === 'desc'
                                    ? <ArrowDown size={11}/>
                                    : <ArrowUp size={11}/>
                            )}
                        </button>
                    ))}
                </div>

                {/* 统计 Chips */}
                <div className="flex items-center gap-1.5 shrink-0">
                    <Chip label={formatBytes(displayNode.size || 0)} size="small"
                          sx={{
                              height: 20,
                              fontSize: 11,
                              bgcolor: alpha('#ffffff', 0.08),
                              color: alpha('#ffffff', 0.7),
                              border: `1px solid ${alpha('#ffffff', 0.12)}`
                          }}/>
                    <Chip label={`${(displayNode.file_count || 0).toLocaleString()} ${t('fileList.files')}`}
                          size="small"
                          sx={{
                              height: 20,
                              fontSize: 11,
                              bgcolor: alpha('#ffffff', 0.08),
                              color: alpha('#ffffff', 0.7),
                              border: `1px solid ${alpha('#ffffff', 0.12)}`
                          }}/>
                    <Chip label={`${(displayNode.dir_count || 0).toLocaleString()} ${t('fileList.folders')}`}
                          size="small"
                          sx={{
                              height: 20,
                              fontSize: 11,
                              bgcolor: alpha('#ffffff', 0.08),
                              color: alpha('#ffffff', 0.7),
                              border: `1px solid ${alpha('#ffffff', 0.12)}`
                          }}/>
                </div>
            </div>

            {/* 表头 */}
            <div className="shrink-0 flex items-center px-3 py-1.5 text-xs font-semibold"
                 style={{
                     background: alpha('#ffffff', 0.05),
                     borderBottom: `1px solid ${alpha('#ffffff', 0.07)}`,
                     color: alpha('#ffffff', 0.4)
                 }}>
                <span className="flex-1">{t('fileList.name')}</span>
                <span className="w-20 text-right">{t('fileList.size')}</span>
                <span className="w-16 text-right ml-2">{t('fileList.percentage')}</span>
                <span className="w-20 text-right">{t('fileList.fileCount')}</span>
                <span className="w-24 text-right">{t('fileList.modifiedTime')}</span>
            </div>

            {/* 列表内容 */}
            <div ref={scrollRef} className="flex-1 overflow-y-auto custom-scrollbar">
                <div style={{height: rowVirtualizer.getTotalSize(), position: 'relative'}}>
                    {rowVirtualizer.getVirtualItems().map((virtualRow) => {
                        const child = sortedChildren[virtualRow.index];
                        return (
                            <div
                                key={virtualRow.key}
                                data-index={virtualRow.index}
                                ref={rowVirtualizer.measureElement}
                                style={{
                                    position: 'absolute',
                                    top: 0, left: 0, width: '100%',
                                    transform: `translateY(${virtualRow.start}px)`,
                                }}
                            >
                                <TreeItem
                                    node={child}
                                    level={0}
                                    parentSize={displayNode.size}
                                    onNavigate={handleNavigate}
                                    isExpanded={expandedPaths.has(child.path)}
                                    onToggleExpand={handleToggleExpand}
                                />
                            </div>
                        );
                    })}
                </div>
            </div>
        </div>
    );
};
