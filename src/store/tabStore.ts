import { create } from 'zustand';
import { FileNode, ScanProgress, SortField, SortOrder, GroupBy } from './scanStore';

export type TabType = 'home' | 'disk-scan' | 'snapshot-analysis';

export interface TabData {
  id: string;
  type: TabType;
  title: string;
  data?: {
    // Disk Scan 相关数据
    drive?: string;
    scanResult?: FileNode;
    scanProgress?: ScanProgress;
    isScanning?: boolean;
    scanStage?: 'select' | 'scanning' | 'complete';
    error?: string | null;
    
    // 文件浏览相关状态
    selectedPath?: string;
    currentNode?: FileNode | null;
    breadcrumbs?: FileNode[];
    sortField?: SortField;
    sortOrder?: SortOrder;
    groupBy?: GroupBy;
    flatGrouping?: boolean;
  };
}

interface TabState {
  tabs: TabData[];
  activeTabId: string | null;
  
  addTab: (tab: TabData) => void;
  removeTab: (tabId: string) => void;
  setActiveTab: (tabId: string) => void;
  updateTab: (tabId: string, updates: Partial<TabData>) => void;
  updateCurrentTab: (updates: Partial<TabData>) => void;
  getActiveTab: () => TabData | null;
}

export const useTabStore = create<TabState>((set, get) => ({
  tabs: [
    {
      id: 'home-1',
      type: 'home',
      title: 'Home',
    },
  ],
  activeTabId: 'home-1',
  
  addTab: (tab) => set((state) => ({
    tabs: [...state.tabs, tab],
    activeTabId: tab.id,
  })),
  
  removeTab: (tabId) => set((state) => {
    const newTabs = state.tabs.filter(t => t.id !== tabId);
    let newActiveTabId = state.activeTabId;
    
    if (state.activeTabId === tabId) {
      newActiveTabId = newTabs.length > 0 ? newTabs[newTabs.length - 1].id : null;
    }
    
    return {
      tabs: newTabs,
      activeTabId: newActiveTabId,
    };
  }),
  
  setActiveTab: (tabId) => set({ activeTabId: tabId }),
  
  updateTab: (tabId, updates) => set((state) => ({
    tabs: state.tabs.map(tab => 
      tab.id === tabId ? { ...tab, ...updates } : tab
    ),
  })),
  
  updateCurrentTab: (updates) => set((state) => ({
    tabs: state.tabs.map(tab => 
      tab.id === state.activeTabId ? { ...tab, ...updates } : tab
    ),
  })),
  
  getActiveTab: () => {
    const state = get();
    return state.tabs.find(t => t.id === state.activeTabId) || null;
  },
}));
