import { invoke } from '@tauri-apps/api/core';
import { decode } from '@msgpack/msgpack';
import pako from 'pako';
import type { FileNode, ScanConfig, ScanProgress } from '../store/scanStore';

/**
 * 启动磁盘扫描
 * 调用后端的 start_scan 命令，并解压返回的 MessagePack 数据
 */
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

/**
 * 获取当前的扫描进度
 */
export async function getScanProgress(): Promise<ScanProgress> {
  return await invoke<ScanProgress>('get_scan_progress');
}

/**
 * 取消当前正在进行的扫描
 */
export async function cancelScan(): Promise<void> {
  return await invoke<void>('cancel_scan');
}

/**
 * 获取系统中的磁盘驱动器列表
 */
export async function getDrives(): Promise<string[]> {
  return await invoke<string[]>('get_drives');
}

/**
 * 获取系统的 CPU 核心数
 */
export async function getCpuCount(): Promise<number> {
  return await invoke<number>('get_cpu_count');
}

export interface DiskInfo {
  path: string;
  total_space: number;
  available_space: number;
  used_space: number;
}

/**
 * 获取指定磁盘的详细信息
 */
export async function getDiskInfo(path: string): Promise<DiskInfo> {
  return await invoke<DiskInfo>('get_disk_info', { path });
}
