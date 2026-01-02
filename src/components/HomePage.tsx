import React from 'react';
import { Box, Typography, Paper, alpha } from '@mui/material';
import { Storage, PhotoLibrary } from '@mui/icons-material';
import { useTranslation } from 'react-i18next';
import { useTabStore } from '../store/tabStore';

export const HomePage: React.FC = () => {
  const { t } = useTranslation();
  const { updateCurrentTab } = useTabStore();

  const handleDiskScan = () => {
    updateCurrentTab({
      type: 'disk-scan',
      title: t('home.diskScan'),
    });
  };

  const handleSnapshotAnalysis = () => {
    updateCurrentTab({
      type: 'snapshot-analysis',
      title: t('home.snapshotAnalysis'),
    });
  };

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
      {/* 背景动画圆 */}
      <Box
        sx={{
          position: 'absolute',
          width: '500px',
          height: '500px',
          borderRadius: '50%',
          background: alpha('#ffffff', 0.1),
          top: '-200px',
          left: '-200px',
          animation: 'float 20s ease-in-out infinite',
          '@keyframes float': {
            '0%, 100%': { transform: 'translate(0, 0) scale(1)' },
            '50%': { transform: 'translate(50px, 50px) scale(1.1)' },
          },
        }}
      />
      <Box
        sx={{
          position: 'absolute',
          width: '400px',
          height: '400px',
          borderRadius: '50%',
          background: alpha('#ffffff', 0.08),
          bottom: '-150px',
          right: '-150px',
          animation: 'float 15s ease-in-out infinite reverse',
        }}
      />

      {/* 主内容 */}
      <Box
        sx={{
          display: 'flex',
          gap: 8,
          alignItems: 'center',
          justifyContent: 'center',
          zIndex: 1,
        }}
      >
        {/* Disk Scan 按钮 */}
        <Paper
          elevation={8}
          onClick={handleDiskScan}
          sx={{
            width: 280,
            height: 280,
            borderRadius: '50%',
            display: 'flex',
            flexDirection: 'column',
            alignItems: 'center',
            justifyContent: 'center',
            cursor: 'pointer',
            transition: 'all 0.4s cubic-bezier(0.4, 0, 0.2, 1)',
            background: 'linear-gradient(135deg, #667eea 0%, #764ba2 100%)',
            color: 'white',
            position: 'relative',
            overflow: 'hidden',
            '&::before': {
              content: '""',
              position: 'absolute',
              top: 0,
              left: 0,
              right: 0,
              bottom: 0,
              background: 'radial-gradient(circle at center, rgba(255,255,255,0.2) 0%, transparent 70%)',
              opacity: 0,
              transition: 'opacity 0.4s ease',
            },
            '&:hover': {
              transform: 'scale(1.1) translateY(-10px)',
              boxShadow: '0 20px 60px rgba(102, 126, 234, 0.6)',
              '&::before': {
                opacity: 1,
              },
            },
            '&:active': {
              transform: 'scale(1.05) translateY(-5px)',
            },
          }}
        >
          <Storage
            sx={{
              fontSize: 80,
              mb: 2,
              opacity: 1,
              animation: 'pulse 2s ease-in-out infinite',
              '@keyframes pulse': {
                '0%, 100%': { transform: 'scale(1)' },
                '50%': { transform: 'scale(1.1)' },
              },
            }}
          />
          <Typography
            variant="h4"
            sx={{
              fontWeight: 700,
              textShadow: '0 2px 10px rgba(0,0,0,0.2)',
            }}
          >
            {t('home.diskScan')}
          </Typography>
        </Paper>

        {/* Snapshot 按钮 */}
        <Paper
          elevation={8}
          onClick={handleSnapshotAnalysis}
          sx={{
            width: 280,
            height: 280,
            borderRadius: '50%',
            display: 'flex',
            flexDirection: 'column',
            alignItems: 'center',
            justifyContent: 'center',
            cursor: 'pointer',
            transition: 'all 0.4s cubic-bezier(0.4, 0, 0.2, 1)',
            background: 'linear-gradient(135deg, #f093fb 0%, #f5576c 100%)',
            color: 'white',
            position: 'relative',
            overflow: 'hidden',
            '&::before': {
              content: '""',
              position: 'absolute',
              top: 0,
              left: 0,
              right: 0,
              bottom: 0,
              background: 'radial-gradient(circle at center, rgba(255,255,255,0.2) 0%, transparent 70%)',
              opacity: 0,
              transition: 'opacity 0.4s ease',
            },
            '&:hover': {
              transform: 'scale(1.1) translateY(-10px)',
              boxShadow: '0 20px 60px rgba(240, 147, 251, 0.6)',
              '&::before': {
                opacity: 1,
              },
            },
            '&:active': {
              transform: 'scale(1.05) translateY(-5px)',
            },
          }}
        >
          <PhotoLibrary
            sx={{
              fontSize: 80,
              mb: 2,
              opacity: 1,
              animation: 'pulse 2s ease-in-out infinite 0.5s',
            }}
          />
          <Typography
            variant="h4"
            sx={{
              fontWeight: 700,
              textShadow: '0 2px 10px rgba(0,0,0,0.2)',
            }}
          >
            {t('home.snapshot')}
          </Typography>
        </Paper>
      </Box>
    </Box>
  );
};
