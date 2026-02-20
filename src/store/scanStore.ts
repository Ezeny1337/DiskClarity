import {create} from 'zustand';
import type {ScanConfig} from '../types';
import {DEFAULT_SCAN_CONFIG} from '../constants';

export type {ScanConfig};

interface ScanState {
    error: string | null;
    scanConfig: ScanConfig;

    setError: (error: string | null) => void;
    setScanConfig: (config: Partial<ScanConfig>) => void;
}


export const useScanStore = create<ScanState>((set) => ({
    error: null,
    scanConfig: DEFAULT_SCAN_CONFIG,

    setError: (error) => set({error}),
    setScanConfig: (config) => set((state) => ({
        scanConfig: {...state.scanConfig, ...config}
    })),
}));
