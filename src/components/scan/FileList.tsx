import React, {useCallback, useMemo, useRef, useState} from 'react';
import {useVirtualizer} from '@tanstack/react-virtual';
import {Chip, Menu, MenuItem} from '@mui/material';
import {ArrowDown, ArrowUp, File, Folder, FolderOpen} from 'lucide-react';
import {useTranslation} from 'react-i18next';
import type {FileNode} from '../../types';
import {useTabStore} from '../../store/tabStore';
import {DEFAULT_GROUP_CONFIG, DEFAULT_SORT_CONFIG} from '../../constants';
import {formatBytes, formatPercentage} from '../../utils/format';
import {invoke} from '@tauri-apps/api/core';
import {groupFileNodes, sortGroupedNodes} from '../../utils/groupingUtils';
import {buildBreadcrumbs, updateCurrentTabData} from '../../utils/tabNavigation';
import {PathBreadcrumb} from '../ui/PathBreadcrumb';
import {filterFileTree, findNodeByPath, hasDiskSearchFilter} from '../../utils/diskSearch';
import {useDiskSearchCriteria} from '../../hooks/useDiskSearchCriteria';

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

export const FileList: React.FC = () => {
    const {t} = useTranslation();
    const tGrouping = useCallback((key: string) => t(key), [t]);
    const activeTabId = useTabStore((state) => state.activeTabId);
    const tabs = useTabStore((state) => state.tabs);
    const activeTab = useMemo(() => tabs.find((tab) => tab.id === activeTabId) || null, [tabs, activeTabId]);

    const currentNode = activeTab?.data?.currentNode || null;
    const scanResult = activeTab?.data?.scanResult || null;
    const sortField = activeTab?.data?.sortField || DEFAULT_SORT_CONFIG.field;
    const sortOrder = activeTab?.data?.sortOrder || DEFAULT_SORT_CONFIG.order;
    const groupBy = activeTab?.data?.groupBy || DEFAULT_GROUP_CONFIG.groupBy;
    const flatGrouping = activeTab?.data?.flatGrouping || DEFAULT_GROUP_CONFIG.flatGrouping;
    const diskSearchCriteria = useDiskSearchCriteria();

    const scrollRef = useRef<HTMLDivElement>(null);
    const [contextMenu, setContextMenu] = useState<{ mouseX: number; mouseY: number; node: FileNode } | null>(null);

    const setSortField = (field: any) => {
        updateCurrentTabData({sortField: field});
    };

    const setSortOrder = (order: any) => {
        updateCurrentTabData({sortOrder: order});
    };

    const filteredScanResult = useMemo(() => {
        if (!scanResult) return null;
        if (!hasDiskSearchFilter(diskSearchCriteria)) return scanResult;
        return filterFileTree(scanResult, diskSearchCriteria);
    }, [scanResult, diskSearchCriteria]);

    const displayNode = useMemo(() => {
        if (!filteredScanResult) return null;
        if (!currentNode?.path) return filteredScanResult;
        if (currentNode.path.startsWith('__group__:')) return currentNode;
        return findNodeByPath(filteredScanResult, currentNode.path) || filteredScanResult;
    }, [currentNode?.path, filteredScanResult]);

    const displayBreadcrumbs = useMemo(
        () => buildBreadcrumbs(filteredScanResult, displayNode?.path || ''),
        [filteredScanResult, displayNode?.path]
    );

    const handleNavigate = useCallback((node: FileNode, parentPath?: string) => {
        const fullPath = node.path || (parentPath ? `${parentPath}\\${node.name}` : node.name);
        const resolvedNode = {...node, path: fullPath};
        updateCurrentTabData({
            currentNode: resolvedNode,
            breadcrumbs: buildBreadcrumbs(filteredScanResult, fullPath),
        });
    }, [filteredScanResult]);

    const handleBreadcrumbClick = (index: number) => {
        if (index === -1) {
            updateCurrentTabData({currentNode: filteredScanResult, breadcrumbs: []});
        } else {
            const newBreadcrumbs = displayBreadcrumbs.slice(0, index + 1);
            updateCurrentTabData({currentNode: newBreadcrumbs[index], breadcrumbs: newBreadcrumbs});
        }
    };

    // 应用分组和排序到顶级子项
    const sortedChildren = useMemo(() => {
        if (!displayNode?.children) return [];
        let arr = [...displayNode.children];
        // Ensure path exists for grouping correctly
        arr = arr.map(child => ({
            ...child,
            path: child.path || (displayNode.path ? `${displayNode.path}\\${child.name}` : child.name)
        }));
        arr = groupFileNodes(arr, groupBy, displayNode.path, flatGrouping, tGrouping);
        return sortGroupedNodes(arr, sortField, sortOrder);
    }, [displayNode, groupBy, flatGrouping, sortField, sortOrder, tGrouping]);

    const rowVirtualizer = useVirtualizer({
        count: sortedChildren.length,
        getScrollElement: () => scrollRef.current,
        estimateSize: () => 36,
        overscan: 8,
    });

    const handleCloseContextMenu = () => {
        setContextMenu(null);
    };

    const handleOpenInExplorer = async () => {
        if (!contextMenu) return;
        const targetPath = contextMenu.node.path || (displayNode?.path ? `${displayNode.path}\\${contextMenu.node.name}` : contextMenu.node.name);
        try {
            await invoke('open_in_explorer', {path: targetPath});
        } catch (error) {
            updateCurrentTabData({
                error: `${t('common.cannotOpenExplorer')}: ${error}`,
            });
        }
        handleCloseContextMenu();
    };

    if (!displayNode) {
        return (
            <div className="flex items-center justify-center h-full">
                <span className="text-sm text-white/30">{t('fileList.noData')}</span>
            </div>
        );
    }

    const sortFields = [
        {value: 'size', label: t('sortOptions.size')},
        {value: 'name', label: t('sortOptions.name')},
        {value: 'modified', label: t('sortOptions.modified')},
        {value: 'fileCount', label: t('sortOptions.fileCount')},
    ];

    return (
        <div className="w-full h-full flex flex-col overflow-hidden">
            {/* 顶部工具栏 */}
            <div className="shrink-0 flex items-center gap-2 px-4 py-2 flex-wrap border-b border-white/7 bg-white/3">
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
                                    color: sortField === f.value ? 'white' : 'rgba(255,255,255,0.4)',
                                    background: sortField === f.value ? 'rgba(139,92,246,0.2)' : 'transparent',
                                    border: `1px solid ${sortField === f.value ? 'rgba(139,92,246,0.4)' : 'transparent'}`,
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
                              bgcolor: 'rgba(255,255,255,0.08)',
                              color: 'rgba(255,255,255,0.7)',
                              border: '1px solid rgba(255,255,255,0.12)'
                          }}/>
                    <Chip label={`${(displayNode.file_count || 0).toLocaleString()} ${t('fileList.files')}`}
                          size="small"
                          sx={{
                              bgcolor: 'rgba(255,255,255,0.08)',
                              color: 'rgba(255,255,255,0.7)',
                              border: '1px solid rgba(255,255,255,0.12)'
                          }}/>
                    <Chip label={`${(displayNode.dir_count || 0).toLocaleString()} ${t('fileList.folders')}`}
                          size="small"
                          sx={{
                              bgcolor: 'rgba(255,255,255,0.08)',
                              color: 'rgba(255,255,255,0.7)',
                              border: '1px solid rgba(255,255,255,0.12)'
                          }}/>
                </div>
            </div>

            {/* 表头 */}
            <div
                className="shrink-0 flex items-center px-4 py-2 text-xs font-semibold bg-white/5 border-b border-white/7 text-white/40">
                <span className="flex-1 min-w-0">{t('fileList.name')}</span>
                <span className="w-24 text-right shrink-0">{t('fileList.size')}</span>
                <span className="w-16 text-right ml-2 shrink-0">{t('fileList.percentage')}</span>
                <span className="w-24 text-right shrink-0">{t('fileList.fileCount')}</span>
                <span className="w-28 text-right shrink-0">{t('fileList.modifiedTime')}</span>
            </div>

            {/* 列表内容 */}
            <div ref={scrollRef} className="flex-1 overflow-y-auto custom-scrollbar">
                {sortedChildren.length === 0 ? (
                    <div className="flex items-center justify-center h-32">
                        <span className="text-sm text-white/30">{t('fileList.noData')}</span>
                    </div>
                ) : (
                    <div style={{height: rowVirtualizer.getTotalSize(), position: 'relative'}}>
                        {rowVirtualizer.getVirtualItems().map((virtualRow) => {
                            const child = sortedChildren[virtualRow.index];
                            const idx = virtualRow.index;
                            const evenBg = idx % 2 === 0 ? 'rgba(255,255,255,0.02)' : 'transparent';

                            return (
                                <div
                                    key={virtualRow.key}
                                    style={{
                                        position: 'absolute',
                                        top: 0, left: 0, width: '100%',
                                        transform: `translateY(${virtualRow.start}px)`,
                                        height: virtualRow.size,
                                    }}
                                >
                                    <div
                                        onClick={() => child.is_dir && handleNavigate(child, displayNode.path)}
                                        onContextMenu={(e) => {
                                            e.preventDefault();
                                            e.stopPropagation();
                                            if (!child.path?.startsWith('__group__:')) {
                                                setContextMenu({mouseX: e.clientX, mouseY: e.clientY, node: child});
                                            }
                                        }}
                                        className="flex items-center px-4 py-1.5 text-sm transition-colors group h-full"
                                        style={{
                                            background: evenBg,
                                            borderBottom: '1px solid rgba(255,255,255,0.04)',
                                            cursor: child.is_dir ? 'pointer' : 'default',
                                        }}
                                        onMouseEnter={e => {
                                            (e.currentTarget as HTMLDivElement).style.background = 'rgba(255,255,255,0.06)';
                                        }}
                                        onMouseLeave={e => {
                                            (e.currentTarget as HTMLDivElement).style.background = evenBg;
                                        }}
                                    >
                                        {/* 名称 */}
                                        <div className="flex-1 flex items-center gap-2 min-w-0 pr-2">
                                            <span
                                                className="shrink-0 flex items-center justify-center w-4 text-white/40">
                                                {child.is_dir ? (
                                                    <Folder size={14} style={{color: '#60a5fa'}}/>
                                                ) : (
                                                    <File size={14} className="text-white/30"/>
                                                )}
                                            </span>
                                            <span
                                                className={`truncate font-medium ${child.is_dir ? 'text-white' : 'text-white/80'}`}
                                                title={child.name}>
                                                {child.name}
                                            </span>
                                        </div>

                                        {/* 大小 */}
                                        <span className="shrink-0 w-24 text-right text-xs text-white/60">
                                            {formatBytes(child.size)}
                                        </span>

                                        {/* 占比 */}
                                        <span className="shrink-0 w-16 text-right text-xs text-white/40 ml-2">
                                            {child.is_dir ? formatPercentage(child.size, displayNode.size) : ''}
                                        </span>

                                        {/* 文件数 */}
                                        <span className="shrink-0 w-24 text-right text-xs text-white/40">
                                            {child.is_dir ? `${(child.file_count || 0).toLocaleString()} ${t('fileList.files')}` : ''}
                                        </span>

                                        {/* 修改时间 */}
                                        <span className="shrink-0 w-28 text-right text-xs text-white/35">
                                            {formatDate(child.modified_time, t)}
                                        </span>
                                    </div>
                                </div>
                            );
                        })}
                    </div>
                )}
            </div>

            {/* 右键菜单 */}
            <Menu
                open={contextMenu !== null}
                onClose={handleCloseContextMenu}
                anchorPosition={contextMenu ? {top: contextMenu.mouseY, left: contextMenu.mouseX} : undefined}
                anchorReference="anchorPosition"
                slotProps={{paper: {sx: {minWidth: 160}}}}
            >
                <MenuItem onClick={handleOpenInExplorer} sx={{gap: 1}}>
                    <FolderOpen size={16}/>
                    {t('fileList.openInExplorer')}
                </MenuItem>
            </Menu>
        </div>
    );
};
