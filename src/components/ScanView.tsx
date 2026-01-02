import React, { useEffect, useRef } from 'react';
import { Box, CircularProgress, Typography, Paper, LinearProgress, alpha } from '@mui/material';
import { useTranslation } from 'react-i18next';
import { useScanStore } from '../store/scanStore';
import { useTabStore } from '../store/tabStore';
import { startScan, getScanProgress } from '../services/scanService';
import { formatBytes } from '../utils/format';
import { TreemapView } from './TreemapView';
import { FileList } from './FileList';
import { GroupOptions } from './GroupOptions';

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

  // 从 tab data 中获取状态
  const scanStage = activeTab?.data?.scanStage || 'scanning';
  const isScanning = activeTab?.data?.isScanning || false;
  const scanProgress = activeTab?.data?.scanProgress || null;

  useEffect(() => {
    // 如果已经在扫描或已有结果,不重复扫描
    if (scanningRef.current || activeTab?.data?.scanResult || activeTab?.data?.isScanning) {
      return;
    }

    // 标记正在扫描,防止重复执行
    scanningRef.current = true;

    const performScan = async () => {
      lastDurationRef.current = 0;
      
      // 更新 tab 状态为扫描中
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
        
        // 保存扫描结果到 tab data
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
          
          // 更新当前 tab 的进度
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
      <Box
        sx={{
          height: '100%',
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
          background: 'linear-gradient(135deg, #667eea 0%, #764ba2 100%)',
          position: 'relative',
          overflow: 'hidden',
        }}
      >
        {/* 动画背景 */}
        <Box
          sx={{
            position: 'absolute',
            width: '100%',
            height: '100%',
            opacity: 0.1,
            background: 'radial-gradient(circle at 20% 50%, white 0%, transparent 50%), radial-gradient(circle at 80% 80%, white 0%, transparent 50%)',
            animation: 'pulse 4s ease-in-out infinite',
            '@keyframes pulse': {
              '0%, 100%': { opacity: 0.1 },
              '50%': { opacity: 0.2 },
            },
          }}
        />

        <Paper
          elevation={12}
          sx={{
            p: 6,
            minWidth: 500,
            background: alpha('#ffffff', 0.95),
            backdropFilter: 'blur(10px)',
            borderRadius: 4,
            animation: 'fadeIn 0.5s ease-out',
            '@keyframes fadeIn': {
              from: { opacity: 0, transform: 'scale(0.9)' },
              to: { opacity: 1, transform: 'scale(1)' },
            },
          }}
        >
          <Box sx={{ display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 3 }}>
            <Box sx={{ position: 'relative' }}>
              <CircularProgress
                size={100}
                thickness={4}
                sx={{
                  color: 'primary.main',
                  animation: 'rotate 2s linear infinite',
                  '@keyframes rotate': {
                    '0%': { transform: 'rotate(0deg)' },
                    '100%': { transform: 'rotate(360deg)' },
                  },
                }}
              />
              <Box
                sx={{
                  position: 'absolute',
                  top: '50%',
                  left: '50%',
                  transform: 'translate(-50%, -50%)',
                  width: 60,
                  height: 60,
                  borderRadius: '50%',
                  background: 'linear-gradient(135deg, #667eea 0%, #764ba2 100%)',
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'center',
                  color: 'white',
                  fontWeight: 700,
                  fontSize: 20,
                }}
              >
                {drive.charAt(0)}
              </Box>
            </Box>

            <Typography
              variant="h4"
              sx={{
                fontWeight: 700,
                background: 'linear-gradient(135deg, #667eea 0%, #764ba2 100%)',
                WebkitBackgroundClip: 'text',
                WebkitTextFillColor: 'transparent',
                backgroundClip: 'text',
              }}
            >
              {getStageText(scanProgress?.stage || 'scanning', t)}
            </Typography>

            {scanProgress && (
              <Box sx={{ width: '100%' }}>
                <Box sx={{ display: 'flex', justifyContent: 'space-between', mb: 1 }}>
                  <Typography variant="body2" color="text.secondary">
                    {t('scanView.files')}: <strong>{(scanProgress.scanned_files || 0).toLocaleString()}</strong>
                  </Typography>
                  <Typography variant="body2" color="text.secondary">
                    {t('scanView.dirs')}: <strong>{(scanProgress.scanned_dirs || 0).toLocaleString()}</strong>
                  </Typography>
                </Box>
                <Box sx={{ display: 'flex', justifyContent: 'space-between', mb: 2 }}>
                  <Typography variant="body2" color="text.secondary">
                    {t('scanView.size')}: <strong>{formatBytes(scanProgress.total_size || 0)}</strong>
                  </Typography>
                  <Typography variant="body2" color="text.secondary">
                    {t('scanView.time')}: <strong>{formatDuration(scanProgress.duration_ms || 0, t)}</strong>
                  </Typography>
                </Box>
                <LinearProgress
                  sx={{
                    height: 8,
                    borderRadius: 4,
                    backgroundColor: alpha('#667eea', 0.2),
                    '& .MuiLinearProgress-bar': {
                      background: 'linear-gradient(90deg, #667eea 0%, #764ba2 100%)',
                      borderRadius: 4,
                    },
                  }}
                />
              </Box>
            )}
          </Box>
        </Paper>
      </Box>
    );
  }

  return (
    <Box
      sx={{
        height: '100%',
        display: 'flex',
        flexDirection: 'column',
        overflow: 'hidden',
        animation: 'fadeIn 0.6s ease-out',
        background: 'linear-gradient(135deg, #667eea 0%, #764ba2 100%)',
      }}
    >
      <Box sx={{ display: 'flex', flex: 1, minHeight: 0, overflow: 'hidden' }}>
        <Box sx={{ 
          width: 350, 
          flexShrink: 0, 
          display: 'flex', 
          flexDirection: 'column', 
          gap: 2,
          p: 2,
          overflow: 'auto',
          '&::-webkit-scrollbar': {
            width: 6,
          },
          '&::-webkit-scrollbar-thumb': {
            bgcolor: alpha('#ffffff', 0.3),
            borderRadius: 3,
          },
        }}>
          {/* 扫描信息卡片 */}
          {scanProgress && (
            <Paper 
              elevation={0} 
              sx={{ 
                p: 3,
                background: alpha('#ffffff', 0.15),
                backdropFilter: 'blur(10px)',
                border: `1px solid ${alpha('#ffffff', 0.2)}`,
                borderRadius: 2,
              }}
            >
              <Typography variant="h6" gutterBottom sx={{ fontWeight: 700, color: 'white' }}>
                {drive}
              </Typography>
              <Box sx={{ display: 'flex', flexDirection: 'column', gap: 1.5 }}>
                <Box>
                  <Typography variant="caption" sx={{ color: alpha('#ffffff', 0.7) }}>
                    {t('scanView.files')}
                  </Typography>
                  <Typography variant="h6" fontWeight="bold" sx={{ color: 'white' }}>
                    {(scanProgress.scanned_files || 0).toLocaleString()}
                  </Typography>
                </Box>
                <Box>
                  <Typography variant="caption" sx={{ color: alpha('#ffffff', 0.7) }}>
                    {t('scanView.dirs')}
                  </Typography>
                  <Typography variant="h6" fontWeight="bold" sx={{ color: 'white' }}>
                    {(scanProgress.scanned_dirs || 0).toLocaleString()}
                  </Typography>
                </Box>
                <Box>
                  <Typography variant="caption" sx={{ color: alpha('#ffffff', 0.7) }}>
                    {t('scanView.size')}
                  </Typography>
                  <Typography variant="h6" fontWeight="bold" sx={{ color: 'white' }}>
                    {formatBytes(scanProgress.total_size || 0)}
                  </Typography>
                </Box>
                <Box>
                  <Typography variant="caption" sx={{ color: alpha('#ffffff', 0.7) }}>
                    {t('scanView.time')}
                  </Typography>
                  <Typography variant="h6" fontWeight="bold" sx={{ color: 'white' }}>
                    {formatDuration(scanProgress.duration_ms || 0, t)}
                  </Typography>
                </Box>
              </Box>
            </Paper>
          )}
          
          <GroupOptions />
        </Box>

        <Box sx={{ 
          flex: 1, 
          minWidth: 0, 
          display: 'flex', 
          flexDirection: 'column', 
          p: 2,
          pt: 2,
          overflow: 'auto',
          '&::-webkit-scrollbar': {
            width: 8,
          },
          '&::-webkit-scrollbar-thumb': {
            bgcolor: 'grey.400',
            borderRadius: 4,
          },
          '& > *:not(:last-child)': {
            mb: 2,
          },
        }}>
          <TreemapView />
          <FileList />
        </Box>
      </Box>
    </Box>
  );
};

