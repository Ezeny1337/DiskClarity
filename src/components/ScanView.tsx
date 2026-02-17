import React, { useEffect, useRef } from 'react';
import { useTranslation } from 'react-i18next';
import { useScanStore } from '../store/scanStore';
import { useTabStore } from '../store/tabStore';
import { startScan, getScanProgress } from '../services/scanService';
import { formatBytes } from '../utils/format';
import { TreemapView } from './TreemapView';
import { FileList } from './FileList';
import { GroupOptions } from './GroupOptions';
import { motion } from 'framer-motion';
import { Card } from './ui/Card';

interface ScanViewProps {
  drive: string;
}

export const ScanView: React.FC<ScanViewProps> = ({ drive }) => {
  const { t } = useTranslation();
  const { getActiveTab, updateCurrentTab } = useTabStore();
  const activeTab = getActiveTab();
  const lastDurationRef = useRef<number>(0);
  const scanningRef = useRef<boolean>(false);

  const { scanConfig } = useScanStore();

  const scanStage = activeTab?.data?.scanStage || 'scanning';
  const isScanning = activeTab?.data?.isScanning || false;
  const scanProgress = activeTab?.data?.scanProgress || null;

  useEffect(() => {
    if (scanningRef.current || activeTab?.data?.scanResult || activeTab?.data?.isScanning) {
      return;
    }

    scanningRef.current = true;

    const performScan = async () => {
      lastDurationRef.current = 0;
      updateCurrentTab({
        data: {
          ...activeTab?.data,
          drive,
          isScanning: true,
          scanStage: 'scanning',
          error: null,
        },
      });

      try {
        const result = await startScan(drive, scanConfig);
        const progress = {
          scanned_files: result.file_count,
          scanned_dirs: result.dir_count,
          total_size: result.size,
          current_path: result.path,
          is_complete: true,
          duration_ms: lastDurationRef.current,
          stage: 'complete' as const,
        };

        updateCurrentTab({
          data: {
            ...activeTab?.data,
            drive,
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
          },
        });
      } catch (err) {
        updateCurrentTab({
          data: {
            ...activeTab?.data,
            drive,
            isScanning: false,
            error: String(err),
          },
        });
      }
    };

    performScan();
  }, [drive, activeTab?.id]);

  useEffect(() => {
    let interval: ReturnType<typeof setInterval> | null = null;

    if (isScanning && activeTab?.id) {
      interval = setInterval(async () => {
        try {
          const progress = await getScanProgress();
          lastDurationRef.current = progress.duration_ms;
          updateCurrentTab({
            data: {
              ...activeTab?.data,
              scanProgress: progress,
            },
          });
        } catch (err) {
          console.error('Failed to get scan progress:', err);
        }
      }, 200);
    }

    return () => {
      if (interval) clearInterval(interval);
    };
  }, [isScanning, activeTab?.id]);

  if (scanStage === 'scanning') {
    return (
      <div className="h-full flex items-center justify-center relative overflow-hidden bg-background">
        <motion.div
          initial={{ opacity: 0, scale: 0.9 }}
          animate={{ opacity: 1, scale: 1 }}
          className="relative z-10 w-full max-w-2xl p-8"
        >
          <Card className="p-8 flex flex-col items-center gap-6 bg-zinc-900/80 backdrop-blur-xl border-white/5">
            {/* 旋转的驱动器图标 */}
            <div className="relative">
              <div className="absolute inset-0 rounded-full bg-primary/20 blur-xl animate-pulse" />
              <div className="relative w-24 h-24 rounded-full border-4 border-primary/30 border-t-primary animate-spin" />
              <div className="absolute inset-0 flex items-center justify-center font-bold text-2xl text-white">
                {drive.charAt(0)}
              </div>
            </div>

            <div className="text-center space-y-2">
              <h2 className="text-2xl font-bold text-white">
                {getStageText(scanProgress?.stage || 'scanning', t)}
              </h2>
              {scanProgress && (
                <p className="text-sm text-text-muted font-mono truncate max-w-md">
                  {scanProgress.current_path || 'Scanning...'}
                </p>
              )}
            </div>

            {scanProgress && (
              <div className="w-full grid grid-cols-2 gap-4 mt-4">
                <StatItem label={t('scanView.files')} value={(scanProgress.scanned_files || 0).toLocaleString()} />
                <StatItem label={t('scanView.dirs')} value={(scanProgress.scanned_dirs || 0).toLocaleString()} />
                <StatItem label={t('scanView.size')} value={formatBytes(scanProgress.total_size || 0)} />
                <StatItem label={t('scanView.time')} value={formatDuration(scanProgress.duration_ms || 0, t)} />
              </div>
            )}

            {/* 进度条 */}
            <div className="w-full h-1 bg-surface2 rounded-full overflow-hidden mt-2">
              <motion.div
                className="h-full bg-primary"
                initial={{ x: '-100%' }}
                animate={{ x: '100%' }}
                transition={{ repeat: Infinity, duration: 1.5, ease: "linear" }}
              />
            </div>

          </Card>
        </motion.div>
      </div>
    );
  }


  // 完成视图
  return (
    <div className="h-full flex flex-col overflow-hidden bg-background">
      <div className="flex-1 flex min-h-0">
        {/* 侧边栏信息 */}
        <div className="w-80 flex-shrink-0 flex flex-col gap-4 p-4 border-r border-white/5 bg-zinc-900/30 overflow-y-auto custom-scrollbar">
          {scanProgress && (
            <Card className="p-4 space-y-4 bg-zinc-900/50 backdrop-blur-md">
              <div className="flex items-center justify-between">
                <h2 className="text-xl font-bold text-white">{drive}</h2>
                <span className="text-xs text-green-400 bg-green-400/10 px-2 py-0.5 rounded-full">Completed</span>
              </div>

              <div className="space-y-3">
                <StatRow label={t('scanView.files')} value={(scanProgress.scanned_files || 0).toLocaleString()} />
                <StatRow label={t('scanView.dirs')} value={(scanProgress.scanned_dirs || 0).toLocaleString()} />
                <StatRow label={t('scanView.size')} value={formatBytes(scanProgress.total_size || 0)} />
                <StatRow label={t('scanView.time')} value={formatDuration(scanProgress.duration_ms || 0, t)} />
              </div>
            </Card>
          )}

          <GroupOptions />
        </div>

        {/* 主要内容 - 可滚动 */}
        <div className="flex-1 flex flex-col min-w-0 p-4 gap-6 overflow-y-auto custom-scrollbar">
          <div className="flex-none h-[650px] rounded-xl border border-white/5 bg-zinc-900/20 overflow-hidden relative">
            <TreemapView />
          </div>
          <div className="flex-none min-h-[600px] rounded-xl border border-white/5 bg-zinc-900/20 overflow-hidden relative">
            <FileList />
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
  );
};

