import React from 'react';
import {Tooltip} from '@mui/material';
import {ChevronRight, Copy, Home} from 'lucide-react';
import {useTranslation} from 'react-i18next';
import type {BreadcrumbItem} from '../../utils/snapshotUtils';

export type {BreadcrumbItem};

interface PathBreadcrumbProps {
    crumbs: BreadcrumbItem[];
    onNavigate: (path: string) => void;
    currentPath?: string;
    rootLabel?: string;
    className?: string;
}

export const PathBreadcrumb: React.FC<PathBreadcrumbProps> = ({
                                                                  crumbs,
                                                                  onNavigate,
                                                                  currentPath,
                                                                  rootLabel,
                                                                  className,
                                                              }) => {
    const {t} = useTranslation();
    const isAtRoot = crumbs.length === 0;

    return (
        <div className={className ?? 'flex items-center gap-1 px-3 py-1.5 shrink-0 flex-wrap'}>
            {/* 根节点按钮 */}
            <Tooltip title={rootLabel ?? t('treemapView.root')}>
                <button
                    onClick={() => onNavigate('')}
                    className={`p-0.5 rounded transition-colors ${isAtRoot ? 'text-white/30' : 'text-white/70 hover:text-white'}`}
                >
                    <Home size={14}/>
                </button>
            </Tooltip>

            {/* 各级路径 */}
            {crumbs.map((crumb, i) => {
                const isLast = i === crumbs.length - 1;
                return (
                    <React.Fragment key={crumb.path}>
                        <ChevronRight size={12} className="text-white/30 shrink-0"/>
                        <button
                            onClick={() => onNavigate(crumb.path)}
                            className={`text-xs px-1 py-0.5 rounded transition-all max-w-48 truncate ${
                                isLast ? 'text-white font-semibold bg-white/8' : 'text-white/55 font-normal hover:text-white/80'
                            }`}
                            title={crumb.path}
                        >
                            {crumb.label}
                        </button>
                    </React.Fragment>
                );
            })}

            {/* 复制路径按钮 */}
            {currentPath !== undefined && (
                <Tooltip title={t('treemapView.copyPath')}>
                    <button
                        onClick={() => navigator.clipboard.writeText(currentPath.replace(/\//g, '\\'))}
                        className="p-0.5 ml-0.5 rounded text-white/35 hover:text-violet-400 transition-colors"
                    >
                        <Copy size={12}/>
                    </button>
                </Tooltip>
            )}
        </div>
    );
};
