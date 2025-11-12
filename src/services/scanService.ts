import {invoke} from '@tauri-apps/api/core';
import {decode} from '@msgpack/msgpack';
import pako from 'pako';
import type {FileNode, ScanConfig, ScanProgress} from '../store/scanStore';

export async function startScan(path: string, config: ScanConfig): Promise<FileNode> {
  try {
    const compressedData = await invoke<number[]>('start_scan', { path, config });

    const uint8Array = new Uint8Array(compressedData);
    const decompressed = pako.ungzip(uint8Array);

    return decode(decompressed) as FileNode;
  } catch (error) {
    console.error('Error in startScan:', error);
    throw error;
  }
}

export async function getScanProgress(): Promise<ScanProgress> {
  return await invoke<ScanProgress>('get_scan_progress');
}

export async function cancelScan(): Promise<void> {
  return await invoke<void>('cancel_scan');
}

export async function getDrives(): Promise<string[]> {
  return await invoke<string[]>('get_drives');
}

export async function getCpuCount(): Promise<number> {
  return await invoke<number>('get_cpu_count');
}

export interface DiskInfo {
  path: string;
  total_space: number;
  available_space: number;
  used_space: number;
}

export async function getDiskInfo(path: string): Promise<DiskInfo> {
  return await invoke<DiskInfo>('get_disk_info', { path });
}
