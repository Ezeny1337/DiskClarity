import React from 'react';
import {useTranslation} from 'react-i18next';
import {useTabStore} from '../../store/tabStore';
import type {TabData} from '../../types';
import {DEFAULT_HOME_TAB} from '../../constants';
import {AnimatePresence, motion, Reorder} from 'framer-motion';
import {GitCompare, HardDrive, Home, Image as ImageIcon, Plus, X} from 'lucide-react';
import {cn} from '../../lib/utils';

export const AppTabBar: React.FC = () => {
    const {t} = useTranslation();
    const {tabs, activeTabId, addTab, removeTab, setActiveTab, setTabs} = useTabStore();

    const handleNewTab = () => {
        const newTab: TabData = {
            ...DEFAULT_HOME_TAB,
            id: `home-${Date.now()}`,
            title: t('home.title'),
        };
        addTab(newTab);
    };

    const handleCloseTab = (e: React.MouseEvent, tabId: string) => {
        e.stopPropagation();
        removeTab(tabId);
    };

    const getTabIcon = (type: string) => {
        switch (type) {
            case 'home':
                return <Home size={14}/>;
            case 'disk-scan':
                return <HardDrive size={14}/>;
            case 'snapshot-analysis':
                return <ImageIcon size={14}/>;
            case 'snapshot-diff':
                return <GitCompare size={14}/>;
            default:
                return <Home size={14}/>;
        }
    };

    return (
        <motion.div
            layout
            className="flex items-center h-full flex-1 px-4 pointer-events-none relative"
        >
            <Reorder.Group
                axis="x"
                values={tabs}
                onReorder={setTabs}
                as="div"
                className="flex items-center gap-1 h-full"
            >
                <div className="flex items-center gap-1 h-full relative">
                    <AnimatePresence initial={false} mode="popLayout">
                        {tabs.map((tab) => (
                            <Reorder.Item
                                key={tab.id}
                                value={tab}
                                layout
                                onClick={() => setActiveTab(tab.id)}
                                onMouseDown={(e) => e.stopPropagation()}
                                initial={{opacity: 0, scale: 0.9, width: 0}}
                                animate={{opacity: 1, scale: 1, width: 'auto'}}
                                exit={{opacity: 0, scale: 0.8, width: 0}}
                                transition={{type: "spring", bounce: 0.2, duration: 0.5}}
                                className={cn(
                                    "group relative flex items-center gap-2 px-3 py-1.5 rounded-md text-sm cursor-pointer transition-colors border border-transparent min-w-30 max-w-50 pointer-events-auto shrink-0",
                                    tab.id === activeTabId
                                        ? "bg-surface2 text-white border-white/10 shadow-sm"
                                        : "text-text-muted hover:bg-white/5 hover:text-text"
                                )}
                            >
                                {tab.id === activeTabId && (
                                    <motion.div
                                        layoutId="activeTabGlow"
                                        className="absolute inset-0 bg-primary/10 rounded-md -z-10"
                                        initial={false}
                                        transition={{type: "spring", bounce: 0.2, duration: 0.6}}
                                    />
                                )}

                                <span className="opacity-70 shrink-0">{getTabIcon(tab.type)}</span>
                                <span className="truncate flex-1 font-medium select-none">{tab.title}</span>

                                {(tabs.length > 1 || tab.id === activeTabId) && (
                                    <button
                                        onClick={(e) => handleCloseTab(e, tab.id)}
                                        onMouseDown={(e) => e.stopPropagation()}
                                        className={cn(
                                            "p-0.5 rounded-md opacity-0 group-hover:opacity-100 transition-opacity hover:bg-white/10 hover:text-red-400 shrink-0 relative z-30",
                                            tab.id === activeTabId ? "opacity-100" : ""
                                        )}
                                    >
                                        <X size={12}/>
                                    </button>
                                )}
                            </Reorder.Item>
                        ))}
                    </AnimatePresence>
                </div>
            </Reorder.Group>

            <button
                onClick={handleNewTab}
                onMouseDown={(e) => e.stopPropagation()}
                className="ml-1 p-1.5 rounded-md text-text-muted hover:text-text hover:bg-white/5 transition-colors shrink-0 pointer-events-auto relative z-30"
                title={t('tabs.newTab')}
            >
                <Plus size={16}/>
            </button>
        </motion.div>
    );
};
