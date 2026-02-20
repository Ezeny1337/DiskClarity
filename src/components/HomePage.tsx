import React from 'react';
import {useTranslation} from 'react-i18next';
import {useTabStore} from '../store/tabStore';
import {motion} from 'framer-motion';
import {HardDrive, History} from 'lucide-react';
import {cn} from '../lib/utils';

export const HomePage: React.FC = () => {
    const {t} = useTranslation();
    const {activeTabId, updateCurrentTab, addTab} = useTabStore();

    const handleDiskScan = () => {
        if (!activeTabId) {
            addTab({
                id: `disk-scan-${Date.now()}`,
                type: 'disk-scan',
                title: t('home.diskScan'),
                data: {scanStage: 'select'}
            });
            return;
        }
        updateCurrentTab({
            type: 'disk-scan',
            title: t('home.diskScan'),
            data: {
                scanStage: 'select', // 确保从选择界面开始
                drive: undefined
            }
        });
    };

    const handleSnapshotAnalysis = () => {
        if (!activeTabId) {
            addTab({
                id: `snapshot-${Date.now()}`,
                type: 'snapshot-analysis',
                title: t('home.snapshotAnalysis'),
            });
            return;
        }
        updateCurrentTab({
            type: 'snapshot-analysis',
            title: t('home.snapshotAnalysis'),
        });
    };

    const containerVariants = {
        hidden: {opacity: 0},
        visible: {
            opacity: 1,
            transition: {
                staggerChildren: 0.1,
                delayChildren: 0.2
            }
        }
    };

    const itemVariants = {
        hidden: {y: 20, opacity: 0},
        visible: {y: 0, opacity: 1, transition: {type: "spring", stiffness: 100}}
    };

    return (
        <div className="h-full w-full flex items-center justify-center bg-background relative overflow-hidden">
            {/* Background Gradients */}
            <div
                className="absolute top-[-10%] left-[-10%] w-[40%] h-[40%] bg-primary/20 blur-[100px] rounded-full pointer-events-none"/>
            <div
                className="absolute bottom-[-10%] right-[-10%] w-[40%] h-[40%] bg-purple-500/20 blur-[100px] rounded-full pointer-events-none"/>

            <motion.div
                className="z-10 flex gap-8"
                variants={containerVariants}
                initial="hidden"
                animate="visible"
            >
                <HomeCard
                    title={t('home.diskScan')}
                    icon={<HardDrive size={48}/>}
                    description={t('home.diskScanDesc')}
                    onClick={handleDiskScan}
                    gradient="from-blue-500/20 to-cyan-500/20"
                    variants={itemVariants}
                />

                <HomeCard
                    title={t('home.snapshotAnalysis')}
                    icon={<History size={48}/>}
                    description={t('home.snapshotAnalysisDesc')}
                    onClick={handleSnapshotAnalysis}
                    gradient="from-purple-500/20 to-pink-500/20"
                    variants={itemVariants}
                />
            </motion.div>
        </div>
    );
};

interface HomeCardProps {
    title: string;
    icon: React.ReactNode;
    description: string;
    onClick: () => void;
    gradient: string;
    variants: any;
}

const HomeCard: React.FC<HomeCardProps> = ({title, icon, description, onClick, gradient, variants}) => {
    return (
        <motion.button
            variants={variants}
            onClick={onClick}
            whileHover={{scale: 1.05, y: -5}}
            whileTap={{scale: 0.98}}
            transition={{type: "spring", stiffness: 400, damping: 25}}
            className={cn(
                "group relative w-72 h-72 rounded-3xl p-8 flex flex-col items-center justify-center text-center gap-6",
                "bg-surface/50 backdrop-blur-xl border border-white/5",
                "transition-colors duration-200",
                "hover:border-white/10 hover:shadow-2xl z-20 cursor-pointer"
            )}
        >
            {/* Inner Gradient */}
            <div className={cn(
                "absolute inset-0 rounded-3xl opacity-0 group-hover:opacity-100 transition-opacity duration-300 bg-linear-to-br",
                gradient
            )}/>

            {/* Icon with Glow */}
            <div
                className="relative z-10 p-4 rounded-2xl bg-white/5 border border-white/10 group-hover:bg-white/10 transition-colors">
                <div className="text-white/80 group-hover:text-white transition-colors">
                    {icon}
                </div>
                {/* Icon Glow */}
                <div className={cn(
                    "absolute inset-0 rounded-2xl opacity-0 group-hover:opacity-50 blur-lg transition-opacity duration-300 bg-current",
                )}/>
            </div>

            <div className="relative z-10 space-y-2">
                <h3 className="text-xl font-semibold text-white tracking-tight">{title}</h3>
                <p className="text-sm text-text-muted">{description}</p>
            </div>
        </motion.button>
    );
};
