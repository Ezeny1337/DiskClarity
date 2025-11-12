import { create } from 'zustand';

export interface FileNode {
  name: string;
  path: string;
  size: number;
  is_dir: boolean;
  children: FileNode[];
  file_count: number;
  dir_count: number;
  modified_time: number;
}

export interface ScanProgress {
  scanned_files: number;
  scanned_dirs: number;
  total_size: number;
  current_path: string;
  is_complete: boolean;
  duration_ms: number;
  stage?: string; // scanning | fetching_sizes | building_tree | serializing | complete
}

export interface ScanConfig {
  max_threads?: number;
}

export type SortField = 'name' | 'size' | 'modified' | 'fileCount';
export type SortOrder = 'asc' | 'desc';

interface ScanState {
  scanResult: FileNode | null;
  scanProgress: ScanProgress | null;
  isScanning: boolean;
  error: string | null;

  selectedPath: string;
  currentNode: FileNode | null;
  breadcrumbs: FileNode[];
  sortField: SortField;
  sortOrder: SortOrder;

  scanConfig: ScanConfig;

  setScanResult: (result: FileNode | null) => void;
  setScanProgress: (progress: ScanProgress | null) => void;
  setIsScanning: (isScanning: boolean) => void;
  setError: (error: string | null) => void;
  setSelectedPath: (path: string) => void;
  setCurrentNode: (node: FileNode | null) => void;
  setBreadcrumbs: (breadcrumbs: FileNode[]) => void;
  setScanConfig: (config: Partial<ScanConfig>) => void;
  setSortField: (field: SortField) => void;
  setSortOrder: (order: SortOrder) => void;
  reset: () => void;
}

const defaultConfig: ScanConfig = {
  max_threads: undefined,
};

export const useScanStore = create<ScanState>((set) => ({
  scanResult: null,
  scanProgress: null,
  isScanning: false,
  error: null,
  selectedPath: '',
  currentNode: null,
  breadcrumbs: [],
  sortField: 'size',
  sortOrder: 'desc',
  scanConfig: defaultConfig,

  setScanResult: (result) => set({ scanResult: result, currentNode: result }),
  setScanProgress: (progress) => set({ scanProgress: progress }),
  setIsScanning: (isScanning) => set({ isScanning }),
  setError: (error) => set({ error }),
  setSelectedPath: (path) => set({ selectedPath: path }),
  setCurrentNode: (node) => set({ currentNode: node }),
  setBreadcrumbs: (breadcrumbs) => set({ breadcrumbs }),
  setScanConfig: (config) => set((state) => ({ 
    scanConfig: { ...state.scanConfig, ...config } 
  })),
  setSortField: (field) => set({ sortField: field }),
  setSortOrder: (order) => set({ sortOrder: order }),
  reset: () => set({
    scanResult: null,
    scanProgress: null,
    isScanning: false,
    error: null,
    currentNode: null,
    breadcrumbs: [],
  }),
}));
