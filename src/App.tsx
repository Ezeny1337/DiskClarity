import {useEffect, useMemo} from 'react';
import {Alert, Button, createTheme, CssBaseline, Snackbar, ThemeProvider,} from '@mui/material';
import {useTranslation} from 'react-i18next';
import {useScanStore} from './store/scanStore';
import {useTabStore} from './store/tabStore';
import {useAppStore} from './store/appStore';
import {checkForUpdates, getChangelogReleases} from './services/updateService';
import {HomePage} from './components/HomePage';
import {DiskScanTab} from './components/DiskScanTab';
import {SnapshotTab} from './components/SnapshotTab';
import {SnapshotAnalysisView} from './components/SnapshotAnalysisView';
import {ChangelogDialog} from './components/ChangelogDialog';
import {openUrl} from '@tauri-apps/plugin-opener';
import {invoke} from '@tauri-apps/api/core';
import {MainLayout} from './components/layout/MainLayout';
import {AppHeader} from './components/layout/AppHeader';

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
    const {t} = useTranslation();
    const error = useScanStore((state) => state.error);
    const {tabs, activeTabId} = useTabStore();
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
                    setUpdateInfo({version: info.latestVersion, url: info.downloadUrl});
                }
            } catch {
                // 自动检查失败时不提示
            } finally {
                setIsCheckingUpdate(false);
            }
        };

        handleCheckUpdates();
    }, []);

    const tabContent = useMemo(() => {
        const activeTab = tabs.find((tab) => tab.id === activeTabId);
        if (!activeTab) return <HomePage/>;
        switch (activeTab.type) {
            case 'home':
                return <HomePage/>;
            case 'disk-scan':
                return <DiskScanTab/>;
            case 'snapshot-analysis':
                return <SnapshotTab/>;
            case 'snapshot-diff':
                return <SnapshotAnalysisView/>;
            default:
                return <HomePage/>;
        }
    }, [tabs, activeTabId]);

    // 窗口最小化时降低 WebView2 内存占用，恢复时还原
    useEffect(() => {
        const handleVisibility = () => {
            invoke('set_webview_memory_level', {low: document.hidden}).catch(() => {
            });
        };
        document.addEventListener('visibilitychange', handleVisibility);
        return () => document.removeEventListener('visibilitychange', handleVisibility);
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

    return (
        <ThemeProvider theme={theme}>
            <CssBaseline/>
            <MainLayout header={<AppHeader/>}>
                <Snackbar
                    open={updateInfo !== null}
                    onClose={() => setUpdateInfo(null)}
                    anchorOrigin={{vertical: 'bottom', horizontal: 'center'}}
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
                                            } catch {
                                            }
                                            setUpdateInfo(null);
                                        }}
                                    >
                                        {t('app.download')}
                                    </Button>
                                ) : null}
                            </div>
                        }
                        sx={{alignItems: 'center'}}
                    >
                        {t('app.updateAvailable', {version: updateInfo?.version})}
                    </Alert>
                </Snackbar>

                <Snackbar
                    open={updateStatus !== null}
                    onClose={() => setUpdateStatus(null)}
                    anchorOrigin={{vertical: 'bottom', horizontal: 'center'}}
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
                        sx={{alignItems: 'center'}}
                    >
                        {updateStatus?.message}
                    </Alert>
                </Snackbar>

                <ChangelogDialog
                    open={changelogOpen}
                    onClose={() => setChangelogOpen(false)}
                    loading={changelogLoading}
                    error={changelogError}
                    releases={changelogReleases}
                />

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
                    {tabContent}
                </div>
            </MainLayout>
        </ThemeProvider>
    );
}

export default App;
