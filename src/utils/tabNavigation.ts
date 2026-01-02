import { FileNode } from '../store/scanStore';
import { useTabStore } from '../store/tabStore';

export function buildBreadcrumbs(root: FileNode | null, targetPath: string): FileNode[] {
  if (!root || !targetPath) return [];
  if (root.path === targetPath) return [];

  const stack: Array<{ node: FileNode; trail: FileNode[] }> = [{ node: root, trail: [] }];
  while (stack.length > 0) {
    const current = stack.pop();
    if (!current) continue;

    if (current.node.path === targetPath) {
      return current.trail;
    }

    if (current.node.children && current.node.children.length > 0) {
      for (let i = current.node.children.length - 1; i >= 0; i--) {
        const child = current.node.children[i];
        stack.push({ node: child, trail: [...current.trail, child] });
      }
    }
  }

  return [];
}

export function updateCurrentTabData(partialData: Record<string, any>) {
  const latestState = useTabStore.getState();
  const latestTab = latestState.tabs.find((tab) => tab.id === latestState.activeTabId) || null;
  latestState.updateCurrentTab({
    data: {
      ...latestTab?.data,
      ...partialData,
    },
  });
}
