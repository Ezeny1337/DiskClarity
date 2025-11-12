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
} from '@mui/material';
import { Sort } from '@mui/icons-material';
import { useTranslation } from 'react-i18next';
import { useScanStore, SortField, SortOrder } from '../store/scanStore';

export const SortOptions: React.FC = () => {
  const { t } = useTranslation();
  const { sortField, sortOrder, setSortField, setSortOrder } = useScanStore();

  /**
   * 处理排序字段改变事件
   */
  const handleFieldChange = (event: SelectChangeEvent<SortField>) => {
    setSortField(event.target.value as SortField);
  };

  /**
   * 处理排序顺序改变事件
   */
  const handleOrderChange = (event: SelectChangeEvent<SortOrder>) => {
    setSortOrder(event.target.value as SortOrder);
  };

  return (
    <Paper elevation={3} sx={{ p: 2 }}>
      <Box sx={{ display: 'flex', alignItems: 'center', gap: 1, mb: 2 }}>
        <Sort color="primary" />
        <Typography variant="h6">{t('sortOptions.title')}</Typography>
      </Box>
      
      <Stack spacing={2}>
        <FormControl fullWidth size="small">
          <Typography variant="caption" color="text.secondary" sx={{ mb: 0.5 }}>
            {t('sortOptions.sortBy')}
          </Typography>
          <Select value={sortField} onChange={handleFieldChange}>
            <MenuItem value="name">{t('sortOptions.name')}</MenuItem>
            <MenuItem value="size">{t('sortOptions.size')}</MenuItem>
            <MenuItem value="modified">{t('sortOptions.modified')}</MenuItem>
            <MenuItem value="fileCount">{t('sortOptions.fileCount')}</MenuItem>
          </Select>
        </FormControl>

        <FormControl fullWidth size="small">
          <Typography variant="caption" color="text.secondary" sx={{ mb: 0.5 }}>
            {t('sortOptions.sortOrder')}
          </Typography>
          <Select value={sortOrder} onChange={handleOrderChange}>
            <MenuItem value="asc">{t('sortOptions.ascending')}</MenuItem>
            <MenuItem value="desc">{t('sortOptions.descending')}</MenuItem>
          </Select>
        </FormControl>
      </Stack>
    </Paper>
  );
};
