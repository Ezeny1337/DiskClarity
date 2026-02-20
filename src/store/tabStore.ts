import {create} from 'zustand';
import type {TabData, TabType} from '../types';
import {DEFAULT_HOME_TAB} from '../constants';

export type {TabData, TabType};

interface TabState {
    tabs: TabData[];
    activeTabId: string | null;

    addTab: (tab: TabData) => void;
    removeTab: (tabId: string) => void;
    setActiveTab: (tabId: string) => void;
    updateTab: (tabId: string, updates: Partial<TabData>) => void;
    updateCurrentTab: (updates: Partial<TabData>) => void;
    getActiveTab: () => TabData | null;
    setTabs: (tabs: TabData[]) => void;
}

export const useTabStore = create<TabState>((set, get) => ({
    tabs: [
        {
            ...DEFAULT_HOME_TAB,
            id: 'home-1',
        },
    ],
    activeTabId: 'home-1',

    addTab: (tab) => set((state) => ({
        tabs: [...state.tabs, tab],
        activeTabId: tab.id,
    })),

    removeTab: (tabId) => set((state) => {
        const tabIndex = state.tabs.findIndex(t => t.id === tabId);
        if (tabIndex === -1) return {};

        let newTabs = state.tabs.filter(t => t.id !== tabId);
        let newActiveTabId = state.activeTabId;

        // 如果正在关闭活动标签页，或者活动标签页刚被移除
        if (state.activeTabId === tabId || !newTabs.some(t => t.id === state.activeTabId)) {
            if (newTabs.length > 0) {
                // 切换到邻近标签页，优先选择移动到当前索引的那个
                const newIndex = Math.min(tabIndex, newTabs.length - 1);
                newActiveTabId = newTabs[newIndex].id;
            } else {
                // 如果所有标签页都已关闭，创建一个新的主页标签页
                const newHomeTab: TabData = {
                    ...DEFAULT_HOME_TAB,
                    id: `home-${Date.now()}`,
                };
                newTabs = [newHomeTab];
                newActiveTabId = newHomeTab.id;
            }
        }

        return {
            tabs: newTabs,
            activeTabId: newActiveTabId,
        };
    }),

    setActiveTab: (tabId) => set({activeTabId: tabId}),

    updateTab: (tabId, updates) => set((state) => ({
        tabs: state.tabs.map(tab =>
            tab.id === tabId ? {...tab, ...updates} : tab
        ),
    })),

    updateCurrentTab: (updates) => set((state) => ({
        tabs: state.tabs.map(tab =>
            tab.id === state.activeTabId ? {...tab, ...updates} : tab
        ),
    })),

    getActiveTab: () => {
        const state = get();
        return state.tabs.find(t => t.id === state.activeTabId) || null;
    },

    setTabs: (tabs) => set({tabs}),
}));
