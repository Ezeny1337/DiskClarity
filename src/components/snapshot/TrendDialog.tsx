import React, {useMemo} from 'react';
import {alpha, CircularProgress, Dialog, DialogContent, DialogTitle, IconButton, Typography} from '@mui/material';
import {TrendingUp, X} from 'lucide-react';
import {useTranslation} from 'react-i18next';

/** 趋势数据点接口 */
export interface TrendPoint {
    snapshotId: string;
    createdAt: number;
    size: number;
    label?: string;
}

interface TrendDialogProps {
    open: boolean;
    onClose: () => void;
    entryPath: string;
    trendData: TrendPoint[];
    loading: boolean;
}

export const TrendDialog: React.FC<TrendDialogProps> = ({
                                                            open,
                                                            onClose,
                                                            entryPath,
                                                            trendData,
                                                            loading
                                                        }) => {
    const {t} = useTranslation();

    const W = 700, H = 280, PAD = {top: 20, right: 20, bottom: 50, left: 70};
    const innerW = W - PAD.left - PAD.right;
    const innerH = H - PAD.top - PAD.bottom;

    const chartData = useMemo(() => {
        if (trendData.length < 2) return null;
        const sorted = [...trendData].sort((a, b) => a.createdAt - b.createdAt);
        const pointCount = sorted.length;
        const minT = sorted[0].createdAt;
        const maxT = sorted[sorted.length - 1].createdAt;
        const maxSize = Math.max(...sorted.map(p => p.size), 1);
        const tRange = maxT - minT || 1;

        const points = sorted.map((p, idx) => {
            const evenCx = PAD.left + (pointCount <= 1 ? 0 : (idx / (pointCount - 1)) * innerW);
            const timeCx = PAD.left + ((p.createdAt - minT) / tRange) * innerW;
            return {
                ...p,
                cx: pointCount <= 3 ? evenCx : timeCx,
                cy: PAD.top + (1 - p.size / maxSize) * innerH,
            };
        });

        const minDateGap = 54;
        const dateVisible = points.map((_, idx) => {
            if (idx === 0 || idx === points.length - 1) return true;
            return points[idx].cx - points[idx - 1].cx >= minDateGap;
        });

        const pathD = points.map((p, i) => `${i === 0 ? 'M' : 'L'}${p.cx.toFixed(1)},${p.cy.toFixed(1)}`).join(' ');
        const areaD = `${pathD} L${points[points.length - 1].cx.toFixed(1)},${(PAD.top + innerH).toFixed(1)} L${PAD.left},${(PAD.top + innerH).toFixed(1)} Z`;
        return {sorted, points, pathD, areaD, maxSize, dateVisible};
    }, [trendData]);

    const formatDate = (ts: number, withYear = true) => {
        const date = new Date(ts * 1000);
        if (withYear) {
            return date.toLocaleDateString(undefined, {year: 'numeric', month: '2-digit', day: '2-digit'});
        }
        return date.toLocaleDateString(undefined, {month: '2-digit', day: '2-digit'});
    };

    const formatDateTime = (ts: number) => {
        const date = new Date(ts * 1000);
        return date.toLocaleString(undefined, {
            year: 'numeric',
            month: '2-digit',
            day: '2-digit',
            hour: '2-digit',
            minute: '2-digit',
            second: '2-digit',
            hour12: false,
        });
    };

    const fmtBytes = (b: number) => {
        if (b >= 1e9) return `${(b / 1e9).toFixed(1)}G`;
        if (b >= 1e6) return `${(b / 1e6).toFixed(1)}M`;
        if (b >= 1e3) return `${(b / 1e3).toFixed(1)}K`;
        return `${b}B`;
    };

    const pointCount = chartData?.points.length ?? 0;
    const showXAxisDate = pointCount <= 24;
    const useMonthDayOnly = pointCount > 6;
    const showSnapshotLabel = pointCount <= 12;

    return (
        <Dialog open={open} onClose={onClose} maxWidth="md" fullWidth
                slotProps={{
                    paper: {
                        sx: {
                            bgcolor: '#0f0f11',
                            border: `1px solid ${alpha('#ffffff', 0.1)}`,
                            borderRadius: 3,
                            backgroundImage: 'none',
                        }
                    }
                }}>
            <DialogTitle sx={{display: 'flex', alignItems: 'center', justifyContent: 'space-between', pb: 1}}>
                <div className="flex items-center gap-2">
                    <TrendingUp size={20} style={{color: '#a78bfa'}}/>
                    <Typography component="span" sx={{color: 'white', fontSize: 15, fontWeight: 700}}>
                        {t('snapshot.trendTitle')}
                    </Typography>
                </div>
                <div>
                    <Typography variant="caption" sx={{color: alpha('#ffffff', 0.4), fontFamily: 'monospace', mr: 2}}
                                noWrap>
                        {entryPath.replace(/\//g, '\\')}
                    </Typography>
                    <IconButton size="small" onClick={onClose} sx={{color: alpha('#ffffff', 0.5)}}>
                        <X size={18}/>
                    </IconButton>
                </div>
            </DialogTitle>
            <DialogContent sx={{pt: 1}}>
                {loading ? (
                    <div className="flex items-center justify-center h-64">
                        <CircularProgress sx={{color: '#a78bfa'}}/>
                    </div>
                ) : !chartData ? (
                    <div className="flex flex-col items-center justify-center h-64 gap-3">
                        <TrendingUp size={48} style={{color: alpha('#ffffff', 0.15)}}/>
                        <Typography sx={{color: alpha('#ffffff', 0.4)}}>{t('snapshot.trendNoData')}</Typography>
                        <Typography variant="caption"
                                    sx={{color: alpha('#ffffff', 0.25)}}>{t('snapshot.trendNoDataHint')}</Typography>
                    </div>
                ) : (
                    <div>
                        {/* SVG 折线图 */}
                        <svg width="100%" viewBox={`0 0 ${W} ${H}`}
                             style={{overflow: 'visible'}}>
                            <defs>
                                <linearGradient id="trendGrad" x1="0" y1="0" x2="0" y2="1">
                                    <stop offset="0%" stopColor="#8b5cf6" stopOpacity="0.4"/>
                                    <stop offset="100%" stopColor="#8b5cf6" stopOpacity="0.02"/>
                                </linearGradient>
                            </defs>
                            {/* 网格线 */}
                            {[0, 0.25, 0.5, 0.75, 1].map((ratio) => {
                                const y = PAD.top + ratio * innerH;
                                const val = chartData.maxSize * (1 - ratio);
                                return (
                                    <g key={ratio}>
                                        <line x1={PAD.left} y1={y} x2={PAD.left + innerW} y2={y}
                                              stroke={alpha('#ffffff', 0.06)} strokeWidth={1}/>
                                        <text x={PAD.left - 6} y={y} textAnchor="end" dominantBaseline="middle"
                                              fill={alpha('#ffffff', 0.35)} fontSize={11}>{fmtBytes(val)}</text>
                                    </g>
                                );
                            })}
                            {/* 面积填充 */}
                            <path d={chartData.areaD} fill="url(#trendGrad)"/>
                            {/* 折线 */}
                            <path d={chartData.pathD} fill="none" stroke="#8b5cf6" strokeWidth={2.5}
                                  strokeLinejoin="round" strokeLinecap="round"/>
                            {/* 数据点 */}
                            {chartData.points.map((p, i) => (
                                <g key={i}>
                                    <circle cx={p.cx} cy={p.cy} r={5} fill="#8b5cf6" stroke="#0f0f11" strokeWidth={2}/>
                                    {/* X 轴标签 */}
                                    {showXAxisDate && chartData.dateVisible[i] && (
                                        <text x={p.cx} y={PAD.top + innerH + 32} textAnchor="middle"
                                              fill={alpha('#ffffff', 0.35)} fontSize={9.5}>
                                            {formatDate(p.createdAt, !useMonthDayOnly)}
                                        </text>
                                    )}
                                    {showSnapshotLabel && p.label && (
                                        <text x={p.cx} y={PAD.top + innerH + 45} textAnchor="middle"
                                              fill={alpha('#ffffff', 0.25)} fontSize={8}>
                                            {p.label.length > 6 ? p.label.slice(0, 6) + '…' : p.label}
                                        </text>
                                    )}
                                </g>
                            ))}
                            {/* 轴线 */}
                            <line x1={PAD.left} y1={PAD.top} x2={PAD.left} y2={PAD.top + innerH}
                                  stroke={alpha('#ffffff', 0.15)} strokeWidth={1}/>
                            <line x1={PAD.left} y1={PAD.top + innerH} x2={PAD.left + innerW} y2={PAD.top + innerH}
                                  stroke={alpha('#ffffff', 0.15)} strokeWidth={1}/>
                        </svg>
                        {/* 数据点列表 */}
                        <div className="mt-4 space-y-1">
                            {chartData.sorted.map((p, i) => (
                                <div key={i} className="flex items-center gap-3 text-xs px-2 py-1 rounded"
                                     style={{background: alpha('#ffffff', 0.03)}}>
                                    <span style={{
                                        color: alpha('#ffffff', 0.35),
                                        minWidth: 180
                                    }}>{formatDateTime(p.createdAt)}</span>
                                    <span style={{
                                        color: '#a78bfa',
                                        fontWeight: 600,
                                        minWidth: 70
                                    }}>{fmtBytes(p.size)}</span>
                                    {p.label && <span style={{color: alpha('#ffffff', 0.5)}}>{p.label}</span>}
                                </div>
                            ))}
                        </div>
                    </div>
                )}
            </DialogContent>
        </Dialog>
    );
};
