import React, {useCallback, useEffect, useMemo, useRef, useState} from 'react';
import {Chip, FormControl, FormControlLabel, MenuItem, Select, Slider, Switch, Tab, Tabs,} from '@mui/material';
import {BarChart2, History, List} from 'lucide-react';
import {invoke} from '@tauri-apps/api/core';
import {useTranslation} from 'react-i18next';
import {useSnapshotStore} from '../store/snapshotStore';
import {useTabStore} from '../store/tabStore';
import {formatBytes} from '../utils/format';
import type {DiffEntry, DiffKind, SnapshotGroupBy, SnapshotMeta} from '../types';
import {DEFAULT_GROUP_CONFIG, KIND_COLORS} from '../constants';
import {diffSnapshots, listSnapshots} from '../services/snapshotService';
import {updateTabData} from '../utils/tabNavigation';
import {computeVisibleDiffEntries, normPath} from '../utils/snapshotUtils';
import {DiffTreemap} from './snapshot/DiffTreemap';
import {DiffList} from './snapshot/DiffList';
import {DiffBarChart} from './snapshot/DiffBarChart';
import {TrendDialog, type TrendPoint} from './snapshot/TrendDialog';

// 统计徽章组件
const StatBadge: React.FC<{ label: string; value: string; color: string }> = ({label, value, color}) => (
    <div className="flex flex-col items-center px-3 py-1 rounded-lg bg-white/5 border border-white/8">
        <span className="text-xs font-semibold" style={{color}}>{value}</span>
        <span className="text-xs text-white/40">{label}</span>
    </div>
);

