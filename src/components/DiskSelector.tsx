import React, {useEffect, useState} from 'react';
import {useTranslation} from 'react-i18next';
import {DiskInfo, getCpuCount, getDiskInfo, getDrives} from '../services/scanService';
import {formatBytes} from '../utils/format';
import {useScanStore} from '../store/scanStore';
import {AnimatePresence, motion} from 'framer-motion';
import {Check, Cpu, HardDrive, Loader2} from 'lucide-react';
import {cn} from '../lib/utils';
import {Card} from './ui/Card';

interface DiskSelectorProps {
    onSelect: (drive: string) => void;
}

export const DiskSelector: React.FC<DiskSelectorProps> = ({onSelect}) => {
    const {t} = useTranslation();
    const [drives, setDrives] = useState<string[]>([]);
    const [diskInfos, setDiskInfos] = useState<Map<string, DiskInfo>>(new Map());
    const [selectedDrive, setSelectedDrive] = useState<string | null>(null);
    const [loading, setLoading] = useState(true);
    const [cpuCount, setCpuCount] = useState<number>(0);
    const {scanConfig, setScanConfig} = useScanStore();

    useEffect(() => {
        const loadData = async () => {
            try {
                const [driveList, cpus] = await Promise.all([
                    getDrives(),
                    getCpuCount()
                ]);
                setDrives(driveList);
                setCpuCount(cpus);

                const infoMap = new Map<string, DiskInfo>();
                for (const drive of driveList) {
                    try {
                        const info = await getDiskInfo(drive);
                        infoMap.set(drive, info);
                    } catch (err) {
                        console.error(`Failed to get info for ${drive}:`, err);
                    }
                }
                setDiskInfos(infoMap);
            } catch (err) {
                console.error('Failed to load drives:', err);
            } finally {
                setLoading(false);
            }
        };

        loadData();
    }, []);

    const threadCount = scanConfig.max_threads || cpuCount;

    const handleThreadChange = (e: React.ChangeEvent<HTMLInputElement>) => {
        const threads = parseInt(e.target.value);
        setScanConfig({
            max_threads: threads === cpuCount ? undefined : threads,
        });
    };

    const handleDriveClick = (drive: string) => {
        setSelectedDrive(drive);
        // 添加选择动画的延迟
        setTimeout(() => {
            onSelect(drive);
        }, 400);
    };

    if (loading) {
        return (
            <div className="h-full flex items-center justify-center">
                <Loader2 className="w-8 h-8 animate-spin text-primary"/>
            </div>
        );
    }

    return (
        <div className="h-full flex flex-col items-center justify-center p-8 overflow-y-auto">
            <motion.div
                initial={{opacity: 0, y: -20}}
                animate={{opacity: 1, y: 0}}
                className="w-full max-w-4xl flex flex-col items-center gap-8"
            >
                <h1 className="text-3xl font-bold bg-clip-text text-transparent bg-linear-to-b from-white to-white/50">
                    {t('diskSelector.title')}
                </h1>

                {/* 设置卡片 */}
                <Card className="w-full max-w-lg p-6 flex flex-col gap-4 bg-zinc-900/50">
                    <div className="flex items-center gap-3 text-white/90">
                        <Cpu size={20} className="text-primary"/>
                        <span className="font-semibold">{t('scanOptions.performance')}</span>
                        <div
                            className="ml-auto px-2 py-1 rounded-full bg-primary/10 border border-primary/20 text-primary text-xs font-medium">
                            {t('scanOptions.threads', {count: threadCount})}
                        </div>
                    </div>

                    <div className="relative pt-2">
                        <input
                            type="range"
                            min={1}
                            max={Math.max(cpuCount, 16)}
                            value={threadCount}
                            onChange={handleThreadChange}
                            className="w-full h-2 bg-surface2 rounded-lg appearance-none cursor-pointer accent-primary hover:accent-primary-hover"
                        />
                        <div className="flex justify-between text-xs text-text-muted mt-2">
                            <span>1</span>
                            <span>{t('scanOptions.auto')} ({cpuCount})</span>
                        </div>
                    </div>
                </Card>

                {/* 驱动器网格 */}
                <div className="flex flex-wrap justify-center gap-6 w-full">
                    <AnimatePresence>
                        {drives.map((drive, index) => {
                            const diskInfo = diskInfos.get(drive);
                            const usagePercent = diskInfo
                                ? (diskInfo.used_space / diskInfo.total_space) * 100
                                : 0;
                            const isSelected = selectedDrive === drive;

                            return (
                                <motion.button
                                    key={drive}
                                    initial={{opacity: 0, scale: 0.9}}
                                    animate={{opacity: 1, scale: 1}}
                                    transition={{delay: index * 0.1}}
                                    onClick={() => handleDriveClick(drive)}
                                    whileHover={{scale: 1.02, y: -2}}
                                    whileTap={{scale: 0.98}}
                                    className={cn(
                                        "relative w-64 h-64 rounded-xl flex flex-col items-center justify-center p-6 gap-4 transition-all duration-300",
                                        "border backdrop-blur-md overflow-hidden",
                                        isSelected
                                            ? "bg-primary/10 border-primary/50 shadow-[0_0_30px_-5px_var(--tw-shadow-color)] shadow-primary/30"
                                            : "bg-surface/50 border-white/5 hover:border-white/10 hover:bg-surface/80"
                                    )}
                                >
                                    {/* 选择指示器 */}
                                    {isSelected && (
                                        <motion.div
                                            initial={{scale: 0}}
                                            animate={{scale: 1}}
                                            className="absolute top-4 right-4 text-primary bg-primary/20 p-1 rounded-full"
                                        >
                                            <Check size={20} className="stroke-3"/>
                                        </motion.div>
                                    )}

                                    {/* 驱动器图标 */}
                                    <div className={cn(
                                        "p-4 rounded-full transition-colors",
                                        isSelected ? "bg-primary/20 text-primary" : "bg-white/5 text-text-muted group-hover:text-white"
                                    )}>
                                        <HardDrive size={40} className="stroke-[1.5]"/>
                                    </div>

                                    <div className="text-center space-y-1 z-10">
                                        <h3 className="text-2xl font-bold tracking-tight text-white">
                                            {drive}
                                        </h3>

                                        {diskInfo ? (
                                            <div className="space-y-2">
                                                <p className="text-sm font-medium text-text-muted">
                                                    {formatBytes(diskInfo.total_space)}
                                                </p>

                                                {/* 进度条 */}
                                                <div
                                                    className="w-32 h-1.5 bg-surface2 rounded-full overflow-hidden mx-auto mt-3">
                                                    <motion.div
                                                        initial={{width: 0}}
                                                        animate={{width: `${usagePercent}%`}}
                                                        transition={{duration: 1, delay: 0.5}}
                                                        className={cn(
                                                            "h-full rounded-full",
                                                            usagePercent > 90 ? "bg-red-500" : "bg-primary"
                                                        )}
                                                    />
                                                </div>
                                                <p className="text-xs text-text-muted pt-1">
                                                    {usagePercent.toFixed(1)}% {t('diskSelector.used')}
                                                </p>
                                            </div>
                                        ) : (
                                            <Loader2 className="w-4 h-4 animate-spin mx-auto text-text-muted"/>
                                        )}
                                    </div>

                                    {/* 发光效果 */}
                                    <div className={cn(
                                        "absolute inset-0 pointer-events-none opacity-0 transition-opacity duration-500",
                                        isSelected ? "opacity-100" : "group-hover:opacity-100"
                                    )}
                                         style={{
                                             background: isSelected
                                                 ? `radial-gradient(circle at 50% 50%, rgba(59, 130, 246, 0.15), transparent 70%)`
                                                 : `radial-gradient(circle at 50% 100%, rgba(255, 255, 255, 0.05), transparent 70%)`
                                         }}
                                    />
                                </motion.button>
                            );
                        })}
                    </AnimatePresence>
                </div>
            </motion.div>
        </div>
    );
};
