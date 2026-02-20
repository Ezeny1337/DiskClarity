import React, {useEffect, useRef, useState} from 'react';
import {useTranslation} from 'react-i18next';
import {invoke} from '@tauri-apps/api/core';
import {ungzip} from 'pako';
import {decode} from '@msgpack/msgpack';
import {useScanStore} from '../store/scanStore';
import {useTabStore} from '../store/tabStore';
import {getScanProgress} from '../services/scanService';
import {saveSnapshot} from '../services/snapshotService';
import {formatBytes} from '../utils/format';
import {formatDurationPrecise, getStageText} from '../utils/scanUtils';
import {updateTabData} from '../utils/tabNavigation';
import {TreemapView} from './TreemapView';
import {FileList} from './FileList';
import {GroupOptions} from './GroupOptions';
import {motion} from 'framer-motion';
import {Card} from './ui/Card';
import {Button, Dialog, DialogActions, DialogContent, DialogTitle, TextField,} from '@mui/material';

interface ScanViewProps {
    drive: string;
}

export const ScanView: React.FC<ScanViewProps> = ({drive}) => {
    const {t} = useTranslation();
    const {getActiveTab} = useTabStore();
    const activeTab = getActiveTab();
    const tabId = activeTab?.id;
    const lastDurationRef = useRef<number>(0);
    const scanningRef = useRef<boolean>(false);
    const rawDataRef = useRef<Uint8Array | null>(null);
    const [isSavingSnapshot, setIsSavingSnapshot] = useState(false);
    const [snapshotError, setSnapshotError] = useState<string | null>(null);
    const [showLabelDialog, setShowLabelDialog] = useState(false);
    const [labelInput, setLabelInput] = useState('');

    const {scanConfig} = useScanStore();

    const scanStage = activeTab?.data?.scanStage || 'scanning';
    const isScanning = activeTab?.data?.isScanning || false;
    const scanProgress = activeTab?.data?.scanProgress || null;
    const scanTaskId = activeTab?.data?.scanTaskId;
    const snapshotSaved = activeTab?.data?.snapshotSaved ?? false;

    // 仅在 tab 首次挂载且尚未扫描时触发，scanningRef 防止 StrictMode 双重执行
    useEffect(() => {
        if (!tabId || scanningRef.current || activeTab?.data?.scanResult || activeTab?.data?.isScanning) {
            return;
        }

        scanningRef.current = true;

        const performScan = async () => {
            const currentTaskId = `${tabId}-${drive}-${Date.now()}`;
            lastDurationRef.current = 0;
            rawDataRef.current = null;
            setSnapshotError(null);
            if (tabId) updateTabData(tabId, {
                drive,
                scanTaskId: currentTaskId,
                isScanning: true,
                scanStage: 'scanning',
                error: null,
            });

            try {
                const compressedNums = await invoke<number[]>('start_scan', {
                    path: drive,
                    config: scanConfig,
                    taskId: currentTaskId,
                });
                const compressed = new Uint8Array(compressedNums);
                rawDataRef.current = compressed;
                if (tabId) updateTabData(tabId, {rawScanData: compressed});
                const decompressed = ungzip(compressed);
                const result = decode(decompressed) as import('../types').FileNode;

                // 迭代重建路径
                const stack: Array<{ node: any; parentPath: string }> = [{node: result, parentPath: ''}];
                while (stack.length > 0) {
                    const {node, parentPath} = stack.pop()!;
                    node.path = parentPath ? `${parentPath}\\${node.name}` : node.name;
                    if (node.children) {
                        for (const child of node.children) {
                            stack.push({node: child, parentPath: node.path});
                        }
                    }
                }

                const progress = {
                    scanned_files: result.file_count,
                    scanned_dirs: result.dir_count,
                    total_size: result.size,
                    current_path: result.path,
                    is_complete: true,
                    duration_ms: lastDurationRef.current,
                    stage: 'complete' as const,
                };

                if (tabId) updateTabData(tabId, {
                    drive,
                    scanTaskId: currentTaskId,
                    scanResult: result,
                    scanProgress: progress,
                    currentNode: result,
                    isScanning: false,
                    scanStage: 'complete',
                    sortField: 'size',
                    sortOrder: 'desc',
                    groupBy: 'none',
                    flatGrouping: false,
                    breadcrumbs: [],
                });
            } catch (err) {
                if (tabId) updateTabData(tabId, {
                    drive,
                    scanTaskId: currentTaskId,
                    isScanning: false,
                    error: String(err),
                });
            } finally {
                scanningRef.current = false;
            }
        };

        performScan();
    }, [drive, tabId, activeTab?.data?.scanResult, activeTab?.data?.isScanning]);

    useEffect(() => {
        let interval: ReturnType<typeof setInterval> | null = null;

        if (isScanning && tabId && scanTaskId) {
            interval = setInterval(async () => {
                try {
                    const progress = await getScanProgress(scanTaskId);
                    lastDurationRef.current = progress.duration_ms;
                    updateTabData(tabId, {scanProgress: progress});
                } catch (err) {
                    const message = String(err);
                    if (message.includes('No Active Scan')) {
                        updateTabData(tabId, {isScanning: false});
                        return;
                    }
                    console.error('Failed to get scan progress:', err);
                }
            }, 100);
        }

        return () => {
            if (interval) clearInterval(interval);
        };
    }, [isScanning, tabId, scanTaskId]);

    if (scanStage === 'scanning') {
        return (
            <div className="h-full flex items-center justify-center relative overflow-hidden bg-background">
                <motion.div
                    initial={{opacity: 0, scale: 0.9}}
                    animate={{opacity: 1, scale: 1}}
                    className="relative z-10 w-full max-w-2xl p-8"
                >
                    <Card
                        className="p-8 flex flex-col items-center gap-6 bg-zinc-900/80 backdrop-blur-xl border-white/5">
                        {/* 旋转的驱动器图标 */}
                        <div className="relative">
                            <div className="absolute inset-0 rounded-full bg-primary/20 blur-xl animate-pulse"/>
                            <div
                                className="relative w-24 h-24 rounded-full border-4 border-primary/30 border-t-primary animate-spin"/>
                            <div
                                className="absolute inset-0 flex items-center justify-center font-bold text-2xl text-white">
                                {drive.charAt(0)}
                            </div>
                        </div>

                        <div className="text-center space-y-2">
                            <h2 className="text-2xl font-bold text-white">
                                {getStageText(scanProgress?.stage || 'scanning', t)}
                            </h2>
                        </div>

                        {scanProgress && (
                            <div className="w-full grid grid-cols-2 gap-4 mt-4">
                                <StatItem label={t('scanView.files')}
                                          value={(scanProgress.scanned_files || 0).toLocaleString()}/>
                                <StatItem label={t('scanView.dirs')}
                                          value={(scanProgress.scanned_dirs || 0).toLocaleString()}/>
                                <StatItem label={t('scanView.size')} value={formatBytes(scanProgress.total_size || 0)}/>
                                <StatItem label={t('scanView.time')}
                                          value={formatDurationPrecise(scanProgress.duration_ms || 0)}/>
                            </div>
                        )}

                        {/* 进度条 */}
                        <div className="w-full h-1 bg-surface2 rounded-full overflow-hidden mt-2">
                            <motion.div
                                className="h-full bg-primary"
                                initial={{x: '-100%'}}
                                animate={{x: '100%'}}
                                transition={{repeat: Infinity, duration: 1.5, ease: "linear"}}
                            />
                        </div>

                    </Card>
                </motion.div>
            </div>
        );
    }


    const rawScanData = activeTab?.data?.rawScanData ?? null;
    if (rawScanData && !rawDataRef.current) {
        rawDataRef.current = rawScanData;
    }

    const handleSaveSnapshot = () => {
        if (!rawDataRef.current) return;
        setLabelInput('');
        setShowLabelDialog(true);
    };

    const handleConfirmSave = async () => {
        if (!rawDataRef.current) return;
        setShowLabelDialog(false);
        setIsSavingSnapshot(true);
        setSnapshotError(null);
        try {
            await saveSnapshot(rawDataRef.current, drive, labelInput.trim() || undefined);
            rawDataRef.current = null;
            if (tabId) updateTabData(tabId, {snapshotSaved: true, rawScanData: null});
            setTimeout(() => {
                if (tabId) updateTabData(tabId, {snapshotSaved: false});
            }, 3000);
        } catch (err) {
            setSnapshotError(String(err));
        } finally {
            setIsSavingSnapshot(false);
        }
    };

    // 完成视图
    return (
        <>
            <div className="h-full flex flex-col overflow-hidden bg-background">
                <div className="flex-1 flex min-h-0">
                    {/* 侧边栏信息 */}
                    <div
                        className="w-80 shrink-0 flex flex-col gap-4 p-4 border-r border-white/5 bg-zinc-900/30 overflow-y-auto custom-scrollbar">
                        {scanProgress && (
                            <Card className="p-4 space-y-4 bg-zinc-900/50 backdrop-blur-md">
                                <div className="flex items-center justify-between">
                                    <h2 className="text-xl font-bold text-white">{drive}</h2>
                                    <span
                                        className="text-xs text-green-400 bg-green-400/10 px-2 py-0.5 rounded-full">{t('scanControl.complete')}</span>
                                </div>

                                <div className="space-y-3">
                                    <StatRow label={t('scanView.files')}
                                             value={(scanProgress.scanned_files || 0).toLocaleString()}/>
                                    <StatRow label={t('scanView.dirs')}
                                             value={(scanProgress.scanned_dirs || 0).toLocaleString()}/>
                                    <StatRow label={t('scanView.size')}
                                             value={formatBytes(scanProgress.total_size || 0)}/>
                                    <StatRow label={t('scanView.time')}
                                             value={formatDurationPrecise(scanProgress.duration_ms || 0)}/>
                                </div>

                                {/* 保存快照按钮 */}
                                <button
                                    onClick={handleSaveSnapshot}
                                    disabled={isSavingSnapshot || (!rawDataRef.current && !rawScanData) || snapshotSaved}
                                    className={`w-full py-2 px-3 rounded-lg text-sm font-medium transition-all flex items-center justify-center gap-2 ${snapshotSaved
                                        ? 'bg-green-500/20 text-green-400 border border-green-500/30'
                                        : 'bg-blue-500/20 text-blue-400 border border-blue-500/30 hover:bg-blue-500/30 disabled:opacity-50 disabled:cursor-not-allowed'
                                    }`}
                                >
                                    {isSavingSnapshot ? (
                                        <>
                                            <span
                                                className="w-3 h-3 border-2 border-blue-400/50 border-t-blue-400 rounded-full animate-spin"/>
                                            {t('snapshot.saving')}
                                        </>
                                    ) : snapshotSaved ? (
                                        <>
                                            <span>✓</span>
                                            {t('snapshot.saved')}
                                        </>
                                    ) : (
                                        <>
                                            <span>📷</span>
                                            {t('snapshot.saveSnapshot')}
                                        </>
                                    )}
                                </button>
                                {snapshotError && (
                                    <p className="text-xs text-red-400 mt-1">{snapshotError}</p>
                                )}
                            </Card>
                        )}

                        <GroupOptions/>
                    </div>

                    {/* 主要内容 */}
                    <div className="flex-1 flex flex-col min-w-0 p-4 gap-6 overflow-y-auto custom-scrollbar">
                        <div
                            className="flex-none h-162.5 rounded-xl border border-white/5 bg-zinc-900/20 overflow-hidden relative">
                            <TreemapView/>
                        </div>
                        <div
                            className="flex-none min-h-150 rounded-xl border border-white/5 bg-zinc-900/20 overflow-hidden relative">
                            <FileList/>
                        </div>
                    </div>
                </div>
                <style>{`
        .custom-scrollbar::-webkit-scrollbar {
          width: 0px;
          background: transparent;
        }
      `}</style>
            </div>

            {/* 快照命名对话框 */}
            <Dialog
                open={showLabelDialog}
                onClose={() => setShowLabelDialog(false)}
                slotProps={{
                    paper: {
                        sx: {
                            bgcolor: '#1c1c1e',
                            border: '1px solid rgba(255,255,255,0.1)',
                            borderRadius: 3,
                            minWidth: 360
                        }
                    }
                }}
            >
                <DialogTitle sx={{color: 'white', fontWeight: 700}}>{t('snapshot.saveSnapshot')}</DialogTitle>
                <DialogContent>
                    <TextField
                        autoFocus
                        fullWidth
                        variant="outlined"
                        label={t('snapshot.labelPlaceholder')}
                        value={labelInput}
                        onChange={(e) => setLabelInput(e.target.value)}
                        onKeyDown={(e) => {
                            if (e.key === 'Enter') handleConfirmSave();
                        }}
                        sx={{
                            mt: 1,
                            '& .MuiOutlinedInput-root': {
                                color: 'white',
                                '& fieldset': {borderColor: 'rgba(255,255,255,0.2)'},
                                '&:hover fieldset': {borderColor: 'rgba(255,255,255,0.4)'},
                                '&.Mui-focused fieldset': {borderColor: '#8b5cf6'}
                            },
                            '& .MuiInputLabel-root': {color: 'rgba(255,255,255,0.5)'},
                        }}
                    />
                </DialogContent>
                <DialogActions sx={{px: 3, pb: 2, gap: 1}}>
                    <Button onClick={() => setShowLabelDialog(false)}
                            sx={{color: 'rgba(255,255,255,0.5)'}}>{t('common.cancel')}</Button>
                    <Button onClick={handleConfirmSave} variant="contained"
                            sx={{bgcolor: '#8b5cf6', '&:hover': {bgcolor: '#7c3aed'}}}>{t('common.confirm')}</Button>
                </DialogActions>
            </Dialog>
        </>
    );
};

// 辅助组件
const StatItem = ({label, value}: { label: string; value: string }) => (
    <div className="flex flex-col items-center p-3 rounded-lg bg-surface2/50 border border-white/5">
        <span className="text-xs text-text-muted uppercase tracking-wider">{label}</span>
        <span className="text-lg font-bold text-white">{value}</span>
    </div>
);

const StatRow = ({label, value}: { label: string; value: string }) => (
    <div className="flex justify-between items-center">
        <span className="text-sm text-text-muted">{label}</span>
        <span className="text-sm font-medium text-white">{value}</span>
    </div>
);

