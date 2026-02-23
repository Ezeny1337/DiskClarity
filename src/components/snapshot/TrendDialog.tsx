import React, {useMemo} from 'react';
import {CircularProgress, Dialog, DialogContent, DialogTitle} from '@mui/material';
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
        <Dialog open={open} onClose={onClose} maxWidth="md" fullWidth>
            <DialogTitle>
                <div className="flex items-center gap-2">
                    <TrendingUp size={20} style={{color: '#a78bfa'}}/>
                    <span className="text-[15px] font-bold text-white">{t('snapshot.trendTitle')}</span>
                </div>
                <div className="flex items-center gap-2">
                    <span className="text-xs text-white/40 font-mono truncate max-w-64">
                        {entryPath.replace(/\//g, '\\')}
                    </span>
                    <button
                        onClick={onClose}
                        className="p-1.5 rounded-md text-white/50 hover:text-white/80 hover:bg-white/5 transition-colors"
                    >
                        <X size={18}/>
                    </button>
                </div>
            </DialogTitle>
            <DialogContent>
                {loading ? (
                    <div className="flex items-center justify-center h-64">
                        <CircularProgress sx={{color: '#a78bfa'}}/>
                    </div>
                ) : !chartData ? (
                    <div className="flex flex-col items-center justify-center h-64 gap-3">
                        <TrendingUp size={48} className="text-white/15"/>
                        <p className="text-sm text-white/40">{t('snapshot.trendNoData')}</p>
                        <span className="text-xs text-white/25">{t('snapshot.trendNoDataHint')}</span>
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
                                              stroke="rgba(255,255,255,0.06)" strokeWidth={1}/>
                                        <text x={PAD.left - 6} y={y} textAnchor="end" dominantBaseline="middle"
                                              fill="rgba(255,255,255,0.35)" fontSize={11}>{fmtBytes(val)}</text>
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
                                              fill="rgba(255,255,255,0.35)" fontSize={9.5}>
                                            {formatDate(p.createdAt, !useMonthDayOnly)}
                                        </text>
                                    )}
                                    {showSnapshotLabel && p.label && (
                                        <text x={p.cx} y={PAD.top + innerH + 45} textAnchor="middle"
                                              fill="rgba(255,255,255,0.25)" fontSize={8}>
                                            {p.label.length > 6 ? p.label.slice(0, 6) + '…' : p.label}
                                        </text>
                                    )}
                                </g>
                            ))}
                            {/* 轴线 */}
                            <line x1={PAD.left} y1={PAD.top} x2={PAD.left} y2={PAD.top + innerH}
                                  stroke="rgba(255,255,255,0.15)" strokeWidth={1}/>
                            <line x1={PAD.left} y1={PAD.top + innerH} x2={PAD.left + innerW} y2={PAD.top + innerH}
                                  stroke="rgba(255,255,255,0.15)" strokeWidth={1}/>
                        </svg>
                        {/* 数据点列表 */}
                        <div className="mt-4 space-y-1">
                            {chartData.sorted.map((p, i) => (
                                <div key={i} className="flex items-center gap-3 text-xs px-2 py-1 rounded bg-white/3">
                                    <span className="text-white/35"
                                          style={{minWidth: 180}}>{formatDateTime(p.createdAt)}</span>
                                    <span className="text-violet-400 font-semibold"
                                          style={{minWidth: 70}}>{fmtBytes(p.size)}</span>
                                    {p.label && <span className="text-white/50">{p.label}</span>}
                                </div>
                            ))}
                        </div>
                    </div>
                )}
            </DialogContent>
        </Dialog>
    );
};
