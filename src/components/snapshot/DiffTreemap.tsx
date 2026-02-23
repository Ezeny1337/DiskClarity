import React, {useCallback, useEffect, useMemo, useRef, useState} from 'react';
import {DiffContextMenu} from '../ui/DiffContextMenu';
import {useTranslation} from 'react-i18next';
import type {DiffEntry, DiffKind, SnapshotGroupBy} from '../../types';
import {KIND_COLORS} from '../../constants';
import {formatBytes} from '../../utils/format';
import {buildSnapshotBreadcrumbs, computeVisibleDiffEntries, isVirtualGroupPath,} from '../../utils/snapshotUtils';
import {type DiffRect, ellipsizeText, layoutDiffRects} from '../../utils/treemapUtils';
import {PathBreadcrumb} from '../ui/PathBreadcrumb';

interface DiffTreemapProps {
    entries: DiffEntry[];
    currentPath: string;
    showFilesOnly: boolean;
    groupBy: SnapshotGroupBy;
    flatGrouping: boolean;
    onNavigate: (path: string) => void;
    onOpenExplorer: (path: string) => void;
    onViewTrend: (entry: DiffEntry) => void;
}

export const DiffTreemap: React.FC<DiffTreemapProps> = ({
                                                            entries,
                                                            currentPath,
                                                            showFilesOnly,
                                                            groupBy,
                                                            flatGrouping,
                                                            onNavigate,
                                                            onOpenExplorer,
                                                            onViewTrend,
                                                        }) => {
    const {t} = useTranslation();
    const containerRef = useRef<HTMLDivElement>(null);
    const tooltipRef = useRef<HTMLDivElement>(null);
    const rafRef = useRef<number | null>(null);
    const tooltipPosRef = useRef({x: 0, y: 0});

    const [size, setSize] = useState({w: 800, h: 600});
    const [hovered, setHovered] = useState<DiffRect | null>(null);
    const [ctxMenu, setCtxMenu] = useState<{ mouseX: number; mouseY: number; entry: DiffEntry } | null>(null);

    const breadcrumbs = useMemo(() => buildSnapshotBreadcrumbs(currentPath, t), [currentPath, t]);

    const visibleEntries = useMemo(
        () => computeVisibleDiffEntries(entries, currentPath, showFilesOnly, groupBy, flatGrouping, t),
        [entries, currentPath, showFilesOnly, groupBy, flatGrouping, t],
    );

    // 布局矩形
    const rects = useMemo(() => layoutDiffRects(visibleEntries, size.w, size.h), [visibleEntries, size]);

    // 监听容器尺寸变化
    useEffect(() => {
        const container = containerRef.current;
        if (!container) return;

        const updateSize = () => {
            const rect = container.getBoundingClientRect();
            setSize({w: rect.width, h: rect.height});
        };

        updateSize();
        const observer = new ResizeObserver(updateSize);
        observer.observe(container);
        return () => observer.disconnect();
    }, []);

    // 更新工具提示位置
    const updateTooltip = useCallback((e: React.MouseEvent) => {
        tooltipPosRef.current = {x: e.clientX, y: e.clientY};
        if (rafRef.current) cancelAnimationFrame(rafRef.current);
        rafRef.current = requestAnimationFrame(() => {
            const el = tooltipRef.current;
            if (!el) return;
            el.style.transform = `translate(${tooltipPosRef.current.x + 15}px, ${tooltipPosRef.current.y + 15}px)`;
        });
    }, []);

    useEffect(() => () => {
        if (rafRef.current) cancelAnimationFrame(rafRef.current);
    }, []);

    const handleRectClick = useCallback((r: DiffRect) => {
        if (r.entry.is_dir) onNavigate(r.entry.path);
    }, [onNavigate]);

    const handleRectContextMenu = useCallback((e: React.MouseEvent, r: DiffRect) => {
        e.preventDefault();
        setCtxMenu({mouseX: e.clientX, mouseY: e.clientY, entry: r.entry});
    }, []);

    return (
        <div className="w-full h-full flex flex-col overflow-hidden">
            {/* 面包屑 */}
            {!showFilesOnly && (
                <PathBreadcrumb
                    crumbs={breadcrumbs}
                    onNavigate={onNavigate}
                    currentPath={currentPath && !currentPath.startsWith('__group__:') ? currentPath : undefined}
                />
            )}

            {/* Treemap 画布 */}
            {!visibleEntries.length ? (
                <div className="flex-1 flex items-center justify-center">
                    <span className="text-sm text-white/40">{t('snapshot.noDiff')}</span>
                </div>
            ) : (
                <div ref={containerRef} className="flex-1 relative overflow-hidden bg-white/4">
                    <svg width="100%" height="100%" viewBox={`0 0 ${size.w} ${size.h}`} preserveAspectRatio="none">
                        {rects.map((r, i) => {
                            const isHov = hovered?.entry.path === r.entry.path;
                            const fs = Math.max(9, Math.min(13, Math.min(r.width / 10, r.height / 3.5)));
                            const maxChars = Math.floor(r.width / (fs * 0.55));
                            const name = ellipsizeText(r.entry.name, Math.max(0, maxChars));
                            const isDir = r.entry.is_dir;
                            return (
                                <g key={`${r.entry.path}-${i}`} onClick={() => handleRectClick(r)}
                                   style={{cursor: isDir ? 'pointer' : 'default'}}
                                   onContextMenu={(e) => handleRectContextMenu(e, r)}>
                                    <rect x={r.x} y={r.y} width={r.width} height={r.height}
                                          fill={r.color} stroke="rgba(0,0,0,0.4)" strokeWidth={1}
                                          opacity={isHov ? 1 : 0.82} style={{transition: 'opacity 0.15s'}}
                                          onMouseEnter={(e) => {
                                              setHovered(r);
                                              updateTooltip(e);
                                          }}
                                          onMouseMove={updateTooltip} onMouseLeave={() => setHovered(null)}/>
                                    {r.width > 28 && r.height > 18 && (
                                        <text x={r.x + r.width / 2} y={r.y + r.height / 2}
                                              textAnchor="middle" dominantBaseline="middle"
                                              fill="#fff" fontSize={fs} fontWeight="600"
                                              style={{
                                                  pointerEvents: 'none',
                                                  userSelect: 'none',
                                                  textShadow: '0 1px 3px rgba(0,0,0,0.9)'
                                              }}>
                                            {name}
                                        </text>
                                    )}
                                </g>
                            );
                        })}
                    </svg>

                    {/* 图例 */}
                    <div className="absolute bottom-2 right-2 flex gap-2 flex-wrap">
                        {(['added', 'removed', 'grown', 'shrunk'] as DiffKind[]).map((k) => (
                            <div key={k} className="flex items-center gap-1 px-2 py-0.5 rounded text-xs bg-black/60"
                                 style={{color: KIND_COLORS[k]}}>
                                <span className="w-2 h-2 rounded-sm inline-block" style={{background: KIND_COLORS[k]}}/>
                                {t(`snapshot.kind.${k}`)}
                            </div>
                        ))}
                    </div>

                    {/* 工具提示 */}
                    {hovered && (
                        <div ref={tooltipRef}
                             className="fixed left-0 top-0 pointer-events-none z-[99999] bg-zinc-900/95 backdrop-blur-md border border-white/10 rounded-lg p-3 max-w-[280px] shadow-[0_8px_32px_rgba(0,0,0,0.6)]">
                            <p className="text-sm font-bold text-white mb-1">{ellipsizeText(hovered.entry.name, 42)}</p>
                            <span className="text-xs block mb-1" style={{color: KIND_COLORS[hovered.entry.kind]}}>
                                {t(`snapshot.kind.${hovered.entry.kind}`)}
                                {hovered.entry.is_dir &&
                                    <span className="text-white/40 ml-1">({t('snapshot.clickToEnter')})</span>}
                            </span>
                            {hovered.entry.size_a > 0 && <span
                                className="text-xs text-white/60 block">OLD: {formatBytes(hovered.entry.size_a)}</span>}
                            {hovered.entry.size_b > 0 && <span
                                className="text-xs text-white/60 block">NEW: {formatBytes(hovered.entry.size_b)}</span>}
                            <span className="text-xs text-white/80 font-semibold block">
                                Δ {hovered.entry.size_delta >= 0 ? '+' : ''}{formatBytes(Math.abs(hovered.entry.size_delta))}
                            </span>
                        </div>
                    )}

                    {/* 右键菜单 */}
                    <DiffContextMenu
                        anchor={ctxMenu}
                        isVirtual={ctxMenu ? isVirtualGroupPath(ctxMenu.entry.path) : false}
                        onClose={() => setCtxMenu(null)}
                        onOpenExplorer={() => ctxMenu && onOpenExplorer(ctxMenu.entry.path)}
                        onViewTrend={() => ctxMenu && onViewTrend(ctxMenu.entry)}
                    />
                </div>
            )}
        </div>
    );
};
