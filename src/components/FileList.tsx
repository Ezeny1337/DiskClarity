import React, { useState, useCallback } from 'react';
import {
  Typography,
  Chip,
  IconButton,
  Tooltip,
  Menu,
  MenuItem,
  alpha,
} from '@mui/material';
import { Folder, InsertDriveFile, ExpandMore, ChevronRight, FolderOutlined, NavigateNext, ContentCopy, Home, ArrowUpward, ArrowDownward } from '@mui/icons-material';
import { useTranslation } from 'react-i18next';
import { FileNode } from '../store/scanStore';
import { useTabStore } from '../store/tabStore';
import { formatBytes, formatPercentage } from '../utils/format';
import { invoke } from '@tauri-apps/api/core';
import { groupFileNodes, sortGroupedNodes } from '../utils/grouping';
import { buildBreadcrumbs, updateCurrentTabData } from '../utils/tabNavigation';
import { filterFileTree, findNodeByPath, hasDiskSearchFilter, type DiskSearchCriteria } from '../utils/diskSearch';

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
  if (diffDays < 7) return t('fileList.daysAgo', { days: diffDays });
  if (diffDays < 30) return t('fileList.weeksAgo', { weeks: Math.floor(diffDays / 7) });
  if (diffDays < 365) return t('fileList.monthsAgo', { months: Math.floor(diffDays / 30) });
  return t('fileList.yearsAgo', { years: Math.floor(diffDays / 365) });
}

interface TreeItemProps {
  node: FileNode;
  level: number;
  parentSize: number;
  onNavigate: (node: FileNode) => void;
  maxInitialChildren?: number;
}

const TreeItem = React.memo(({ node, level, parentSize, onNavigate, maxInitialChildren = 100 }: TreeItemProps) => {
  const { t } = useTranslation();
  const tGrouping = useCallback((key: string) => t(key), [t]);
  const [expanded, setExpanded] = useState(false);
  const [displayCount, setDisplayCount] = useState(maxInitialChildren);
  const { getActiveTab, updateCurrentTab } = useTabStore();
  const activeTab = getActiveTab();
  const sortField = activeTab?.data?.sortField || 'size';
  const sortOrder = activeTab?.data?.sortOrder || 'desc';
  const groupBy = activeTab?.data?.groupBy || 'none';
  const flatGrouping = activeTab?.data?.flatGrouping || false;
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
        setExpanded(!expanded);
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
    setContextMenu({ mouseX: e.clientX, mouseY: e.clientY });
  };

  const handleCloseContextMenu = () => {
    setContextMenu(null);
  };

  const handleOpenInExplorer = async () => {
    try {
      await invoke('open_in_explorer', { path: node.path });
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
        onMouseEnter={e => { (e.currentTarget as HTMLDivElement).style.background = alpha('#ffffff', 0.06); }}
        onMouseLeave={e => { (e.currentTarget as HTMLDivElement).style.background = rowBg(level); }}
      >
        {/* 展开/折叠图标 */}
        <span className="shrink-0 w-5 flex items-center justify-center mr-1" style={{ color: alpha('#ffffff', 0.4) }}>
          {node.is_dir ? (
            hasChildren ? (
              expanded
                ? <ExpandMore sx={{ fontSize: 16 }} />
                : <ChevronRight sx={{ fontSize: 16 }} />
            ) : (
              <Folder sx={{ fontSize: 14, color: '#60a5fa' }} />
            )
          ) : (
            <InsertDriveFile sx={{ fontSize: 14, color: alpha('#ffffff', 0.3) }} />
          )}
        </span>

        {/* 名称 */}
        <span className="flex-1 truncate font-medium" style={{ color: node.is_dir ? 'white' : alpha('#ffffff', 0.8) }}>
          {node.name}
        </span>

        {/* 大小 */}
        <span className="shrink-0 text-xs text-right w-20" style={{ color: alpha('#ffffff', 0.6) }}>
          {formatBytes(node.size)}
        </span>

        {/* 占比 */}
        <span className="shrink-0 text-xs text-right w-14" style={{ color: alpha('#ffffff', 0.4) }}>
          {node.is_dir ? formatPercentage(node.size, parentSize) : ''}
        </span>

        {/* 文件数 */}
        <span className="shrink-0 text-xs text-right w-20" style={{ color: alpha('#ffffff', 0.4) }}>
          {node.is_dir ? `${(node.file_count || 0).toLocaleString()} ${t('fileList.files')}` : ''}
        </span>

        {/* 修改时间 */}
        <span className="shrink-0 text-xs text-right w-24" style={{ color: alpha('#ffffff', 0.35) }}>
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
            <div className="flex justify-center py-2" style={{ paddingLeft: `${12 + (level + 1) * 16}px` }}>
              <button
                onClick={(e) => { e.stopPropagation(); setDisplayCount(prev => Math.min(prev + 100, sortedChildren.length)); }}
                className="text-xs px-3 py-1 rounded-lg border transition-all"
                style={{ color: alpha('#ffffff', 0.5), borderColor: alpha('#ffffff', 0.12), background: alpha('#ffffff', 0.04) }}
              >
                {t('fileList.showMore', { count: sortedChildren.length - displayCount })}
              </button>
            </div>
          )}
        </>
      )}

      {/* 右键菜单 */}
      <Menu
        open={contextMenu !== null}
        onClose={handleCloseContextMenu}
        anchorPosition={contextMenu ? { top: contextMenu.mouseY, left: contextMenu.mouseX } : undefined}
        anchorReference="anchorPosition"
        PaperProps={{ sx: { bgcolor: alpha('#1c1c1e', 0.98), border: `1px solid ${alpha('#ffffff', 0.1)}`, borderRadius: 2 } }}
      >
        <MenuItem onClick={handleOpenInExplorer} sx={{ color: alpha('#ffffff', 0.8), fontSize: 13, gap: 1, '&:hover': { bgcolor: alpha('#ffffff', 0.08) } }}>
          <FolderOutlined fontSize="small" />
          {t('fileList.openInExplorer')}
        </MenuItem>
      </Menu>
    </>
  );
});

