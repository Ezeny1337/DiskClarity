import {alpha} from '@mui/material';
import type {DiffKind} from '../types';

/** 差异类型对应的颜色 */
export const KIND_COLORS: Record<DiffKind, string> = {
    added: '#22c55e',
    removed: '#ef4444',
    grown: '#3b82f6',
    shrunk: '#6b7280',
};

/** 差异类型对应的背景色 */
export const KIND_BG: Record<DiffKind, string> = {
    added: alpha('#22c55e', 0.15),
    removed: alpha('#ef4444', 0.15),
    grown: alpha('#3b82f6', 0.15),
    shrunk: alpha('#6b7280', 0.12),
};

/** 生成增长颜色的函数 */
export function grownColor(delta: number, maxDelta: number): string {
    if (maxDelta <= 0) return KIND_COLORS.grown;
    const ratio = Math.min(delta / maxDelta, 1);
    return `rgb(30, ${Math.round(80 + ratio * 40)}, ${Math.round(100 + ratio * 155)})`;
}
