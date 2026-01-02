import React from 'react';
import { Box, Typography, Paper } from '@mui/material';
import { PhotoLibrary } from '@mui/icons-material';
import { useTranslation } from 'react-i18next';

export const SnapshotTab: React.FC = () => {
  const { t } = useTranslation();

  return (
    <Box
      sx={{
        height: '100%',
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
        background: 'linear-gradient(135deg, #f093fb 0%, #f5576c 100%)',
      }}
    >
      <Paper
        elevation={8}
        sx={{
          p: 6,
          textAlign: 'center',
          maxWidth: 500,
        }}
      >
        <PhotoLibrary sx={{ fontSize: 80, color: 'primary.main', mb: 2 }} />
        <Typography variant="h4" gutterBottom sx={{ fontWeight: 700 }}>
          {t('snapshot.comingSoon')}
        </Typography>
        <Typography variant="body1" color="text.secondary">
          {t('snapshot.description')}
        </Typography>
      </Paper>
    </Box>
  );
};
