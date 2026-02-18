import { create } from 'zustand';
import type { GitHubRelease } from '../services/updateService';

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
    changelogOpen: boolean;
    changelogLoading: boolean;
    changelogError: string | null;
    changelogReleases: GitHubRelease[];

    setUpdateInfo: (info: UpdateInfo | null) => void;
    setIsCheckingUpdate: (isChecking: boolean) => void;
    setUpdateStatus: (status: { message: string; severity: 'success' | 'error' | 'info' } | null) => void;
    setChangelogOpen: (open: boolean) => void;
    setChangelogLoading: (loading: boolean) => void;
    setChangelogError: (error: string | null) => void;
    setChangelogReleases: (releases: GitHubRelease[]) => void;
}

/**
 * 存储应用全局状态的 Store
 */
export const useAppStore = create<AppState>((set) => ({
    updateInfo: null,
    isCheckingUpdate: false,
    updateStatus: null,
    changelogOpen: false,
    changelogLoading: false,
    changelogError: null,
    changelogReleases: [],

    setUpdateInfo: (info) => set({ updateInfo: info }),
    setIsCheckingUpdate: (isChecking) => set({ isCheckingUpdate: isChecking }),
    setUpdateStatus: (status) => set({ updateStatus: status }),
    setChangelogOpen: (open) => set({ changelogOpen: open }),
    setChangelogLoading: (loading) => set({ changelogLoading: loading }),
    setChangelogError: (error) => set({ changelogError: error }),
    setChangelogReleases: (releases) => set({ changelogReleases: releases }),
}));
