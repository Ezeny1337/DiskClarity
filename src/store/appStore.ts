import { create } from 'zustand';

/**
 * 更新信息接口
 */
interface UpdateInfo {
    version: string;
    url?: string;
    releaseNotes?: string;
}

/**
 * 全局应用状态
 */
interface AppState {
    updateInfo: UpdateInfo | null;
    isCheckingUpdate: boolean;
    updateStatus: { message: string; severity: 'success' | 'error' | 'info' } | null;

    setUpdateInfo: (info: UpdateInfo | null) => void;
    setIsCheckingUpdate: (isChecking: boolean) => void;
    setUpdateStatus: (status: { message: string; severity: 'success' | 'error' | 'info' } | null) => void;
}

/**
 * 存储应用全局状态的 Store
 */
export const useAppStore = create<AppState>((set) => ({
    updateInfo: null,
    isCheckingUpdate: false,
    updateStatus: null,

    setUpdateInfo: (info) => set({ updateInfo: info }),
    setIsCheckingUpdate: (isChecking) => set({ isCheckingUpdate: isChecking }),
    setUpdateStatus: (status) => set({ updateStatus: status }),
}));
