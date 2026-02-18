import React, {useCallback, useEffect, useMemo, useRef, useState} from 'react';
import {
  alpha,
  Box,
  Chip,
  CircularProgress,
  Dialog,
  DialogContent,
  DialogTitle,
  FormControl,
  FormControlLabel,
  IconButton,
  Menu,
  MenuItem,
  Select,
  Slider,
  Switch,
  Tab,
  Tabs,
  Tooltip,
  Typography,
} from '@mui/material';
import {BarChart2, ChevronRight, Copy, FolderOpen, History, Home, List, TrendingUp, X} from 'lucide-react';
import {invoke} from '@tauri-apps/api/core';
import {useTranslation} from 'react-i18next';
import {useSnapshotStore} from '../store/snapshotStore';
import {useTabStore} from '../store/tabStore';
import {formatBytes} from '../utils/format';
import type {DiffEntry, DiffKind, SnapshotMeta} from '../services/snapshotService';
import {listSnapshots} from '../services/snapshotService';

const KIND_COLORS: Record<DiffKind, string> = {
  added: '#22c55e',
  removed: '#ef4444',
  grown: '#3b82f6',
  shrunk: '#6b7280',
};

const KIND_BG: Record<DiffKind, string> = {
  added: alpha('#22c55e', 0.15),
  removed: alpha('#ef4444', 0.15),
  grown: alpha('#3b82f6', 0.15),
  shrunk: alpha('#6b7280', 0.12),
};

function grownColor(delta: number, maxDelta: number): string {
  if (maxDelta <= 0) return KIND_COLORS.grown;
  const ratio = Math.min(delta / maxDelta, 1);
  return `rgb(30, ${Math.round(80 + ratio * 40)}, ${Math.round(100 + ratio * 155)})`;
}

/** 统一路径分隔符为 '/'，去掉末尾斜杠 */
function normPath(p: string): string {
  return p.replace(/\\/g, '/').replace(/\/$/, '');
}

/**
 * 获取当前层级的虚拟直接子项
 *
 */
