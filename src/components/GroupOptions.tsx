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
} from '@mui/material';
import { Layers } from '@mui/icons-material';
import { useTranslation } from 'react-i18next';
import { useScanStore, GroupBy } from '../store/scanStore';

export const GroupOptions: React.FC = () => {
  const { t } = useTranslation();
  const { groupBy, setGroupBy, flatGrouping, setFlatGrouping } = useScanStore();

  const handleGroupChange = (event: SelectChangeEvent<GroupBy>) => {
    setGroupBy(event.target.value as GroupBy);
  };

  const handleFlatGroupingChange = (event: React.ChangeEvent<HTMLInputElement>) => {
    setFlatGrouping(event.target.checked);
  };

  return (
    <Paper elevation={3} sx={{ p: 2 }}>
      <Box sx={{ display: 'flex', alignItems: 'center', gap: 1, mb: 2 }}>
        <Layers color="primary" />
        <Typography variant="h6">{t('groupOptions.title')}</Typography>
      </Box>
      
      <Stack spacing={2}>
        <FormControl fullWidth size="small">
          <Typography variant="caption" color="text.secondary" sx={{ mb: 0.5 }}>
            {t('groupOptions.groupBy')}
          </Typography>
          <Select value={groupBy} onChange={handleGroupChange}>
            <MenuItem value="none">{t('groupOptions.none')}</MenuItem>
            <MenuItem value="type">{t('groupOptions.byType')}</MenuItem>
            <MenuItem value="extension">{t('groupOptions.byExtension')}</MenuItem>
          </Select>
        </FormControl>

        {groupBy !== 'none' && (
          <FormControlLabel
            control={
              <Switch
                checked={flatGrouping}
                onChange={handleFlatGroupingChange}
                size="small"
              />
            }
            label={
              <Typography variant="caption" color="text.secondary">
                {t('groupOptions.flatGrouping')}
              </Typography>
            }
          />
        )}
      </Stack>
    </Paper>
  );
};
