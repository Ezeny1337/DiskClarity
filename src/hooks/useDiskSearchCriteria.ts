import React from 'react';
import {useTabStore} from '../store/tabStore';
import type {DiskSearchCriteria} from '../utils/diskSearch';

/** 从当前 activeTab 中读取并构建 DiskSearchCriteria */
export function useDiskSearchCriteria(): DiskSearchCriteria {
    const activeTabId = useTabStore((state) => state.activeTabId);
    const tabs = useTabStore((state) => state.tabs);
    const tabData = React.useMemo(
        () => tabs.find((tab) => tab.id === activeTabId)?.data,
        [tabs, activeTabId]
    );

    return React.useMemo<DiskSearchCriteria>(() => ({
        query: tabData?.diskSearchQuery || '',
        mode: tabData?.diskSearchMode || 'contains',
        caseSensitive: tabData?.diskSearchCaseSensitive || false,
        nodeType: tabData?.diskSearchNodeType || 'all',
        minSizeMb: tabData?.diskSearchMinSizeMb || '',
        maxSizeMb: tabData?.diskSearchMaxSizeMb || '',
        minSizeUnit: tabData?.diskSearchMinSizeUnit || 'MB',
        maxSizeUnit: tabData?.diskSearchMaxSizeUnit || 'MB',
        extensions: tabData?.diskSearchExtensions || [],
        extensionMode: tabData?.diskSearchExtensionMode || 'include',
    }), [
        tabData?.diskSearchQuery,
        tabData?.diskSearchMode,
        tabData?.diskSearchCaseSensitive,
        tabData?.diskSearchNodeType,
        tabData?.diskSearchMinSizeMb,
        tabData?.diskSearchMaxSizeMb,
        tabData?.diskSearchMinSizeUnit,
        tabData?.diskSearchMaxSizeUnit,
        tabData?.diskSearchExtensions,
        tabData?.diskSearchExtensionMode,
    ]);
}
