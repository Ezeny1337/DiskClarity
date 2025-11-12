import { useEffect, useState } from 'react';
import { ThemeProvider, createTheme, CssBaseline, Container, Box, Alert, IconButton, Typography } from '@mui/material';
import { Close, CropSquare, Remove, FullscreenExit } from '@mui/icons-material';
import { WebviewWindow } from '@tauri-apps/api/webviewWindow';
import { useTranslation } from 'react-i18next';
import { ScanControl } from './components/ScanControl';
import { ScanOptions } from './components/ScanOptions';
import { SortOptions } from './components/SortOptions';
import { TreemapView } from './components/TreemapView';
import { FileList } from './components/FileList';
import { useScanStore } from './store/scanStore';
import { LanguageSwitcher } from './components/LanguageSwitcher';

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
  const { error } = useScanStore();
  const [isMaximized, setIsMaximized] = useState(false);
  
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
          <Box
            sx={{
              display: 'flex',
              gap: 0.5,
              WebkitAppRegion: 'no-drag',
            }}
          >
            <LanguageSwitcher />
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
          overflow: 'auto', 
          py: 3,
          minHeight: 0,
          boxSizing: 'border-box'
        }}>
          <Container maxWidth={false} sx={{ px: isMaximized ? 4 : 2 }}>

          {/* 错误提示 */}
          {error && (
            <Alert severity="error" sx={{ mb: 3 }} onClose={() => useScanStore.getState().setError(null)}>
              {error}
            </Alert>
          )}

          {/* 主布局：左侧控制面板，右侧可视化区域 */}
          <Box sx={{ display: 'flex', gap: 3 }}>
            {/* 左侧边栏 - 扫描控制 */}
            <Box sx={{ width: 350, flexShrink: 0 }}>
              <ScanControl />
              <ScanOptions />
              <SortOptions />
            </Box>

            {/* 右侧主内容 - 可视化展示 */}
            <Box sx={{ flex: 1, minWidth: 0 }}>
              <TreemapView />
              <FileList />
            </Box>
          </Box>
        </Container>
        </Box>
      </Box>
    </ThemeProvider>
  );
}

export default App;