// 辅助组件
const StatItem = ({ label, value }: { label: string; value: string }) => (
  <div className="flex flex-col items-center p-3 rounded-lg bg-surface2/50 border border-white/5">
    <span className="text-xs text-text-muted uppercase tracking-wider">{label}</span>
    <span className="text-lg font-bold text-white">{value}</span>
  </div>
);

const StatRow = ({ label, value }: { label: string; value: string }) => (
  <div className="flex justify-between items-center">
    <span className="text-sm text-text-muted">{label}</span>
    <span className="text-sm font-medium text-white">{value}</span>
  </div>
);

function getStageText(stage: string, t: (key: string) => string): string {
  switch (stage) {
    case 'scanning': return t('scanControl.scanning');
    case 'fetching_sizes': return t('scanControl.fetchingSizes');
    case 'building_tree': return t('scanControl.buildingTree');
    case 'serializing': return t('scanControl.serializing');
    case 'complete': return t('scanControl.complete');
    default: return t('scanControl.processing');
  }
}

function formatDuration(ms: number, t: (key: string, options?: any) => string): string {
  if (ms < 1000) return t('common.time.millisecond', { count: ms });
  const seconds = Math.floor(ms / 1000);
  if (seconds < 60) return t('common.time.second', { count: seconds });
  const minutes = Math.floor(seconds / 60);
  const remainingSeconds = seconds % 60;
  if (minutes < 60) return remainingSeconds > 0 ? t('common.time.minuteWithSeconds', { minutes, seconds: remainingSeconds }) : t('common.time.minute', { minutes });
  const hours = Math.floor(minutes / 60);
  const remainingMinutes = minutes % 60;
  return remainingMinutes > 0 ? t('common.time.hourWithMinutes', { hours, minutes: remainingMinutes }) : t('common.time.hour', { hours });
}
