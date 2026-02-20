import React, {useCallback, useEffect, useMemo, useRef, useState} from 'react';
import {alpha, Box, Typography} from '@mui/material';
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
                    <Typography sx={{color: alpha('#ffffff', 0.4)}}>{t('snapshot.noDiff')}</Typography>
                </div>
            ) : (
                <div ref={containerRef} className="flex-1 relative overflow-hidden"
                     style={{background: alpha('#ffffff', 0.04)}}>
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
                                          fill={r.color} stroke={alpha('#000', 0.4)} strokeWidth={1}
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
                            <div key={k} className="flex items-center gap-1 px-2 py-0.5 rounded text-xs"
                                 style={{background: alpha('#000', 0.6), color: KIND_COLORS[k]}}>
                                <span className="w-2 h-2 rounded-sm inline-block" style={{background: KIND_COLORS[k]}}/>
                                {t(`snapshot.kind.${k}`)}
                            </div>
                        ))}
                    </div>

                    {/* 工具提示 */}
                    {hovered && (
                        <Box ref={tooltipRef} sx={{
                            position: 'fixed', left: 0, top: 0, pointerEvents: 'none', zIndex: 99999,
                            bgcolor: alpha('#18181b', 0.95), backdropFilter: 'blur(12px)',
                            border: `1px solid ${alpha('#fff', 0.1)}`, borderRadius: 2,
                            p: 1.5, maxWidth: 280, boxShadow: '0 8px 32px rgba(0,0,0,0.6)',
                        }}>
                            <Typography variant="body2" fontWeight="bold" sx={{
                                color: 'white',
                                mb: 0.5
                            }}>{ellipsizeText(hovered.entry.name, 42)}</Typography>
                            <Typography variant="caption" display="block"
                                        sx={{color: KIND_COLORS[hovered.entry.kind], mb: 0.5}}>
                                {t(`snapshot.kind.${hovered.entry.kind}`)}
                                {hovered.entry.is_dir && <span style={{
                                    color: alpha('#fff', 0.4),
                                    marginLeft: 4
                                }}>({t('snapshot.clickToEnter')})</span>}
                            </Typography>
                            {hovered.entry.size_a > 0 && <Typography variant="caption" display="block"
                                                                     sx={{color: alpha('#fff', 0.6)}}>OLD: {formatBytes(hovered.entry.size_a)}</Typography>}
                            {hovered.entry.size_b > 0 && <Typography variant="caption" display="block"
                                                                     sx={{color: alpha('#fff', 0.6)}}>NEW: {formatBytes(hovered.entry.size_b)}</Typography>}
                            <Typography variant="caption" display="block"
                                        sx={{color: alpha('#fff', 0.8), fontWeight: 600}}>
                                Δ {hovered.entry.size_delta >= 0 ? '+' : ''}{formatBytes(Math.abs(hovered.entry.size_delta))}
                            </Typography>
                        </Box>
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
