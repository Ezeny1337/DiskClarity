import React from 'react';
import {
  Box,
  Paper,
  Typography,
  FormControl,
  Select,
  MenuItem,
  SelectChangeEvent,
  Stack,
  FormControlLabel,
  Switch,
  alpha,
} from '@mui/material';
import { Layers } from '@mui/icons-material';
import { useTranslation } from 'react-i18next';
import { GroupBy } from '../store/scanStore';
import { useTabStore } from '../store/tabStore';

export const GroupOptions: React.FC = () => {
  const { t } = useTranslation();
  const { getActiveTab, updateCurrentTab } = useTabStore();
  const activeTab = getActiveTab();

  const groupBy = activeTab?.data?.groupBy || 'none';
  const flatGrouping = activeTab?.data?.flatGrouping || false;

  const handleGroupChange = (event: SelectChangeEvent<GroupBy>) => {
    updateCurrentTab({
      data: {
        ...activeTab?.data,
        groupBy: event.target.value as GroupBy,
      },
    });
  };

  const handleFlatGroupingChange = (event: React.ChangeEvent<HTMLInputElement>) => {
    updateCurrentTab({
      data: {
        ...activeTab?.data,
        flatGrouping: event.target.checked,
      },
    });
  };

  return (
    <Paper
      elevation={0}
      className="bg-zinc-900/50 backdrop-blur-md border border-white/5 rounded-xl text-white"
      sx={{ p: 2, bgcolor: 'transparent' }}
    >
      <Box sx={{ display: 'flex', alignItems: 'center', gap: 1, mb: 2 }}>
        <Layers sx={{ color: 'white' }} />
        <Typography variant="h6" sx={{ color: 'white' }}>{t('groupOptions.title')}</Typography>
      </Box>

      <Stack spacing={2}>
        <FormControl fullWidth size="small">
          <Typography variant="caption" sx={{ mb: 0.5, color: alpha('#ffffff', 0.7) }}>
            {t('groupOptions.groupBy')}
          </Typography>
          <Select
            value={groupBy}
            onChange={handleGroupChange}
            sx={{
              color: 'white',
              bgcolor: alpha('#000', 0.2),
              borderRadius: 1,
              '.MuiOutlinedInput-notchedOutline': {
                border: '1px solid',
                borderColor: alpha('#ffffff', 0.1),
                transition: 'border-color 0.2s',
              },
              '&:hover .MuiOutlinedInput-notchedOutline': {
                borderColor: alpha('#ffffff', 0.3),
              },
              '&.Mui-focused .MuiOutlinedInput-notchedOutline': {
                borderWidth: '1px',
                borderColor: 'primary.main',
                boxShadow: `0 0 0 3px ${alpha('#3b82f6', 0.2)}`, // blue-500 equivalent
              },
              '.MuiSvgIcon-root': {
                color: 'white',
              },
            }}
            MenuProps={{
              transitionDuration: 120,
              PaperProps: {
                sx: {
                  background: alpha('#1a1a2e', 0.95),
                  backdropFilter: 'blur(20px)',
                  border: `1px solid ${alpha('#ffffff', 0.2)}`,
                  '& .MuiMenuItem-root': {
                    color: 'white',
                    transition: 'background-color 80ms ease',
                    '&:hover': {
                      background: alpha('#ffffff', 0.1),
                    },
                    '&.Mui-selected': {
                      background: alpha('#ffffff', 0.2),
                      '&:hover': {
                        background: alpha('#ffffff', 0.25),
                      },
                    },
                  },
                },
              },
            }}
          >
            <MenuItem disableRipple value="none">{t('groupOptions.none')}</MenuItem>
            <MenuItem disableRipple value="type">{t('groupOptions.byType')}</MenuItem>
            <MenuItem disableRipple value="extension">{t('groupOptions.byExtension')}</MenuItem>
          </Select>
        </FormControl>

        {groupBy !== 'none' && (
          <FormControlLabel
            control={
              <Switch
                sx={{
                  '& .MuiSwitch-switchBase.Mui-checked': {
                    color: 'white',
                  },
                  '& .MuiSwitch-switchBase.Mui-checked + .MuiSwitch-track': {
                    backgroundColor: alpha('#ffffff', 0.5),
                  },
                }}

                checked={flatGrouping}
                onChange={handleFlatGroupingChange}
                size="small"
              />
            }
            label={
              <Typography variant="caption" sx={{ color: alpha('#ffffff', 0.7) }}>
                {t('groupOptions.flatGrouping')}
              </Typography>
            }
          />
        )}
      </Stack>
    </Paper>
  );
};
