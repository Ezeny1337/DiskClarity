import React, {useMemo} from 'react';
import {Chip} from '@mui/material';
import {useTranslation} from 'react-i18next';
import type {DiffEntry, SnapshotGroupBy} from '../../types';
import {KIND_BG, KIND_COLORS} from '../../constants';
import {formatBytes} from '../../utils/format';
import {
    getDirectChildren,
    getEntriesInVirtualGroup,
    getFlatFiles,
    groupDiffEntriesWithScope,
    parseVirtualGroupPath,
} from '../../utils/snapshotUtils';

interface DiffBarChartProps {
    entries: DiffEntry[];
    topN: number;
    showFilesOnly: boolean;
    currentPath: string;
    groupBy: SnapshotGroupBy;
    flatGrouping: boolean;
}

export const DiffBarChart: React.FC<DiffBarChartProps> = ({
                                                              entries,
                                                              topN,
                                                              showFilesOnly,
                                                              currentPath,
                                                              groupBy,
                                                              flatGrouping
                                                          }) => {
    const {t} = useTranslation();

    const topEntries = useMemo(() => {
        const virtual = parseVirtualGroupPath(currentPath);
        if (virtual) {
            const scopeBase = (showFilesOnly || flatGrouping)
                ? getFlatFiles(entries, virtual.scopePath)
                : getDirectChildren(entries, virtual.scopePath);
            return getEntriesInVirtualGroup(scopeBase, currentPath)
                .sort((a, b) => Math.abs(b.size_delta) - Math.abs(a.size_delta))
                .slice(0, topN);
        }

        const base = (showFilesOnly || flatGrouping)
            ? getFlatFiles(entries, currentPath)
            : getDirectChildren(entries, currentPath);
        const grouped = groupDiffEntriesWithScope(base, groupBy, currentPath, t);
        return grouped.sort((a, b) => Math.abs(b.size_delta) - Math.abs(a.size_delta)).slice(0, topN);
    }, [entries, topN, showFilesOnly, currentPath, groupBy, flatGrouping, t]);

    if (!topEntries.length) {
        return (
            <div className="flex items-center justify-center h-full">
                <span className="text-sm text-white/40">{t('snapshot.noDiff')}</span>
            </div>
        );
    }

    const maxAbs = Math.max(...topEntries.map(e => Math.abs(e.size_delta)), 1);

    return (
        <div className="w-full h-full flex flex-col overflow-hidden p-4 gap-2">
            <span className="text-xs text-white/40 mb-1 block">{t('snapshot.topNDesc', {n: topN})}</span>
            <div className="flex-1 overflow-y-auto custom-scrollbar space-y-2">
                {topEntries.map((entry) => {
                    const ratio = Math.abs(entry.size_delta) / maxAbs;
                    const barColor = KIND_COLORS[entry.kind];
                    return (
                        <div key={entry.path} className="flex items-center gap-3">
                            <div className="w-36 shrink-0 flex items-center gap-1 min-w-0">
                                <span className="text-[11px] text-white/50">{entry.is_dir ? '📁' : '📄'}</span>
                                <span className="text-xs truncate text-white/80" title={entry.path}>{entry.name}</span>
                            </div>
                            <div className="flex-1 relative h-6 rounded overflow-hidden bg-white/6">
                                <div className="absolute left-0 top-0 h-full rounded transition-all"
                                     style={{
                                         width: `${Math.max(ratio * 100, 2)}%`,
                                         background: barColor,
                                         opacity: 0.8
                                     }}/>
                                <span className="absolute right-2 top-0 h-full flex items-center text-xs font-medium"
                                      style={{color: '#fff'}}>
                  {entry.size_delta >= 0 ? '+' : ''}{formatBytes(Math.abs(entry.size_delta))}
                </span>
                            </div>
                            <Chip
                                label={t(`snapshot.kind.${entry.kind}`)}
                                size="small"
                                sx={{
                                    flexShrink: 0,
                                    bgcolor: KIND_BG[entry.kind],
                                    color: KIND_COLORS[entry.kind],
                                    border: `1px solid ${KIND_COLORS[entry.kind]}4d`,
                                }}
                            />
                        </div>
                    );
                })}
            </div>
        </div>
    );
};
