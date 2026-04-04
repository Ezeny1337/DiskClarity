import type {DiffEntry, FileNode} from '../types';
import {grownColor, KIND_COLORS} from '../constants';

// 颜色调色板
const TREEMAP_COLORS = [
    '#1976d2', '#2196f3', '#42a5f5', '#64b5f6', '#90caf9',
    '#388e3c', '#4caf50', '#66bb6a', '#81c784', '#a5d6a7',
    '#d32f2f', '#f44336', '#ef5350', '#e57373', '#ef9a9a',
    '#f57c00', '#ff9800', '#ffa726', '#ffb74d', '#ffcc80',
    '#7b1fa2', '#9c27b0', '#ab47bc', '#ba68c8', '#ce93d8',
    '#0097a7', '#00bcd4', '#26c6da', '#4dd0e1', '#80deea',
];

const MAX_TREEMAP_ITEMS = 100;

/** 差异矩形接口 */
export interface DiffRect {
    x: number;
    y: number;
    width: number;
    height: number;
    entry: DiffEntry;
    color: string;
}

interface ScaledItem {
    scaledSize: number;
}

/** 文本省略 */
export function ellipsizeText(text: string, maxChars: number): string {
    if (maxChars <= 0) return '';
    if (text.length <= maxChars) return text;
    if (maxChars <= 3) return '.'.repeat(maxChars);
    return `${text.slice(0, maxChars - 3)}...`;
}

/** 贪心构建单行 */
function takeGreedyRow<T extends ScaledItem>(
    items: T[],
    shortSide: number,
    worstAspectRatio: (row: T[], sideLength: number) => number
): { row: T[]; remaining: T[] } {
    const row: T[] = [];
    const remaining = [...items];

    while (remaining.length > 0) {
        const item = remaining[0];
        const testRow = [...row, item];

        if (row.length === 0) {
            row.push(item);
            remaining.shift();
            continue;
        }

        const currentWorst = worstAspectRatio(row, shortSide);
        const newWorst = worstAspectRatio(testRow, shortSide);
        if (newWorst <= currentWorst) {
            row.push(item);
            remaining.shift();
        } else {
            break;
        }
    }

    return {row, remaining};
}

/** 文件节点矩形接口 */
export interface FileNodeRect {
    x: number;
    y: number;
    width: number;
    height: number;
    node: FileNode;
    color: string;
}

/** Squarified Treemap 布局函数 */
function squarifyLayout<T extends ScaledItem>(
    items: T[],
    w: number,
    h: number,
    getColor: (item: T, rectCount: number) => string,
    pushRect: (item: T, x: number, y: number, width: number, height: number, color: string) => void
): void {
    // 对子区域 [x, y, width, height] 进行布局
    const squarify = (
        nodes: T[],
        x: number,
        y: number,
        width: number,
        height: number,
        rectCount: { n: number }
    ) => {
        if (nodes.length === 0) return;
        if (!Number.isFinite(width) || !Number.isFinite(height) || width <= 0 || height <= 0) return;

        if (nodes.length === 1) {
            pushRect(nodes[0], x, y, width, height, getColor(nodes[0], rectCount.n++));
            return;
        }

        const total = nodes.reduce((sum, item) => sum + (Number.isFinite(item.scaledSize) ? item.scaledSize : 0), 0);
        if (total <= 0) return;
        const shortSide = Math.min(width, height);

        // 计算一行的最大长宽比
        const worstAspectRatio = (row: T[], sideLength: number): number => {
            if (!Number.isFinite(sideLength) || sideLength <= 0) return Number.POSITIVE_INFINITY;
            const rowSum = row.reduce((sum, item) => sum + item.scaledSize, 0);
            const rowArea = (rowSum / total) * width * height;
            const rowShortSide = rowArea / sideLength;
            if (!Number.isFinite(rowShortSide) || rowShortSide <= 0) return Number.POSITIVE_INFINITY;
            let worst = 0;
            for (const item of row) {
                const itemArea = (item.scaledSize / total) * width * height;
                const itemLongSide = itemArea / rowShortSide;
                const aspect = Math.max(itemLongSide / rowShortSide, rowShortSide / itemLongSide);
                worst = Math.max(worst, aspect);
            }
            return worst;
        };

        const {row, remaining} = takeGreedyRow(nodes, shortSide, worstAspectRatio);

        // 布局当前行
        const rowSum = row.reduce((sum, item) => sum + item.scaledSize, 0);
        const rowRatio = rowSum / total;

        const layoutRow = (rowItems: T[], rx: number, ry: number, rw: number, rh: number, isHorizontal: boolean) => {
            const rowTotal = rowItems.reduce((sum, item) => sum + (Number.isFinite(item.scaledSize) ? item.scaledSize : 0), 0);
            if (rowTotal <= 0) return;
            let offset = 0;
            for (const item of rowItems) {
                const ratio = item.scaledSize / rowTotal;
                if (!Number.isFinite(ratio) || ratio <= 0) continue;
                const color = getColor(item, rectCount.n);
                if (isHorizontal) {
                    const itemHeight = rh * ratio;
                    if (!Number.isFinite(itemHeight) || itemHeight <= 0) continue;
                    pushRect(item, rx, ry + offset, rw, itemHeight, color);
                    rectCount.n++;
                    offset += itemHeight;
                } else {
                    const itemWidth = rw * ratio;
                    if (!Number.isFinite(itemWidth) || itemWidth <= 0) continue;
                    pushRect(item, rx + offset, ry, itemWidth, rh, color);
                    rectCount.n++;
                    offset += itemWidth;
                }
            }
        };

        if (width >= height) {
            const rowWidth = width * rowRatio;
            layoutRow(row, x, y, rowWidth, height, true);
            if (remaining.length > 0) squarify(remaining, x + rowWidth, y, width - rowWidth, height, rectCount);
        } else {
            const rowHeight = height * rowRatio;
            layoutRow(row, x, y, width, rowHeight, false);
            if (remaining.length > 0) squarify(remaining, x, y + rowHeight, width, height - rowHeight, rectCount);
        }
    };

    squarify(items, 0, 0, w, h, {n: 0});
}

