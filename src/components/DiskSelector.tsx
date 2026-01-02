import React, { useState, useEffect } from 'react';
import { Box, Typography, Paper, CircularProgress, alpha, Slider, Chip } from '@mui/material';
import { Storage, CheckCircle, Speed } from '@mui/icons-material';
import { useTranslation } from 'react-i18next';
import { getDrives, getDiskInfo, DiskInfo, getCpuCount } from '../services/scanService';
import { formatBytes } from '../utils/format';
import { useScanStore } from '../store/scanStore';

interface DiskSelectorProps {
  onSelect: (drive: string) => void;
}

export const DiskSelector: React.FC<DiskSelectorProps> = ({ onSelect }) => {
  const { t } = useTranslation();
  const [drives, setDrives] = useState<string[]>([]);
  const [diskInfos, setDiskInfos] = useState<Map<string, DiskInfo>>(new Map());
  const [selectedDrive, setSelectedDrive] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [cpuCount, setCpuCount] = useState<number>(0);
  const { scanConfig, setScanConfig } = useScanStore();

  useEffect(() => {
    const loadData = async () => {
      try {
        const [driveList, cpus] = await Promise.all([
          getDrives(),
          getCpuCount()
        ]);
        setDrives(driveList);
        setCpuCount(cpus);

        const infoMap = new Map<string, DiskInfo>();
        for (const drive of driveList) {
          try {
            const info = await getDiskInfo(drive);
            infoMap.set(drive, info);
          } catch (err) {
            console.error(`Failed to get info for ${drive}:`, err);
          }
        }
        setDiskInfos(infoMap);
      } catch (err) {
        console.error('Failed to load drives:', err);
      } finally {
        setLoading(false);
      }
    };

    loadData();
  }, []);

  const threadCount = scanConfig.max_threads || cpuCount;

  const handleThreadChange = (_event: Event, value: number | number[]) => {
    const threads = value as number;
    setScanConfig({
      max_threads: threads === cpuCount ? undefined : threads,
    });
  };

  const handleDriveClick = (drive: string) => {
    setSelectedDrive(drive);
    setTimeout(() => {
      onSelect(drive);
    }, 300);
  };

  if (loading) {
    return (
      <Box
        sx={{
          height: '100%',
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
          background: 'linear-gradient(135deg, #667eea 0%, #764ba2 100%)',
        }}
      >
        <CircularProgress size={60} sx={{ color: 'white' }} />
      </Box>
    );
  }

  return (
    <Box
      sx={{
        height: '100%',
        display: 'flex',
        flexDirection: 'column',
        alignItems: 'center',
        justifyContent: 'center',
        p: 4,
        background: 'linear-gradient(135deg, #667eea 0%, #764ba2 100%)',
      }}
    >
      <Typography
        variant="h3"
        sx={{
          color: 'white',
          fontWeight: 700,
          mb: 2,
          textShadow: '0 2px 10px rgba(0,0,0,0.2)',
          animation: 'fadeInDown 0.6s ease-out',
          '@keyframes fadeInDown': {
            from: {
              opacity: 0,
              transform: 'translateY(-30px)',
            },
            to: {
              opacity: 1,
              transform: 'translateY(0)',
            },
          },
        }}
      >
        {t('diskSelector.title')}
      </Typography>

      {/* CPU线程数设置 */}
      <Paper
        elevation={4}
        sx={{
          p: 3,
          mb: 4,
          minWidth: 400,
          bgcolor: alpha('#ffffff', 0.95),
          backdropFilter: 'blur(10px)',
          borderRadius: 3,
          animation: 'fadeInDown 0.6s ease-out 0.2s both',
        }}
      >
        <Box sx={{ display: 'flex', alignItems: 'center', gap: 1, mb: 2 }}>
          <Speed color="primary" />
          <Typography variant="h6" fontWeight="bold">
            {t('scanOptions.performance')}
          </Typography>
          <Chip
            label={t('scanOptions.threads', { count: threadCount })}
            size="small"
            color="primary"
            sx={{ ml: 'auto' }}
          />
        </Box>

        <Slider
          value={threadCount}
          onChange={handleThreadChange}
          min={1}
          max={Math.max(cpuCount, 16)}
          step={1}
          marks={[
            { value: 1, label: '1' },
            { value: Math.floor(cpuCount / 2), label: `${Math.floor(cpuCount / 2)}` },
            { value: cpuCount, label: t('scanOptions.auto') },
          ]}
          valueLabelDisplay="auto"
          sx={{ mt: 1 }}
        />
      </Paper>

      <Box
        sx={{
          display: 'flex',
          gap: 4,
          alignItems: 'center',
          justifyContent: 'center',
          flexWrap: 'wrap',
          animation: 'fadeInUp 0.6s ease-out 0.4s both',
          '@keyframes fadeInUp': {
            from: {
              opacity: 0,
              transform: 'translateY(30px)',
            },
            to: {
              opacity: 1,
              transform: 'translateY(0)',
            },
          },
        }}
      >
        {drives.map((drive, index) => {
          const diskInfo = diskInfos.get(drive);
          const usagePercent = diskInfo
            ? (diskInfo.used_space / diskInfo.total_space) * 100
            : 0;
          const isSelected = selectedDrive === drive;

          return (
            <Paper
              key={drive}
              elevation={isSelected ? 12 : 6}
              onClick={() => handleDriveClick(drive)}
              sx={{
                width: 240,
                height: 240,
                borderRadius: '50%',
                p: 0,
                cursor: 'pointer',
                transition: 'all 0.4s cubic-bezier(0.4, 0, 0.2, 1)',
                position: 'relative',
                overflow: 'hidden',
                display: 'flex',
                flexDirection: 'column',
                alignItems: 'center',
                justifyContent: 'center',
                background: isSelected
                  ? 'linear-gradient(135deg, #667eea 0%, #764ba2 100%)'
                  : 'white',
                color: isSelected ? 'white' : 'inherit',
                animation: `slideIn 0.4s ease-out ${index * 0.1}s both`,
                '@keyframes slideIn': {
                  from: {
                    opacity: 0,
                    transform: 'scale(0.8)',
                  },
                  to: {
                    opacity: 1,
                    transform: 'scale(1)',
                  },
                },
                '&::before': {
                  content: '""',
                  position: 'absolute',
                  top: 0,
                  left: 0,
                  right: 0,
                  bottom: 0,
                  background: isSelected
                    ? 'radial-gradient(circle at center, rgba(255,255,255,0.2) 0%, transparent 70%)'
                    : 'radial-gradient(circle at center, rgba(102,126,234,0.1) 0%, transparent 70%)',
                  opacity: 0,
                  transition: 'opacity 0.3s ease',
                },
                '&:hover': {
                  transform: 'scale(1.1)',
                  boxShadow: isSelected
                    ? '0 20px 60px rgba(102, 126, 234, 0.6)'
                    : '0 12px 40px rgba(0,0,0,0.2)',
                  '&::before': {
                    opacity: 1,
                  },
                },
                '&:active': {
                  transform: 'scale(1.05)',
                },
              }}
            >
              {isSelected && (
                <CheckCircle
                  sx={{
                    position: 'absolute',
                    top: 20,
                    right: 20,
                    fontSize: 28,
                    animation: 'checkmark 0.5s ease-out',
                    '@keyframes checkmark': {
                      '0%': {
                        transform: 'scale(0) rotate(-45deg)',
                        opacity: 0,
                      },
                      '50%': {
                        transform: 'scale(1.2) rotate(10deg)',
                      },
                      '100%': {
                        transform: 'scale(1) rotate(0deg)',
                        opacity: 1,
                      },
                    },
                  }}
                />
              )}

              <Box
                sx={{
                  position: 'relative',
                  zIndex: 1,
                  width: '100%',
                  height: '100%',
                  display: 'flex',
                  flexDirection: 'column',
                  alignItems: 'center',
                  justifyContent: 'center',
                  p: 3,
                  boxSizing: 'border-box',
                }}
              >
                <Storage
                  sx={{
                    fontSize: 60,
                    mb: 1,
                    color: isSelected ? 'white' : 'primary.main',
                    opacity: 1,
                  }}
                />

                <Typography
                  variant="h3"
                  sx={{
                    fontWeight: 700,
                    mb: 2,
                    color: isSelected ? 'white' : 'text.primary',
                  }}
                >
                  {drive.replace(':\\', '')}
                </Typography>

                {diskInfo && (
                  <>
                    <Typography
                      variant="body2"
                      sx={{
                        fontWeight: 600,
                        color: isSelected ? alpha('#ffffff', 0.95) : 'text.primary',
                        mb: 0.5,
                      }}
                    >
                      {formatBytes(diskInfo.total_space)}
                    </Typography>

                    <Typography
                      variant="caption"
                      sx={{
                        mt: 0.5,
                        fontWeight: 600,
                        color: isSelected ? alpha('#ffffff', 0.9) : 'text.secondary',
                      }}
                    >
                      {usagePercent.toFixed(0)}% {t('diskSelector.used')}
                    </Typography>
                  </>
                )}
              </Box>
            </Paper>
          );
        })}
      </Box>
    </Box>
  );
};
