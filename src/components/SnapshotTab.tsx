import React, {useCallback, useEffect, useState} from 'react';
import {alpha, Box, Checkbox, Chip, IconButton, Tooltip, Typography,} from '@mui/material';
import {ArrowLeftRight, Images, Loader2, RefreshCw, Trash2} from 'lucide-react';
import {useTranslation} from 'react-i18next';
import {useSnapshotStore} from '../store/snapshotStore';
import {deleteSnapshot, diffSnapshots, listSnapshots} from '../services/snapshotService';
import {formatBytes} from '../utils/format';
import {formatDurationPrecise} from '../utils/scanUtils';
import {useTabStore} from '../store/tabStore';
import {updateTabData} from '../utils/tabNavigation';
import {motion} from 'framer-motion';

function formatTimestamp(ts: number): string {
    const d = new Date(ts * 1000);
    return d.toLocaleString(undefined, {
        year: 'numeric',
        month: '2-digit',
        day: '2-digit',
        hour: '2-digit',
        minute: '2-digit',
        second: '2-digit',
        hour12: false,
    });
}

export const SnapshotTab: React.FC = () => {
    const {t} = useTranslation();
    const [analyzeElapsedMs, setAnalyzeElapsedMs] = useState(0);
    const {
        snapshots,
        selectedIds,
        isLoading,
        error,
        setSnapshots,
        toggleSelect,
        setIsLoading,
        setError,
        removeSnapshot,
    } = useSnapshotStore();

    const {addTab, getActiveTab} = useTabStore();
    const activeTab = getActiveTab();
    const tabId = activeTab?.id;

    const isAnalyzingDiff = activeTab?.data?.isAnalyzingDiff ?? false;
    const analyzeStartedAt = activeTab?.data?.analyzeStartedAt ?? null;

    useEffect(() => {
        if (!isAnalyzingDiff || !analyzeStartedAt) return;

        const timer = setInterval(() => {
            setAnalyzeElapsedMs(Date.now() - analyzeStartedAt);
        }, 100);

        return () => clearInterval(timer);
    }, [isAnalyzingDiff, analyzeStartedAt]);

    const loadSnapshots = useCallback(async () => {
        setIsLoading(true);
        setError(null);
        try {
            const list = await listSnapshots();
            setSnapshots(list);
        } catch (err) {
            setError(String(err));
        } finally {
            setIsLoading(false);
        }
    }, [setSnapshots, setIsLoading, setError]);

    useEffect(() => {
        loadSnapshots();
    }, [loadSnapshots]);

    const handleDelete = async (id: string, e: React.MouseEvent) => {
        e.stopPropagation();
        try {
            await deleteSnapshot(id);
            removeSnapshot(id);
        } catch (err) {
            setError(String(err));
        }
    };

    const handleAnalyze = async () => {
        if (selectedIds.length !== 2) return;

        // 防止对比不同驱动器的快照
        const snapA = snapshots.find((s) => s.id === selectedIds[0]);
        const snapB = snapshots.find((s) => s.id === selectedIds[1]);
        const driveA = snapA?.drive?.replace(/\\/g, '/').replace(/\/$/, '').toUpperCase();
        const driveB = snapB?.drive?.replace(/\\/g, '/').replace(/\/$/, '').toUpperCase();
        if (driveA && driveB && driveA !== driveB) {
            setError(t('snapshot.differentDriveError', {driveA: snapA?.drive, driveB: snapB?.drive}));
            return;
        }

        setError(null);
        const title = `${snapA?.label ?? snapA?.drive ?? '?'} ${t('snapshot.vs')} ${snapB?.label ?? snapB?.drive ?? '?'}`;
        const diffTaskId = `diff-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;

        const startedAt = Date.now();
        setAnalyzeElapsedMs(0);
        if (tabId) updateTabData(tabId, {isAnalyzingDiff: true, analyzeStartedAt: startedAt});

        try {
            const result = await diffSnapshots(selectedIds[0], selectedIds[1]);

            addTab({
                id: `snapshot-diff-${Date.now()}`,
                type: 'snapshot-diff',
                title,
                data: {
                    snapshotAId: selectedIds[0],
                    snapshotBId: selectedIds[1],
                    diffTaskId,
                    isDiffing: false,
                    diffResult: result,
                    diffError: null,
                },
            });
        } catch (err) {
            setError(String(err));
        } finally {
            if (tabId) updateTabData(tabId, {isAnalyzingDiff: false, analyzeStartedAt: null});
        }
    };

    if (isAnalyzingDiff) {
        const snapOldInfo = snapshots.find((s) => s.id === selectedIds[0]) ?? null;
        const snapNewInfo = snapshots.find((s) => s.id === selectedIds[1]) ?? null;
        return (
            <div className="h-full flex items-center justify-center relative overflow-hidden bg-background">
                <motion.div
                    initial={{opacity: 0, scale: 0.9}}
                    animate={{opacity: 1, scale: 1}}
                    className="relative z-10 w-full max-w-2xl p-8"
                >
                    <div
                        className="p-8 flex flex-col items-center gap-6 rounded-2xl bg-zinc-900/80 backdrop-blur-xl border border-white/5">
                        {/* 旋转图标 */}
                        <div className="relative">
                            <div className="absolute inset-0 rounded-full bg-violet-500/20 blur-xl animate-pulse"/>
                            <div
                                className="relative w-24 h-24 rounded-full border-4 border-violet-500/30 border-t-violet-400 animate-spin"/>
                            <div className="absolute inset-0 flex items-center justify-center">
                                <ArrowLeftRight size={36} style={{color: '#a78bfa'}}/>
                            </div>
                        </div>

                        <div className="text-center">
                            <h2 className="text-2xl font-bold text-white">{t('snapshot.analyzing')}</h2>
                        </div>

                        {/* 进度条 */}
                        <div className="w-full h-1 bg-white/5 rounded-full overflow-hidden">
                            <motion.div
                                className="h-full bg-violet-500"
                                initial={{x: '-100%'}}
                                animate={{x: '100%'}}
                                transition={{repeat: Infinity, duration: 1.5, ease: 'linear'}}
                            />
                        </div>

                        <div className="w-full grid grid-cols-2 gap-3 mt-1">
                            {/* 耗时 */}
                            <div className="rounded-lg border border-white/8 bg-white/3 px-3 py-2 flex flex-col">
                                <span
                                    className="text-xs text-white/55 uppercase tracking-wider">{t('snapshot.elapsedTime')}</span>
                                <span
                                    className="text-base font-bold text-white">{formatDurationPrecise(analyzeElapsedMs)}</span>
                            </div>
                            {/* 合并大小 */}
                            <div className="rounded-lg border border-white/8 bg-white/3 px-3 py-2 flex flex-col">
                                <span
                                    className="text-xs text-white/55 uppercase tracking-wider">{t('snapshot.totalSize')}</span>
                                <span className="text-base font-bold text-white">
                  {snapOldInfo && snapNewInfo ? formatBytes(snapOldInfo.total_size + snapNewInfo.total_size) : '—'}
                </span>
                            </div>
                            {/* OLD + NEW 同格 */}
                            <div
                                className="col-span-2 rounded-lg border border-white/8 bg-white/3 px-3 py-2 flex gap-6">
                                <div className="flex-1 min-w-0">
                                    <Typography variant="caption"
                                                sx={{color: alpha('#ffffff', 0.55)}}>{t('snapshot.old')}</Typography>
                                    <Typography variant="body2" sx={{color: '#a5b4fc', fontWeight: 700}} noWrap>
                                        {snapOldInfo ? `${snapOldInfo.file_count.toLocaleString()} ${t('fileList.files')} · ${formatBytes(snapOldInfo.total_size)}` : '—'}
                                    </Typography>
                                </div>
                                <div className="flex-1 min-w-0">
                                    <Typography variant="caption"
                                                sx={{color: alpha('#ffffff', 0.55)}}>{t('snapshot.new')}</Typography>
                                    <Typography variant="body2" sx={{color: '#fcd34d', fontWeight: 700}} noWrap>
                                        {snapNewInfo ? `${snapNewInfo.file_count.toLocaleString()} ${t('fileList.files')} · ${formatBytes(snapNewInfo.total_size)}` : '—'}
                                    </Typography>
                                </div>
                            </div>
                        </div>
                    </div>
                </motion.div>
            </div>
        );
    }

    return (
        <div className="h-full flex flex-col overflow-hidden bg-background">
            {/* 顶部工具栏 */}
            <div
                className="flex items-center justify-between px-6 py-4 border-b"
                style={{borderColor: alpha('#ffffff', 0.08)}}
            >
                <div className="flex items-center gap-3">
                    <Images size={28} style={{color: '#a78bfa'}}/>
                    <div>
                        <Typography variant="h6" sx={{color: 'white', fontWeight: 700, lineHeight: 1.2}}>
                            {t('snapshot.management')}
                        </Typography>
                        <Typography variant="caption" sx={{color: alpha('#ffffff', 0.5)}}>
                            {t('snapshot.managementDesc')}
                        </Typography>
                    </div>
                </div>

                <div className="flex items-center gap-2">
                    {selectedIds.length === 2 && (
                        <button
                            onClick={handleAnalyze}
                            className="flex items-center gap-2 px-4 py-2 rounded-lg bg-violet-500/20 text-violet-300 border border-violet-500/30 hover:bg-violet-500/30 transition-all text-sm font-medium"
                        >
                            <ArrowLeftRight size={18}/>
                            {t('snapshot.analyze')}
                        </button>
                    )}
                    <Tooltip title={t('snapshot.refresh')}>
                        <IconButton onClick={loadSnapshots} disabled={isLoading} sx={{color: alpha('#ffffff', 0.6)}}>
                            {isLoading ? <Loader2 size={18} className="animate-spin"/> : <RefreshCw size={18}/>}
                        </IconButton>
                    </Tooltip>
                </div>
            </div>

            {/* 选择提示 */}
            {selectedIds.length > 0 && (
                <div
                    className="px-6 py-2 text-sm"
                    style={{background: alpha('#8b5cf6', 0.1), borderBottom: `1px solid ${alpha('#8b5cf6', 0.2)}`}}
                >
          <span style={{color: '#a78bfa'}}>
            {selectedIds.length === 1
                ? t('snapshot.selectedOld')
                : t('snapshot.selectedBoth')}
          </span>
                </div>
            )}

            {/* 错误提示 */}
            {error && (
                <div className="px-6 py-2 text-sm text-red-400 bg-red-500/10 border-b border-red-500/20">
                    {error}
                </div>
            )}

            {/* 快照列表 */}
            <div className="flex-1 overflow-y-auto custom-scrollbar px-6 py-4">
                {isLoading && snapshots.length === 0 ? (
                    <div className="flex items-center justify-center h-40">
                        <Loader2 size={32} className="animate-spin" style={{color: '#a78bfa'}}/>
                    </div>
                ) : snapshots.length === 0 ? (
                    <div className="flex flex-col items-center justify-center h-64 gap-4">
                        <Images size={64} style={{color: alpha('#ffffff', 0.15)}}/>
                        <Typography variant="body1" sx={{color: alpha('#ffffff', 0.4)}}>
                            {t('snapshot.noSnapshots')}
                        </Typography>
                        <Typography variant="caption" sx={{color: alpha('#ffffff', 0.25)}}>
                            {t('snapshot.noSnapshotsHint')}
                        </Typography>
                    </div>
                ) : (
                    <div className="space-y-2">
                        {/* 表头 */}
                        <div
                            className="grid text-xs font-semibold px-4 py-2 rounded-lg"
                            style={{
                                gridTemplateColumns: '40px 1fr 160px 100px 100px 48px',
                                color: alpha('#ffffff', 0.4),
                                background: alpha('#ffffff', 0.04),
                            }}
                        >
                            <span/>
                            <span>{t('snapshot.nameOrDrive')}</span>
                            <span>{t('snapshot.createdAt')}</span>
                            <span>{t('snapshot.totalSize')}</span>
                            <span>{t('snapshot.fileCount')}</span>
                            <span/>
                        </div>

                        {snapshots.map((snap, idx) => {
                            const isSelected = selectedIds.includes(snap.id);
                            const selOrder = selectedIds.indexOf(snap.id);

                            return (
                                <div
                                    key={snap.id}
                                    onClick={() => toggleSelect(snap.id)}
                                    className="grid items-center px-4 py-3 rounded-xl cursor-pointer transition-all"
                                    style={{
                                        gridTemplateColumns: '40px 1fr 160px 100px 100px 48px',
                                        background: isSelected
                                            ? alpha('#8b5cf6', 0.15)
                                            : idx % 2 === 0
                                                ? alpha('#ffffff', 0.03)
                                                : 'transparent',
                                        border: `1px solid ${isSelected ? alpha('#8b5cf6', 0.4) : alpha('#ffffff', 0.06)}`,
                                    }}
                                >
                                    <Box sx={{display: 'flex', alignItems: 'center'}}>
                                        <Checkbox
                                            checked={isSelected}
                                            size="small"
                                            sx={{
                                                p: 0,
                                                color: alpha('#ffffff', 0.3),
                                                '&.Mui-checked': {color: '#a78bfa'},
                                            }}
                                            onClick={(e) => e.stopPropagation()}
                                            onChange={() => toggleSelect(snap.id)}
                                        />
                                    </Box>

                                    <div className="flex items-center gap-2 min-w-0">
                                        {selOrder >= 0 && (
                                            <Chip
                                                label={selOrder === 0 ? t('snapshot.old') : t('snapshot.new')}
                                                size="small"
                                                sx={{
                                                    height: 20,
                                                    fontSize: 11,
                                                    fontWeight: 700,
                                                    bgcolor: selOrder === 0 ? alpha('#6366f1', 0.3) : alpha('#f59e0b', 0.3),
                                                    color: selOrder === 0 ? '#a5b4fc' : '#fcd34d',
                                                    border: `1px solid ${selOrder === 0 ? alpha('#6366f1', 0.5) : alpha('#f59e0b', 0.5)}`,
                                                }}
                                            />
                                        )}
                                        <div className="min-w-0">
                                            <Typography variant="body2"
                                                        sx={{color: 'white', fontWeight: 600, fontSize: 12.5}} noWrap>
                                                {snap.label ?? snap.drive}
                                            </Typography>
                                            {snap.label && (
                                                <Typography variant="caption" sx={{color: alpha('#ffffff', 0.4)}}
                                                            noWrap>
                                                    {snap.drive}
                                                </Typography>
                                            )}
                                        </div>
                                    </div>

                                    <Typography variant="caption" sx={{color: alpha('#ffffff', 0.6)}}>
                                        {formatTimestamp(snap.created_at)}
                                    </Typography>

                                    <Typography variant="caption" sx={{color: alpha('#ffffff', 0.8), fontWeight: 500}}>
                                        {formatBytes(snap.total_size)}
                                    </Typography>

                                    <Typography variant="caption" sx={{color: alpha('#ffffff', 0.6)}}>
                                        {snap.file_count.toLocaleString()} {t('fileList.files')}
                                    </Typography>

                                    <Tooltip title={t('snapshot.delete')}>
                                        <IconButton
                                            size="small"
                                            onClick={(e) => handleDelete(snap.id, e)}
                                            sx={{
                                                color: alpha('#ffffff', 0.3),
                                                '&:hover': {color: '#f87171', bgcolor: alpha('#ef4444', 0.1)},
                                            }}
                                        >
                                            <Trash2 size={16}/>
                                        </IconButton>
                                    </Tooltip>
                                </div>
                            );
                        })}
                    </div>
                )}
            </div>

            <style>{`
        .custom-scrollbar::-webkit-scrollbar { width: 0px; background: transparent; }
      `}</style>
        </div>
    );
};