/** 布局差异矩形 */
export function layoutDiffRects(entries: DiffEntry[], containerWidth: number, containerHeight: number): DiffRect[] {
    if (!entries || entries.length === 0) return [];
    if (!Number.isFinite(containerWidth) || !Number.isFinite(containerHeight) || containerWidth <= 0 || containerHeight <= 0) return [];

    // 按大小排序（降序）并限制为 100 项
    const sortedEntries = [...entries]
        .sort((a, b) => Math.abs(b.size_delta) - Math.abs(a.size_delta))
        .slice(0, MAX_TREEMAP_ITEMS);

    // 应用对数缩放以提高小文件的可见性
    const scaledEntries = sortedEntries.map(entry => {
        const rawSize = Math.abs(entry.size_delta);
        const safeSize = Number.isFinite(rawSize) && rawSize > 0 ? rawSize : 0;
        return {...entry, scaledSize: safeSize === 0 ? 0 : Math.log10(safeSize + 1)};
    });

    const totalSize = scaledEntries.reduce((sum, e) => sum + (Number.isFinite(e.scaledSize) ? e.scaledSize : 0), 0);
    if (totalSize === 0) return [];

    const maxDelta = Math.max(...entries.filter(e => e.kind === 'grown').map(e => e.size_delta), 0);
    const rects: DiffRect[] = [];

    squarifyLayout(
        scaledEntries,
        containerWidth,
        containerHeight,
        (item) => item.kind === 'grown' ? grownColor(item.size_delta, maxDelta) : KIND_COLORS[item.kind],
        (item, x, y, width, height, color) => rects.push({x, y, width, height, entry: item, color})
    );

    return rects;
}

/** 布局文件节点矩形 */
export function layoutFileNodeRects(children: FileNode[], containerWidth: number, containerHeight: number, parentPath?: string): FileNodeRect[] {
    if (!children || children.length === 0) return [];
    if (!Number.isFinite(containerWidth) || !Number.isFinite(containerHeight) || containerWidth <= 0 || containerHeight <= 0) return [];

    // 按大小排序（降序）并限制为 100 项
    const sortedChildren = [...children]
        .sort((a, b) => (Number(b.size) || 0) - (Number(a.size) || 0))
        .slice(0, MAX_TREEMAP_ITEMS);

    // 应用对数缩放以提高小文件的可见性
    const scaledChildren = sortedChildren.map(child => {
        const rawSize = Number(child.size);
        const safeSize = Number.isFinite(rawSize) && rawSize > 0 ? rawSize : 0;
        // 如果提供了 parentPath，为其生成动态 path
        const path = child.path || (parentPath ? `${parentPath}\\${child.name}` : child.name);
        return {...child, path, scaledSize: safeSize === 0 ? 0 : Math.log10(safeSize + 1)};
    });

    const totalSize = scaledChildren.reduce((sum, c) => sum + (Number.isFinite(c.scaledSize) ? c.scaledSize : 0), 0);
    if (totalSize === 0) return [];

    const rects: FileNodeRect[] = [];

    squarifyLayout(
        scaledChildren,
        containerWidth,
        containerHeight,
        (_item, rectCount) => TREEMAP_COLORS[rectCount % TREEMAP_COLORS.length],
        (item, x, y, width, height, color) => rects.push({x, y, width, height, node: item, color})
    );

    return rects;
}
