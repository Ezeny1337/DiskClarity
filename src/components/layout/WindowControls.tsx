import React, { useEffect, useState } from 'react';
import { WebviewWindow } from '@tauri-apps/api/webviewWindow';
import { Minus, Square, X, Copy } from 'lucide-react';
import { useTranslation } from 'react-i18next';

export const WindowControls: React.FC = () => {
    const { t } = useTranslation();
    const [isMaximized, setIsMaximized] = useState(false);
    useEffect(() => {
        const appWindow = WebviewWindow.getCurrent();
        const updateState = async () => {
            setIsMaximized(await appWindow.isMaximized());
        };
        updateState();

        const unlisten = appWindow.listen('tauri://resize', updateState);
        return () => {
            unlisten.then(f => f());
        };
    }, []);

    const handleMinimize = () => WebviewWindow.getCurrent().minimize();
    const handleMaximize = async () => {
        const appWindow = WebviewWindow.getCurrent();
        if (await appWindow.isMaximized()) {
            await appWindow.unmaximize();
            setIsMaximized(false);
        } else {
            await appWindow.maximize();
            setIsMaximized(true);
        }
    };
    const handleClose = () => WebviewWindow.getCurrent().close();

    return (
        <div className="flex items-center gap-1 drag-none">
            <button
                onClick={handleMinimize}
                onMouseDown={(e) => e.stopPropagation()}
                className="p-2 hover:bg-white/10 rounded-md text-text-muted hover:text-text transition-colors"
                title={t('common.minimize')}
            >
                <Minus size={16} />
            </button>
            <button
                onClick={handleMaximize}
                onMouseDown={(e) => e.stopPropagation()}
                className="p-2 hover:bg-white/10 rounded-md text-text-muted hover:text-text transition-colors"
                title={isMaximized ? t('common.unmaximize') : t('common.maximize')}
            >
                {isMaximized ? <Copy size={16} /> : <Square size={16} />}
            </button>
            <button
                onClick={handleClose}
                onMouseDown={(e) => e.stopPropagation()}
                className="p-2 hover:bg-red-500 hover:text-white rounded-md text-text-muted transition-colors"
                title={t('common.close')}
            >
                <X size={16} />
            </button>
        </div>
    );
};