export const FileList: React.FC = () => {
  const { t } = useTranslation();
  const tGrouping = useCallback((key: string) => t(key), [t]);
  const activeTabId = useTabStore((state) => state.activeTabId);
  const tabs = useTabStore((state) => state.tabs);
  const activeTab = React.useMemo(() => tabs.find((tab) => tab.id === activeTabId) || null, [tabs, activeTabId]);

  const currentNode = activeTab?.data?.currentNode || null;
  const scanResult = activeTab?.data?.scanResult || null;
  const sortField = activeTab?.data?.sortField || 'size';
  const sortOrder = activeTab?.data?.sortOrder || 'desc';
  const groupBy = activeTab?.data?.groupBy || 'none';
  const flatGrouping = activeTab?.data?.flatGrouping || false;
  const tabData = activeTab?.data;
  const diskSearchCriteria = React.useMemo<DiskSearchCriteria>(() => ({
    query: tabData?.diskSearchQuery || '',
    mode: tabData?.diskSearchMode || 'contains',
    caseSensitive: tabData?.diskSearchCaseSensitive || false,
    nodeType: tabData?.diskSearchNodeType || 'all',
    minSizeMb: tabData?.diskSearchMinSizeMb || '',
    maxSizeMb: tabData?.diskSearchMaxSizeMb || '',
    minSizeUnit: tabData?.diskSearchMinSizeUnit || 'MB',
    maxSizeUnit: tabData?.diskSearchMaxSizeUnit || 'MB',
    extensions: tabData?.diskSearchExtensions || [],
    extensionMode: tabData?.diskSearchExtensionMode || 'include',
  }), [
    tabData?.diskSearchQuery,
    tabData?.diskSearchMode,
    tabData?.diskSearchCaseSensitive,
    tabData?.diskSearchNodeType,
    tabData?.diskSearchMinSizeMb,
    tabData?.diskSearchMaxSizeMb,
    tabData?.diskSearchMinSizeUnit,
    tabData?.diskSearchMaxSizeUnit,
    tabData?.diskSearchExtensions,
    tabData?.diskSearchExtensionMode,
  ]);

  const setSortField = (field: any) => {
    updateCurrentTabData({ sortField: field });
  };

  const setSortOrder = (order: any) => {
    updateCurrentTabData({ sortOrder: order });
  };

  const [displayCount, setDisplayCount] = useState(100);

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
      updateCurrentTabData({ currentNode: filteredScanResult, breadcrumbs: [] });
    } else {
      const newBreadcrumbs = displayBreadcrumbs.slice(0, index + 1);
      updateCurrentTabData({ currentNode: newBreadcrumbs[index], breadcrumbs: newBreadcrumbs });
    }
  };

  if (!displayNode) {
    return (
      <div className="flex items-center justify-center h-full">
        <Typography sx={{ color: alpha('#ffffff', 0.3) }}>{t('fileList.noData')}</Typography>
      </div>
    );
  }

  // 应用分组和排序到顶级子项
  let sortedChildren = displayNode && displayNode.children
    ? [...displayNode.children]
    : [];

  // 应用分组
  sortedChildren = groupFileNodes(sortedChildren, groupBy, displayNode?.path, flatGrouping, tGrouping);

  // 应用排序
  sortedChildren = sortGroupedNodes(sortedChildren, sortField, sortOrder);

  // 限制显示的子项数量
  const displayedChildren = sortedChildren.slice(0, displayCount);
  const hasMore = sortedChildren.length > displayCount;

  // 排序字段按钮列表
  const sortFields = [
    { value: 'size', label: t('sortOptions.size') },
    { value: 'name', label: t('sortOptions.name') },
    { value: 'modified', label: t('sortOptions.modified') },
    { value: 'fileCount', label: t('sortOptions.fileCount') },
  ];

  return (
    <div className="w-full h-full flex flex-col overflow-hidden">
      {/* 顶部工具栏 */}
      <div className="shrink-0 flex items-center gap-2 px-4 py-2 flex-wrap"
        style={{ borderBottom: `1px solid ${alpha('#ffffff', 0.07)}`, background: alpha('#ffffff', 0.03) }}>

        {/* 面包屑 */}
        <div className="flex items-center gap-1 flex-1 min-w-0 flex-wrap">
          <Tooltip title={t('treemapView.root')}>
            <IconButton size="small" onClick={() => handleBreadcrumbClick(-1)}
              sx={{ color: displayBreadcrumbs.length ? alpha('#ffffff', 0.6) : alpha('#ffffff', 0.3), p: 0.5 }}>
              <Home sx={{ fontSize: 15 }} />
            </IconButton>
          </Tooltip>
          {displayBreadcrumbs.map((node, index) => (
            <React.Fragment key={node.path}>
              <NavigateNext sx={{ fontSize: 13, color: alpha('#ffffff', 0.25) }} />
              <button
                onClick={() => handleBreadcrumbClick(index)}
                className="text-xs px-1.5 py-0.5 rounded transition-all max-w-40 truncate"
                style={{
                  color: index === displayBreadcrumbs.length - 1 ? 'white' : alpha('#ffffff', 0.55),
                  fontWeight: index === displayBreadcrumbs.length - 1 ? 600 : 400,
                  background: index === displayBreadcrumbs.length - 1 ? alpha('#ffffff', 0.08) : 'transparent',
                }}
                title={node.path}
              >
                {node.name}
              </button>
            </React.Fragment>
          ))}
          <Tooltip title={t('treemapView.copyPath')}>
            <IconButton size="small"
              onClick={() => navigator.clipboard.writeText(displayNode?.path || '')}
              sx={{ color: alpha('#ffffff', 0.3), p: 0.5, '&:hover': { color: '#a78bfa' } }}>
              <ContentCopy sx={{ fontSize: 13 }} />
            </IconButton>
          </Tooltip>
        </div>

        {/* 排序按钮组 */}
        <div className="flex items-center gap-1 shrink-0">
          {sortFields.map(f => (
            <button key={f.value}
              onClick={() => {
                if (sortField === f.value) setSortOrder(sortOrder === 'asc' ? 'desc' : 'asc');
                else { setSortField(f.value); setSortOrder('desc'); }
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
                  ? <ArrowDownward sx={{ fontSize: 11 }} />
                  : <ArrowUpward sx={{ fontSize: 11 }} />
              )}
            </button>
          ))}
        </div>

        {/* 统计 Chips */}
        <div className="flex items-center gap-1.5 shrink-0">
          <Chip label={formatBytes(displayNode.size || 0)} size="small"
            sx={{ height: 20, fontSize: 11, bgcolor: alpha('#ffffff', 0.08), color: alpha('#ffffff', 0.7), border: `1px solid ${alpha('#ffffff', 0.12)}` }} />
          <Chip label={`${(displayNode.file_count || 0).toLocaleString()} ${t('fileList.files')}`} size="small"
            sx={{ height: 20, fontSize: 11, bgcolor: alpha('#ffffff', 0.08), color: alpha('#ffffff', 0.7), border: `1px solid ${alpha('#ffffff', 0.12)}` }} />
          <Chip label={`${(displayNode.dir_count || 0).toLocaleString()} ${t('fileList.folders')}`} size="small"
            sx={{ height: 20, fontSize: 11, bgcolor: alpha('#ffffff', 0.08), color: alpha('#ffffff', 0.7), border: `1px solid ${alpha('#ffffff', 0.12)}` }} />
        </div>
      </div>

      {/* 表头 */}
      <div className="shrink-0 flex items-center px-3 py-1.5 text-xs font-semibold"
        style={{ background: alpha('#ffffff', 0.05), borderBottom: `1px solid ${alpha('#ffffff', 0.07)}`, color: alpha('#ffffff', 0.4) }}>
        <span className="flex-1">{t('fileList.name')}</span>
        <span className="w-20 text-right">{t('fileList.size')}</span>
        <span className="w-16 text-right ml-2">{t('fileList.percentage')}</span>
        <span className="w-20 text-right">{t('fileList.fileCount')}</span>
        <span className="w-24 text-right">{t('fileList.modifiedTime')}</span>
      </div>

      {/* 列表内容 */}
      <div className="flex-1 overflow-y-auto custom-scrollbar">
        {displayedChildren.map((child) => (
          <TreeItem
            key={child.path}
            node={child}
            level={0}
            parentSize={displayNode.size}
            onNavigate={handleNavigate}
          />
        ))}
        {hasMore && (
          <div className="flex justify-center py-3">
            <button
              onClick={() => setDisplayCount(prev => Math.min(prev + 100, sortedChildren.length))}
              className="text-xs px-4 py-1.5 rounded-lg border transition-all"
              style={{ color: alpha('#ffffff', 0.5), borderColor: alpha('#ffffff', 0.12), background: alpha('#ffffff', 0.04) }}
            >
              {t('fileList.showMore', { count: sortedChildren.length - displayCount })}
            </button>
          </div>
        )}
      </div>
    </div>
  );
};
