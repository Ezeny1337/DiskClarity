import React, {useMemo, useRef} from 'react';
import {useVirtualizer} from '@tanstack/react-virtual';
import {Chip} from '@mui/material';
import {DiffContextMenu} from '../ui/DiffContextMenu';
import {useTranslation} from 'react-i18next';
import type {DiffEntry} from '../../types';
import {KIND_BG, KIND_COLORS} from '../../constants';
import {formatBytes} from '../../utils/format';
import {buildSnapshotBreadcrumbs, isVirtualGroupPath,} from '../../utils/snapshotUtils';
import {PathBreadcrumb} from '../ui/PathBreadcrumb';

import {File, Folder} from 'lucide-react';

interface DiffListProps {
    entries: DiffEntry[];
    showFilesOnly: boolean;
    currentPath: string;
    onNavigate: (path: string) => void;
    onOpenExplorer: (path: string) => void;
    onViewTrend: (entry: DiffEntry) => void;
}

export const DiffList: React.FC<DiffListProps> = ({
                                                      entries,
                                                      showFilesOnly,
                                                      currentPath,
                                                      onNavigate,
                                                      onOpenExplorer,
                                                      onViewTrend
                                                  }) => {
    const {t} = useTranslation();
    const [ctxMenu, setCtxMenu] = React.useState<{ mouseX: number; mouseY: number; entry: DiffEntry } | null>(null);
    const scrollRef = useRef<HTMLDivElement>(null);

    const listBreadcrumbs = useMemo(() => buildSnapshotBreadcrumbs(currentPath, t), [currentPath, t]);

    const rowVirtualizer = useVirtualizer({
        count: entries.length,
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
            <div
                className="grid text-xs font-semibold px-4 py-2 sticky top-0 z-10 text-white/50 bg-white/8 border-b border-white/8"
                style={{gridTemplateColumns: '1fr 80px 80px 80px 90px'}}>
                <span>{t('fileList.name')}</span>
                <span className="text-right">{t('snapshot.sizeOld')}</span>
                <span className="text-right">{t('snapshot.sizeNew')}</span>
                <span className="text-right">{t('snapshot.delta')}</span>
                <span className="text-right">{t('snapshot.changeType')}</span>
            </div>

            {/* 列表内容 */}
            <div ref={scrollRef} className="flex-1 overflow-y-auto custom-scrollbar">
                {entries.length === 0 ? (
                    <div className="flex items-center justify-center h-32">
                        <span className="text-sm text-white/30">{t('snapshot.noDiff')}</span>
                    </div>
                ) : (
                    <div style={{height: rowVirtualizer.getTotalSize(), position: 'relative'}}>
                        {rowVirtualizer.getVirtualItems().map((virtualRow) => {
                            const entry = entries[virtualRow.index];
                            const idx = virtualRow.index;
                            const evenBg = idx % 2 === 0 ? 'rgba(255,255,255,0.02)' : 'transparent';
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
                                            borderBottom: '1px solid rgba(255,255,255,0.04)',
                                            cursor: entry.is_dir ? 'pointer' : 'default',
                                        }}
                                        onMouseEnter={e => {
                                            (e.currentTarget as HTMLDivElement).style.background = 'rgba(255,255,255,0.06)';
                                        }}
                                        onMouseLeave={e => {
                                            (e.currentTarget as HTMLDivElement).style.background = evenBg;
                                        }}
                                    >
                                        <div className="flex items-center gap-2 min-w-0">
                                            <span className="flex items-center justify-center shrink-0 w-4" style={{
                                                color: KIND_COLORS[entry.kind]
                                            }}>
                                                {entry.is_dir ? <Folder size={14}/> :
                                                    <File size={14} className="opacity-70"/>}
                                            </span>
                                            <span className="truncate text-white/85"
                                                  title={entry.path}>{entry.name}</span>
                                        </div>
                                        <span
                                            className="text-right text-xs text-white/50">{entry.size_a > 0 ? formatBytes(entry.size_a) : '—'}</span>
                                        <span
                                            className="text-right text-xs text-white/50">{entry.size_b > 0 ? formatBytes(entry.size_b) : '—'}</span>
                                        <span className="text-right text-xs font-medium"
                                              style={{color: entry.size_delta >= 0 ? '#4ade80' : '#f87171'}}>
                                            {entry.size_delta >= 0 ? '+' : ''}{formatBytes(Math.abs(entry.size_delta))}
                                        </span>
                                        <div className="flex justify-end">
                                            <Chip
                                                label={t(`snapshot.kind.${entry.kind}`)}
                                                size="small"
                                                sx={{
                                                    bgcolor: KIND_BG[entry.kind],
                                                    color: KIND_COLORS[entry.kind],
                                                    border: `1px solid ${KIND_COLORS[entry.kind]}4d`,
                                                }}
                                            />
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
