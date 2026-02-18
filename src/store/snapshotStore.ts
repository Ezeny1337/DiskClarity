import { create } from 'zustand';
import type { SnapshotMeta, DiffResult } from '../services/snapshotService';

interface SnapshotState {
  snapshots: SnapshotMeta[];
  selectedIds: string[];
  diffResult: DiffResult | null;
  isDiffing: boolean;
  isLoading: boolean;
  error: string | null;

  // 顶部 N 项设置
  topNCount: number;
  showFilesOnly: boolean;

  setSnapshots: (snapshots: SnapshotMeta[]) => void;
  toggleSelect: (id: string) => void;
  clearSelection: () => void;
  setDiffResult: (result: DiffResult | null) => void;
  setIsDiffing: (v: boolean) => void;
  setIsLoading: (v: boolean) => void;
  setError: (error: string | null) => void;
  setTopNCount: (n: number) => void;
  setShowFilesOnly: (v: boolean) => void;
  removeSnapshot: (id: string) => void;
}

export const useSnapshotStore = create<SnapshotState>((set) => ({
  snapshots: [],
  selectedIds: [],
  diffResult: null,
  isDiffing: false,
  isLoading: false,
  error: null,
  topNCount: 10,
  showFilesOnly: false,

  setSnapshots: (snapshots) => set({ snapshots }),

  toggleSelect: (id) =>
    set((state) => {
      const already = state.selectedIds.includes(id);
      if (already) {
        return { selectedIds: state.selectedIds.filter((s) => s !== id) };
      }
      // 最多选两个，超过两个时，丢弃最早选的，保持最新两个
      if (state.selectedIds.length >= 2) {
        return { selectedIds: [state.selectedIds[1], id] };
      }
      return { selectedIds: [...state.selectedIds, id] };
    }),

  clearSelection: () => set({ selectedIds: [] }),
  setDiffResult: (result) => set({ diffResult: result }),
  setIsDiffing: (v) => set({ isDiffing: v }),
  setIsLoading: (v) => set({ isLoading: v }),
  setError: (error) => set({ error }),
  setTopNCount: (n) => set({ topNCount: n }),
  setShowFilesOnly: (v) => set({ showFilesOnly: v }),
  removeSnapshot: (id) =>
    set((state) => ({
      snapshots: state.snapshots.filter((s) => s.id !== id),
      selectedIds: state.selectedIds.filter((s) => s !== id),
    })),
}));
