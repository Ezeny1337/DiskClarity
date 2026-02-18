import { useEffect } from 'react';
import {
  ThemeProvider,
  createTheme,
  CssBaseline,
  Button,
  Alert,
  Snackbar,
  Dialog,
  DialogTitle,
  DialogContent,
  IconButton,
  Typography,
  CircularProgress,
  alpha,
} from '@mui/material';
import { useTranslation } from 'react-i18next';
import { useScanStore } from './store/scanStore';
import { useTabStore } from './store/tabStore';
import { useAppStore } from './store/appStore';
import { checkForUpdates, getChangelogReleases } from './services/updateService';
import { HomePage } from './components/HomePage';
import { DiskScanTab } from './components/DiskScanTab';
import { SnapshotTab } from './components/SnapshotTab';
import { SnapshotAnalysisView } from './components/SnapshotAnalysisView';
import { openUrl } from '@tauri-apps/plugin-opener';
import { MainLayout } from './components/layout/MainLayout';
import { AppHeader } from './components/layout/AppHeader';
import { X, ExternalLink } from 'lucide-react';
import { motion } from 'framer-motion';

const theme = createTheme({
  palette: {
    mode: 'dark', // 使用暗黑模式以匹配 Tailwind
    primary: {
      main: '#3b82f6', // Tailwind blue-500
    },
    background: {
      default: '#09090b', // zinc-950
      paper: '#18181b', // zinc-900
    },
  },
  typography: {
    fontFamily: 'Inter, sans-serif',
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
            display: 'none !important',
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
            display: 'none !important',
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
  const {
    updateInfo,
    setUpdateInfo,
    updateStatus,
    setUpdateStatus,
    setIsCheckingUpdate,
    changelogOpen,
    setChangelogOpen,
    changelogLoading,
    setChangelogLoading,
    changelogError,
    setChangelogError,
    changelogReleases,
    setChangelogReleases,
  } = useAppStore();

  const loadChangelog = async () => {
    setChangelogOpen(true);
    if (changelogReleases.length > 0) return;

    setChangelogLoading(true);
    setChangelogError(null);
    try {
      const releases = await getChangelogReleases(30);
      setChangelogReleases(releases);
    } catch {
      setChangelogError(t('app.changelogLoadFailed'));
    } finally {
      setChangelogLoading(false);
    }
  };

  useEffect(() => {
    const handleCheckUpdates = async () => {
      // 避免重复检查
      if (useAppStore.getState().updateInfo || useAppStore.getState().isCheckingUpdate) return;

      setIsCheckingUpdate(true);
      try {
        const info = await checkForUpdates();
        if (info.hasUpdate) {
          setUpdateInfo({ version: info.latestVersion, url: info.downloadUrl });
        }
      } catch {
        // 自动检查失败时不提示
      } finally {
        setIsCheckingUpdate(false);
      }
    };

    handleCheckUpdates();
  }, []);

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
      case 'snapshot-diff':
        return <SnapshotAnalysisView />;
      default:
        return <HomePage />;
    }
  };

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

  return (
    <ThemeProvider theme={theme}>
      <CssBaseline />
      <MainLayout header={<AppHeader />}>
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
              <div className="flex items-center gap-1">
                <Button color="inherit" size="small" onClick={loadChangelog}>
                  {t('app.changelog')}
                </Button>
                {updateInfo?.url ? (
                  <Button
                    color="inherit"
                    size="small"
                    onClick={() => {
                      const url = updateInfo?.url;
                      if (!url) return;
                      try {
                        openUrl(url);
                      } catch { }
                      setUpdateInfo(null);
                    }}
                  >
                    {t('app.download')}
                  </Button>
                ) : null}
              </div>
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
            action={
              <Button color="inherit" size="small" onClick={loadChangelog}>
                {t('app.changelog')}
              </Button>
            }
            sx={{ alignItems: 'center' }}
          >
            {updateStatus?.message}
          </Alert>
        </Snackbar>

        <Dialog
          open={changelogOpen}
          onClose={() => setChangelogOpen(false)}
          maxWidth="md"
          fullWidth
          PaperProps={{
            sx: {
              bgcolor: '#0a0a0b',
              border: `1px solid ${alpha('#ffffff', 0.08)}`,
              borderRadius: 3,
              maxHeight: '85vh',
              backdropFilter: 'blur(20px)',
              boxShadow: '0 25px 50px -12px rgba(0, 0, 0, 0.8), 0 0 0 1px rgba(255, 255, 255, 0.05)',
            },
          }}
        >
          <DialogTitle sx={{ 
            display: 'flex', 
            alignItems: 'center', 
            justifyContent: 'space-between', 
            pb: 2,
            pt: 3,
            px: 3,
            borderBottom: `1px solid ${alpha('#ffffff', 0.06)}`,
          }}>
            <div className="flex items-center gap-3">
              <div className="w-2 h-2 rounded-full bg-linear-to-r from-blue-400 to-purple-500"></div>
              <Typography component="span" sx={{ 
                color: 'white', 
                fontSize: 18, 
                fontWeight: 600,
                letterSpacing: '-0.025em'
              }}>
                {t('app.changelogTitle')}
              </Typography>
            </div>
            <IconButton 
              size="small" 
              onClick={() => setChangelogOpen(false)} 
              sx={{ 
                color: alpha('#ffffff', 0.4),
                '&:hover': {
                  color: alpha('#ffffff', 0.7),
                  bgcolor: alpha('#ffffff', 0.05)
                }
              }}
            >
              <X size={18} />
            </IconButton>
          </DialogTitle>
          <DialogContent sx={{ pt: 3, pb: 3, px: 3 }}>
            {changelogLoading ? (
              <div className="h-56 flex items-center justify-center">
                <CircularProgress size={26} sx={{ color: '#60a5fa' }} />
              </div>
            ) : changelogError ? (
              <Typography sx={{ color: '#f87171', fontSize: 13 }}>{changelogError}</Typography>
            ) : changelogReleases.length === 0 ? (
              <Typography sx={{ color: alpha('#ffffff', 0.45), fontSize: 13 }}>{t('app.changelogEmpty')}</Typography>
            ) : (
              <div className="space-y-4">
                {changelogReleases.map((release, index) => (
                  <motion.div
                    key={`${release.tag_name}-${release.published_at || 'na'}`}
                    initial={{ opacity: 0, y: 20 }}
                    animate={{ opacity: 1, y: 0 }}
                    transition={{ delay: index * 0.1, duration: 0.4 }}
                    className="group relative rounded-xl border px-4 py-4 transition-all duration-200"
                    style={{ 
                      borderColor: alpha('#ffffff', 0.06), 
                      background: `linear-gradient(135deg, ${alpha('#ffffff', 0.03)} 0%, ${alpha('#ffffff', 0.01)} 100%)`,
                      backdropFilter: 'blur(10px)'
                    }}
                    onMouseEnter={(e) => {
                      e.currentTarget.style.borderColor = alpha('#ffffff', 0.12);
                      e.currentTarget.style.background = `linear-gradient(135deg, ${alpha('#ffffff', 0.06)} 0%, ${alpha('#ffffff', 0.02)} 100%)`;
                    }}
                    onMouseLeave={(e) => {
                      e.currentTarget.style.borderColor = alpha('#ffffff', 0.06);
                      e.currentTarget.style.background = `linear-gradient(135deg, ${alpha('#ffffff', 0.03)} 0%, ${alpha('#ffffff', 0.01)} 100%)`;
                    }}
                  >
                    <div className="flex items-start justify-between gap-4 mb-3">
                      <div className="min-w-0 flex-1">
                        <div className="flex items-center gap-2 mb-1">
                          <div className="w-1.5 h-1.5 rounded-full bg-linear-to-r from-emerald-400 to-blue-500"></div>
                          <Typography sx={{ 
                            color: '#e2e8f0', 
                            fontSize: 15, 
                            fontWeight: 600,
                            letterSpacing: '-0.01em'
                          }}>
                            {release.name || release.tag_name}
                          </Typography>
                        </div>
                        <Typography sx={{ 
                          color: alpha('#ffffff', 0.45), 
                          fontSize: 12,
                          fontFamily: 'ui-monospace, monospace',
                          pl: 2.5
                        }}>
                          {release.published_at
                            ? new Date(release.published_at).toLocaleString(undefined, {
                                year: 'numeric',
                                month: 'short',
                                day: '2-digit',
                                hour: '2-digit',
                                minute: '2-digit',
                                hour12: false,
                              })
                            : release.tag_name}
                        </Typography>
                      </div>
                      {release.html_url && (
                        <button
                          onClick={() => openUrl(release.html_url!)}
                          className="text-xs px-3 py-1.5 rounded-lg border flex items-center gap-1.5 transition-all duration-200 hover:scale-105"
                          style={{
                            color: alpha('#ffffff', 0.7),
                            borderColor: alpha('#ffffff', 0.15),
                            background: `linear-gradient(135deg, ${alpha('#ffffff', 0.05)} 0%, ${alpha('#ffffff', 0.02)} 100%)`,
                            backdropFilter: 'blur(10px)'
                          }}
                          onMouseEnter={(e) => {
                            e.currentTarget.style.color = alpha('#ffffff', 0.9);
                            e.currentTarget.style.borderColor = alpha('#ffffff', 0.25);
                            e.currentTarget.style.background = `linear-gradient(135deg, ${alpha('#ffffff', 0.1)} 0%, ${alpha('#ffffff', 0.05)} 100%)`;
                          }}
                          onMouseLeave={(e) => {
                            e.currentTarget.style.color = alpha('#ffffff', 0.7);
                            e.currentTarget.style.borderColor = alpha('#ffffff', 0.15);
                            e.currentTarget.style.background = `linear-gradient(135deg, ${alpha('#ffffff', 0.05)} 0%, ${alpha('#ffffff', 0.02)} 100%)`;
                          }}
                        >
                          <ExternalLink size={11} />
                          <span className="font-medium">GitHub</span>
                        </button>
                      )}
                    </div>

                    <div className="relative pl-2.5">
                      <div className="absolute left-0 top-0 bottom-0 w-px bg-linear-to-b from-transparent via-white/10 to-transparent"></div>
                      <pre
                        className="whitespace-pre-wrap wrap-break-word text-sm leading-6 m-0 pl-3"
                        style={{ 
                          color: alpha('#ffffff', 0.75), 
                          fontFamily: 'inherit',
                          lineHeight: '1.6'
                        }}
                      >
                        {release.body?.trim() || t('app.changelogNoNotes')}
                      </pre>
                    </div>
                  </motion.div>
                ))}
              </div>
            )}
          </DialogContent>
        </Dialog>

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

        <div className="h-full overflow-hidden relative">
          {renderTabContent()}
        </div>
      </MainLayout>
    </ThemeProvider>
  );
}

export default App;