function getDirectChildren(entries: DiffEntry[], currentPath: string): DiffEntry[] {
  if (!entries.length) return [];

  let cur = normPath(currentPath);

  if (!cur) {
    // 找所有 entries 中最短的非空父路径
    const parents = entries
      .map(e => {
        const p = normPath(e.path);
        const idx = p.lastIndexOf('/');
        return idx >= 0 ? p.slice(0, idx) : '';
      })
      .filter(p => p.length > 0);

    if (!parents.length) return [];

    const minLen = Math.min(...parents.map(p => p.length));
    const roots = [...new Set(parents.filter(p => p.length === minLen))];
    cur = roots.length === 1 ? roots[0] : roots.reduce((a, b) => {
      let i = 0;
      while (i < a.length && i < b.length && a[i] === b[i]) i++;
      return a.slice(0, i).replace(/\/$/, '');
    });
  }

  const prefix = cur + '/';

  // 按"下一级路径段"聚合所有以 prefix 开头的 entries
  // key = cur + '/' + 下一级名称
  const groups = new Map<string, { entries: DiffEntry[]; isDir: boolean; name: string }>();

  for (const e of entries) {
    const p = normPath(e.path);
    if (!p.startsWith(prefix)) continue;

    const rest = p.slice(prefix.length); // 去掉前缀后的剩余路径
    const slashIdx = rest.indexOf('/');
    const childName = slashIdx >= 0 ? rest.slice(0, slashIdx) : rest;
    const childPath = prefix + childName;
    const isDir = slashIdx >= 0 || e.is_dir; // 有子路径说明是目录

    if (!groups.has(childPath)) {
      groups.set(childPath, { entries: [], isDir, name: childName });
    }
    groups.get(childPath)!.entries.push(e);
  }

  // 每组合并为一个虚拟 DiffEntry
  const result: DiffEntry[] = [];
  for (const [childPath, group] of groups) {
    const { entries: grpEntries, isDir, name } = group;

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

interface DiffRect {
  x: number; y: number; width: number; height: number;
  entry: DiffEntry; color: string;
}

type SnapshotGroupBy = 'none' | 'type' | 'extension';

function isVirtualGroupPath(path: string): boolean {
  return path.startsWith('__group__:');
}

function parseVirtualGroupPath(path: string): { groupBy: SnapshotGroupBy; scopePath: string; groupKey: string } | null {
  if (!isVirtualGroupPath(path)) return null;
  const parts = path.split(':');
  if (parts.length < 4) return null;

  const groupBy = parts[1] as SnapshotGroupBy;
  const scopeRaw = parts[2] || '__root__';
  const groupKey = parts.slice(3).join(':');
  const scopePath = scopeRaw === '__root__' ? '' : decodeURIComponent(scopeRaw);

  return { groupBy, scopePath, groupKey };
}

function getSnapshotTypeKey(name: string): string {
  const ext = name.toLowerCase().split('.').pop() || '';
  const imageExts = ['jpg', 'jpeg', 'png', 'gif', 'bmp', 'svg', 'webp', 'ico'];
  const videoExts = ['mp4', 'avi', 'mkv', 'mov', 'wmv', 'flv', 'webm'];
  const audioExts = ['mp3', 'wav', 'flac', 'aac', 'ogg', 'wma'];
  const docExts = ['pdf', 'doc', 'docx', 'txt', 'rtf', 'odt'];
  const codeExts = ['js', 'ts', 'jsx', 'tsx', 'py', 'java', 'cpp', 'c', 'h', 'css', 'html', 'xml', 'json'];

  if (imageExts.includes(ext)) return 'image';
  if (videoExts.includes(ext)) return 'video';
  if (audioExts.includes(ext)) return 'audio';
  if (docExts.includes(ext)) return 'document';
  if (codeExts.includes(ext)) return 'source';
  return 'other';
}
function groupDiffEntriesWithScope(entries: DiffEntry[], groupBy: SnapshotGroupBy, scopePath: string, t: (key: string) => string): DiffEntry[] {
  if (groupBy === 'none' || entries.length === 0) return entries;

  const files = entries.filter((e) => !e.is_dir && !isVirtualGroupPath(e.path));
  const dirs = entries.filter((e) => e.is_dir && !isVirtualGroupPath(e.path));
  if (files.length === 0) return dirs;

  const groups = new Map<string, DiffEntry[]>();
  for (const file of files) {
    const key = groupBy === 'type'
      ? getSnapshotTypeKey(file.name)
      : (file.name.split('.').pop()?.toUpperCase() || 'NO_EXT');
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

    let displayName = groupKey;
    if (groupBy === 'type') {
      const nameMap: Record<string, string> = {
        image: t('fileType.image'),
        video: t('fileType.video'),
        audio: t('fileType.audio'),
        document: t('fileType.document'),
        source: t('fileType.source'),
        other: t('fileType.other'),
      };
      displayName = nameMap[groupKey] || groupKey;
    } else {
      displayName = groupKey === 'NO_EXT' ? t('grouping.noExtension') : `.${groupKey.toLowerCase()}`;
    }

    groupedNodes.push({
      path: `__group__:${groupBy}:${encodedScope}:${groupKey}`,
      name: `📁 ${displayName}`,
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

function getEntriesInVirtualGroup(entries: DiffEntry[], virtualPath: string): DiffEntry[] {
  const parsed = parseVirtualGroupPath(virtualPath);
  if (!parsed) return [];

  return entries
    .filter((e) => !e.is_dir && !isVirtualGroupPath(e.path))
    .filter((e) => {
      if (parsed.groupBy === 'type') {
        return getSnapshotTypeKey(e.name) === parsed.groupKey;
      }
      const ext = e.name.split('.').pop()?.toUpperCase() || 'NO_EXT';
      return ext === parsed.groupKey;
    })
    .sort((a, b) => Math.abs(b.size_delta) - Math.abs(a.size_delta));
}

function getFlatFiles(entries: DiffEntry[], currentPath: string): DiffEntry[] {
  if (!currentPath) return entries.filter((e) => !e.is_dir && !isVirtualGroupPath(e.path));
  const prefix = normPath(currentPath) + '/';
  return entries.filter((e) => !e.is_dir && !isVirtualGroupPath(e.path) && normPath(e.path).startsWith(prefix));
}

function getVirtualGroupDisplayName(parsed: { groupBy: SnapshotGroupBy; scopePath: string; groupKey: string }, t?: (key: string) => string): string {
  if (parsed.groupBy === 'type') {
    const typeNameMap: Record<string, string> = {
      image: t ? t('fileType.image') : '图片',
      video: t ? t('fileType.video') : '视频',
      audio: t ? t('fileType.audio') : '音频',
      document: t ? t('fileType.document') : '文档',
      source: t ? t('fileType.source') : '源代码',
      other: t ? t('fileType.other') : '其他',
    };
    return `📁 ${typeNameMap[parsed.groupKey] || parsed.groupKey}`;
  }

  return parsed.groupKey === 'NO_EXT'
    ? `📁 ${t ? t('grouping.noExtension') : '无扩展名'}`
    : `📁 .${parsed.groupKey.toLowerCase()}`;
}

function layoutDiffRects(entries: DiffEntry[], w: number, h: number): DiffRect[] {
  if (!entries.length || w <= 0 || h <= 0) return [];
  const maxDelta = Math.max(...entries.filter(e => e.kind === 'grown').map(e => e.size_delta), 0);
  const sorted = [...entries]
    .sort((a, b) => Math.abs(b.size_delta) - Math.abs(a.size_delta))
    .slice(0, 120);
  const getLogArea = (e: DiffEntry) => Math.log10(Math.abs(e.size_delta) + 2);
  const totalArea = sorted.reduce((s, e) => s + getLogArea(e), 0);
  if (totalArea <= 0) return [];
  const rects: DiffRect[] = [];

  const squarify = (items: DiffEntry[], x: number, y: number, width: number, height: number) => {
    if (!items.length || width <= 0 || height <= 0) return;
    const getArea = (e: DiffEntry) => (getLogArea(e) / totalArea) * w * h;
    if (items.length === 1) {
      const e = items[0];
      rects.push({ x, y, width, height, entry: e, color: e.kind === 'grown' ? grownColor(e.size_delta, maxDelta) : KIND_COLORS[e.kind] });
      return;
    }
    const total = items.reduce((s, e) => s + getArea(e), 0);
    const shortSide = Math.min(width, height);
    const worstAR = (row: DiffEntry[], side: number): number => {
      if (side <= 0) return Infinity;
      const rowSum = row.reduce((s, e) => s + getArea(e), 0);
      const rowArea = (rowSum / total) * width * height;
      const rowShort = rowArea / side;
      if (rowShort <= 0) return Infinity;
      let worst = 0;
      for (const e of row) {
        const a = (getArea(e) / total) * width * height;
        const long = a / rowShort;
        worst = Math.max(worst, Math.max(long / rowShort, rowShort / long));
      }
      return worst;
    };
    const row: DiffEntry[] = [];
    let remaining = [...items];
    while (remaining.length > 0) {
      const item = remaining[0];
      if (row.length === 0) { row.push(item); remaining.shift(); }
      else {
        const next = worstAR([...row, item], shortSide);
        if (next <= worstAR(row, shortSide)) { row.push(item); remaining.shift(); }
        else break;
      }
    }
    const rowSum = row.reduce((s, e) => s + getArea(e), 0);
    const rowRatio = rowSum / total;
    const layoutRow = (rowItems: DiffEntry[], rx: number, ry: number, rw: number, rh: number, horiz: boolean) => {
      const rTotal = rowItems.reduce((s, e) => s + getArea(e), 0);
      let offset = 0;
      for (const e of rowItems) {
        const ratio = getArea(e) / rTotal;
        const color = e.kind === 'grown' ? grownColor(e.size_delta, maxDelta) : KIND_COLORS[e.kind];
        if (horiz) { const ih = rh * ratio; if (ih > 0) rects.push({ x: rx, y: ry + offset, width: rw, height: ih, entry: e, color }); offset += ih; }
        else { const iw = rw * ratio; if (iw > 0) rects.push({ x: rx + offset, y: ry, width: iw, height: rh, entry: e, color }); offset += iw; }
      }
    };
    if (width >= height) {
      const rowW = width * rowRatio;
      layoutRow(row, x, y, rowW, height, true);
      if (remaining.length > 0) squarify(remaining, x + rowW, y, width - rowW, height);
    } else {
      const rowH = height * rowRatio;
      layoutRow(row, x, y, width, rowH, false);
      if (remaining.length > 0) squarify(remaining, x, y + rowH, width, height - rowH);
    }
  };
  squarify(sorted, 0, 0, w, h);
  return rects;
}

interface DiffTreemapProps {
  entries: DiffEntry[];
  currentPath: string;
  showFilesOnly: boolean;
  groupBy: SnapshotGroupBy;
  flatGrouping: boolean;
  onNavigate: (path: string) => void;
  onOpenExplorer: (path: string) => void;
  onViewTrend: (entry: DiffEntry) => void;
}

const DiffTreemap: React.FC<DiffTreemapProps> = ({ entries, currentPath, showFilesOnly, groupBy, flatGrouping, onNavigate, onOpenExplorer, onViewTrend }) => {
  const { t } = useTranslation();
  const containerRef = useRef<HTMLDivElement>(null);
  const tooltipRef = useRef<HTMLDivElement>(null);
  const tooltipPosRef = useRef({ x: 0, y: 0 });
  const rafRef = useRef<number | null>(null);
  const [size, setSize] = useState({ w: 0, h: 0 });
  const [hovered, setHovered] = useState<DiffRect | null>(null);
  const [ctxMenu, setCtxMenu] = useState<{ mouseX: number; mouseY: number; entry: DiffEntry } | null>(null);

  // 过滤出当前层级的直接子项
  const visibleEntries = useMemo(() => {
    const virtual = parseVirtualGroupPath(currentPath);
    if (virtual) {
      const scopeBase = (showFilesOnly || flatGrouping)
        ? getFlatFiles(entries, virtual.scopePath)
        : getDirectChildren(entries, virtual.scopePath);
      return getEntriesInVirtualGroup(scopeBase, currentPath);
    }

    const base = (showFilesOnly || flatGrouping)
      ? getFlatFiles(entries, currentPath)
      : getDirectChildren(entries, currentPath);
    return groupDiffEntriesWithScope(base, groupBy, currentPath, t);
  }, [entries, currentPath, showFilesOnly, groupBy, flatGrouping, t]);

  useEffect(() => {
    const update = () => {
      if (containerRef.current) setSize({ w: containerRef.current.clientWidth, h: containerRef.current.clientHeight });
    };
    update();
    window.addEventListener('resize', update);
    const timer = setTimeout(update, 100);
    return () => { window.removeEventListener('resize', update); clearTimeout(timer); };
  }, [visibleEntries]);

  const rects = useMemo(() => layoutDiffRects(visibleEntries, size.w, size.h), [visibleEntries, size]);

  const updateTooltip = useCallback((e: React.MouseEvent<SVGRectElement>) => {
    tooltipPosRef.current = { x: e.clientX, y: e.clientY };
    if (rafRef.current !== null) return;
    rafRef.current = requestAnimationFrame(() => {
      rafRef.current = null;
      const el = tooltipRef.current;
      if (!el) return;
      el.style.transform = `translate(${tooltipPosRef.current.x + 15}px, ${tooltipPosRef.current.y + 15}px)`;
    });
  }, []);

  useEffect(() => () => { if (rafRef.current) cancelAnimationFrame(rafRef.current); }, []);

  const handleRectClick = useCallback((r: DiffRect) => {
    if (r.entry.is_dir) onNavigate(r.entry.path);
  }, [onNavigate]);

  const handleRectContextMenu = useCallback((e: React.MouseEvent, r: DiffRect) => {
    e.preventDefault();
    setCtxMenu({ mouseX: e.clientX, mouseY: e.clientY, entry: r.entry });
  }, []);

  if (!visibleEntries.length) {
    return (
      <div className="flex items-center justify-center h-full">
        <Typography sx={{ color: alpha('#ffffff', 0.4) }}>{t('snapshot.noDiff')}</Typography>
      </div>
    );
  }

  return (
    <div ref={containerRef} className="w-full h-full relative overflow-hidden"
      style={{ background: alpha('#ffffff', 0.04) }}>
      <svg width="100%" height="100%" viewBox={`0 0 ${size.w} ${size.h}`} preserveAspectRatio="none">
        {rects.map((r, i) => {
          const isHov = hovered?.entry.path === r.entry.path;
          const fs = Math.max(9, Math.min(13, Math.min(r.width / 10, r.height / 3.5)));
          const maxChars = Math.floor(r.width / (fs * 0.55));
          let name = r.entry.name;
          if (name.length > maxChars && maxChars > 3) name = name.slice(0, maxChars - 3) + '…';
          const isDir = r.entry.is_dir;
          return (
            <g key={`${r.entry.path}-${i}`} onClick={() => handleRectClick(r)} style={{ cursor: isDir ? 'pointer' : 'default' }}
              onContextMenu={(e) => handleRectContextMenu(e, r)}>
              <rect x={r.x} y={r.y} width={r.width} height={r.height}
                fill={r.color} stroke={alpha('#000', 0.4)} strokeWidth={1}
                opacity={isHov ? 1 : 0.82} style={{ transition: 'opacity 0.15s' }}
                onMouseEnter={(e) => { setHovered(r); updateTooltip(e); }}
                onMouseMove={updateTooltip} onMouseLeave={() => setHovered(null)} />
              {r.width > 28 && r.height > 18 && (
                <text x={r.x + r.width / 2} y={r.y + r.height / 2}
                  textAnchor="middle" dominantBaseline="middle"
                  fill="#fff" fontSize={fs} fontWeight="600"
                  style={{ pointerEvents: 'none', userSelect: 'none', textShadow: '0 1px 3px rgba(0,0,0,0.9)' }}>
                  {name}
                </text>
              )}
            </g>
          );
        })}
      </svg>
      <div className="absolute bottom-2 right-2 flex gap-2 flex-wrap">
        {(['added', 'removed', 'grown', 'shrunk'] as DiffKind[]).map((k) => (
          <div key={k} className="flex items-center gap-1 px-2 py-0.5 rounded text-xs"
            style={{ background: alpha('#000', 0.6), color: KIND_COLORS[k] }}>
            <span className="w-2 h-2 rounded-sm inline-block" style={{ background: KIND_COLORS[k] }} />
            {t(`snapshot.kind.${k}`)}
          </div>
        ))}
      </div>
      {hovered && (
        <Box ref={tooltipRef} sx={{
          position: 'fixed', left: 0, top: 0, pointerEvents: 'none', zIndex: 99999,
          bgcolor: alpha('#18181b', 0.95), backdropFilter: 'blur(12px)',
          border: `1px solid ${alpha('#fff', 0.1)}`, borderRadius: 2,
          p: 1.5, maxWidth: 280, boxShadow: '0 8px 32px rgba(0,0,0,0.6)',
        }}>
          <Typography variant="body2" fontWeight="bold" sx={{ color: 'white', mb: 0.5 }}>{hovered.entry.name}</Typography>
          <Typography variant="caption" display="block" sx={{ color: KIND_COLORS[hovered.entry.kind], mb: 0.5 }}>
            {t(`snapshot.kind.${hovered.entry.kind}`)}
            {hovered.entry.is_dir && <span style={{ color: alpha('#fff', 0.4), marginLeft: 4 }}>({t('snapshot.clickToEnter')})</span>}
          </Typography>
          {hovered.entry.size_a > 0 && <Typography variant="caption" display="block" sx={{ color: alpha('#fff', 0.6) }}>OLD: {formatBytes(hovered.entry.size_a)}</Typography>}
          {hovered.entry.size_b > 0 && <Typography variant="caption" display="block" sx={{ color: alpha('#fff', 0.6) }}>NEW: {formatBytes(hovered.entry.size_b)}</Typography>}
          <Typography variant="caption" display="block" sx={{ color: alpha('#fff', 0.8), fontWeight: 600 }}>
            Δ {hovered.entry.size_delta >= 0 ? '+' : ''}{formatBytes(Math.abs(hovered.entry.size_delta))}
          </Typography>
        </Box>
      )}
      {/* Treemap 右键菜单 */}
      <Menu
        open={ctxMenu !== null}
        onClose={() => setCtxMenu(null)}
        anchorReference="anchorPosition"
        anchorPosition={ctxMenu ? { top: ctxMenu.mouseY, left: ctxMenu.mouseX } : undefined}
        PaperProps={{ sx: { bgcolor: alpha('#1c1c1e', 0.98), border: `1px solid ${alpha('#ffffff', 0.1)}`, borderRadius: 2, minWidth: 180 } }}
      >
        <MenuItem
          disabled={ctxMenu ? isVirtualGroupPath(ctxMenu.entry.path) : false}
          onClick={() => {
            if (ctxMenu && !isVirtualGroupPath(ctxMenu.entry.path)) onOpenExplorer(ctxMenu.entry.path);
            setCtxMenu(null);
          }}
          sx={{ color: alpha('#ffffff', 0.8), fontSize: 13, gap: 1.5, '&:hover': { bgcolor: alpha('#ffffff', 0.08) } }}>
          <FolderOpen size={16} style={{ color: '#60a5fa' }} />
          {t('snapshot.openInExplorer')}
        </MenuItem>
        <MenuItem
          disabled={ctxMenu ? isVirtualGroupPath(ctxMenu.entry.path) : false}
          onClick={() => {
            if (ctxMenu && !isVirtualGroupPath(ctxMenu.entry.path)) onViewTrend(ctxMenu.entry);
            setCtxMenu(null);
          }}
          sx={{ color: alpha('#ffffff', 0.8), fontSize: 13, gap: 1.5, '&:hover': { bgcolor: alpha('#ffffff', 0.08) } }}>
          <TrendingUp size={16} style={{ color: '#a78bfa' }} />
          {t('snapshot.viewTrend')}
        </MenuItem>
      </Menu>
    </div>
  );
};

interface DiffListProps {
  entries: DiffEntry[];
  showFilesOnly: boolean;
  currentPath: string;
  groupBy: SnapshotGroupBy;
  flatGrouping: boolean;
  onNavigate: (path: string) => void;
  onOpenExplorer: (path: string) => void;
  onViewTrend: (entry: DiffEntry) => void;
}

const DiffList: React.FC<DiffListProps> = ({ entries, showFilesOnly, currentPath, groupBy, flatGrouping, onNavigate, onOpenExplorer, onViewTrend }) => {
  const { t } = useTranslation();
  const [displayCount, setDisplayCount] = useState(100);
  const [ctxMenu, setCtxMenu] = useState<{ mouseX: number; mouseY: number; entry: DiffEntry } | null>(null);

  // Files Only 扁平化显示所有文件
  const visibleEntries = useMemo(() => {
    const virtual = parseVirtualGroupPath(currentPath);
    if (virtual) {
      const scopeBase = (showFilesOnly || flatGrouping)
        ? getFlatFiles(entries, virtual.scopePath)
        : getDirectChildren(entries, virtual.scopePath);
      return getEntriesInVirtualGroup(scopeBase, currentPath);
    }

    const base = (showFilesOnly || flatGrouping)
      ? getFlatFiles(entries, currentPath)
      : getDirectChildren(entries, currentPath);
    return groupDiffEntriesWithScope(base, groupBy, currentPath, t);
  }, [entries, currentPath, showFilesOnly, groupBy, flatGrouping, t]);

  useEffect(() => { setDisplayCount(100); }, [visibleEntries]);

  const displayed = visibleEntries.slice(0, displayCount);

  const listBreadcrumbs = useMemo(() => buildBreadcrumbs(currentPath, t), [currentPath, t]);

  return (
    <div className="w-full h-full flex flex-col overflow-hidden">
      {/* List View 面包屑 */}
      {!showFilesOnly && (
        <div className="flex items-center gap-1 px-3 py-1.5 shrink-0 flex-wrap"
          style={{ borderBottom: `1px solid ${alpha('#ffffff', 0.06)}`, background: alpha('#ffffff', 0.03) }}>
          <Tooltip title={t('snapshot.backToRoot')}>
            <IconButton size="small" onClick={() => onNavigate('')}
              sx={{ color: currentPath ? alpha('#ffffff', 0.7) : alpha('#ffffff', 0.3), p: 0.25 }}>
              <Home size={14} />
            </IconButton>
          </Tooltip>
          {listBreadcrumbs.map((crumb, i) => (
            <React.Fragment key={crumb.path}>
              <ChevronRight size={12} style={{ color: alpha('#ffffff', 0.3) }} />
              <button onClick={() => onNavigate(crumb.path)}
                className="text-xs px-1 py-0.5 rounded transition-all"
                style={{
                  color: i === listBreadcrumbs.length - 1 ? 'white' : alpha('#ffffff', 0.55),
                  fontWeight: i === listBreadcrumbs.length - 1 ? 600 : 400,
                  background: i === listBreadcrumbs.length - 1 ? alpha('#ffffff', 0.08) : 'transparent',
                }}>
                {crumb.label}
              </button>
            </React.Fragment>
          ))}
          {currentPath && (
            <Tooltip title={t('snapshot.copyPath')}>
              <IconButton size="small"
                onClick={() => navigator.clipboard.writeText(currentPath.replace(/\//g, '\\'))}
                sx={{ color: alpha('#ffffff', 0.35), p: 0.25, ml: 0.5, '&:hover': { color: '#a78bfa' } }}>
                <Copy size={12} />
              </IconButton>
            </Tooltip>
          )}
        </div>
      )}
      <div className="grid text-xs font-semibold px-4 py-2 sticky top-0 z-10"
        style={{ gridTemplateColumns: '1fr 80px 80px 80px 90px', background: alpha('#ffffff', 0.08), color: alpha('#ffffff', 0.5), borderBottom: `1px solid ${alpha('#ffffff', 0.08)}` }}>
        <span>{t('fileList.name')}</span>
        <span className="text-right">{t('snapshot.sizeA')}</span>
        <span className="text-right">{t('snapshot.sizeB')}</span>
        <span className="text-right">{t('snapshot.delta')}</span>
        <span className="text-right">{t('snapshot.changeType')}</span>
      </div>
      <div className="flex-1 overflow-y-auto custom-scrollbar">
        {displayed.map((entry, idx) => (
          <div key={entry.path}
            onClick={() => entry.is_dir && onNavigate(entry.path)}
            onContextMenu={(e) => { e.preventDefault(); setCtxMenu({ mouseX: e.clientX, mouseY: e.clientY, entry }); }}
            className="grid items-center px-4 py-2 text-sm transition-colors"
            style={{
              gridTemplateColumns: '1fr 80px 80px 80px 90px',
              background: idx % 2 === 0 ? alpha('#ffffff', 0.02) : 'transparent',
              borderBottom: `1px solid ${alpha('#ffffff', 0.04)}`,
              cursor: entry.is_dir ? 'pointer' : 'default',
            }}
            onMouseEnter={e => { (e.currentTarget as HTMLDivElement).style.background = alpha('#ffffff', 0.06); }}
            onMouseLeave={e => { (e.currentTarget as HTMLDivElement).style.background = idx % 2 === 0 ? alpha('#ffffff', 0.02) : 'transparent'; }}
          >
            <div className="flex items-center gap-2 min-w-0">
              <span style={{ color: KIND_COLORS[entry.kind], fontSize: 12 }}>{entry.is_dir ? '📁' : '📄'}</span>
              <span className="truncate" style={{ color: alpha('#ffffff', 0.85) }} title={entry.path}>{entry.name}</span>
            </div>
            <span className="text-right text-xs" style={{ color: alpha('#ffffff', 0.5) }}>{entry.size_a > 0 ? formatBytes(entry.size_a) : '—'}</span>
            <span className="text-right text-xs" style={{ color: alpha('#ffffff', 0.5) }}>{entry.size_b > 0 ? formatBytes(entry.size_b) : '—'}</span>
            <span className="text-right text-xs font-medium" style={{ color: entry.size_delta >= 0 ? '#4ade80' : '#f87171' }}>
              {entry.size_delta >= 0 ? '+' : ''}{formatBytes(Math.abs(entry.size_delta))}
            </span>
            <div className="flex justify-end">
              <Chip label={t(`snapshot.kind.${entry.kind}`)} size="small"
                sx={{ height: 18, fontSize: 10, fontWeight: 600, bgcolor: KIND_BG[entry.kind], color: KIND_COLORS[entry.kind], border: `1px solid ${alpha(KIND_COLORS[entry.kind], 0.3)}` }} />
            </div>
          </div>
        ))}
        {visibleEntries.length > displayCount && (
          <div className="flex justify-center py-3">
            <button onClick={() => setDisplayCount(c => Math.min(c + 100, visibleEntries.length))}
              className="text-sm px-4 py-1.5 rounded-lg border transition-all"
              style={{ color: alpha('#ffffff', 0.6), borderColor: alpha('#ffffff', 0.15), background: alpha('#ffffff', 0.05) }}>
              {t('fileList.showMore', { count: visibleEntries.length - displayCount })}
            </button>
          </div>
        )}
        {visibleEntries.length === 0 && (
          <div className="flex items-center justify-center h-32">
            <Typography sx={{ color: alpha('#ffffff', 0.3), fontSize: 14 }}>{t('snapshot.noDiff')}</Typography>
          </div>
        )}
      </div>
      {/* List 右键菜单 */}
      <Menu
        open={ctxMenu !== null}
        onClose={() => setCtxMenu(null)}
        anchorReference="anchorPosition"
        anchorPosition={ctxMenu ? { top: ctxMenu.mouseY, left: ctxMenu.mouseX } : undefined}
        PaperProps={{ sx: { bgcolor: alpha('#1c1c1e', 0.98), border: `1px solid ${alpha('#ffffff', 0.1)}`, borderRadius: 2, minWidth: 180 } }}
      >
        <MenuItem
          disabled={ctxMenu ? isVirtualGroupPath(ctxMenu.entry.path) : false}
          onClick={() => {
            if (ctxMenu && !isVirtualGroupPath(ctxMenu.entry.path)) onOpenExplorer(ctxMenu.entry.path);
            setCtxMenu(null);
          }}
          sx={{ color: alpha('#ffffff', 0.8), fontSize: 13, gap: 1.5, '&:hover': { bgcolor: alpha('#ffffff', 0.08) } }}>
          <FolderOpen size={16} style={{ color: '#60a5fa' }} />
          {t('snapshot.openInExplorer')}
        </MenuItem>
        <MenuItem
          disabled={ctxMenu ? isVirtualGroupPath(ctxMenu.entry.path) : false}
          onClick={() => {
            if (ctxMenu && !isVirtualGroupPath(ctxMenu.entry.path)) onViewTrend(ctxMenu.entry);
            setCtxMenu(null);
          }}
          sx={{ color: alpha('#ffffff', 0.8), fontSize: 13, gap: 1.5, '&:hover': { bgcolor: alpha('#ffffff', 0.08) } }}>
          <TrendingUp size={16} style={{ color: '#a78bfa' }} />
          {t('snapshot.viewTrend')}
        </MenuItem>
      </Menu>
    </div>
  );
};

const DiffBarChart: React.FC<{ entries: DiffEntry[]; topN: number; showFilesOnly: boolean; currentPath: string; groupBy: SnapshotGroupBy; flatGrouping: boolean }> = ({ entries, topN, showFilesOnly, currentPath, groupBy, flatGrouping }) => {
  const { t } = useTranslation();
  const topEntries = useMemo(() => {
    const virtual = parseVirtualGroupPath(currentPath);
    if (virtual) {
      const scopeBase = (showFilesOnly || flatGrouping)
        ? getFlatFiles(entries, virtual.scopePath)
        : getDirectChildren(entries, virtual.scopePath);
      return getEntriesInVirtualGroup(scopeBase, currentPath)
        .filter(e => e.kind !== 'removed')
        .slice(0, topN);
    }

    const base = (showFilesOnly || flatGrouping)
      ? getFlatFiles(entries, currentPath)
      : getDirectChildren(entries, currentPath);
    const grouped = groupDiffEntriesWithScope(base, groupBy, currentPath, t);
    return grouped.filter(e => e.kind !== 'removed').sort((a, b) => Math.abs(b.size_delta) - Math.abs(a.size_delta)).slice(0, topN);
  }, [entries, topN, showFilesOnly, currentPath, groupBy, flatGrouping, t]);

  if (!topEntries.length) {
    return <div className="flex items-center justify-center h-full"><Typography sx={{ color: alpha('#ffffff', 0.4) }}>{t('snapshot.noDiff')}</Typography></div>;
  }

  const maxAbs = Math.max(...topEntries.map(e => Math.abs(e.size_delta)), 1);

  return (
    <div className="w-full h-full flex flex-col overflow-hidden p-4 gap-2">
      <Typography variant="caption" sx={{ color: alpha('#ffffff', 0.4), mb: 1 }}>{t('snapshot.topNDesc', { n: topN })}</Typography>
      <div className="flex-1 overflow-y-auto custom-scrollbar space-y-2">
        {topEntries.map((entry) => {
          const ratio = Math.abs(entry.size_delta) / maxAbs;
          const barColor = KIND_COLORS[entry.kind];
          return (
            <div key={entry.path} className="flex items-center gap-3">
              <div className="w-36 shrink-0 flex items-center gap-1 min-w-0">
                <span style={{ fontSize: 11, color: alpha('#ffffff', 0.5) }}>{entry.is_dir ? '📁' : '📄'}</span>
                <span className="text-xs truncate" style={{ color: alpha('#ffffff', 0.8) }} title={entry.path}>{entry.name}</span>
              </div>
              <div className="flex-1 relative h-6 rounded overflow-hidden" style={{ background: alpha('#ffffff', 0.06) }}>
                <div className="absolute left-0 top-0 h-full rounded transition-all"
                  style={{ width: `${Math.max(ratio * 100, 2)}%`, background: barColor, opacity: 0.8 }} />
                <span className="absolute right-2 top-0 h-full flex items-center text-xs font-medium" style={{ color: '#fff' }}>
                  {entry.size_delta >= 0 ? '+' : ''}{formatBytes(Math.abs(entry.size_delta))}
                </span>
              </div>
              <Chip label={t(`snapshot.kind.${entry.kind}`)} size="small"
                sx={{ height: 18, fontSize: 10, fontWeight: 600, flexShrink: 0, bgcolor: KIND_BG[entry.kind], color: KIND_COLORS[entry.kind], border: `1px solid ${alpha(KIND_COLORS[entry.kind], 0.3)}` }} />
            </div>
          );
        })}
      </div>
    </div>
  );
};

const StatBadge: React.FC<{ label: string; value: string; color: string }> = ({ label, value, color }) => (
  <div className="flex flex-col items-center px-3 py-1 rounded-lg" style={{ background: alpha('#ffffff', 0.05), border: `1px solid ${alpha('#ffffff', 0.08)}` }}>
    <span className="text-xs font-semibold" style={{ color }}>{value}</span>
    <span className="text-xs" style={{ color: alpha('#ffffff', 0.4) }}>{label}</span>
  </div>
);

// 面包屑路径解析：跳过磁盘符（如 "D:"），直接从子文件夹开始
function buildBreadcrumbs(path: string, t?: (key: string) => string): { label: string; path: string }[] {
  if (!path) return [];

  const virtual = parseVirtualGroupPath(path);
  if (virtual) {
    const base = buildBreadcrumbs(virtual.scopePath, t);
    return [...base, { label: getVirtualGroupDisplayName(virtual, t), path }];
  }

  const parts = path.replace(/\\/g, '/').split('/').filter(Boolean);
  const crumbs: { label: string; path: string }[] = [];
  let cur = '';
  for (const p of parts) {
    cur = cur ? cur + '/' + p : p;
    // 跳过磁盘符（如 "D:"、"C:"），不在面包屑中显示
    if (/^[A-Za-z]:$/.test(p)) continue;
    crumbs.push({ label: p, path: cur });
  }
  return crumbs;
}

// ─── 历史趋势弹窗 ────────────────────────────────────────────────────────────

interface TrendPoint {
  snapshotId: string;
  createdAt: number;  // Unix 秒
  size: number;       // 字节
  label?: string;
}

interface TrendDialogProps {
  open: boolean;
  onClose: () => void;
  entryPath: string;  // 要查看趋势的路径
  trendData: TrendPoint[];
  loading: boolean;
}

const TrendDialog: React.FC<TrendDialogProps> = ({ open, onClose, entryPath, trendData, loading }) => {
  const { t } = useTranslation();

  const W = 700, H = 280, PAD = { top: 20, right: 20, bottom: 50, left: 70 };
  const innerW = W - PAD.left - PAD.right;
  const innerH = H - PAD.top - PAD.bottom;

  const chartData = useMemo(() => {
    if (trendData.length < 2) return null;
    const sorted = [...trendData].sort((a, b) => a.createdAt - b.createdAt);
    const pointCount = sorted.length;
    const minT = sorted[0].createdAt;
    const maxT = sorted[sorted.length - 1].createdAt;
    const maxSize = Math.max(...sorted.map(p => p.size), 1);
    const tRange = maxT - minT || 1;
    const points = sorted.map((p, idx) => {
      const evenCx = PAD.left + (pointCount <= 1 ? 0 : (idx / (pointCount - 1)) * innerW);
      const timeCx = PAD.left + ((p.createdAt - minT) / tRange) * innerW;
      return {
        ...p,
        cx: pointCount <= 3 ? evenCx : timeCx,
        cy: PAD.top + (1 - p.size / maxSize) * innerH,
      };
    });

    const minDateGap = 54;
    const dateVisible = points.map((_, idx) => {
      if (idx === 0 || idx === points.length - 1) return true;
      return points[idx].cx - points[idx - 1].cx >= minDateGap;
    });

    const pathD = points.map((p, i) => `${i === 0 ? 'M' : 'L'}${p.cx.toFixed(1)},${p.cy.toFixed(1)}`).join(' ');
    const areaD = `${pathD} L${points[points.length - 1].cx.toFixed(1)},${(PAD.top + innerH).toFixed(1)} L${PAD.left},${(PAD.top + innerH).toFixed(1)} Z`;
    return { sorted, points, pathD, areaD, maxSize, dateVisible };
  }, [trendData]);

  const formatDate = (ts: number, withYear = true) => {
    const date = new Date(ts * 1000);
    if (withYear) {
      return date.toLocaleDateString(undefined, { year: 'numeric', month: '2-digit', day: '2-digit' });
    }
    return date.toLocaleDateString(undefined, { month: '2-digit', day: '2-digit' });
  };

  const formatDateTime = (ts: number) => {
    const date = new Date(ts * 1000);
    return date.toLocaleString(undefined, {
      year: 'numeric',
      month: '2-digit',
      day: '2-digit',
      hour: '2-digit',
      minute: '2-digit',
      second: '2-digit',
      hour12: false,
    });
  };

  const fmtBytes = (b: number) => {
    if (b >= 1e9) return `${(b / 1e9).toFixed(1)}G`;
    if (b >= 1e6) return `${(b / 1e6).toFixed(1)}M`;
    if (b >= 1e3) return `${(b / 1e3).toFixed(1)}K`;
    return `${b}B`;
  };

  const pointCount = chartData?.points.length ?? 0;
  const showXAxisDate = pointCount <= 24;
  const useMonthDayOnly = pointCount > 6;
  const showSnapshotLabel = pointCount <= 12;

  return (
    <Dialog open={open} onClose={onClose} maxWidth="md" fullWidth
      PaperProps={{
        sx: {
          bgcolor: '#0f0f11',
          border: `1px solid ${alpha('#ffffff', 0.1)}`,
          borderRadius: 3,
          backgroundImage: 'none',
        }
      }}>
      <DialogTitle sx={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', pb: 1 }}>
        <div className="flex items-center gap-2">
          <TrendingUp size={20} style={{ color: '#a78bfa' }} />
          <Typography component="span" sx={{ color: 'white', fontSize: 15, fontWeight: 700 }}>
            {t('snapshot.trendTitle')}
          </Typography>
        </div>
        <div>
          <Typography variant="caption" sx={{ color: alpha('#ffffff', 0.4), fontFamily: 'monospace', mr: 2 }} noWrap>
            {entryPath.replace(/\//g, '\\')}
          </Typography>
          <IconButton size="small" onClick={onClose} sx={{ color: alpha('#ffffff', 0.5) }}>
            <X size={18} />
          </IconButton>
        </div>
      </DialogTitle>
      <DialogContent sx={{ pt: 1 }}>
        {loading ? (
          <div className="flex items-center justify-center h-64">
            <CircularProgress sx={{ color: '#a78bfa' }} />
          </div>
        ) : !chartData ? (
          <div className="flex flex-col items-center justify-center h-64 gap-3">
            <TrendingUp size={48} style={{ color: alpha('#ffffff', 0.15) }} />
            <Typography sx={{ color: alpha('#ffffff', 0.4) }}>{t('snapshot.trendNoData')}</Typography>
            <Typography variant="caption" sx={{ color: alpha('#ffffff', 0.25) }}>{t('snapshot.trendNoDataHint')}</Typography>
          </div>
        ) : (
          <div>
            {/* SVG 折线图 */}
            <svg width="100%" viewBox={`0 0 ${W} ${H}`}
              style={{ overflow: 'visible' }}>
              <defs>
                <linearGradient id="trendGrad" x1="0" y1="0" x2="0" y2="1">
                  <stop offset="0%" stopColor="#8b5cf6" stopOpacity="0.4" />
                  <stop offset="100%" stopColor="#8b5cf6" stopOpacity="0.02" />
                </linearGradient>
              </defs>
              {/* 网格线 */}
              {[0, 0.25, 0.5, 0.75, 1].map((ratio) => {
                const y = PAD.top + ratio * innerH;
                const val = chartData.maxSize * (1 - ratio);
                return (
                  <g key={ratio}>
                    <line x1={PAD.left} y1={y} x2={PAD.left + innerW} y2={y}
                      stroke={alpha('#ffffff', 0.06)} strokeWidth={1} />
                    <text x={PAD.left - 6} y={y} textAnchor="end" dominantBaseline="middle"
                      fill={alpha('#ffffff', 0.35)} fontSize={11}>{fmtBytes(val)}</text>
                  </g>
                );
              })}
              {/* 面积填充 */}
              <path d={chartData.areaD} fill="url(#trendGrad)" />
              {/* 折线 */}
              <path d={chartData.pathD} fill="none" stroke="#8b5cf6" strokeWidth={2.5}
                strokeLinejoin="round" strokeLinecap="round" />
              {/* 数据点 */}
              {chartData.points.map((p, i) => (
                <g key={i}>
                  <circle cx={p.cx} cy={p.cy} r={5} fill="#8b5cf6" stroke="#0f0f11" strokeWidth={2} />
                  {/* X 轴标签 */}
                  {showXAxisDate && chartData.dateVisible[i] && (
                    <text x={p.cx} y={PAD.top + innerH + 32} textAnchor="middle"
                      fill={alpha('#ffffff', 0.35)} fontSize={9.5}>
                      {formatDate(p.createdAt, !useMonthDayOnly)}
                    </text>
                  )}
                  {showSnapshotLabel && p.label && (
                    <text x={p.cx} y={PAD.top + innerH + 45} textAnchor="middle"
                      fill={alpha('#ffffff', 0.25)} fontSize={8}>
                      {p.label.length > 6 ? p.label.slice(0, 6) + '…' : p.label}
                    </text>
                  )}
                </g>
              ))}
              {/* 轴线 */}
              <line x1={PAD.left} y1={PAD.top} x2={PAD.left} y2={PAD.top + innerH}
                stroke={alpha('#ffffff', 0.15)} strokeWidth={1} />
              <line x1={PAD.left} y1={PAD.top + innerH} x2={PAD.left + innerW} y2={PAD.top + innerH}
                stroke={alpha('#ffffff', 0.15)} strokeWidth={1} />
            </svg>
            {/* 数据点列表 */}
            <div className="mt-4 space-y-1">
              {chartData.sorted.map((p, i) => (
                <div key={i} className="flex items-center gap-3 text-xs px-2 py-1 rounded"
                  style={{ background: alpha('#ffffff', 0.03) }}>
                  <span style={{ color: alpha('#ffffff', 0.35), minWidth: 180 }}>{formatDateTime(p.createdAt)}</span>
                  <span style={{ color: '#a78bfa', fontWeight: 600, minWidth: 70 }}>{fmtBytes(p.size)}</span>
                  {p.label && <span style={{ color: alpha('#ffffff', 0.5) }}>{p.label}</span>}
                </div>
              ))}
            </div>
          </div>
        )}
      </DialogContent>
    </Dialog>
  );
};

export const SnapshotAnalysisView: React.FC = () => {
  const { t } = useTranslation();
  const { diffResult, topNCount, showFilesOnly, setTopNCount, setShowFilesOnly, snapshots } = useSnapshotStore();
  const { getActiveTab } = useTabStore();
  const activeTab = getActiveTab();

  const [filterKind, setFilterKind] = useState<DiffKind | 'all'>('all');
  const [bottomTab, setBottomTab] = useState(0);
  const [currentPath, setCurrentPath] = useState('');

  // 历史趋势相关状态
  const [trendDialogOpen, setTrendDialogOpen] = useState(false);
  const [trendEntry, setTrendEntry] = useState<DiffEntry | null>(null);
  const [trendData, setTrendData] = useState<TrendPoint[]>([]);
  const [trendLoading, setTrendLoading] = useState(false);
  const [historyLoaded, setHistoryLoaded] = useState(false);
  const [historyLoading, setHistoryLoading] = useState(false);
  // 分组选项状态
  const [groupBy, setGroupBy] = useState<SnapshotGroupBy>('none');
  const [flatGrouping, setFlatGrouping] = useState(false);
  // 历史快照列表
  const [historySnapshots, setHistorySnapshots] = useState<SnapshotMeta[]>([]);
  // 历史快照数据：snapshotId -> { path -> size }
  const [historyCache, setHistoryCache] = useState<Map<string, Map<string, number>>>(new Map());

  const entries = diffResult?.entries ?? [];

  const filteredEntries = useMemo(() => {
    return entries.filter((e) => {
      return !(filterKind !== 'all' && e.kind !== filterKind);

    });
  }, [entries, filterKind]);

  // 切换 filterKind 时重置路径
  useEffect(() => { setCurrentPath(''); }, [filterKind, diffResult]);

  const handleNavigate = useCallback((path: string) => {
    setCurrentPath(path);
  }, []);

  const breadcrumbs = useMemo(() => buildBreadcrumbs(currentPath, t), [currentPath, t]);

  /** 在文件资源管理器中打开指定路径 */
  const handleOpenExplorer = useCallback(async (entryPath: string) => {
    try {
      const winPath = entryPath.replace(/\//g, '\\');
      await invoke('open_in_explorer', { path: winPath });
    } catch (e) {
      console.error('open_in_explorer failed:', e);
    }
  }, []);

  /** 加载当前磁盘的历史快照文件大小数据，用于历史趋势 */
  const handleLoadHistory = useCallback(async () => {
    if (historyLoaded || historyLoading) return;
    setHistoryLoading(true);
    try {
      const activeSnap = snapshots.find(s => s.id === diffResult?.snapshot_b_id);
      const currentDrive = activeSnap?.drive;

      const relevantMetas = await listSnapshots(currentDrive);
      setHistorySnapshots(relevantMetas);

      const cache = new Map<string, Map<string, number>>();

      await Promise.all(relevantMetas.map(async (snap) => {
        try {
          const sizes = await invoke<Record<string, number>>('get_snapshot_file_sizes', { id: snap.id });
          // 与前端 normPath 保持一致
          const normalized = new Map<string, number>();
          for (const [k, v] of Object.entries(sizes)) {
            normalized.set(normPath(k), v);
          }
          cache.set(snap.id, normalized);
        } catch {
        }
      }));
      setHistoryCache(cache);
      setHistoryLoaded(true);
    } catch (e) {
      console.error('Failed to load history:', e);
    } finally {
      setHistoryLoading(false);
    }
  }, [snapshots, diffResult, historyLoaded, historyLoading]);

  /** 查看指定条目的历史趋势 */
  const handleViewTrend = useCallback(async (entry: DiffEntry) => {
    setTrendEntry(entry);
    setTrendDialogOpen(true);
    setTrendLoading(true);
    try {
      const normEntry = normPath(entry.path);
      const points: TrendPoint[] = [];
      // 如果历史数据已加载，从缓存读取相关快照的数据
      if (historyLoaded && historyCache.size > 0) {
        for (const snap of historySnapshots) {
          const sizeMap = historyCache.get(snap.id);
          if (!sizeMap) continue;
          // cache 已在加载时 normalize，直接用 normEntry 查找
          let size = sizeMap.get(normEntry);
          // fallback：当前 diff 的两个快照若 cache 未命中，用 entry 自带的 size_a/size_b
          if (size === undefined && diffResult) {
            if (snap.id === diffResult.snapshot_a_id) size = entry.size_a;
            else if (snap.id === diffResult.snapshot_b_id) size = entry.size_b;
          }
          if (size !== undefined) {
            points.push({ snapshotId: snap.id, createdAt: snap.created_at, size, label: snap.label });
          }
        }
      } else {
        // 未加载历史数据时，至少显示当前 diff 的两个快照数据点
        if (diffResult) {
          const snapA = snapshots.find(s => s.id === diffResult.snapshot_a_id);
          const snapB = snapshots.find(s => s.id === diffResult.snapshot_b_id);
          if (snapA) points.push({ snapshotId: snapA.id, createdAt: snapA.created_at, size: entry.size_a, label: snapA.label });
          if (snapB) points.push({ snapshotId: snapB.id, createdAt: snapB.created_at, size: entry.size_b, label: snapB.label });
        }
      }
      setTrendData(points);
    } finally {
      setTrendLoading(false);
    }
  }, [snapshots, historyLoaded, historyCache, diffResult]);

  if (!diffResult) {
    return (
      <div className="flex items-center justify-center h-full">
        <Typography sx={{ color: alpha('#ffffff', 0.4) }}>{t('snapshot.noAnalysis')}</Typography>
      </div>
    );
  }

  const snapOldId = activeTab?.data?.snapshotAId ?? diffResult.snapshot_a_id;
  const snapNewId = activeTab?.data?.snapshotBId ?? diffResult.snapshot_b_id;

  const netChange = diffResult.total_grown_delta + diffResult.total_shrunk_delta
    + Number(diffResult.total_added_size) - Number(diffResult.total_removed_size);

  return (
    <div className="h-full flex flex-col overflow-hidden bg-background">
      {/* 顶部统计栏 */}
      <div className="flex items-center gap-4 px-6 py-3 flex-wrap border-b shrink-0" style={{ borderColor: alpha('#ffffff', 0.08) }}>
        <div className="flex items-center gap-2 flex-wrap">
          <Chip label={t('snapshot.old')} size="small" sx={{ bgcolor: alpha('#6366f1', 0.3), color: '#a5b4fc', fontWeight: 700, fontSize: 11 }} />
          <Typography variant="caption" sx={{ color: alpha('#ffffff', 0.5), fontFamily: 'monospace', fontSize: 11 }}>{snapOldId}</Typography>
          <Typography variant="caption" sx={{ color: alpha('#ffffff', 0.3) }}>→</Typography>
          <Chip label={t('snapshot.new')} size="small" sx={{ bgcolor: alpha('#f59e0b', 0.3), color: '#fcd34d', fontWeight: 700, fontSize: 11 }} />
          <Typography variant="caption" sx={{ color: alpha('#ffffff', 0.5), fontFamily: 'monospace', fontSize: 11 }}>{snapNewId}</Typography>
        </div>
        <div className="flex gap-3 ml-auto flex-wrap">
          <StatBadge label={t('snapshot.kind.added')} value={`+${diffResult.added_count}`} color="#22c55e" />
          <StatBadge label={t('snapshot.kind.removed')} value={`-${diffResult.removed_count}`} color="#ef4444" />
          <StatBadge label={t('snapshot.kind.grown')} value={`~${diffResult.changed_count}`} color="#3b82f6" />
          <StatBadge label={t('snapshot.netChange')} value={`${netChange >= 0 ? '+' : ''}${formatBytes(Math.abs(netChange))}`} color={alpha('#ffffff', 0.7)} />
        </div>
      </div>

      {/* 左侧设置 + 右侧可滚动主内容 */}
      <div className="flex-1 flex min-h-0">
        {/* 左侧设置面板 */}
        <div className="w-80 shrink-0 flex flex-col gap-3 p-4 border-r overflow-y-auto custom-scrollbar"
          style={{ borderColor: alpha('#ffffff', 0.06), background: alpha('#ffffff', 0.02) }}>
          {/* 过滤器分区 */}
          <div className="rounded-xl border p-3" style={{ borderColor: alpha('#ffffff', 0.08), background: alpha('#ffffff', 0.02) }}>
            <div className="flex items-center gap-2 mb-3">
              <div className="w-2 h-2 rounded-full bg-linear-to-r from-blue-400 to-purple-500"></div>
              <Typography variant="caption" sx={{ color: alpha('#ffffff', 0.7), fontWeight: 600, textTransform: 'uppercase', letterSpacing: 0.5 }}>
                {t('snapshot.filterKind')}
              </Typography>
            </div>
            <div className="space-y-1.5">
              {(['all', 'added', 'removed', 'grown', 'shrunk'] as const).map((k) => (
                <button key={k} onClick={() => setFilterKind(k)}
                  className="w-full text-left px-3 py-2 rounded-lg text-sm transition-all duration-200 hover:scale-[1.02]"
                  style={{
                    background: filterKind === k
                      ? `linear-gradient(135deg, ${alpha(k === 'all' ? '#ffffff' : KIND_COLORS[k], 0.15)} 0%, ${alpha(k === 'all' ? '#ffffff' : KIND_COLORS[k], 0.08)} 100%)`
                      : 'transparent',
                    color: filterKind === k ? (k === 'all' ? 'white' : KIND_COLORS[k]) : alpha('#ffffff', 0.6),
                    border: `1px solid ${filterKind === k ? alpha(k === 'all' ? '#ffffff' : KIND_COLORS[k], 0.25) : alpha('#ffffff', 0.05)}`,
                    boxShadow: filterKind === k ? `0 2px 8px ${alpha(k === 'all' ? '#ffffff' : KIND_COLORS[k], 0.1)}` : 'none',
                  }}>
                  <div className="flex items-center justify-between">
                    <span className="font-medium">{k === 'all' ? t('snapshot.allChanges') : t(`snapshot.kind.${k}`)}</span>
                    <span className="text-xs px-1.5 py-0.5 rounded-full" style={{
                      background: alpha('#ffffff', 0.1),
                      color: alpha('#ffffff', 0.7)
                    }}>
                      {k === 'all' ? entries.length : entries.filter(e => e.kind === k).length}
                    </span>
                  </div>
                </button>
              ))}
            </div>
          </div>

          {/* 显示选项分区 */}
          <div className="rounded-xl border p-3" style={{ borderColor: alpha('#ffffff', 0.08), background: alpha('#ffffff', 0.02) }}>
            <div className="flex items-center gap-2 mb-3">
              <div className="w-2 h-2 rounded-full bg-linear-to-r from-emerald-400 to-blue-500"></div>
              <Typography variant="caption" sx={{ color: alpha('#ffffff', 0.7), fontWeight: 600, textTransform: 'uppercase', letterSpacing: 0.5 }}>
                {t('snapshot.displayOptions')}
              </Typography>
            </div>
            <div className="space-y-3">
              <FormControlLabel
                control={
                  <Switch
                    checked={showFilesOnly}
                    onChange={(e) => setShowFilesOnly(e.target.checked)}
                    size="small"
                    sx={{
                      '& .MuiSwitch-thumb': { bgcolor: '#a78bfa' },
                      '& .Mui-checked + .MuiSwitch-track': { bgcolor: alpha('#8b5cf6', 0.5) },
                      '& .MuiSwitch-track': { bgcolor: alpha('#ffffff', 0.1) }
                    }}
                  />
                }
                label={<Typography variant="caption" sx={{ color: alpha('#ffffff', 0.7), fontWeight: 500 }}>{t('snapshot.filesOnly')}</Typography>}
              />

              <FormControl size="small" fullWidth>
                <Typography variant="caption" sx={{ color: alpha('#ffffff', 0.6), mb: 0.5, display: 'block' }}>{t('snapshot.groupOptions')}</Typography>
                <Select
                  value={groupBy}
                  onChange={(e) => setGroupBy(e.target.value as SnapshotGroupBy)}
                  sx={{
                    color: alpha('#ffffff', 0.8),
                    fontSize: 12,
                    bgcolor: alpha('#ffffff', 0.02),
                    '& fieldset': { borderColor: alpha('#ffffff', 0.1) },
                    '&:hover fieldset': { borderColor: alpha('#ffffff', 0.2) }
                  }}
                >
                  <MenuItem value="none">{t('snapshot.groupByNone')}</MenuItem>
                  <MenuItem value="type">{t('snapshot.groupByType')}</MenuItem>
                  <MenuItem value="extension">{t('snapshot.groupByExtension')}</MenuItem>
                </Select>
              </FormControl>
              {groupBy !== 'none' && (
                <FormControlLabel
                  control={
                    <Switch
                      checked={flatGrouping}
                      onChange={(e) => setFlatGrouping(e.target.checked)}
                      size="small"
                      sx={{
                        '& .MuiSwitch-thumb': { bgcolor: '#a78bfa' },
                        '& .Mui-checked + .MuiSwitch-track': { bgcolor: alpha('#8b5cf6', 0.5) },
                        '& .MuiSwitch-track': { bgcolor: alpha('#ffffff', 0.1) },
                      }}
                    />
                  }
                  label={<Typography variant="caption" sx={{ color: alpha('#ffffff', 0.7), fontWeight: 500 }}>{t('snapshot.flatGrouping')}</Typography>}
                />
              )}
            </div>
          </div>

          {/* 显示数量分区 */}
          <div className="rounded-xl border p-3" style={{ borderColor: alpha('#ffffff', 0.08), background: alpha('#ffffff', 0.02) }}>
            <div className="flex items-center gap-2 mb-3">
              <div className="w-2 h-2 rounded-full bg-linear-to-r from-purple-400 to-pink-500"></div>
              <Typography variant="caption" sx={{ color: alpha('#ffffff', 0.7), fontWeight: 600, textTransform: 'uppercase', letterSpacing: 0.5 }}>
                {t('snapshot.topN')} ({topNCount})
              </Typography>
            </div>
            <Slider
              value={topNCount}
              min={5}
              max={20}
              step={1}
              onChange={(_e, v) => setTopNCount(v as number)}
              sx={{
                color: '#8b5cf6',
                mt: 1,
                '& .MuiSlider-track': {
                  background: 'linear-gradient(90deg, #8b5cf6 0%, #a78bfa 100%)'
                },
                '& .MuiSlider-thumb': {
                  bgcolor: '#a78bfa',
                  boxShadow: '0 2px 8px rgba(139, 92, 246, 0.3)'
                }
              }}
              marks={[{ value: 5, label: '5' }, { value: 10, label: '10' }, { value: 20, label: '20' }]}
            />
          </div>

          {/* 历史数据分区 */}
          <div className="mt-auto rounded-xl border p-3" style={{ borderColor: alpha('#ffffff', 0.08), background: alpha('#ffffff', 0.02) }}>
            <div className="flex items-center gap-2 mb-3">
              <div className="w-2 h-2 rounded-full bg-linear-to-r from-cyan-400 to-blue-500"></div>
              <Typography variant="caption" sx={{ color: alpha('#ffffff', 0.7), fontWeight: 600, textTransform: 'uppercase', letterSpacing: 0.5 }}>
                {t('snapshot.historyData')}
              </Typography>
            </div>
            <button
              onClick={handleLoadHistory}
              disabled={historyLoaded || historyLoading}
              className="w-full flex items-center justify-center gap-2 px-3 py-2.5 rounded-lg text-sm transition-all duration-200 hover:scale-[1.02]"
              style={{
                background: historyLoaded
                  ? `linear-gradient(135deg, ${alpha('#22c55e', 0.15)} 0%, ${alpha('#22c55e', 0.08)} 100%)`
                  : `linear-gradient(135deg, ${alpha('#8b5cf6', 0.15)} 0%, ${alpha('#8b5cf6', 0.08)} 100%)`,
                color: historyLoaded ? '#4ade80' : alpha('#ffffff', 0.8),
                border: `1px solid ${historyLoaded ? alpha('#22c55e', 0.25) : alpha('#8b5cf6', 0.25)}`,
                opacity: historyLoading ? 0.6 : 1,
                cursor: historyLoaded ? 'default' : 'pointer',
                boxShadow: historyLoaded
                  ? `0 2px 8px ${alpha('#22c55e', 0.1)}`
                  : `0 2px 8px ${alpha('#8b5cf6', 0.1)}`,
              }}
            >
              {historyLoading ? (
                <CircularProgress size={14} sx={{ color: 'inherit' }} />
              ) : (
                <History size={16} />
              )}
              <span className="font-medium">{historyLoaded ? t('snapshot.historyLoaded') : t('snapshot.loadHistory')}</span>
            </button>
            {historyLoaded && (
              <Typography variant="caption" sx={{ color: alpha('#ffffff', 0.5), display: 'block', textAlign: 'center', mt: 1, fontSize: 11 }}>
                {t('snapshot.historyLoadedDesc', { count: historySnapshots.length })}
              </Typography>
            )}
          </div>
        </div>

        {/* 右侧主内容 */}
        <div className="flex-1 flex flex-col min-w-0 p-4 gap-6 overflow-y-auto custom-scrollbar">

          {/* 面包屑导航 */}
          <div className="flex items-center gap-1 shrink-0 flex-wrap">
            <Tooltip title={t('snapshot.backToRoot')}>
              <IconButton size="small" onClick={() => setCurrentPath('')}
                sx={{ color: currentPath ? alpha('#ffffff', 0.7) : alpha('#ffffff', 0.3), p: 0.5 }}>
                <Home size={16} />
              </IconButton>
            </Tooltip>
            {breadcrumbs.map((crumb, i) => (
              <React.Fragment key={crumb.path}>
                <ChevronRight size={14} style={{ color: alpha('#ffffff', 0.3) }} />
                <button
                  onClick={() => setCurrentPath(crumb.path)}
                  className="text-xs px-1.5 py-0.5 rounded transition-all"
                  style={{
                    color: i === breadcrumbs.length - 1 ? 'white' : alpha('#ffffff', 0.6),
                    fontWeight: i === breadcrumbs.length - 1 ? 600 : 400,
                    background: i === breadcrumbs.length - 1 ? alpha('#ffffff', 0.08) : 'transparent',
                  }}>
                  {crumb.label}
                </button>
              </React.Fragment>
            ))}
            {currentPath && (
              <Tooltip title={t('snapshot.copyPath')}>
                <IconButton size="small"
                  onClick={() => navigator.clipboard.writeText(currentPath.replace(/\//g, '\\'))}
                  sx={{ color: alpha('#ffffff', 0.4), p: 0.5, ml: 0.5, '&:hover': { color: '#a78bfa' } }}>
                  <Copy size={14} />
                </IconButton>
              </Tooltip>
            )}
          </div>

          {/* Treemap 差异视图 */}
          <div className="flex-none h-162.5 rounded-xl overflow-hidden" style={{ border: `1px solid ${alpha('#ffffff', 0.06)}` }}>
            <DiffTreemap
              entries={filteredEntries}
              currentPath={currentPath}
              showFilesOnly={showFilesOnly}
              groupBy={groupBy}
              flatGrouping={flatGrouping}
              onNavigate={handleNavigate}
              onOpenExplorer={handleOpenExplorer}
              onViewTrend={handleViewTrend}
            />
          </div>

          {/* 底部标签页：列表 + 条形图 */}
          <div className="flex-none min-h-150 flex flex-col rounded-xl overflow-hidden"
            style={{ border: `1px solid ${alpha('#ffffff', 0.06)}`, background: alpha('#ffffff', 0.02) }}>
            <Tabs value={bottomTab} onChange={(_e, v) => setBottomTab(v)}
              sx={{
                minHeight: 44, borderBottom: `1px solid ${alpha('#ffffff', 0.08)}`, flexShrink: 0,
                '& .MuiTab-root': { color: alpha('#ffffff', 0.5), minHeight: 44, fontSize: 13, textTransform: 'none', gap: 0.5 },
                '& .Mui-selected': { color: '#a78bfa' },
                '& .MuiTabs-indicator': { bgcolor: '#8b5cf6' },
              }}>
              <Tab icon={<List size={16} />} iconPosition="start" label={t('snapshot.listView')} />
              <Tab icon={<BarChart2 size={16} />} iconPosition="start" label={t('snapshot.chartView')} />
            </Tabs>

            <div className="flex-1 min-h-0 overflow-hidden" style={{ minHeight: 556 }}>
              {bottomTab === 0 && (
                <DiffList
                  entries={filteredEntries}
                  showFilesOnly={showFilesOnly}
                  currentPath={currentPath}
                  groupBy={groupBy}
                  flatGrouping={flatGrouping}
                  onNavigate={handleNavigate}
                  onOpenExplorer={handleOpenExplorer}
                  onViewTrend={handleViewTrend}
                />
              )}
              {bottomTab === 1 && <DiffBarChart entries={filteredEntries} topN={topNCount} showFilesOnly={showFilesOnly} currentPath={currentPath} groupBy={groupBy} flatGrouping={flatGrouping} />}
            </div>
          </div>
        </div>
      </div>

      {/* 历史趋势弹窗 */}
      {trendEntry && (
        <TrendDialog
          open={trendDialogOpen}
          onClose={() => setTrendDialogOpen(false)}
          entryPath={trendEntry.path}
          trendData={trendData}
          loading={trendLoading}
        />
      )}

      <style>{`.custom-scrollbar::-webkit-scrollbar { width: 0px; background: transparent; }`}</style>
    </div>
  );
};