export const SnapshotAnalysisView: React.FC = () => {
    const {t} = useTranslation();
    const {topNCount, showFilesOnly, setTopNCount, setShowFilesOnly, snapshots} = useSnapshotStore();
    const activeTab = useTabStore((state) =>
        state.tabs.find((t) => t.id === state.activeTabId) ?? null
    );
    const tabId = activeTab?.id;
    const diffResult = activeTab?.data?.diffResult ?? null;
    const isDiffing = activeTab?.data?.isDiffing ?? false;
    const diffError = activeTab?.data?.diffError ?? null;
    const snapshotAId = activeTab?.data?.snapshotAId;
    const snapshotBId = activeTab?.data?.snapshotBId;
    const diffTaskId = activeTab?.data?.diffTaskId;

    const diffTriggeredRef = useRef(false);

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
    const [groupBy, setGroupBy] = useState<SnapshotGroupBy>(DEFAULT_GROUP_CONFIG.groupBy);
    const [flatGrouping, setFlatGrouping] = useState(DEFAULT_GROUP_CONFIG.flatGrouping);
    // 历史快照列表
    const [historySnapshots, setHistorySnapshots] = useState<SnapshotMeta[]>([]);
    // 历史快照数据：snapshotId -> { normalizedPath -> size }
    const [historyCache, setHistoryCache] = useState<Record<string, Record<string, number>>>({});

    const entries = diffResult?.entries ?? [];

    useEffect(() => {
        if (!tabId || activeTab?.type !== 'snapshot-diff') return;
        if (!snapshotAId || !snapshotBId) return;
        if (diffResult || isDiffing || diffTriggeredRef.current) return;

        diffTriggeredRef.current = true;
        const currentTaskId = diffTaskId || `diff-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
        updateTabData(tabId, {isDiffing: true, diffTaskId: currentTaskId, diffError: null});

        const runDiff = async () => {
            try {
                const result = await diffSnapshots(snapshotAId, snapshotBId);
                updateTabData(tabId, {
                    diffResult: result,
                    isDiffing: false,
                    diffError: null,
                });
            } catch (err) {
                diffTriggeredRef.current = false;
                updateTabData(tabId, {
                    isDiffing: false,
                    diffError: String(err),
                });
            }
        };

        runDiff();
    }, [tabId, activeTab?.type, snapshotAId, snapshotBId]);

    const filteredEntries = useMemo(
        () => filterKind === 'all' ? entries : entries.filter((e) => e.kind === filterKind),
        [entries, filterKind],
    );
    const entryCounts = useMemo(() => {
        const counts: Record<DiffKind | 'all', number> = {
            all: entries.length,
            added: 0,
            removed: 0,
            grown: 0,
            shrunk: 0,
        };
        for (const entry of entries) {
            counts[entry.kind] += 1;
        }
        return counts;
    }, [entries]);
    const visibleEntries = useMemo(
        () => computeVisibleDiffEntries(filteredEntries, currentPath, showFilesOnly, groupBy, flatGrouping, t),
        [filteredEntries, currentPath, showFilesOnly, groupBy, flatGrouping, t],
    );

    // 切换 filterKind 时重置路径
    useEffect(() => {
        setCurrentPath('');
    }, [filterKind, diffResult]);

    const handleNavigate = useCallback((path: string) => {
        setCurrentPath(path);
    }, []);

    /** 在文件资源管理器中打开指定路径 */
    const handleOpenExplorer = useCallback(async (entryPath: string) => {
        try {
            const winPath = entryPath.replace(/\//g, '\\');
            await invoke('open_in_explorer', {path: winPath});
        } catch (e) {
            console.error('open_in_explorer failed:', e);
        }
    }, []);

    /** 加载当前磁盘的历史快照文件大小数据 */
    const handleLoadHistory = useCallback(async () => {
        if (historyLoaded || historyLoading) return;
        setHistoryLoading(true);
        try {
            const activeSnap = snapshots.find(s => s.id === diffResult?.snapshot_b_id);
            const currentDrive = activeSnap?.drive;

            const relevantMetas = await listSnapshots(currentDrive);
            setHistorySnapshots(relevantMetas);

            const cache: Record<string, Record<string, number>> = {};

            const CONCURRENCY = 12;
            for (let i = 0; i < relevantMetas.length; i += CONCURRENCY) {
                const batch = relevantMetas.slice(i, i + CONCURRENCY);
                await Promise.all(batch.map(async (snap) => {
                    try {
                        const sizes = await invoke<Record<string, number>>('get_snapshot_file_sizes', {id: snap.id});
                        const normalized: Record<string, number> = {};
                        for (const [k, v] of Object.entries(sizes)) {
                            normalized[normPath(k)] = v;
                        }
                        cache[snap.id] = normalized;
                    } catch (e) {
                        console.warn(`Failed to load sizes for snapshot ${snap.id}:`, e);
                    }
                }));
            }
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
            if (historyLoaded && Object.keys(historyCache).length > 0) {
                for (const snap of historySnapshots) {
                    const sizeMap = historyCache[snap.id];
                    if (!sizeMap) continue;
                    let size: number | undefined = sizeMap[normEntry];
                    if (size === undefined && diffResult) {
                        if (snap.id === diffResult.snapshot_a_id) size = entry.size_a;
                        else if (snap.id === diffResult.snapshot_b_id) size = entry.size_b;
                    }
                    if (size !== undefined) {
                        points.push({snapshotId: snap.id, createdAt: snap.created_at, size, label: snap.label});
                    }
                }
            } else {
                // 未加载历史数据时，至少显示当前 diff 的两个快照数据点
                if (diffResult) {
                    const snapA = snapshots.find(s => s.id === diffResult.snapshot_a_id);
                    const snapB = snapshots.find(s => s.id === diffResult.snapshot_b_id);
                    if (snapA) points.push({
                        snapshotId: snapA.id,
                        createdAt: snapA.created_at,
                        size: entry.size_a,
                        label: snapA.label
                    });
                    if (snapB) points.push({
                        snapshotId: snapB.id,
                        createdAt: snapB.created_at,
                        size: entry.size_b,
                        label: snapB.label
                    });
                }
            }
            setTrendData(points);
        } finally {
            setTrendLoading(false);
        }
    }, [snapshots, historyLoaded, historyCache, diffResult]);

    if (!diffResult) {
        if (isDiffing) {
            return (
                <div className="flex items-center justify-center h-full">
                    <span className="text-sm text-white/60">{t('snapshot.loading')}</span>
                </div>
            );
        }

        if (diffError) {
            return (
                <div className="flex items-center justify-center h-full">
                    <span className="text-sm text-red-400">{diffError}</span>
                </div>
            );
        }

        return (
            <div className="flex items-center justify-center h-full">
                <span className="text-sm text-white/40">{t('snapshot.noAnalysis')}</span>
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
            <div className="flex items-center gap-4 px-6 py-3 flex-wrap border-b border-white/8 shrink-0">
                <div className="flex items-center gap-2 flex-wrap">
                    <Chip label={t('snapshot.old')} size="small"
                          sx={{bgcolor: 'rgba(99,102,241,0.3)', color: '#a5b4fc'}}/>
                    <span className="text-[11px] text-white/50 font-mono">{snapOldId}</span>
                    <span className="text-[11px] text-white/30">→</span>
                    <Chip label={t('snapshot.new')} size="small"
                          sx={{bgcolor: 'rgba(245,158,11,0.3)', color: '#fcd34d'}}/>
                    <span className="text-[11px] text-white/50 font-mono">{snapNewId}</span>
                </div>
                <div className="flex gap-3 ml-auto flex-wrap">
                    <StatBadge label={t('snapshot.kind.added')} value={`+${diffResult.added_count}`} color="#22c55e"/>
                    <StatBadge label={t('snapshot.kind.removed')} value={`-${diffResult.removed_count}`}
                               color="#ef4444"/>
                    <StatBadge label={t('snapshot.kind.grown')} value={`~${diffResult.changed_count}`} color="#3b82f6"/>
                    <StatBadge label={t('snapshot.netChange')}
                               value={`${netChange >= 0 ? '+' : ''}${formatBytes(Math.abs(netChange))}`}
                               color="rgba(255,255,255,0.7)"/>
                </div>
            </div>

            {/* 左侧设置 + 右侧可滚动主内容 */}
            <div className="flex-1 flex min-h-0">
                {/* 左侧设置面板 */}
                <div
                    className="w-80 shrink-0 flex flex-col gap-3 p-4 border-r border-white/6 bg-white/2 overflow-y-auto custom-scrollbar">
                    {/* 过滤器分区 */}
                    <div className="rounded-xl border border-white/8 bg-white/2 p-3">
                        <div className="flex items-center gap-2 mb-3">
                            <div className="w-2 h-2 rounded-full bg-linear-to-r from-blue-400 to-purple-500"></div>
                            <span className="text-xs font-semibold text-white/70 uppercase tracking-wide">
                                {t('snapshot.filterKind')}
                            </span>
                        </div>
                        <div className="space-y-1.5">
                            {(['all', 'added', 'removed', 'grown', 'shrunk'] as const).map((k) => (
                                <button key={k} onClick={() => setFilterKind(k)}
                                        className="w-full text-left px-3 py-2 rounded-lg text-sm transition-all duration-200 hover:scale-[1.02]"
                                        style={{
                                            background: filterKind === k
                                                ? `linear-gradient(135deg, ${k === 'all' ? 'rgba(255,255,255,0.15)' : `${KIND_COLORS[k]}26`} 0%, ${k === 'all' ? 'rgba(255,255,255,0.08)' : `${KIND_COLORS[k]}14`} 100%)`
                                                : 'transparent',
                                            color: filterKind === k ? (k === 'all' ? 'white' : KIND_COLORS[k]) : 'rgba(255,255,255,0.6)',
                                            border: `1px solid ${filterKind === k ? (k === 'all' ? 'rgba(255,255,255,0.25)' : `${KIND_COLORS[k]}40`) : 'rgba(255,255,255,0.05)'}`,
                                            boxShadow: filterKind === k ? `0 2px 8px ${k === 'all' ? 'rgba(255,255,255,0.1)' : `${KIND_COLORS[k]}1a`}` : 'none',
                                        }}>
                                    <div className="flex items-center justify-between">
                                        <span
                                            className="font-medium">{k === 'all' ? t('snapshot.allChanges') : t(`snapshot.kind.${k}`)}</span>
                                        <span className="text-xs px-1.5 py-0.5 rounded-full bg-white/10 text-white/70">
                                            {entryCounts[k]}
                                        </span>
                                    </div>
                                </button>
                            ))}
                        </div>
                    </div>

                    {/* 显示选项分区 */}
                    <div className="rounded-xl border border-white/8 bg-white/2 p-3">
                        <div className="flex items-center gap-2 mb-3">
                            <div className="w-2 h-2 rounded-full bg-linear-to-r from-emerald-400 to-blue-500"></div>
                            <span className="text-xs font-semibold text-white/70 uppercase tracking-wide">
                                {t('snapshot.displayOptions')}
                            </span>
                        </div>
                        <div className="space-y-3">
                            <FormControlLabel
                                control={
                                    <Switch
                                        checked={showFilesOnly}
                                        onChange={(e) => setShowFilesOnly(e.target.checked)}
                                        size="small"
                                    />
                                }
                                label={<span
                                    className="text-xs text-white/70 font-medium">{t('snapshot.filesOnly')}</span>}
                            />

                            <FormControl size="small" fullWidth>
                                <span className="text-xs text-white/60 mb-1 block">{t('snapshot.groupOptions')}</span>
                                <Select
                                    value={groupBy}
                                    onChange={(e) => setGroupBy(e.target.value as SnapshotGroupBy)}
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
                                        />
                                    }
                                    label={<span
                                        className="text-xs text-white/70 font-medium">{t('snapshot.flatGrouping')}</span>}
                                />
                            )}
                        </div>
                    </div>

                    {/* Top N 设置分区 */}
                    <div className="rounded-xl border border-white/8 bg-white/2 p-3">
                        <div className="flex items-center gap-2 mb-3">
                            <div className="w-2 h-2 rounded-full bg-linear-to-r from-orange-400 to-red-500"></div>
                            <span className="text-xs font-semibold text-white/70 uppercase tracking-wide">
                                {t('snapshot.topN')}
                            </span>
                        </div>
                        <div className="space-y-3">
                            <div>
                                <span className="text-xs text-white/60 mb-2 block">
                                    {t('snapshot.topNDesc', {n: topNCount})}
                                </span>
                                <Slider
                                    value={topNCount}
                                    onChange={(_, v) => setTopNCount(v as number)}
                                    min={5}
                                    max={50}
                                    step={1}
                                    size="small"
                                    sx={{color: '#a78bfa'}}
                                />
                            </div>
                        </div>
                    </div>

                    {/* 历史数据分区 */}
                    <div className="rounded-xl border border-white/8 bg-white/2 p-3">
                        <div className="flex items-center gap-2 mb-3">
                            <div className="w-2 h-2 rounded-full bg-linear-to-r from-purple-400 to-pink-500"></div>
                            <span className="text-xs font-semibold text-white/70 uppercase tracking-wide">
                                {t('snapshot.historyData')}
                            </span>
                        </div>
                        <button
                            onClick={handleLoadHistory}
                            disabled={historyLoaded || historyLoading}
                            className="w-full px-3 py-2 rounded-lg text-sm transition-all flex items-center justify-center gap-2 hover:scale-[1.02] active:scale-[0.98] disabled:hover:scale-100"
                            style={{
                                background: historyLoaded ? 'rgba(34,197,94,0.15)' : 'rgba(139,92,246,0.15)',
                                color: historyLoaded ? '#22c55e' : '#a78bfa',
                                border: `1px solid ${historyLoaded ? 'rgba(34,197,94,0.25)' : 'rgba(139,92,246,0.25)'}`,
                                opacity: historyLoading ? 0.6 : 1,
                                cursor: historyLoaded || historyLoading ? 'default' : 'pointer',
                            }}
                        >
                            <History size={14}/>
                            {historyLoading ? t('snapshot.historyLoading') : historyLoaded ? t('snapshot.historyLoaded') : t('snapshot.loadHistory')}
                        </button>
                        {historyLoaded && (
                            <span className="block mt-2 text-xs text-green-400/80 text-center">
                                {t('snapshot.historyLoadedDesc', {count: historySnapshots.length})}
                            </span>
                        )}
                    </div>
                </div>

                {/* 右侧主内容区域 */}
                <div className="flex-1 flex flex-col min-h-0 gap-4 p-4 overflow-y-auto custom-scrollbar">
                    {/* Treemap 差异视图 */}
                    <div className="flex-none h-162.5 rounded-xl overflow-hidden border border-white/6">
                        <DiffTreemap
                            entries={visibleEntries}
                            currentPath={currentPath}
                            showFilesOnly={showFilesOnly}
                            onNavigate={handleNavigate}
                            onOpenExplorer={handleOpenExplorer}
                            onViewTrend={handleViewTrend}
                        />
                    </div>

                    {/* 底部标签页：列表 + 条形图 */}
                    <div
                        className="flex-none min-h-150 flex flex-col rounded-xl overflow-hidden border border-white/6 bg-white/2">
                        <Tabs value={bottomTab} onChange={(_e, v) => setBottomTab(v)}
                              sx={{
                                  minHeight: 44,
                                  borderBottom: '1px solid rgba(255,255,255,0.08)',
                                  flexShrink: 0,
                                  '& .MuiTab-root': {
                                      color: 'rgba(255,255,255,0.5)',
                                      minHeight: 44,
                                      fontSize: 13,
                                      textTransform: 'none',
                                      gap: 0.5
                                  },
                                  '& .Mui-selected': {color: '#a78bfa'},
                                  '& .MuiTabs-indicator': {bgcolor: '#8b5cf6'},
                              }}>
                            <Tab icon={<List size={16}/>} iconPosition="start" label={t('snapshot.listView')}/>
                            <Tab icon={<BarChart2 size={16}/>} iconPosition="start" label={t('snapshot.chartView')}/>
                        </Tabs>

                        <div className="flex-1 min-h-0 overflow-hidden">
                            {bottomTab === 0 && (
                                <DiffList
                                    entries={visibleEntries}
                                    showFilesOnly={showFilesOnly}
                                    currentPath={currentPath}
                                    onNavigate={handleNavigate}
                                    onOpenExplorer={handleOpenExplorer}
                                    onViewTrend={handleViewTrend}
                                />
                            )}
                            {bottomTab === 1 &&
                                <DiffBarChart entries={visibleEntries} topN={topNCount}/>}
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

        </div>
    );
};
