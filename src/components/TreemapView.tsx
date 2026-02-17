import React, { useState, useMemo, useRef, useEffect, useCallback } from 'react';
import { Box, Paper, Typography, Breadcrumbs, Link, Chip, Stack, IconButton, Tooltip, Menu, MenuItem, alpha } from '@mui/material';
import { useTranslation } from 'react-i18next';
import { FileNode } from '../store/scanStore';
import { useTabStore } from '../store/tabStore';
import { formatBytes } from '../utils/format';
import { Folder, InsertDriveFile, NavigateNext, ContentCopy, FolderOutlined } from '@mui/icons-material';
import { invoke } from '@tauri-apps/api/core';
import { groupFileNodes, sortGroupedNodes } from '../utils/grouping';
import { buildBreadcrumbs, updateCurrentTabData } from '../utils/tabNavigation';

interface TreemapRect {
  x: number;
  y: number;
  width: number;
  height: number;
  node: FileNode;
  color: string;
}

// 颜色调色板
const COLORS = [
  '#1976d2', '#2196f3', '#42a5f5', '#64b5f6', '#90caf9',
  '#388e3c', '#4caf50', '#66bb6a', '#81c784', '#a5d6a7',
  '#d32f2f', '#f44336', '#ef5350', '#e57373', '#ef9a9a',
  '#f57c00', '#ff9800', '#ffa726', '#ffb74d', '#ffcc80',
  '#7b1fa2', '#9c27b0', '#ab47bc', '#ba68c8', '#ce93d8',
  '#0097a7', '#00bcd4', '#26c6da', '#4dd0e1', '#80deea',
];

