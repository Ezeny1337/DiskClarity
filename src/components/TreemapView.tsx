import React, { useState, useMemo, useRef, useEffect, useCallback } from 'react';
import { Box, Paper, Typography, Breadcrumbs, Link, Chip, Stack, IconButton, Tooltip, Menu, MenuItem } from '@mui/material';
import { useTranslation } from 'react-i18next';
import { useScanStore, FileNode } from '../store/scanStore';
import { formatBytes } from '../utils/format';
import { Folder, InsertDriveFile, NavigateNext, ContentCopy, FolderOutlined } from '@mui/icons-material';
import { invoke } from '@tauri-apps/api/core';
import { groupFileNodes, sortGroupedNodes } from '../utils/grouping';

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
  const { 
    currentNode, 
    scanResult, 
    setCurrentNode, 
    breadcrumbs, 
    setBreadcrumbs,
    groupBy,
    sortField,
    sortOrder,
    flatGrouping,
  } = useScanStore();

  const buildBreadcrumbs = useCallback((root: FileNode | null, targetPath: string): FileNode[] => {
    if (!root || !targetPath) return [];
    if (root.path === targetPath) return [];

    const stack: Array<{ node: FileNode; trail: FileNode[] }> = [{ node: root, trail: [] }];
    while (stack.length > 0) {
      const current = stack.pop();
      if (!current) continue;

      if (current.node.path === targetPath) {
        return current.trail;
      }

      if (current.node.children && current.node.children.length > 0) {
        for (let i = current.node.children.length - 1; i >= 0; i--) {
          const child = current.node.children[i];
          stack.push({ node: child, trail: [...current.trail, child] });
        }
      }
    }

    return [];
  }, []);

  const tGrouping = useCallback((key: string) => t(key), [t]);

  const [hoveredRect, setHoveredRect] = useState<TreemapRect | null>(null);
  const [tooltipPos, setTooltipPos] = useState({ x: 0, y: 0 });
  const [contextMenu, setContextMenu] = useState<{ mouseX: number; mouseY: number; node: FileNode } | null>(null);
  const containerRef = useRef<HTMLDivElement>(null);

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

    // 按大小排序（降序）並限制为 100 项
    const sortedChildren = [...children]
      .sort((a, b) => b.size - a.size)
      .slice(0, 100);
    
    // 应用对数缩放以提高小文件的可见性
    // 这个方法确保小文件仍然可见，同时保持相对大小关系
    const scaledChildren = sortedChildren.map(child => ({
      ...child,
      scaledSize: child.size === 0 ? 0 : Math.log10(child.size + 1)
    }));
    
    const totalSize = scaledChildren.reduce((sum, child) => sum + child.scaledSize, 0);
    
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

      const total = items.reduce((sum, item) => sum + item.scaledSize, 0);
      const shortSide = Math.min(width, height);
      
        // 计算一行的最大长宽比
      const worstAspectRatio = (row: Array<FileNode & { scaledSize: number }>, sideLength: number): number => {
        const rowSum = row.reduce((sum, item) => sum + item.scaledSize, 0);
        const rowArea = (rowSum / total) * width * height;
        const rowShortSide = rowArea / sideLength;
        
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
      const total = items.reduce((sum, item) => sum + item.scaledSize, 0);
      let offset = 0;
      
      for (const item of items) {
        const ratio = item.scaledSize / total;
        const color = COLORS[rects.length % COLORS.length];
        
        if (isHorizontal) {
          const itemHeight = height * ratio;
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
    if (!displayNode || containerSize.width === 0 || containerSize.height === 0) return [];

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

    setCurrentNode(rect.node);
    setBreadcrumbs(buildBreadcrumbs(scanResult, rect.node.path));
  };

  // 处理面包屑导航点击
  const handleBreadcrumbClick = (index: number) => {
    if (index === -1) {
      setCurrentNode(scanResult);
      setBreadcrumbs([]);
    } else {
      const newBreadcrumbs = breadcrumbs.slice(0, index + 1);
      setCurrentNode(newBreadcrumbs[index]);
      setBreadcrumbs(newBreadcrumbs);
    }
  };

  const handleMouseMove = (e: React.MouseEvent<SVGRectElement>, rect: TreemapRect) => {
    setHoveredRect(rect);
    setTooltipPos({ x: e.clientX, y: e.clientY });
  };

  const handleMouseLeave = () => {
    setHoveredRect(null);
  };

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
      const { setError } = useScanStore.getState();
      setError(`${t('common.cannotOpenExplorer')}: ${error}`);
    }
    handleCloseContextMenu();
  };

  if (!displayNode) {
    return (
      <Paper elevation={3} sx={{ p: 3, mb: 3, height: '600px', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
        <Typography variant="h6" color="text.secondary">
          {t('treemapView.noData')}
        </Typography>
      </Paper>
    );
  }

  return (
    <Paper elevation={3} sx={{ p: 3, mb: 3 }}>
      {/* 面包屑导航 */}
      <Stack spacing={2} sx={{ mb: 2 }}>
        <Box sx={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 2, flexWrap: 'wrap' }}>
          <Box sx={{ display: 'flex', alignItems: 'center', gap: 1, flex: 1 }}>
            <Breadcrumbs separator={<NavigateNext fontSize="small" />}>
              <Link
                component="button"
                variant="body1"
                onClick={() => handleBreadcrumbClick(-1)}
                sx={{ display: 'flex', alignItems: 'center', gap: 0.5 }}
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
                  sx={{ display: 'flex', alignItems: 'center', gap: 0.5 }}
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
              >
                <ContentCopy fontSize="small" />
              </IconButton>
            </Tooltip>
          </Box>

          {displayNode && (
            <Chip
              label={`${formatBytes(displayNode.size || 0)} | ${(displayNode.file_count || 0).toLocaleString()} ${t('treemapView.files')}`}
              color="primary"
              size="small"
            />
          )}
        </Box>
      </Stack>

      {/* 树状图可视化 */}
      <Box 
        ref={containerRef}
        sx={{ 
          height: '600px', 
          width: '100%', 
          position: 'relative',
          bgcolor: '#f5f5f5',
          border: '1px solid #ddd',
        }}
      >
        <svg width="100%" height="100%" style={{ display: 'block' }}>
          {treemapRects.map((rect, index) => {
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
                  stroke="#fff"
                  strokeWidth={2}
                  opacity={isHovered ? 1 : 0.9}
                  style={{
                    cursor: rect.node.is_dir ? 'pointer' : 'default',
                    transition: 'opacity 0.2s',
                  }}
                  onClick={() => handleRectClick(rect)}
                  onMouseMove={(e) => handleMouseMove(e, rect)}
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
                      textShadow: '1px 1px 2px rgba(0,0,0,0.7)',
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
                    fill="#fff"
                    fontSize={Math.max(9, fontSize - 2)}
                    style={{
                      pointerEvents: 'none',
                      textShadow: '1px 1px 2px rgba(0,0,0,0.7)',
                    }}
                  >
                    {formatBytes(rect.node.size)}
                  </text>
                )}
              </g>
            );
          })}
        </svg>

        {/* 自定义提示框 */}
        {hoveredRect && (
          <Box
            sx={{
              position: 'fixed',
              left: tooltipPos.x + 10,
              top: tooltipPos.y + 10,
              bgcolor: 'rgba(0, 0, 0, 0.9)',
              color: 'white',
              p: 1.5,
              borderRadius: 1,
              pointerEvents: 'none',
              zIndex: 9999,
              maxWidth: 300,
            }}
          >
            <Typography variant="body2" fontWeight="bold" sx={{ mb: 0.5 }}>
              {hoveredRect.node.name}
            </Typography>
            <Typography variant="caption" display="block">
              Size: {formatBytes(hoveredRect.node.size)}
            </Typography>
            {hoveredRect.node.is_dir && (
              <>
                <Typography variant="caption" display="block">
                  {t('treemapView.fileCount', { count: hoveredRect.node.file_count || 0 })}
                </Typography>
                <Typography variant="caption" display="block" sx={{ mt: 0.5, fontStyle: 'italic' }}>
                  {t('treemapView.clickToDrillDown')}
                </Typography>
              </>
            )}
          </Box>
        )}
      </Box>

      <Typography variant="caption" color="text.secondary" sx={{ mt: 2, display: 'block' }}>
        {t('treemapView.clickToView')}
      </Typography>

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
    </Paper>
  );
};
