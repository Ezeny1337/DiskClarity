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
        mode: 'dark',
        primary: {
            main: '#3b82f6',
        },
        background: {
            default: '#09090b',
            paper: '#18181b',
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
                    '&::-webkit-scrollbar': {display: 'none !important'},
                },
                body: {
                    scrollbarWidth: 'none !important',
                    msOverflowStyle: 'none !important',
                    overflow: 'hidden !important',
                    height: '100vh !important',
                    margin: 0,
                    padding: 0,
                    '&::-webkit-scrollbar': {display: 'none !important'},
                },
            },
        },
        // Dialog 统一暗色主题
        MuiDialog: {
            styleOverrides: {
                paper: {
                    backgroundColor: '#0a0a0b',
                    border: '1px solid rgba(255,255,255,0.08)',
                    borderRadius: 12,
                    backgroundImage: 'none',
                    boxShadow: '0 25px 50px -12px rgba(0,0,0,0.8), 0 0 0 1px rgba(255,255,255,0.05)',
                },
            },
        },
        MuiDialogTitle: {
            styleOverrides: {
                root: {
                    display: 'flex',
                    alignItems: 'center',
                    justifyContent: 'space-between',
                    padding: '20px 24px 16px',
                    borderBottom: '1px solid rgba(255,255,255,0.06)',
                    color: 'white',
                },
            },
        },
        MuiDialogContent: {
            styleOverrides: {
                root: {
                    padding: '20px 24px',
                },
            },
        },
        // Select 统一暗色主题
        MuiSelect: {
            styleOverrides: {
                root: {
                    color: 'white',
                    fontSize: 12,
                    backgroundColor: 'rgba(0,0,0,0.2)',
                    '& .MuiOutlinedInput-notchedOutline': {
                        borderColor: 'rgba(255,255,255,0.12)',
                    },
                    '&:hover .MuiOutlinedInput-notchedOutline': {
                        borderColor: 'rgba(255,255,255,0.25)',
                    },
                    '&.Mui-focused .MuiOutlinedInput-notchedOutline': {
                        borderWidth: '1px',
                        borderColor: 'rgba(59,130,246,0.6)',
                    },
                    '& .MuiSvgIcon-root': {color: 'white'},
                },
            },
        },
        MuiMenu: {
            styleOverrides: {
                paper: {
                    background: 'rgba(20,20,30,0.97)',
                    backdropFilter: 'blur(20px)',
                    border: '1px solid rgba(255,255,255,0.15)',
                },
            },
        },
        MuiMenuItem: {
            styleOverrides: {
                root: {
                    color: 'white',
                    fontSize: 13,
                    transition: 'background-color 80ms ease',
                    '&:hover': {background: 'rgba(255,255,255,0.08)'},
                    '&.Mui-selected': {
                        background: 'rgba(255,255,255,0.15)',
                        '&:hover': {background: 'rgba(255,255,255,0.2)'},
                    },
                },
            },
        },
        // TextField 统一暗色主题
        MuiTextField: {
            styleOverrides: {
                root: {
                    '& .MuiOutlinedInput-root': {
                        color: 'rgba(255,255,255,0.82)',
                        fontSize: 12,
                        '& fieldset': {borderColor: 'rgba(255,255,255,0.12)'},
                        '&:hover fieldset': {borderColor: 'rgba(255,255,255,0.22)'},
                        '&.Mui-focused fieldset': {borderColor: 'rgba(59,130,246,0.6)'},
                    },
                },
            },
        },
        // Switch 统一暗色主题
        MuiSwitch: {
            styleOverrides: {
                root: {
                    '& .MuiSwitch-switchBase.Mui-checked': {color: '#93c5fd'},
                    '& .MuiSwitch-switchBase.Mui-checked + .MuiSwitch-track': {
                        backgroundColor: 'rgba(96,165,250,0.45)',
                    },
                },
            },
        },
        // Checkbox 统一暗色主题
        MuiCheckbox: {
            styleOverrides: {
                root: {
                    color: 'rgba(255,255,255,0.3)',
                    padding: 0,
                    '&.Mui-checked': {color: '#a78bfa'},
                },
            },
        },
        // IconButton 统一暗色主题
        MuiIconButton: {
            styleOverrides: {
                root: {
                    color: 'rgba(255,255,255,0.5)',
                    '&:hover': {
                        color: 'rgba(255,255,255,0.8)',
                        backgroundColor: 'rgba(255,255,255,0.06)',
                    },
                },
            },
        },
        // CircularProgress 统一颜色
        MuiCircularProgress: {
            styleOverrides: {
                root: {color: '#60a5fa'},
            },
        },
        // Chip 统一基础样式
        MuiChip: {
            styleOverrides: {
                root: {
                    height: 18,
                    fontSize: 10,
                    fontWeight: 600,
                    '& .MuiChip-deleteIcon': {color: 'rgba(255,255,255,0.5)'},
                },
            },
        },
        // Tooltip 暗色主题
        MuiTooltip: {
            styleOverrides: {
                tooltip: {
                    backgroundColor: 'rgba(30,30,35,0.95)',
                    border: '1px solid rgba(255,255,255,0.1)',
                    fontSize: 12,
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

    // 窗口最小化 或 所有标签页均为 home 时降低 WebView2 内存目标，
    // 通过 window.gc() 强制触发 V8 主 GC，将堆页归还 OS
    useEffect(() => {
        const updateMemoryLevel = () => {
            const idle = document.hidden || tabs.every((t) => t.type === 'home');
            invoke('set_webview_memory_level', {low: idle}).catch(() => {
            });
            if (idle && typeof (window as unknown as { gc?: () => void }).gc === 'function') {
                (window as unknown as { gc: () => void }).gc();
            }
        };
        updateMemoryLevel();
        document.addEventListener('visibilitychange', updateMemoryLevel);
        return () => document.removeEventListener('visibilitychange', updateMemoryLevel);
    }, [tabs]);

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

    // 禁用 Ctrl+F
    useEffect(() => {
        const handleKeyDown = (e: KeyboardEvent) => {
            if (e.ctrlKey && e.key === 'f') {
                e.preventDefault();
                e.stopPropagation();
            }
        };

        document.addEventListener('keydown', handleKeyDown, true);

        return () => {
            document.removeEventListener('keydown', handleKeyDown, true);
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
