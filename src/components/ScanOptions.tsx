import React, { useState, useEffect } from 'react';
import {
  Box,
  Paper,
  Typography,
  Slider,
  Accordion,
  AccordionSummary,
  AccordionDetails,
  Chip,
} from '@mui/material';
import { ExpandMore, Settings, Speed } from '@mui/icons-material';
import { useTranslation } from 'react-i18next';
import { useScanStore } from '../store/scanStore';
import { getCpuCount } from '../services/scanService';

export const ScanOptions: React.FC = () => {
  const { t } = useTranslation();
  const [cpuCount, setCpuCount] = useState<number>(0);
  const { scanConfig, setScanConfig, isScanning } = useScanStore();

  useEffect(() => {
    getCpuCount().then(setCpuCount);
  }, []);

  const threadCount = scanConfig.max_threads || cpuCount;

  const handleThreadChange = (_event: Event, value: number | number[]) => {
    const threads = value as number;
    setScanConfig({
      max_threads: threads === cpuCount ? undefined : threads,
    });
  };

  return (
    <Paper elevation={3} sx={{ mb: 3 }}>
      <Accordion defaultExpanded>
        <AccordionSummary
          expandIcon={<ExpandMore />}
          sx={{ bgcolor: 'primary.main', color: 'white' }}
        >
          <Box sx={{ display: 'flex', alignItems: 'center', gap: 1, width: '100%' }}>
            <Settings />
            <Typography variant="h6">{t('scanOptions.title')}</Typography>
            <Box sx={{ ml: 'auto', mr: 2 }}>
              <Chip
                label={t('scanOptions.threads', { count: threadCount })}
                size="small"
                sx={{ bgcolor: 'rgba(255,255,255,0.2)', color: 'white' }}
              />
            </Box>
          </Box>
        </AccordionSummary>
        <AccordionDetails sx={{ p: 3 }}>
          {/* 线程数滑块 */}
          <Box sx={{ mb: 4 }}>
            <Box sx={{ display: 'flex', alignItems: 'center', gap: 1, mb: 2 }}>
              <Speed color="primary" />
              <Typography variant="subtitle1" fontWeight="bold">
                {t('scanOptions.performance')}
              </Typography>
            </Box>
            
            <Typography variant="body2" color="text.secondary" gutterBottom>
              {t('scanOptions.threadCount', { 
                count: threadCount, 
                auto: threadCount === cpuCount ? t('scanOptions.autoAllCores') : '' 
              })}
            </Typography>
            
            <Slider
              value={threadCount}
              onChange={handleThreadChange}
              min={1}
              max={Math.max(cpuCount, 16)}
              step={1}
              marks={
                cpuCount >= 16
                  ? [
                      { value: 1, label: '1' },
                      { value: Math.floor(cpuCount / 2), label: `${Math.floor(cpuCount / 2)}` },
                      { value: cpuCount, label: t('scanOptions.auto') },
                    ]
                  : [
                      { value: 1, label: '1' },
                      { value: Math.floor(cpuCount / 2), label: `${Math.floor(cpuCount / 2)}` },
                      { value: cpuCount, label: t('scanOptions.auto') },
                      { value: 16, label: '16' },
                    ]
              }
              disabled={isScanning}
              valueLabelDisplay="auto"
              sx={{ mt: 2 }}
            />
            
            <Box sx={{ display: 'flex', justifyContent: 'space-between', mt: 1 }}>
              <Typography variant="caption" color="text.secondary">
                {t('scanOptions.slowerLowCpu')}
              </Typography>
              <Typography variant="caption" color="text.secondary">
                {t('scanOptions.fasterHighCpu')}
              </Typography>
            </Box>
          </Box>

        </AccordionDetails>
      </Accordion>
    </Paper>
  );
};
