import {invoke} from '@tauri-apps/api/core';
import type {ScanProgress} from '../types';

/**
 * 获取当前的扫描进度
 */
export async function getScanProgress(taskId: string): Promise<ScanProgress> {
    return await invoke<ScanProgress>('get_scan_progress', {taskId});
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
    return await invoke<DiskInfo>('get_disk_info', {path});
}
