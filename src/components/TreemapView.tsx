import React, {useCallback, useEffect, useMemo, useRef, useState} from 'react';
import {Chip, Menu, MenuItem} from '@mui/material';
import {useTranslation} from 'react-i18next';
import type {FileNode} from '../types';
import {useTabStore} from '../store/tabStore';
import {DEFAULT_GROUP_CONFIG, DEFAULT_SORT_CONFIG} from '../constants';
import {useSnapshotStore} from '../store/snapshotStore';
import {formatBytes} from '../utils/format';
import {FolderOpen} from 'lucide-react';
import {invoke} from '@tauri-apps/api/core';
import {getGroupDisplayName, groupFileNodes, parseVirtualGroupPath, sortGroupedNodes} from '../utils/groupingUtils';
import {buildBreadcrumbs, updateCurrentTabData} from '../utils/tabNavigation';
import {PathBreadcrumb} from './ui/PathBreadcrumb';
import {filterFileTree, findNodeByPath, hasDiskSearchFilter} from '../utils/diskSearch';
import {useDiskSearchCriteria} from '../hooks/useDiskSearchCriteria';
import {ellipsizeText, type FileNodeRect, layoutFileNodeRects} from '../utils/treemapUtils';

type TreemapRect = FileNodeRect;

export const TreemapView: React.FC = () => {
    const {t} = useTranslation();
    const activeTabId = useTabStore((state) => state.activeTabId);
    const tabs = useTabStore((state) => state.tabs);
    const activeTab = useMemo(() => tabs.find((tab) => tab.id === activeTabId) || null, [tabs, activeTabId]);
    const {showFilesOnly} = useSnapshotStore();

    // 从 tab data 中读取状态
    const currentNode = activeTab?.data?.currentNode || null;
    const scanResult = activeTab?.data?.scanResult || null;
    const groupBy = activeTab?.data?.groupBy || DEFAULT_GROUP_CONFIG.groupBy;
    const sortField = activeTab?.data?.sortField || DEFAULT_SORT_CONFIG.field;
    const sortOrder = activeTab?.data?.sortOrder || DEFAULT_SORT_CONFIG.order;
    const flatGrouping = activeTab?.data?.flatGrouping || DEFAULT_GROUP_CONFIG.flatGrouping;
    const diskSearchCriteria = useDiskSearchCriteria();

    const tGrouping = useCallback((key: string) => t(key), [t]);

    const [hoveredRect, setHoveredRect] = useState<TreemapRect | null>(null);
    const [contextMenu, setContextMenu] = useState<{ mouseX: number; mouseY: number; node: FileNode } | null>(null);
    const containerRef = useRef<HTMLDivElement>(null);
    const tooltipRef = useRef<HTMLDivElement>(null);
    const tooltipPosRef = useRef({x: 0, y: 0});
    const tooltipRafRef = useRef<number | null>(null);

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
    }, [currentNode, filteredScanResult]);

    const isVirtualDisplay = displayNode?.path?.startsWith('__group__:') ?? false;

    const displayBreadcrumbs = useMemo(() => {
        if (!displayNode?.path) return [];
        if (isVirtualDisplay) {
            const parsed = parseVirtualGroupPath(displayNode.path);
            const label = parsed ? getGroupDisplayName(parsed.groupKey, parsed.groupBy, t) : displayNode.name;
            return [{label, path: displayNode.path}];
        }
        return buildBreadcrumbs(filteredScanResult, displayNode.path);
    }, [filteredScanResult, displayNode?.path, displayNode?.name, isVirtualDisplay, t]);

    const driveLabel = useMemo(() => {
        const rootPath = scanResult?.path || '';
        const match = rootPath.match(/^([A-Za-z]):/);
        if (match?.[1]) return match[1].toUpperCase();
        return t('treemapView.root');
    }, [filteredScanResult?.path, scanResult?.path, t]);

    const [containerSize, setContainerSize] = useState({width: 0, height: 0});

    useEffect(() => {
        const container = containerRef.current;
        if (!container) return;
        const update = () => {
            const r = container.getBoundingClientRect();
            setContainerSize({width: r.width, height: r.height});
        };
        update();
        const observer = new ResizeObserver(update);
        observer.observe(container);
        return () => observer.disconnect();
    }, []);

    // 仅当依赖项改变时重新计算
    const treemapRects = useMemo(() => {
        if (!displayNode) return [];
        if (!Number.isFinite(containerSize.width) || !Number.isFinite(containerSize.height)) return [];
        if (containerSize.width <= 0 || containerSize.height <= 0) return [];

        if (displayNode.children && displayNode.children.length > 0) {
            // 应用 files only 过滤
            let childrenToDisplay = showFilesOnly
                ? displayNode.children.filter((child: FileNode) => !child.is_dir)
                : displayNode.children;

            // 应用分组（传递当前节点的路径，避免在分组内再次分组）
            const parentPath = displayNode.path || displayNode.name;
            childrenToDisplay = groupFileNodes(childrenToDisplay, groupBy, parentPath, flatGrouping, tGrouping);

            // 应用排序
            childrenToDisplay = sortGroupedNodes(childrenToDisplay, sortField, sortOrder);

            return layoutFileNodeRects(childrenToDisplay, containerSize.width, containerSize.height, parentPath);
        }

        return [];
    }, [displayNode, containerSize, groupBy, sortField, sortOrder, flatGrouping, tGrouping, showFilesOnly]);

    const handleRectClick = (rect: TreemapRect) => {
        if (!rect.node.is_dir) return;

        if (rect.node.path.startsWith('__group__:')) {
            updateCurrentTabData({currentNode: rect.node, breadcrumbs: []});
            return;
        }

        const crumbs = buildBreadcrumbs(filteredScanResult, rect.node.path);
        updateCurrentTabData({
            currentNode: rect.node,
            breadcrumbs: crumbs,
        });
    };

    const handleBreadcrumbClick = (index: number) => {
        if (index === -1) {
            updateCurrentTabData({currentNode: filteredScanResult, breadcrumbs: []});
            return;
        }
        if (isVirtualDisplay) {
            updateCurrentTabData({currentNode: filteredScanResult, breadcrumbs: []});
            return;
        }
        const realCrumbs = displayBreadcrumbs as ReturnType<typeof buildBreadcrumbs>;
        const newBreadcrumbs = realCrumbs.slice(0, index + 1);
        updateCurrentTabData({currentNode: newBreadcrumbs[index], breadcrumbs: newBreadcrumbs});
    };

    const updateTooltipPosition = useCallback((e: React.MouseEvent<SVGRectElement>) => {
        tooltipPosRef.current = {
            x: e.clientX,
            y: e.clientY,
        };

        if (tooltipRafRef.current !== null) return;
        tooltipRafRef.current = requestAnimationFrame(() => {
            tooltipRafRef.current = null;
            const el = tooltipRef.current;
            if (!el) return;
            const {x, y} = tooltipPosRef.current;
            el.style.transform = `translate(${x + 15}px, ${y + 15}px)`;
        });
    }, []);

    useEffect(() => {
        return () => {
            if (tooltipRafRef.current !== null) {
                cancelAnimationFrame(tooltipRafRef.current);
            }
        };
    }, []);

    const handleMouseLeave = useCallback(() => {
        setHoveredRect(null);
    }, []);

    const handleRectContextMenu = (e: React.MouseEvent<SVGRectElement>, rect: TreemapRect) => {
        e.preventDefault();
        e.stopPropagation();
        if (rect.node.path.startsWith('__group__:')) return;
        setContextMenu({mouseX: e.clientX, mouseY: e.clientY, node: rect.node});
    };

    const handleCloseContextMenu = () => {
        setContextMenu(null);
    };

    const handleOpenInExplorer = async () => {
        if (!contextMenu) return;
        try {
            await invoke('open_in_explorer', {path: contextMenu.node.path});
        } catch (error) {
            updateCurrentTabData({
                error: `${t('common.cannotOpenExplorer')}: ${error}`,
            });
        }
        handleCloseContextMenu();
    };

    if (!displayNode) {
        return (
            <div
                className="h-full flex items-center justify-center bg-white/15 backdrop-blur-sm border border-white/20 rounded-lg">
                <span className="text-lg text-white/70">{t('treemapView.noData')}</span>
            </div>
        );
    }

    return (
        <div className="w-full h-full flex flex-col rounded-xl p-2 relative">
            {/* 面包屑导航 */}
            <div className="flex items-center justify-between gap-1 flex-wrap mb-1">
                <div className="flex-1 min-w-0">
                    <PathBreadcrumb
                        crumbs={isVirtualDisplay
                            ? (displayBreadcrumbs as { label: string; path: string }[])
                            : (displayBreadcrumbs as ReturnType<typeof buildBreadcrumbs>).map(n => ({
                                label: n.name,
                                path: n.path
                            }))
                        }
                        onNavigate={(path) => {
                            if (!path) {
                                handleBreadcrumbClick(-1);
                            } else if (!isVirtualDisplay) {
                                const idx = (displayBreadcrumbs as ReturnType<typeof buildBreadcrumbs>).findIndex(n => n.path === path);
                                if (idx !== -1) handleBreadcrumbClick(idx);
                            }
                        }}
                        currentPath={displayNode?.path && !displayNode.path.startsWith('__group__:') ? displayNode.path : undefined}
                        rootLabel={driveLabel}
                    />
                </div>

                {displayNode && (
                    <Chip
                        label={`${formatBytes(displayNode.size || 0)} | ${(displayNode.file_count || 0).toLocaleString()} ${t('treemapView.files')}`}
                        size="small"
                        sx={{
                            bgcolor: 'rgba(255,255,255,0.2)',
                            color: 'white',
                            border: '1px solid rgba(255,255,255,0.3)'
                        }}
                    />
                )}
            </div>

            {/* 树状图可视化 */}
            <div
                ref={containerRef}
                className="flex-1 w-full min-h-0 relative bg-white/10 border border-white/20 rounded overflow-hidden"
            >
                <svg
                    width="100%"
                    height="100%"
                    viewBox={`0 0 ${containerSize.width} ${containerSize.height}`}
                    preserveAspectRatio="none"
                    style={{display: 'block'}}
                >
                    {treemapRects.map((rect) => {
                        if (![rect.x, rect.y, rect.width, rect.height].every((v) => Number.isFinite(v)) || rect.width <= 0 || rect.height <= 0) {
                            return null;
                        }
                        const isHovered = hoveredRect?.node.path === rect.node.path;
                        const showSize = rect.width > 80 && rect.height > 50;

                        // 根据矩形大小计算字体大小
                        const fontSize = Math.max(10, Math.min(14, Math.min(rect.width / 12, rect.height / 4)));

                        // 计算能容纳的最大字符数
                        const maxChars = Math.floor(rect.width / (fontSize * 0.5));
                        const displayName = ellipsizeText(rect.node.name, Math.max(0, maxChars));

                        return (
                            <g key={rect.node.path}>
                                <rect
                                    x={rect.x}
                                    y={rect.y}
                                    width={rect.width}
                                    height={rect.height}
                                    fill={rect.color}
                                    stroke="rgba(255,255,255,0.5)"
                                    strokeWidth={1}
                                    opacity={isHovered ? 1 : 0.85}
                                    style={{
                                        cursor: rect.node.is_dir ? 'pointer' : 'default',
                                        transition: 'opacity 0.2s',
                                    }}
                                    onClick={() => handleRectClick(rect)}
                                    onMouseEnter={(e) => {
                                        setHoveredRect(rect);
                                        updateTooltipPosition(e);
                                    }}
                                    onMouseMove={updateTooltipPosition}
                                    onMouseLeave={handleMouseLeave}
                                    onContextMenu={(e) => handleRectContextMenu(e, rect)}
                                />

                                {/* 如果空间足够总是显示名称 */}
                                {rect.width > 30 && rect.height > 20 && (
                                    <text
                                        x={rect.x + rect.width / 2}
                                        y={rect.y + rect.height / 2 - (showSize ? fontSize / 2 : 0)}
                                        textAnchor="middle"
                                        dominantBaseline="middle"
                                        fill="#fff"
                                        fontSize={fontSize}
                                        fontWeight="600"
                                        style={{
                                            pointerEvents: 'none',
                                            textShadow: '0px 1px 3px rgba(0,0,0,0.8)',
                                            userSelect: 'none'
                                        }}
                                    >
                                        {displayName}
                                    </text>
                                )}

                                {/* 如果空间足够则显示大小 */}
                                {showSize && (
                                    <text
                                        x={rect.x + rect.width / 2}
                                        y={rect.y + rect.height / 2 + fontSize}
                                        textAnchor="middle"
                                        dominantBaseline="middle"
                                        fill="rgba(255,255,255,0.9)"
                                        fontSize={Math.max(9, fontSize - 2)}
                                        style={{
                                            pointerEvents: 'none',
                                            textShadow: '0px 1px 3px rgba(0,0,0,0.8)',
                                            userSelect: 'none'
                                        }}
                                    >
                                        {formatBytes(rect.node.size)}
                                    </text>
                                )}
                            </g>
                        );
                    })}
                </svg>
            </div>

            <span className="mt-2 block text-xs text-white/40">{t('treemapView.clickToView')}</span>

            {/* 自定义提示框 - 移到外部并使用 fixed 定位以避免被裁剪 */}
            {hoveredRect && (
                <div
                    ref={tooltipRef}
                    className="fixed left-0 top-0 bg-zinc-900/95 backdrop-blur-md border border-white/10 text-white p-3 rounded-lg pointer-events-none z-[99999] max-w-[300px] shadow-[0_8px_32px_rgba(0,0,0,0.6)]"
                >
                    <p className="text-sm font-bold mb-1">{ellipsizeText(hoveredRect.node.name, 42)}</p>
                    <span className="text-xs text-white/60 block">
                        {t('fileList.size')}: <span className="text-white">{formatBytes(hoveredRect.node.size)}</span>
                    </span>
                    {hoveredRect.node.is_dir && (
                        <>
                            <span className="text-xs text-white/60 block">
                                {t('treemapView.fileCount', {count: hoveredRect.node.file_count || 0})}
                            </span>
                            <span className="text-xs text-blue-400 font-medium block mt-1">
                                {t('treemapView.clickToDrillDown')}
                            </span>
                        </>
                    )}
                </div>
            )}

            {/* 右键菜单 */}
            <Menu
                open={contextMenu !== null}
                onClose={handleCloseContextMenu}
                anchorPosition={contextMenu ? {top: contextMenu.mouseY, left: contextMenu.mouseX} : undefined}
                anchorReference="anchorPosition"
            >
                <MenuItem onClick={handleOpenInExplorer}>
                    <FolderOpen size={16} style={{marginRight: 8}}/>
                    {t('treemapView.openInExplorer')}
                </MenuItem>
            </Menu>
        </div>
    );
};
