import React, {useMemo, useRef} from 'react';
import {useVirtualizer} from '@tanstack/react-virtual';
import {alpha, Chip, Typography} from '@mui/material';
import {DiffContextMenu} from '../ui/DiffContextMenu';
import {useTranslation} from 'react-i18next';
import type {DiffEntry, SnapshotGroupBy} from '../../types';
import {KIND_BG, KIND_COLORS} from '../../constants';
import {formatBytes} from '../../utils/format';
import {buildSnapshotBreadcrumbs, computeVisibleDiffEntries, isVirtualGroupPath,} from '../../utils/snapshotUtils';
import {PathBreadcrumb} from '../ui/PathBreadcrumb';

interface DiffListProps {
    entries: DiffEntry[];
    showFilesOnly: boolean;
    currentPath: string;
    groupBy: SnapshotGroupBy;
    flatGrouping: boolean;
    onNavigate: (path: string) => void;
    onOpenExplorer: (path: string) => void;
    onViewTrend: (entry: DiffEntry) => void;
}

export const DiffList: React.FC<DiffListProps> = ({
                                                      entries,
                                                      showFilesOnly,
                                                      currentPath,
                                                      groupBy,
                                                      flatGrouping,
                                                      onNavigate,
                                                      onOpenExplorer,
                                                      onViewTrend
                                                  }) => {
    const {t} = useTranslation();
    const [ctxMenu, setCtxMenu] = React.useState<{ mouseX: number; mouseY: number; entry: DiffEntry } | null>(null);
    const scrollRef = useRef<HTMLDivElement>(null);

    const visibleEntries = useMemo(
        () => computeVisibleDiffEntries(entries, currentPath, showFilesOnly, groupBy, flatGrouping, t),
        [entries, currentPath, showFilesOnly, groupBy, flatGrouping, t],
    );
    const listBreadcrumbs = useMemo(() => buildSnapshotBreadcrumbs(currentPath, t), [currentPath, t]);

    const rowVirtualizer = useVirtualizer({
        count: visibleEntries.length,
        getScrollElement: () => scrollRef.current,
        estimateSize: () => 40,
        overscan: 8,
    });

    return (
        <div className="w-full h-full flex flex-col overflow-hidden">
            {/* List View 面包屑 */}
            {!showFilesOnly && (
                <PathBreadcrumb
                    crumbs={listBreadcrumbs}
                    onNavigate={onNavigate}
                    currentPath={currentPath && !currentPath.startsWith('__group__:') ? currentPath : undefined}
                />
            )}

            {/* 表头 */}
            <div className="grid text-xs font-semibold px-4 py-2 sticky top-0 z-10"
                 style={{
                     gridTemplateColumns: '1fr 80px 80px 80px 90px',
                     background: alpha('#ffffff', 0.08),
                     color: alpha('#ffffff', 0.5),
                     borderBottom: `1px solid ${alpha('#ffffff', 0.08)}`
                 }}>
                <span>{t('fileList.name')}</span>
                <span className="text-right">{t('snapshot.sizeOld')}</span>
                <span className="text-right">{t('snapshot.sizeNew')}</span>
                <span className="text-right">{t('snapshot.delta')}</span>
                <span className="text-right">{t('snapshot.changeType')}</span>
            </div>

            {/* 列表内容 */}
            <div ref={scrollRef} className="flex-1 overflow-y-auto custom-scrollbar">
                {visibleEntries.length === 0 ? (
                    <div className="flex items-center justify-center h-32">
                        <Typography
                            sx={{color: alpha('#ffffff', 0.3), fontSize: 14}}>{t('snapshot.noDiff')}</Typography>
                    </div>
                ) : (
                    <div style={{height: rowVirtualizer.getTotalSize(), position: 'relative'}}>
                        {rowVirtualizer.getVirtualItems().map((virtualRow) => {
                            const entry = visibleEntries[virtualRow.index];
                            const idx = virtualRow.index;
                            const evenBg = idx % 2 === 0 ? alpha('#ffffff', 0.02) : 'transparent';
                            return (
                                <div
                                    key={virtualRow.key}
                                    style={{
                                        position: 'absolute',
                                        top: 0, left: 0, width: '100%',
                                        transform: `translateY(${virtualRow.start}px)`,
                                    }}
                                >
                                    <div
                                        onClick={() => entry.is_dir && onNavigate(entry.path)}
                                        onContextMenu={(e) => {
                                            e.preventDefault();
                                            setCtxMenu({mouseX: e.clientX, mouseY: e.clientY, entry});
                                        }}
                                        className="grid items-center px-4 py-2 text-sm transition-colors"
                                        style={{
                                            gridTemplateColumns: '1fr 80px 80px 80px 90px',
                                            background: evenBg,
                                            borderBottom: `1px solid ${alpha('#ffffff', 0.04)}`,
                                            cursor: entry.is_dir ? 'pointer' : 'default',
                                        }}
                                        onMouseEnter={e => {
                                            (e.currentTarget as HTMLDivElement).style.background = alpha('#ffffff', 0.06);
                                        }}
                                        onMouseLeave={e => {
                                            (e.currentTarget as HTMLDivElement).style.background = evenBg;
                                        }}
                                    >
                                        <div className="flex items-center gap-2 min-w-0">
                                            <span style={{
                                                color: KIND_COLORS[entry.kind],
                                                fontSize: 12
                                            }}>{entry.is_dir ? '📁' : '📄'}</span>
                                            <span className="truncate" style={{color: alpha('#ffffff', 0.85)}}
                                                  title={entry.path}>{entry.name}</span>
                                        </div>
                                        <span className="text-right text-xs"
                                              style={{color: alpha('#ffffff', 0.5)}}>{entry.size_a > 0 ? formatBytes(entry.size_a) : '—'}</span>
                                        <span className="text-right text-xs"
                                              style={{color: alpha('#ffffff', 0.5)}}>{entry.size_b > 0 ? formatBytes(entry.size_b) : '—'}</span>
                                        <span className="text-right text-xs font-medium"
                                              style={{color: entry.size_delta >= 0 ? '#4ade80' : '#f87171'}}>
                                            {entry.size_delta >= 0 ? '+' : ''}{formatBytes(Math.abs(entry.size_delta))}
                                        </span>
                                        <div className="flex justify-end">
                                            <Chip label={t(`snapshot.kind.${entry.kind}`)} size="small"
                                                  sx={{
                                                      height: 18,
                                                      fontSize: 10,
                                                      fontWeight: 600,
                                                      bgcolor: KIND_BG[entry.kind],
                                                      color: KIND_COLORS[entry.kind],
                                                      border: `1px solid ${alpha(KIND_COLORS[entry.kind], 0.3)}`
                                                  }}/>
                                        </div>
                                    </div>
                                </div>
                            );
                        })}
                    </div>
                )}
            </div>

            {/* 右键菜单 */}
            <DiffContextMenu
                anchor={ctxMenu}
                isVirtual={ctxMenu ? isVirtualGroupPath(ctxMenu.entry.path) : false}
                onClose={() => setCtxMenu(null)}
                onOpenExplorer={() => ctxMenu && onOpenExplorer(ctxMenu.entry.path)}
                onViewTrend={() => ctxMenu && onViewTrend(ctxMenu.entry)}
            />
        </div>
    );
};
