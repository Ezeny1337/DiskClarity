import type {FileNode, TabData} from '../types';
import {useTabStore} from '../store/tabStore';

/**
 * 构建从根节点到目标路径的面包屑导航
 */
export function buildBreadcrumbs(root: FileNode | null, targetPath: string): FileNode[] {
    if (!root || !targetPath) return [];
    if (root.path === targetPath) return [];

    const rootPath = root.path || root.name;
    const stack: Array<{ node: FileNode; trail: FileNode[]; currentPath: string }> = [
        {node: root, trail: [], currentPath: rootPath}
    ];

    while (stack.length > 0) {
        const current = stack.pop();
        if (!current) continue;

        if (current.currentPath === targetPath) {
            return current.trail;
        }

        if (current.node.children && current.node.children.length > 0) {
            for (let i = current.node.children.length - 1; i >= 0; i--) {
                const child = current.node.children[i];
                const childPath = child.path || `${current.currentPath}\\${child.name}`;
                const childWithResolvedPath = {...child, path: childPath};
                stack.push({
                    node: child,
                    trail: [...current.trail, childWithResolvedPath],
                    currentPath: childPath
                });
            }
        }
    }

    return [];
}

export function updateCurrentTabData(partialData: Partial<TabData['data']>) {
    const state = useTabStore.getState();
    const tab = state.tabs.find((t) => t.id === state.activeTabId);
    state.updateCurrentTab({data: {...tab?.data, ...partialData}});
}

export function updateTabData(tabId: string, partialData: Partial<TabData['data']>) {
    const state = useTabStore.getState();
    const tab = state.tabs.find((t) => t.id === tabId);
    if (!tab) return;
    state.updateTab(tabId, {data: {...tab.data, ...partialData}});
}
