import React, { useState, useEffect, useRef } from 'react';
import {
  Box,
  Button,
  Select,
  MenuItem,
  FormControl,
  InputLabel,
  Paper,
  CircularProgress,
  Typography,
  Stack,
  SelectChangeEvent,
} from '@mui/material';
import {
  PlayArrow,
  Stop,
  FolderSpecial,
  Storage,
} from '@mui/icons-material';
import { useTranslation } from 'react-i18next';
import { useScanStore } from '../store/scanStore';
import { startScan, cancelScan, getDrives, getScanProgress, getDiskInfo, DiskInfo } from '../services/scanService';
import { formatBytes } from '../utils/format';

export const ScanControl: React.FC = () => {
  const { t } = useTranslation();
  const [selectedDrive, setSelectedDrive] = useState<string>('');
  const [drives, setDrives] = useState<string[]>([]);
  const [diskInfo, setDiskInfo] = useState<DiskInfo | null>(null);
  const lastDurationRef = useRef<number>(0);
  
  const {
    isScanning,
    scanProgress,
    scanConfig,
    setIsScanning,
    setScanResult,
    setScanProgress,
    setError,
    reset,
  } = useScanStore();

  useEffect(() => {
    // 加载可用的驱动器
    getDrives().then(setDrives).catch(() => {});
  }, []);

  useEffect(() => {
    let interval: ReturnType<typeof setInterval> | null = null;
    
    if (isScanning) {
      // 定期轮询进度更新
      interval = setInterval(async () => {
        try {
          const progress = await getScanProgress();
          setScanProgress(progress);
          // 记录最新的持续时间
          lastDurationRef.current = progress.duration_ms;
        } catch (err) {
        }
      }, 200); // 每200毫秒更新一次
    }
    
    return () => {
      if (interval) clearInterval(interval);
    };
  }, [isScanning, setScanProgress]);

  const handleStartScan = async () => {
    if (!selectedDrive) {
      setError(t('scanControl.pleaseSelectDrive'));
      return;
    }

    reset();
    lastDurationRef.current = 0;
    setIsScanning(true);
    setError(null);

    try {
      const result = await startScan(selectedDrive, scanConfig);
      
      // 设置最终结果
      setScanResult(result);
      
      // 标记为完成
      setScanProgress({
        scanned_files: result.file_count,
        scanned_dirs: result.dir_count,
        total_size: result.size,
        current_path: result.path,
        is_complete: true,
        duration_ms: lastDurationRef.current,
        stage: 'complete',
      });
    } catch (err) {
      setError(String(err));
    } finally {
      setIsScanning(false);
    }
  };

  const handleCancelScan = async () => {
    try {
      await cancelScan();
      setIsScanning(false);
    } catch (err) {
      // Handle cancel error silently
    }
  };

  const handleDriveChange = async (event: SelectChangeEvent) => {
    const drive = event.target.value;
    setSelectedDrive(drive);
    
    // 选择驱动器时获取磁盘信息
    if (drive) {
      try {
        const info = await getDiskInfo(drive);
        setDiskInfo(info);
      } catch (err) {
        setDiskInfo(null);
      }
    } else {
      setDiskInfo(null);
    }
  };

  return (
    <Paper elevation={3} sx={{ p: 3, mb: 3 }}>
      <Typography variant="h5" gutterBottom sx={{ display: 'flex', alignItems: 'center', gap: 1 }}>
        <FolderSpecial color="primary" />
        {t('scanControl.title')}
      </Typography>

      <Stack spacing={2} sx={{ mt: 2 }}>
        {/* 驱动器选择 */}
        <FormControl fullWidth>
          <InputLabel>{t('scanControl.selectDrive')}</InputLabel>
          <Select
            value={selectedDrive}
            label={t('scanControl.selectDriveLabel')}
            onChange={handleDriveChange}
            disabled={isScanning}
            MenuProps={{
              transitionDuration: 120,
            }}
          >
            {drives.map((drive) => (
              <MenuItem disableRipple key={drive} value={drive}>
                {drive}
              </MenuItem>
            ))}
          </Select>
        </FormControl>

        {/* 磁盘信息显示 */}
        {diskInfo && (
          <Paper variant="outlined" sx={{ p: 2, bgcolor: 'background.default' }}>
            <Box sx={{ display: 'flex', alignItems: 'center', gap: 1, mb: 1 }}>
              <Storage color="primary" />
              <Typography variant="subtitle2" fontWeight="bold">
                {t('scanControl.diskInfo')}
              </Typography>
            </Box>
            <Stack spacing={0.5}>
              <Box sx={{ display: 'flex', justifyContent: 'space-between' }}>
                <Typography variant="body2" color="text.secondary">{t('scanControl.totalCapacity')}</Typography>
                <Typography variant="body2" fontWeight="medium">{formatBytes(diskInfo.total_space)}</Typography>
              </Box>
              <Box sx={{ display: 'flex', justifyContent: 'space-between' }}>
                <Typography variant="body2" color="text.secondary">{t('scanControl.usedSpace')}</Typography>
                <Typography variant="body2" fontWeight="medium" color="error.main">
                  {formatBytes(diskInfo.used_space)}
                </Typography>
              </Box>
              <Box sx={{ display: 'flex', justifyContent: 'space-between' }}>
                <Typography variant="body2" color="text.secondary">{t('scanControl.availableSpace')}</Typography>
                <Typography variant="body2" fontWeight="medium" color="success.main">
                  {formatBytes(diskInfo.available_space)}
                </Typography>
              </Box>
              <Box sx={{ mt: 1 }}>
                <Box sx={{ display: 'flex', justifyContent: 'space-between', mb: 0.5 }}>
                  <Typography variant="caption" color="text.secondary">{t('scanControl.usageRate')}</Typography>
                  <Typography variant="caption" color="text.secondary">
                    {((diskInfo.used_space / diskInfo.total_space) * 100).toFixed(1)}%
                  </Typography>
                </Box>
                <Box sx={{ width: '100%', height: 8, bgcolor: 'grey.300', borderRadius: 1, overflow: 'hidden' }}>
                  <Box
                    sx={{
                      width: `${(diskInfo.used_space / diskInfo.total_space) * 100}%`,
                      height: '100%',
                      bgcolor: 'primary.main',
                    }}
                  />
                </Box>
              </Box>
            </Stack>
          </Paper>
        )}

        {/* 扫描按钮 */}
        <Box>
          {!isScanning ? (
            <Button
              variant="contained"
              size="large"
              startIcon={<PlayArrow />}
              onClick={handleStartScan}
              fullWidth
            >
              {t('scanControl.startScan')}
            </Button>
          ) : (
            <Button
              variant="contained"
              size="large"
              color="error"
              startIcon={<Stop />}
              onClick={handleCancelScan}
              fullWidth
            >
              {t('scanControl.cancelScan')}
            </Button>
          )}
        </Box>

        {/* 扫描进度显示 */}
        {isScanning && scanProgress && (
          <Paper variant="outlined" sx={{ p: 2, bgcolor: 'background.default' }}>
            <Box sx={{ display: 'flex', alignItems: 'center', gap: 2, mb: 1 }}>
              <CircularProgress size={24} />
              <Typography variant="body2" color="text.secondary">
                {getStageText(scanProgress.stage || 'scanning', t)}
              </Typography>
            </Box>
            <Typography variant="body2">
              <strong>{t('scanControl.files')}:</strong> {(scanProgress.scanned_files || 0).toLocaleString()} | 
              <strong>{t('scanControl.dirs')}:</strong> {(scanProgress.scanned_dirs || 0).toLocaleString()}
            </Typography>
            <Typography variant="body2">
              <strong>{t('scanControl.size')}:</strong> {formatBytes(scanProgress.total_size || 0)} | 
              <strong>{t('scanControl.time')}:</strong> {formatDuration(scanProgress.duration_ms || 0, t)}
            </Typography>
          </Paper>
        )}
        
        {/* 扫描完成信息 */}
        {!isScanning && scanProgress && scanProgress.is_complete && (
          <Paper variant="outlined" sx={{ p: 2, bgcolor: 'success.light', color: 'success.contrastText' }}>
            <Typography variant="body2" fontWeight="bold">
              ✓ {t('scanControl.scanCompleted', { duration: formatDuration(scanProgress.duration_ms || 0, t) })}
            </Typography>
            <Typography variant="caption">
              {t('scanControl.scanDetails', { 
                files: (scanProgress.scanned_files || 0).toLocaleString(),
                dirs: (scanProgress.scanned_dirs || 0).toLocaleString(),
                size: formatBytes(scanProgress.total_size || 0)
              })}
            </Typography>
          </Paper>
        )}
      </Stack>
    </Paper>
  );
};

// 获取扫描阶段的显示文本
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

// 格式化时间间隔为可读的字符串
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
