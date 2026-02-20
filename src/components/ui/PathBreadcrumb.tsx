import React from 'react';
import {alpha, IconButton, Tooltip} from '@mui/material';
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
                <IconButton
                    size="small"
                    onClick={() => onNavigate('')}
                    sx={{color: isAtRoot ? alpha('#ffffff', 0.3) : alpha('#ffffff', 0.7), p: 0.25}}
                >
                    <Home size={14}/>
                </IconButton>
            </Tooltip>

            {/* 各级路径 */}
            {crumbs.map((crumb, i) => {
                const isLast = i === crumbs.length - 1;
                return (
                    <React.Fragment key={crumb.path}>
                        <ChevronRight size={12} style={{color: alpha('#ffffff', 0.3)}}/>
                        <button
                            onClick={() => onNavigate(crumb.path)}
                            className="text-xs px-1 py-0.5 rounded transition-all max-w-48 truncate"
                            style={{
                                color: isLast ? 'white' : alpha('#ffffff', 0.55),
                                fontWeight: isLast ? 600 : 400,
                                background: isLast ? alpha('#ffffff', 0.08) : 'transparent',
                            }}
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
                    <IconButton
                        size="small"
                        onClick={() => navigator.clipboard.writeText(currentPath.replace(/\//g, '\\'))}
                        sx={{color: alpha('#ffffff', 0.35), p: 0.25, ml: 0.5, '&:hover': {color: '#a78bfa'}}}
                    >
                        <Copy size={12}/>
                    </IconButton>
                </Tooltip>
            )}
        </div>
    );
};
