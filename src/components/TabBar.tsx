import React, { useState } from 'react';
import { Box, IconButton, Tooltip, alpha } from '@mui/material';
import { Add, Close, Home, Storage, PhotoLibrary } from '@mui/icons-material';
import { useTranslation } from 'react-i18next';
import { useTabStore, TabData } from '../store/tabStore';

export const TabBar: React.FC = () => {
  const { t } = useTranslation();
  const { tabs, activeTabId, addTab, removeTab, setActiveTab } = useTabStore();
  const [draggedTab, setDraggedTab] = useState<string | null>(null);
  const [dragOverTab, setDragOverTab] = useState<string | null>(null);

  const handleNewTab = () => {
    const newTab: TabData = {
      id: `home-${Date.now()}`,
      type: 'home',
      title: t('home.title'),
    };
    addTab(newTab);
  };

  const handleCloseTab = (e: React.MouseEvent, tabId: string) => {
    e.stopPropagation();
    removeTab(tabId);
  };

  const handleDragStart = (e: React.DragEvent, tabId: string) => {
    setDraggedTab(tabId);
    e.dataTransfer.effectAllowed = 'move';
  };

  const handleDragOver = (e: React.DragEvent, tabId: string) => {
    e.preventDefault();
    if (draggedTab && draggedTab !== tabId) {
      setDragOverTab(tabId);
    }
  };

  const handleDragEnd = () => {
    setDraggedTab(null);
    setDragOverTab(null);
  };

  const handleDrop = (e: React.DragEvent, targetTabId: string) => {
    e.preventDefault();
    if (draggedTab && draggedTab !== targetTabId) {
      const draggedIndex = tabs.findIndex(t => t.id === draggedTab);
      const targetIndex = tabs.findIndex(t => t.id === targetTabId);
      
      if (draggedIndex !== -1 && targetIndex !== -1) {
        const newTabs = [...tabs];
        const [removed] = newTabs.splice(draggedIndex, 1);
        newTabs.splice(targetIndex, 0, removed);
      }
    }
    setDraggedTab(null);
    setDragOverTab(null);
  };

  const getTabIcon = (type: string) => {
    switch (type) {
      case 'home':
        return <Home sx={{ fontSize: 18 }} />;
      case 'disk-scan':
        return <Storage sx={{ fontSize: 18 }} />;
      case 'snapshot-analysis':
        return <PhotoLibrary sx={{ fontSize: 18 }} />;
      default:
        return <Home sx={{ fontSize: 18 }} />;
    }
  };

  return (
    <Box
      sx={{
        display: 'flex',
        alignItems: 'center',
        height: '100%',
        px: 1,
        gap: 0.5,
        overflowX: 'auto',
        overflowY: 'hidden',
        WebkitAppRegion: 'no-drag',
        '&::-webkit-scrollbar': {
          height: 4,
        },
        '&::-webkit-scrollbar-thumb': {
          bgcolor: 'grey.400',
          borderRadius: 2,
        },
      }}
    >
      {tabs.map((tab) => {
        const isActive = tab.id === activeTabId;
        const isDragging = tab.id === draggedTab;
        const isDragOver = tab.id === dragOverTab;

        return (
          <Box
            key={tab.id}
            draggable
            onDragStart={(e) => handleDragStart(e, tab.id)}
            onDragOver={(e) => handleDragOver(e, tab.id)}
            onDragEnd={handleDragEnd}
            onDrop={(e) => handleDrop(e, tab.id)}
            onClick={() => setActiveTab(tab.id)}
            sx={{
              display: 'flex',
              alignItems: 'center',
              gap: 1,
              px: 2,
              py: 0.75,
              minWidth: 150,
              maxWidth: 200,
              cursor: 'pointer',
              userSelect: 'none',
              position: 'relative',
              borderRadius: 1,
              transition: 'all 0.2s ease',
              opacity: isDragging ? 0.5 : 1,
              bgcolor: isActive ? 'primary.main' : 'transparent',
              color: isActive ? 'primary.contrastText' : 'text.primary',
              transform: isDragOver ? 'scale(1.05)' : 'scale(1)',
              '&:hover': {
                bgcolor: isActive ? 'primary.dark' : alpha('#000', 0.05),
              },
              '&::before': isDragOver ? {
                content: '""',
                position: 'absolute',
                left: -2,
                top: 0,
                bottom: 0,
                width: 2,
                bgcolor: 'primary.main',
              } : {},
            }}
          >
            {getTabIcon(tab.type)}
            <Box
              sx={{
                flex: 1,
                overflow: 'hidden',
                textOverflow: 'ellipsis',
                whiteSpace: 'nowrap',
                fontSize: 14,
                fontWeight: isActive ? 600 : 400,
              }}
            >
              {tab.title}
            </Box>
            {tabs.length > 1 && (
              <IconButton
                size="small"
                onClick={(e) => handleCloseTab(e, tab.id)}
                sx={{
                  p: 0.25,
                  color: isActive ? 'primary.contrastText' : 'text.secondary',
                  '&:hover': {
                    bgcolor: isActive ? alpha('#fff', 0.2) : alpha('#000', 0.1),
                  },
                }}
              >
                <Close sx={{ fontSize: 16 }} />
              </IconButton>
            )}
          </Box>
        );
      })}

      <Tooltip title={t('tabs.newTab')}>
        <IconButton
          size="small"
          onClick={handleNewTab}
          sx={{
            ml: 0.5,
            color: 'text.secondary',
            '&:hover': {
              bgcolor: alpha('#000', 0.05),
            },
          }}
        >
          <Add sx={{ fontSize: 20 }} />
        </IconButton>
      </Tooltip>
    </Box>
  );
};
