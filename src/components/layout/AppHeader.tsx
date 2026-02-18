import React from 'react';
import { useTranslation } from 'react-i18next';
import { AppTabBar } from './AppTabBar';
import { WindowControls } from './WindowControls';
import { RefreshCw, Download } from 'lucide-react';
import { useAppStore } from '../../store/appStore';
import { checkForUpdates } from '../../services/updateService';
import { openUrl } from '@tauri-apps/plugin-opener';
import { WebviewWindow } from '@tauri-apps/api/webviewWindow';

// 简单的语言切换器
const SimpleLanguageSwitcher = () => {
    const { i18n } = useTranslation();

    const toggleLanguage = () => {
        const next = i18n.language === 'zh-CN' ? 'en-US' : 'zh-CN';
        i18n.changeLanguage(next);
    };

    return (
        <button
            onClick={toggleLanguage}
            onMouseDown={(e) => e.stopPropagation()}
            className="p-2 hover:bg-white/10 rounded-md text-text-muted hover:text-text transition-colors text-xs font-medium"
        >
            {i18n.language === 'zh-CN' ? 'EN' : '中'}
        </button>
    );
};

const UpdateChecker: React.FC = () => {
    const { t } = useTranslation();
    const {
        isCheckingUpdate,
        setIsCheckingUpdate,
        setUpdateInfo,
        updateInfo,
        setUpdateStatus
    } = useAppStore();

    const handleCheckUpdate = async () => {
        if (isCheckingUpdate) return;

        setIsCheckingUpdate(true);
        try {
            const info = await checkForUpdates();
            if (info.hasUpdate) {
                setUpdateInfo({ version: info.latestVersion, url: info.downloadUrl });
                setUpdateStatus({ message: t('app.updateAvailable', { version: info.latestVersion }), severity: 'success' });
            } else {
                setUpdateStatus({ message: t('app.upToDate'), severity: 'info' });
            }
        } catch (error) {
            setUpdateStatus({ message: t('app.updateCheckFailed'), severity: 'error' });
        } finally {
            setIsCheckingUpdate(false);
        }
    };

    const handleDownload = async () => {
        if (updateInfo?.url) {
            try {
                await openUrl(updateInfo.url);
            } catch (e) {
                console.error(e);
            }
        }
    };

    if (updateInfo) {
        return (
            <button
                onClick={handleDownload}
                onMouseDown={(e) => e.stopPropagation()}
                className="p-2 hover:bg-green-500/10 text-green-400 rounded-md transition-colors flex items-center gap-2"
                title={t('app.download')}
            >
                <Download size={16} />
                <span className="text-xs font-medium">v{updateInfo.version}</span>
            </button>
        );
    }

    return (
        <button
            onClick={handleCheckUpdate}
            onMouseDown={(e) => e.stopPropagation()}
            disabled={isCheckingUpdate}
            className={`p-2 hover:bg-white/10 rounded-md text-text-muted hover:text-text transition-colors ${isCheckingUpdate ? 'animate-spin' : ''}`}
            title={t('app.checkUpdates')}
        >
            <RefreshCw size={16} />
        </button>
    );
};

export const AppHeader: React.FC = () => {

    const handleMouseDown = (e: React.MouseEvent) => {
        // 只有当左键点击时才开始窗口拖拽
        if (e.button === 0) {
            WebviewWindow.getCurrent().startDragging().catch(() => { });
        }
    };

    return (
        <header
            onMouseDown={handleMouseDown}
            data-tauri-drag-region
            className="flex h-12 items-center justify-between px-3 border-b border-white/5 bg-zinc-900/50 backdrop-blur-xl select-none relative cursor-default! active:bg-white/5 transition-colors"
        >
            {/* Logo Area */}
            <div className="flex items-center gap-3 w-48 shrink-0 select-none pointer-events-none">
                <img src="/32x32.png" alt="Logo" className="w-6 h-6" />
                <span className="font-semibold text-sm tracking-wide text-white/90">DiskClarity</span>
            </div>

            {/* Tabs Area */}
            <div
                data-tauri-drag-region
                className="flex-1 h-full min-w-0 flex justify-center overflow-hidden"
            >
                <AppTabBar />
            </div>

            {/* Controls Area */}
            <div className="flex items-center gap-1 w-48 justify-end relative z-20">
                <UpdateChecker />
                <div className="w-px h-4 bg-white/10 mx-1" />
                <SimpleLanguageSwitcher />
                <div className="w-px h-4 bg-white/10 mx-1" />
                <WindowControls />
            </div>
        </header>
    );
};
