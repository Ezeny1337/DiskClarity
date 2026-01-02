import React, { useState, useCallback } from 'react';
import {
  Paper,
  Typography,
  Box,
  Chip,
  Breadcrumbs,
  Link,
  Stack,
  IconButton,
  Tooltip,
  List,
  ListItem,
  ListItemButton,
  ListItemIcon,
  ListItemText,
  Button,
  Menu,
  MenuItem,
  FormControl,
  Select,
  SelectChangeEvent,
  alpha,
} from '@mui/material';
import { Folder, InsertDriveFile, ExpandMore, ChevronRight, ExpandCircleDown, FolderOutlined, NavigateNext, ContentCopy } from '@mui/icons-material';
import { useTranslation } from 'react-i18next';
import { FileNode } from '../store/scanStore';
import { useTabStore } from '../store/tabStore';
import { formatBytes, formatPercentage } from '../utils/format';
import { invoke } from '@tauri-apps/api/core';
import { groupFileNodes, sortGroupedNodes } from '../utils/grouping';
import { buildBreadcrumbs, updateCurrentTabData } from '../utils/tabNavigation';

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

const TreeItem: React.FC<TreeItemProps> = ({ node, level, parentSize, onNavigate, maxInitialChildren = 100 }) => {
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

  return (
    <>
      <ListItem
        disablePadding
        sx={{
          pl: level * 2,
          borderLeft: level > 0 ? '1px solid' : 'none',
          borderColor: 'divider',
        }}
      >
        <ListItemButton onClick={handleClick} onDoubleClick={handleNavigate} onContextMenu={handleContextMenu}>
          <ListItemIcon sx={{ minWidth: 36 }}>
            {/* 目录或文件显示不同的图标 */}
            {node.is_dir ? (
              hasChildren ? (
                expanded ? <ExpandMore /> : <ChevronRight />
              ) : (
                <Folder color="primary" />
              )
            ) : (
              <InsertDriveFile color="action" />
            )}
          </ListItemIcon>
          <ListItemText
            primary={
              <Box sx={{ display: 'flex', alignItems: 'center', gap: 1 }}>
                <Typography variant="body2" sx={{ flex: 1 }} noWrap>
                  {node.name}
                </Typography>
                <Typography variant="caption" color="text.secondary" sx={{ minWidth: 80, textAlign: 'right' }}>
                  {formatBytes(node.size)}
                </Typography>
                {node.is_dir ? (
                  <>
                    <Typography variant="caption" color="text.secondary" sx={{ minWidth: 60, textAlign: 'right' }}>
                      {formatPercentage(node.size, parentSize)}
                    </Typography>
                    <Typography variant="caption" color="text.secondary" sx={{ minWidth: 80, textAlign: 'right' }}>
                      {(node.file_count || 0).toLocaleString()} {t('fileList.files')}
                    </Typography>
                  </>
                ) : (
                  <Box sx={{ minWidth: 140 }} />
                )}
                <Typography variant="caption" color="text.secondary" sx={{ minWidth: 100, textAlign: 'right' }}>
                  {formatDate(node.modified_time, t)}
                </Typography>
              </Box>
            }
          />
        </ListItemButton>
      </ListItem>
      {/* 扩展时显示子项 */}
      {hasChildren && expanded && (
        <List component="div" disablePadding>
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
          {/* 加载更多项的按钮 */}
          {hasMore && (
            <ListItem sx={{ pl: (level + 1) * 2 }}>
              <Button
                size="small"
                startIcon={<ExpandCircleDown />}
                onClick={() => setDisplayCount(prev => Math.min(prev + 100, sortedChildren.length))}
                sx={{ textTransform: 'none' }}
              >
                {t('fileList.showMore', { count: sortedChildren.length - displayCount })}
              </Button>
            </ListItem>
          )}
        </List>
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
          {t('fileList.openInExplorer')}
        </MenuItem>
      </Menu>
    </>
  );
};

export const FileList: React.FC = () => {
  const { t } = useTranslation();
  const tGrouping = useCallback((key: string) => t(key), [t]);
  const activeTabId = useTabStore((state) => state.activeTabId);
  const tabs = useTabStore((state) => state.tabs);
  const activeTab = React.useMemo(() => tabs.find((tab) => tab.id === activeTabId) || null, [tabs, activeTabId]);
  
  const currentNode = activeTab?.data?.currentNode || null;
  const scanResult = activeTab?.data?.scanResult || null;
  const breadcrumbs = activeTab?.data?.breadcrumbs || [];
  const sortField = activeTab?.data?.sortField || 'size';
  const sortOrder = activeTab?.data?.sortOrder || 'desc';
  const groupBy = activeTab?.data?.groupBy || 'none';
  const flatGrouping = activeTab?.data?.flatGrouping || false;

  const setSortField = (field: any) => {
    updateCurrentTabData({ sortField: field });
  };

  const setSortOrder = (order: any) => {
    updateCurrentTabData({ sortOrder: order });
  };
  
  const [displayCount, setDisplayCount] = useState(100);

  const displayNode = currentNode || scanResult;

  const driveLabel = React.useMemo(() => {
    const rootPath = scanResult?.path || '';
    const match = rootPath.match(/^([A-Za-z]):/);
    if (match?.[1]) return match[1].toUpperCase();
    return t('treemapView.root');
  }, [scanResult?.path, t]);

  const handleNavigate = (node: FileNode) => {
    updateCurrentTabData({
      currentNode: node,
      breadcrumbs: buildBreadcrumbs(scanResult, node.path),
    });
  };

  const handleBreadcrumbClick = (index: number) => {
    if (index === -1) {
      updateCurrentTabData({ currentNode: scanResult, breadcrumbs: [] });
    } else {
      const newBreadcrumbs = breadcrumbs.slice(0, index + 1);
      updateCurrentTabData({ currentNode: newBreadcrumbs[index], breadcrumbs: newBreadcrumbs });
    }
  };

  const handleSortFieldChange = (event: SelectChangeEvent) => {
    setSortField(event.target.value as any);
  };

  const handleSortOrderChange = (event: SelectChangeEvent) => {
    setSortOrder(event.target.value as any);
  };

  if (!displayNode) {
    return (
      <Paper elevation={3} sx={{ p: 3 }}>
        <Typography variant="h6" color="text.secondary">
          {t('fileList.noData')}
        </Typography>
      </Paper>
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

  return (
    <Paper 
      elevation={0} 
      sx={{ 
        mt: 3,
        background: alpha('#ffffff', 0.15),
        backdropFilter: 'blur(10px)',
        border: `1px solid ${alpha('#ffffff', 0.2)}`,
        borderRadius: 2,
      }}
    >
      <Stack spacing={2} sx={{ p: 2, pb: 0 }}>
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
        </Box>
      </Stack>

      <Box sx={{ p: 2, display: 'flex', alignItems: 'center', borderBottom: `1px solid ${alpha('#ffffff', 0.2)}`, gap: 2, flexWrap: 'wrap' }}>
        {/* 排序选项 */}
        <Box sx={{ display: 'flex', alignItems: 'center', gap: 1.5 }}>
          <FormControl size="small" sx={{ minWidth: 120 }}>
            <Select 
              value={sortField} 
              onChange={handleSortFieldChange}
              sx={{
                color: 'white',
                '.MuiOutlinedInput-notchedOutline': {
                  borderColor: alpha('#ffffff', 0.3),
                },
                '&:hover .MuiOutlinedInput-notchedOutline': {
                  borderColor: alpha('#ffffff', 0.5),
                },
                '&.Mui-focused .MuiOutlinedInput-notchedOutline': {
                  borderColor: 'white',
                },
                '.MuiSvgIcon-root': {
                  color: 'white',
                },
              }}
              MenuProps={{
                transitionDuration: 120,
                PaperProps: {
                  sx: {
                    background: alpha('#1a1a2e', 0.95),
                    backdropFilter: 'blur(20px)',
                    border: `1px solid ${alpha('#ffffff', 0.2)}`,
                    '& .MuiMenuItem-root': {
                      color: 'white',
                      transition: 'background-color 80ms ease',
                      '&:hover': {
                        background: alpha('#ffffff', 0.1),
                      },
                      '&.Mui-selected': {
                        background: alpha('#ffffff', 0.2),
                        '&:hover': {
                          background: alpha('#ffffff', 0.25),
                        },
                      },
                    },
                  },
                },
              }}
            >
              <MenuItem disableRipple value="name">{t('sortOptions.name')}</MenuItem>
              <MenuItem disableRipple value="size">{t('sortOptions.size')}</MenuItem>
              <MenuItem disableRipple value="modified">{t('sortOptions.modified')}</MenuItem>
              <MenuItem disableRipple value="fileCount">{t('sortOptions.fileCount')}</MenuItem>
            </Select>
          </FormControl>
          <FormControl size="small" sx={{ minWidth: 100 }}>
            <Select 
              value={sortOrder} 
              onChange={handleSortOrderChange}
              sx={{
                color: 'white',
                '.MuiOutlinedInput-notchedOutline': {
                  borderColor: alpha('#ffffff', 0.3),
                },
                '&:hover .MuiOutlinedInput-notchedOutline': {
                  borderColor: alpha('#ffffff', 0.5),
                },
                '&.Mui-focused .MuiOutlinedInput-notchedOutline': {
                  borderColor: 'white',
                },
                '.MuiSvgIcon-root': {
                  color: 'white',
                },
              }}
              MenuProps={{
                transitionDuration: 120,
                PaperProps: {
                  sx: {
                    background: alpha('#1a1a2e', 0.95),
                    backdropFilter: 'blur(20px)',
                    border: `1px solid ${alpha('#ffffff', 0.2)}`,
                    '& .MuiMenuItem-root': {
                      color: 'white',
                      transition: 'background-color 80ms ease',
                      '&:hover': {
                        background: alpha('#ffffff', 0.1),
                      },
                      '&.Mui-selected': {
                        background: alpha('#ffffff', 0.2),
                        '&:hover': {
                          background: alpha('#ffffff', 0.25),
                        },
                      },
                    },
                  },
                },
              }}
            >
              <MenuItem disableRipple value="asc">{t('sortOptions.ascending')}</MenuItem>
              <MenuItem disableRipple value="desc">{t('sortOptions.descending')}</MenuItem>
            </Select>
          </FormControl>
        </Box>
        
        <Box sx={{ display: 'flex', gap: 1, ml: 'auto' }}>
          <Chip 
            label={`${formatBytes(displayNode.size || 0)}`} 
            size="small"
            sx={{
              background: alpha('#ffffff', 0.2),
              color: 'white',
              border: `1px solid ${alpha('#ffffff', 0.3)}`,
            }}
          />
          <Chip 
            label={`${(displayNode.file_count || 0).toLocaleString()} ${t('fileList.files')}`} 
            size="small"
            sx={{
              background: alpha('#ffffff', 0.2),
              color: 'white',
              border: `1px solid ${alpha('#ffffff', 0.3)}`,
            }}
          />
          <Chip 
            label={`${(displayNode.dir_count || 0).toLocaleString()} ${t('fileList.folders')}`} 
            size="small"
            sx={{
              background: alpha('#ffffff', 0.2),
              color: 'white',
              border: `1px solid ${alpha('#ffffff', 0.3)}`,
            }}
          />
        </Box>
      </Box>

      <Box sx={{ maxHeight: 500, overflow: 'auto' }}>
        {/* 表头行 */}
        <Box
          sx={{
            display: 'flex',
            alignItems: 'center',
            px: 2,
            py: 1,
            background: alpha('#ffffff', 0.15),
            backdropFilter: 'blur(20px)',
            borderBottom: `1px solid ${alpha('#ffffff', 0.2)}`,
            position: 'sticky',
            top: 0,
            zIndex: 100,
          }}
        >
          <Box sx={{ flex: 1, minWidth: 0 }}>
            <Typography variant="caption" fontWeight="bold" sx={{ color: 'white' }}>
              {t('fileList.name')}
            </Typography>
          </Box>
          <Typography variant="caption" fontWeight="bold" sx={{ minWidth: 100, textAlign: 'right', mr: 1, color: 'white' }}>
            {t('fileList.size')}
          </Typography>
          <Typography variant="caption" fontWeight="bold" sx={{ minWidth: 60, textAlign: 'right', mr: 1, color: 'white' }}>
            {t('fileList.percentage')}
          </Typography>
          <Typography variant="caption" fontWeight="bold" sx={{ minWidth: 80, textAlign: 'right', mr: 1, color: 'white' }}>
            {t('fileList.fileCount')}
          </Typography>
          <Typography variant="caption" fontWeight="bold" sx={{ minWidth: 100, textAlign: 'right', color: 'white' }}>
            {t('fileList.modifiedTime')}
          </Typography>
        </Box>
        
        <List dense>
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
            <ListItem>
              <Button
                size="small"
                startIcon={<ExpandCircleDown />}
                onClick={() => setDisplayCount(prev => Math.min(prev + 100, sortedChildren.length))}
                sx={{ textTransform: 'none' }}
              >
                {t('fileList.showMore', { count: sortedChildren.length - displayCount })}
              </Button>
            </ListItem>
          )}
        </List>
      </Box>
    </Paper>
  );
};