export const TreemapView: React.FC = () => {
  const { t } = useTranslation();
  const activeTabId = useTabStore((state) => state.activeTabId);
  const tabs = useTabStore((state) => state.tabs);
  const activeTab = useMemo(() => tabs.find((tab) => tab.id === activeTabId) || null, [tabs, activeTabId]);

  // 从 tab data 中读取状态
  const currentNode = activeTab?.data?.currentNode || null;
  const scanResult = activeTab?.data?.scanResult || null;
  const breadcrumbs = activeTab?.data?.breadcrumbs || [];
  const groupBy = activeTab?.data?.groupBy || 'none';
  const sortField = activeTab?.data?.sortField || 'size';
  const sortOrder = activeTab?.data?.sortOrder || 'desc';
  const flatGrouping = activeTab?.data?.flatGrouping || false;

  const tGrouping = useCallback((key: string) => t(key), [t]);

  const [hoveredRect, setHoveredRect] = useState<TreemapRect | null>(null);
  const [contextMenu, setContextMenu] = useState<{ mouseX: number; mouseY: number; node: FileNode } | null>(null);
  const containerRef = useRef<HTMLDivElement>(null);
  const tooltipRef = useRef<HTMLDivElement>(null);
  const tooltipPosRef = useRef({ x: 0, y: 0 });
  const tooltipRafRef = useRef<number | null>(null);

  const displayNode = currentNode || scanResult;

  const driveLabel = useMemo(() => {
    const rootPath = scanResult?.path || '';
    const match = rootPath.match(/^([A-Za-z]):/);
    if (match?.[1]) return match[1].toUpperCase();
    return t('treemapView.root');
  }, [scanResult?.path, t]);

  // 正方形化树状图算法与对数缩放
  // 正方形化算法会优化矩形的长宽比，使其更接近正方形
  const layoutRectangles = (
    children: FileNode[],
    containerWidth: number,
    containerHeight: number
  ): TreemapRect[] => {
    if (!children || children.length === 0) return [];
    if (!Number.isFinite(containerWidth) || !Number.isFinite(containerHeight) || containerWidth <= 0 || containerHeight <= 0) return [];

    // 按大小排序（降序）并限制为 100 项
    const sortedChildren = [...children]
      .sort((a, b) => (Number(b.size) || 0) - (Number(a.size) || 0))
      .slice(0, 100);

    // 应用对数缩放以提高小文件的可见性
    // 这个方法确保小文件仍然可见，同时保持相对大小关系
    const scaledChildren = sortedChildren.map(child => {
      const rawSize = Number(child.size);
      const safeSize = Number.isFinite(rawSize) && rawSize > 0 ? rawSize : 0;
      return {
        ...child,
        scaledSize: safeSize === 0 ? 0 : Math.log10(safeSize + 1)
      };
    });

    const totalSize = scaledChildren.reduce((sum, child) => sum + (Number.isFinite(child.scaledSize) ? child.scaledSize : 0), 0);

    if (totalSize === 0) return [];

    const rects: TreemapRect[] = [];

    // 树图算法
    const squarify = (
      items: Array<FileNode & { scaledSize: number }>,
      x: number,
      y: number,
      width: number,
      height: number
    ) => {
      if (items.length === 0) return;
      if (!Number.isFinite(width) || !Number.isFinite(height) || width <= 0 || height <= 0) return;

      if (items.length === 1) {
        const color = COLORS[rects.length % COLORS.length];
        rects.push({
          x,
          y,
          width,
          height,
          node: items[0],
          color,
        });
        return;
      }

      const total = items.reduce((sum, item) => sum + (Number.isFinite(item.scaledSize) ? item.scaledSize : 0), 0);
      if (total <= 0) return;
      const shortSide = Math.min(width, height);

      // 计算一行的最大长宽比
      const worstAspectRatio = (row: Array<FileNode & { scaledSize: number }>, sideLength: number): number => {
        if (!Number.isFinite(sideLength) || sideLength <= 0) return Number.POSITIVE_INFINITY;
        const rowSum = row.reduce((sum, item) => sum + item.scaledSize, 0);
        const rowArea = (rowSum / total) * width * height;
        const rowShortSide = rowArea / sideLength;

        if (!Number.isFinite(rowShortSide) || rowShortSide <= 0) return Number.POSITIVE_INFINITY;

        let worst = 0;
        for (const item of row) {
          const itemArea = (item.scaledSize / total) * width * height;
          const itemLongSide = itemArea / rowShortSide;
          const aspect = Math.max(itemLongSide / rowShortSide, rowShortSide / itemLongSide);
          worst = Math.max(worst, aspect);
        }
        return worst;
      };

      // 贪心法构建行
      const row: Array<FileNode & { scaledSize: number }> = [];
      let remaining = [...items];

      while (remaining.length > 0) {
        const item = remaining[0];
        const testRow = [...row, item];

        if (row.length === 0) {
          row.push(item);
          remaining.shift();
        } else {
          const currentWorst = worstAspectRatio(row, shortSide);
          const newWorst = worstAspectRatio(testRow, shortSide);

          if (newWorst <= currentWorst) {
            row.push(item);
            remaining.shift();
          } else {
            // 布局当前行并递归
            break;
          }
        }
      }

      // 布局当前行
      const rowSum = row.reduce((sum, item) => sum + item.scaledSize, 0);
      const rowRatio = rowSum / total;

      if (width >= height) {
        // 水平分割
        const rowWidth = width * rowRatio;
        layoutRow(row, x, y, rowWidth, height, true);
        if (remaining.length > 0) {
          squarify(remaining, x + rowWidth, y, width - rowWidth, height);
        }
      } else {
        // 竖直分割
        const rowHeight = height * rowRatio;
        layoutRow(row, x, y, width, rowHeight, false);
        if (remaining.length > 0) {
          squarify(remaining, x, y + rowHeight, width, height - rowHeight);
        }
      }
    };

    const layoutRow = (
      items: Array<FileNode & { scaledSize: number }>,
      x: number,
      y: number,
      width: number,
      height: number,
      isHorizontal: boolean
    ) => {
      const total = items.reduce((sum, item) => sum + (Number.isFinite(item.scaledSize) ? item.scaledSize : 0), 0);
      if (total <= 0) return;
      let offset = 0;

      for (const item of items) {
        const ratio = item.scaledSize / total;
        if (!Number.isFinite(ratio) || ratio <= 0) continue;
        const color = COLORS[rects.length % COLORS.length];

        if (isHorizontal) {
          const itemHeight = height * ratio;
          if (!Number.isFinite(itemHeight) || itemHeight <= 0) continue;
          rects.push({
            x,
            y: y + offset,
            width,
            height: itemHeight,
            node: item,
            color,
          });
          offset += itemHeight;
        } else {
          const itemWidth = width * ratio;
          if (!Number.isFinite(itemWidth) || itemWidth <= 0) continue;
          rects.push({
            x: x + offset,
            y,
            width: itemWidth,
            height,
            node: item,
            color,
          });
          offset += itemWidth;
        }
      }
    };

    // 从根节点开始构建树状图
    squarify(scaledChildren, 0, 0, containerWidth, containerHeight);
    return rects;
  };

  const [containerSize, setContainerSize] = useState({ width: 0, height: 0 });

  // 在挂载和窗口调整大小时更新容器大小
  useEffect(() => {
    const updateSize = () => {
      if (containerRef.current) {
        setContainerSize({
          width: containerRef.current.clientWidth,
          height: containerRef.current.clientHeight,
        });
      }
    };

    updateSize();
    window.addEventListener('resize', updateSize);

    // displayNode 改变时也更新
    const timer = setTimeout(updateSize, 100);

    return () => {
      window.removeEventListener('resize', updateSize);
      clearTimeout(timer);
    };
  }, [displayNode]);

  // 仅当依赖项改变时重新计算
  const treemapRects = useMemo(() => {
    if (!displayNode) return [];
    if (!Number.isFinite(containerSize.width) || !Number.isFinite(containerSize.height)) return [];
    if (containerSize.width <= 0 || containerSize.height <= 0) return [];

    if (displayNode.children && displayNode.children.length > 0) {
      // 应用分组（传递当前节点的路径，避免在分组内再次分组）
      let childrenToDisplay = groupFileNodes(displayNode.children, groupBy, displayNode.path, flatGrouping, tGrouping);

      // 应用排序
      childrenToDisplay = sortGroupedNodes(childrenToDisplay, sortField, sortOrder);

      return layoutRectangles(childrenToDisplay, containerSize.width, containerSize.height);
    }

    return [];
  }, [displayNode, containerSize, groupBy, sortField, sortOrder, flatGrouping, tGrouping]);

  const handleRectClick = (rect: TreemapRect) => {
    if (!rect.node.is_dir) return;

    const crumbs = buildBreadcrumbs(scanResult, rect.node.path);
    updateCurrentTabData({
      currentNode: rect.node,
      breadcrumbs: crumbs,
    });
  };

  // 处理面包屑导航点击
  const handleBreadcrumbClick = (index: number) => {
    if (index === -1) {
      updateCurrentTabData({
        currentNode: scanResult,
        breadcrumbs: [],
      });
    } else {
      const newBreadcrumbs = breadcrumbs.slice(0, index + 1);
      updateCurrentTabData({
        currentNode: newBreadcrumbs[index],
        breadcrumbs: newBreadcrumbs,
      });
    }
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
      const { x, y } = tooltipPosRef.current;
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
    setContextMenu({ mouseX: e.clientX, mouseY: e.clientY, node: rect.node });
  };

  const handleCloseContextMenu = () => {
    setContextMenu(null);
  };

  const handleOpenInExplorer = async () => {
    if (!contextMenu) return;
    try {
      await invoke('open_in_explorer', { path: contextMenu.node.path });
    } catch (error) {
      updateCurrentTabData({
        error: `${t('common.cannotOpenExplorer')}: ${error}`,
      });
    }
    handleCloseContextMenu();
  };

  if (!displayNode) {
    return (
      <Paper
        elevation={0}
        sx={{
          p: 3,
          mb: 3,
          height: '600px',
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
          background: alpha('#ffffff', 0.15),
          backdropFilter: 'blur(10px)',
          border: `1px solid ${alpha('#ffffff', 0.2)}`,
          borderRadius: 2,
        }}
      >
        <Typography variant="h6" sx={{ color: alpha('#ffffff', 0.7) }}>
          {t('treemapView.noData')}
        </Typography>
      </Paper>
    );
  }

  return (
    <div className="w-full h-full flex flex-col rounded-xl p-2 relative">
      {/* 面包屑导航 */}
      <Stack spacing={2} sx={{ mb: 2 }}>
        <Box sx={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 2, flexWrap: 'wrap' }}>
          <Box sx={{ display: 'flex', alignItems: 'center', gap: 1, flex: 1 }}>
            <Breadcrumbs
              separator={<NavigateNext fontSize="small" sx={{ color: alpha('#ffffff', 0.5) }} />}
              sx={{ color: 'white' }}
            >
              <Link
                component="button"
                variant="body1"
                onClick={() => handleBreadcrumbClick(-1)}
                sx={{
                  display: 'flex',
                  alignItems: 'center',
                  gap: 0.5,
                  color: 'white',
                  '&:hover': { color: alpha('#ffffff', 0.8) },
                }}
              >
                <Folder fontSize="small" />
                {driveLabel}
              </Link>
              {breadcrumbs.map((node, index) => (
                <Link
                  key={node.path}
                  component="button"
                  variant="body1"
                  onClick={() => handleBreadcrumbClick(index)}
                  sx={{
                    display: 'flex',
                    alignItems: 'center',
                    gap: 0.5,
                    color: 'white',
                    '&:hover': { color: alpha('#ffffff', 0.8) },
                  }}
                >
                  {node.is_dir ? <Folder fontSize="small" /> : <InsertDriveFile fontSize="small" />}
                  {node.name}
                </Link>
              ))}
            </Breadcrumbs>
            <Tooltip title={t('treemapView.copyPath')}>
              <IconButton
                size="small"
                onClick={() => {
                  const path = displayNode?.path || '';
                  navigator.clipboard.writeText(path);
                }}
                sx={{ color: 'white' }}
              >
                <ContentCopy fontSize="small" />
              </IconButton>
            </Tooltip>
          </Box>

          {displayNode && (
            <Chip
              label={`${formatBytes(displayNode.size || 0)} | ${(displayNode.file_count || 0).toLocaleString()} ${t('treemapView.files')}`}
              size="small"
              sx={{
                background: alpha('#ffffff', 0.2),
                color: 'white',
                border: `1px solid ${alpha('#ffffff', 0.3)}`,
              }}
            />
          )}
        </Box>
      </Stack>

      {/* 树状图可视化 */}
      <Box
        ref={containerRef}
        sx={{
          flex: 1,
          width: '100%',
          minHeight: 0,
          position: 'relative',
          background: alpha('#ffffff', 0.1),
          border: `1px solid ${alpha('#ffffff', 0.2)}`,
          borderRadius: 1,
          overflow: 'hidden'
        }}
      >
        <svg
          width="100%"
          height="100%"
          viewBox={`0 0 ${containerSize.width} ${containerSize.height}`}
          preserveAspectRatio="none"
          style={{ display: 'block' }}
        >
          {treemapRects.map((rect, index) => {
            if (![rect.x, rect.y, rect.width, rect.height].every((v) => Number.isFinite(v)) || rect.width <= 0 || rect.height <= 0) {
              return null;
            }
            const isHovered = hoveredRect?.node.path === rect.node.path;
            const showSize = rect.width > 80 && rect.height > 50;

            // 根据矩形大小计算字体大小
            const fontSize = Math.max(10, Math.min(14, Math.min(rect.width / 12, rect.height / 4)));

            // 计算能容纳的最大字符数
            const maxChars = Math.floor(rect.width / (fontSize * 0.5));
            let displayName = rect.node.name;
            if (displayName.length > maxChars && maxChars > 3) {
              displayName = displayName.substring(0, maxChars - 3) + '...';
            }

            return (
              <g key={`${rect.node.path}-${index}`}>
                <rect
                  x={rect.x}
                  y={rect.y}
                  width={rect.width}
                  height={rect.height}
                  fill={rect.color}
                  stroke={alpha('#fff', 0.5)}
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
      </Box>

      <Typography variant="caption" color="text.secondary" sx={{ mt: 2, display: 'block' }}>
        {t('treemapView.clickToView')}
      </Typography>

      {/* 自定义提示框 - 移到外部并使用 fixed 定位以避免被裁剪 */}
      {hoveredRect && (
        <Box
          ref={tooltipRef}
          sx={{
            position: 'fixed',
            left: 0,
            top: 0,
            bgcolor: alpha('#18181b', 0.95), // dark zinc
            backdropFilter: 'blur(12px)',
            border: `1px solid ${alpha('#fff', 0.1)}`,
            color: 'white',
            p: 1.5,
            borderRadius: 2,
            pointerEvents: 'none',
            zIndex: 99999,
            maxWidth: 300,
            boxShadow: '0 8px 32px rgba(0,0,0,0.6)',
            transform: 'translate(0px, 0px)',
          }}
        >
          <Typography variant="body2" fontWeight="bold" sx={{ mb: 0.5 }}>
            {hoveredRect.node.name}
          </Typography>
          <Typography variant="caption" display="block" color="text.secondary">
            {t('fileList.size')}: <span style={{ color: '#fff' }}>{formatBytes(hoveredRect.node.size)}</span>
          </Typography>
          {hoveredRect.node.is_dir && (
            <>
              <Typography variant="caption" display="block" color="text.secondary">
                {t('treemapView.fileCount', { count: hoveredRect.node.file_count || 0 })}
              </Typography>
              <Typography variant="caption" display="block" sx={{ mt: 1, color: 'primary.main', fontWeight: 500 }}>
                {t('treemapView.clickToDrillDown')}
              </Typography>
            </>
          )}
        </Box>
      )}

      {/* 右键菜单 */}
      <Menu
        open={contextMenu !== null}
        onClose={handleCloseContextMenu}
        anchorPosition={contextMenu ? { top: contextMenu.mouseY, left: contextMenu.mouseX } : undefined}
        anchorReference="anchorPosition"
      >
        <MenuItem onClick={handleOpenInExplorer}>
          <FolderOutlined fontSize="small" sx={{ mr: 1 }} />
          {t('treemapView.openInExplorer')}
        </MenuItem>
      </Menu>
    </div>
  );
};
