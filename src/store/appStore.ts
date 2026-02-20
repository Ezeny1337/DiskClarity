import {create} from 'zustand';
import type {GitHubRelease, UpdateInfo, UpdateStatus} from '../types';

interface ChangelogState {
    open: boolean;
    loading: boolean;
    error: string | null;
    releases: GitHubRelease[];
}

interface AppState {
    updateInfo: UpdateInfo | null;
    isCheckingUpdate: boolean;
    updateStatus: UpdateStatus | null;
    changelog: ChangelogState;

    setUpdateInfo: (info: UpdateInfo | null) => void;
    setIsCheckingUpdate: (v: boolean) => void;
    setUpdateStatus: (status: UpdateStatus | null) => void;
    setChangelog: (patch: Partial<ChangelogState>) => void;

    // 向后兼容的单独 setter
    setChangelogOpen: (open: boolean) => void;
    setChangelogLoading: (loading: boolean) => void;
    setChangelogError: (error: string | null) => void;
    setChangelogReleases: (releases: GitHubRelease[]) => void;

    // 向后兼容的读取器
    changelogOpen: boolean;
    changelogLoading: boolean;
    changelogError: string | null;
    changelogReleases: GitHubRelease[];
}

const syncFlat = (cl: ChangelogState) => ({
    changelogOpen: cl.open,
    changelogLoading: cl.loading,
    changelogError: cl.error,
    changelogReleases: cl.releases,
});

export const useAppStore = create<AppState>((set) => ({
    updateInfo: null,
    isCheckingUpdate: false,
    updateStatus: null,
    changelog: {open: false, loading: false, error: null, releases: []},

    // 向后兼容的扁平字段
    changelogOpen: false,
    changelogLoading: false,
    changelogError: null,
    changelogReleases: [],

    setUpdateInfo: (info) => set({updateInfo: info}),
    setIsCheckingUpdate: (v) => set({isCheckingUpdate: v}),
    setUpdateStatus: (status) => set({updateStatus: status}),

    setChangelog: (patch) =>
        set((s) => {
            const cl = {...s.changelog, ...patch};
            return {changelog: cl, ...syncFlat(cl)};
        }),

    setChangelogOpen: (open) => set((s) => {
        const cl = {...s.changelog, open};
        return {changelog: cl, ...syncFlat(cl)};
    }),
    setChangelogLoading: (loading) => set((s) => {
        const cl = {...s.changelog, loading};
        return {changelog: cl, ...syncFlat(cl)};
    }),
    setChangelogError: (error) => set((s) => {
        const cl = {...s.changelog, error};
        return {changelog: cl, ...syncFlat(cl)};
    }),
    setChangelogReleases: (releases) => set((s) => {
        const cl = {...s.changelog, releases};
        return {changelog: cl, ...syncFlat(cl)};
    }),
}));