function getStageText(stage: string, t: (key: string) => string): string {
  switch (stage) {
    case 'scanning':
      return t('scanControl.scanning');
    case 'fetching_sizes':
      return t('scanControl.fetchingSizes');
    case 'building_tree':
      return t('scanControl.buildingTree');
    case 'serializing':
      return t('scanControl.serializing');
    case 'complete':
      return t('scanControl.complete');
    default:
      return t('scanControl.processing');
  }
}

function formatDuration(ms: number, t: (key: string, options?: any) => string): string {
  if (ms < 1000) return t('common.time.millisecond', { count: ms });
  
  const seconds = Math.floor(ms / 1000);
  if (seconds < 60) return t('common.time.second', { count: seconds });
  
  const minutes = Math.floor(seconds / 60);
  const remainingSeconds = seconds % 60;
  
  if (minutes < 60) {
    return remainingSeconds > 0 
      ? t('common.time.minuteWithSeconds', { minutes, seconds: remainingSeconds })
      : t('common.time.minute', { minutes });
  }
  
  const hours = Math.floor(minutes / 60);
  const remainingMinutes = minutes % 60;
  
  return remainingMinutes > 0 
    ? t('common.time.hourWithMinutes', { hours, minutes: remainingMinutes })
    : t('common.time.hour', { hours });
}
