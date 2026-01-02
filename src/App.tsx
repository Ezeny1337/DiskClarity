import { useEffect, useState } from 'react';
import { ThemeProvider, createTheme, CssBaseline, Box, Alert, IconButton, Typography, Snackbar, Button, Tooltip, CircularProgress } from '@mui/material';
import { Close, CropSquare, Remove, FullscreenExit, SystemUpdateAlt } from '@mui/icons-material';
import { WebviewWindow } from '@tauri-apps/api/webviewWindow';
import { useTranslation } from 'react-i18next';
import { useScanStore } from './store/scanStore';
import { useTabStore } from './store/tabStore';
import { checkForUpdates } from './services/updateService';
import { TabBar } from './components/TabBar';
import { HomePage } from './components/HomePage';
import { DiskScanTab } from './components/DiskScanTab';
import { SnapshotTab } from './components/SnapshotTab.tsx';
import { LanguageSwitcher } from './components/LanguageSwitcher';
import { openUrl } from '@tauri-apps/plugin-opener';

const appWindow = WebviewWindow.getCurrent();

const theme = createTheme({
  palette: {
    mode: 'light',
    primary: {
      main: '#1976d2',
    },
    secondary: {
      main: '#dc004e',
    },
  },
  typography: {
    fontFamily: [
      '-apple-system',
      'BlinkMacSystemFont',
      '"Segoe UI"',
      'Roboto',
      '"Helvetica Neue"',
      'Arial',
      'sans-serif',
    ].join(','),
  },
  components: {
    MuiCssBaseline: {
      styleOverrides: {
        html: {
          scrollbarWidth: 'none !important',
          msOverflowStyle: 'none !important',
          overflow: 'hidden !important',
          height: '100vh !important',
          '&::-webkit-scrollbar': {
            width: '0px !important',
            height: '0px !important',
            background: 'transparent !important',
            display: 'none !important',
            visibility: 'hidden !important',
          },
        },
        body: {
          scrollbarWidth: 'none !important',
          msOverflowStyle: 'none !important',
          overflow: 'hidden !important',
          height: '100vh !important',
          margin: 0,
          padding: 0,
          '&::-webkit-scrollbar': {
            width: '0px !important',
            height: '0px !important',
            background: 'transparent !important',
            display: 'none !important',
            visibility: 'hidden !important',
          },
        },
        '#root': {
          scrollbarWidth: 'none !important',
          msOverflowStyle: 'none !important',
          overflow: 'hidden !important',
          height: '100vh !important',
          '&::-webkit-scrollbar': {
            width: '0px !important',
            height: '0px !important',
            background: 'transparent !important',
            display: 'none !important',
            visibility: 'hidden !important',
          },
        },
        '&.MuiBox-root': {
          scrollbarWidth: 'none !important',
          msOverflowStyle: 'none !important',
          '&::-webkit-scrollbar': {
            width: '0px !important',
            height: '0px !important',
            background: 'transparent !important',
            display: 'none !important',
            visibility: 'hidden !important',
          },
        },
      },
    },
  },
});

function App() {
  const { t } = useTranslation();
  const error = useScanStore((state) => state.error);
  const { tabs, activeTabId } = useTabStore();
  const [isMaximized, setIsMaximized] = useState(false);
  const [updateInfo, setUpdateInfo] = useState<{ version: string; url?: string } | null>(null);
  const [updateStatus, setUpdateStatus] = useState<{ message: string; severity: 'success' | 'error' } | null>(null);
  const [isCheckingUpdate, setIsCheckingUpdate] = useState(false);

  const handleCheckUpdates = async () => {
    if (isCheckingUpdate) return;
    setIsCheckingUpdate(true);
    try {
      const info = await checkForUpdates();
      if (info.hasUpdate) {
        setUpdateInfo({ version: info.latestVersion, url: info.downloadUrl });
      } else {
        setUpdateStatus({ message: t('app.upToDate'), severity: 'success' });
      }
    } catch {
      setUpdateStatus({ message: t('app.updateCheckFailed'), severity: 'error' });
    } finally {
      setIsCheckingUpdate(false);
    }
  };

  const renderTabContent = () => {
    const activeTab = tabs.find((tab) => tab.id === activeTabId);
    
    if (!activeTab) {
      return <HomePage />;
    }

    switch (activeTab.type) {
      case 'home':
        return <HomePage />;
      case 'disk-scan':
        return <DiskScanTab />;
      case 'snapshot-analysis':
        return <SnapshotTab />;
      default:
        return <HomePage />;
    }
  };
  
  // 监听窗口最大化状态变化
  useEffect(() => {
    const checkMaximized = async () => {
      const maximized = await appWindow.isMaximized();
      setIsMaximized(maximized);
    };
    
    checkMaximized();
    
    // 监听窗口状态变化
    const unlisten = appWindow.listen('tauri://resize', () => {
      checkMaximized();
    });
    
    return () => {
      unlisten.then(f => f());
    };
  }, []);

  // 禁用右键菜单
  useEffect(() => {
    const handleContextMenu = (e: MouseEvent) => {
      e.preventDefault();
      return false;
    };

    document.addEventListener('contextmenu', handleContextMenu);

    return () => {
      document.removeEventListener('contextmenu', handleContextMenu);
    };
  }, []);
  
  const handleMinimize = async () => {
    try {
      await appWindow.minimize();
    } catch (e) {
      console.error('Minimize failed:', e);
    }
  };
  const handleMaximize = async () => {
    try {
      const maximized = await appWindow.isMaximized();
      if (maximized) {
        await appWindow.unmaximize();
      } else {
        await appWindow.maximize();
      }
      setIsMaximized(!maximized);
    } catch (e) {
      console.error('Maximize failed:', e);
    }
  };
  const handleClose = async () => {
    try {
      await appWindow.close();
    } catch (e) {
      console.error('Close failed:', e);
    }
  };

  return (
    <ThemeProvider theme={theme}>
      <CssBaseline />
      <Box sx={{ 
        height: '100vh', 
        bgcolor: 'background.default', 
        display: 'flex', 
        flexDirection: 'column', 
        overflow: 'hidden',
        boxSizing: 'border-box'
      }}>
        {/* 自定义标题栏 */}
        <Box
          sx={{
            height: 60,
            bgcolor: 'background.default',
            borderBottom: 1,
            borderColor: 'divider',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'space-between',
            px: 2,
            flexShrink: 0,
            position: 'sticky',
            top: 0,
            zIndex: 1000,
            WebkitAppRegion: 'drag',
          }}
        >
          <Box
            sx={{
              display: 'flex',
              alignItems: 'center',
              gap: 1.5,
              WebkitAppRegion: 'drag',
            }}
          >
            <Box
              component="img"
              src="/32x32.png"
              alt={t('app.logoAlt')}
              sx={{ width: 32, height: 32 }}
            />
            <Typography variant="h6" sx={{ fontWeight: 600, color: 'primary.main', userSelect: 'none' }}>
              {t('app.title')}
            </Typography>
          </Box>

          <Box sx={{ flex: 1, display: 'flex', justifyContent: 'center', px: 2 }}>
            <TabBar />
          </Box>
          
          <Box
            sx={{
              display: 'flex',
              gap: 0.5,
              WebkitAppRegion: 'no-drag',
            }}
          >
            <LanguageSwitcher />
            <Tooltip title={t('app.checkUpdates')}>
              <span>
                <IconButton
                  size="small"
                  onClick={handleCheckUpdates}
                  disabled={isCheckingUpdate}
                  sx={{
                    color: 'text.secondary',
                    '&:hover': { bgcolor: 'action.hover' },
                  }}
                >
                  {isCheckingUpdate ? (
                    <CircularProgress size={18} />
                  ) : (
                    <SystemUpdateAlt sx={{ fontSize: 18 }} />
                  )}
                </IconButton>
              </span>
            </Tooltip>
            <IconButton
              size="small"
              onClick={handleMinimize}
              sx={{
                color: 'text.secondary',
                '&:hover': { bgcolor: 'action.hover' },
              }}
            >
              <Remove sx={{ fontSize: 18 }} />
            </IconButton>
            <IconButton
              size="small"
              onClick={handleMaximize}
              sx={{
                color: 'text.secondary',
                '&:hover': { bgcolor: 'action.hover' },
              }}
            >
              {isMaximized ? (
                <FullscreenExit sx={{ fontSize: 18 }} />
              ) : (
                <CropSquare sx={{ fontSize: 18 }} />
              )}
            </IconButton>
            <IconButton
              size="small"
              onClick={handleClose}
              sx={{
                color: 'text.secondary',
                '&:hover': { bgcolor: 'action.hover' },
              }}
            >
              <Close sx={{ fontSize: 18 }} />
            </IconButton>
          </Box>
        </Box>

        {/* 主内容区域 */}
        <Box sx={{ 
          flex: 1, 
          overflow: 'hidden',
          minHeight: 0,
          boxSizing: 'border-box',
          position: 'relative',
        }}>
          <Snackbar
            open={updateInfo !== null}
            onClose={() => setUpdateInfo(null)}
            anchorOrigin={{ vertical: 'bottom', horizontal: 'center' }}
            autoHideDuration={8000}
          >
            <Alert
              severity="info"
              onClose={() => setUpdateInfo(null)}
              action={
                updateInfo?.url ? (
                  <Button
                    color="inherit"
                    size="small"
                    onClick={() => {
                      const url = updateInfo?.url;
                      if (!url) return;
                      try {
                        openUrl(url);
                      } catch {
                      }
                      setUpdateInfo(null);
                    }}
                  >
                    {t('app.download')}
                  </Button>
                ) : undefined
              }
              sx={{ alignItems: 'center' }}
            >
              {t('app.updateAvailable', { version: updateInfo?.version })}
            </Alert>
          </Snackbar>

          <Snackbar
            open={updateStatus !== null}
            onClose={() => setUpdateStatus(null)}
            anchorOrigin={{ vertical: 'bottom', horizontal: 'center' }}
            autoHideDuration={2500}
          >
            <Alert
              severity={updateStatus?.severity || 'success'}
              onClose={() => setUpdateStatus(null)}
              sx={{ alignItems: 'center' }}
            >
              {updateStatus?.message}
            </Alert>
          </Snackbar>

          {/* 错误提示 */}
          {error && (
            <Alert 
              severity="error" 
              sx={{ 
                position: 'absolute',
                top: 16,
                left: '50%',
                transform: 'translateX(-50%)',
                zIndex: 1000,
                minWidth: 400,
              }} 
              onClose={() => useScanStore.getState().setError(null)}
            >
              {error}
            </Alert>
          )}

          {/* Tab Content */}
          {renderTabContent()}
        </Box>
      </Box>
    </ThemeProvider>
  );
}

export default App;
