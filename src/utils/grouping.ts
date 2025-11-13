import {FileNode, GroupBy} from '../store/scanStore';
import {getFileType} from './fileTypeClassifier';

/**
 * 获取文件的分组键
 */
export function getGroupKey(node: FileNode, groupBy: GroupBy): string {
  if (groupBy === 'none') {
    return '';
  }

  if (node.is_dir) {
    return '__folder__';
  }

  if (groupBy === 'type') {
    const type = getFileType(node.name);
    const typeLabels: Record<string, string> = {
      'video': 'video',
      'image': 'image',
      'audio': 'audio',
      'application': 'application',
      'document': 'document',
      'source': 'source',
      'config': 'config',
      'archive': 'archive',
      'other': 'other',
    };
    return typeLabels[type] || 'other';
  }

  if (groupBy === 'extension') {
    const ext = node.name.split('.').pop()?.toUpperCase() || 'NO_EXT';
    return ext === '' ? 'NO_EXT' : ext;
  }

  return '';
}

/**
 * 使用迭代方式收集所有文件
 */
function collectAllFiles(nodes: FileNode[]): FileNode[] {
  const files: FileNode[] = [];
  const stack: FileNode[] = [...nodes];
  
  try {
    while (stack.length > 0) {
      const node = stack.pop();
      
      if (!node) continue;
      
      if (node.is_dir && node.children && node.children.length > 0) {
        stack.push(...node.children);
      } else if (!node.is_dir) {
        files.push(node);
      }
    }
  } catch (error) {
  }
  
  return files;
}

/**
 * 获取分组的显示名称
 */
function getGroupDisplayName(key: string, groupBy: GroupBy): string {
  if (key === '__folder__') {
    return '📁 文件夹';
  }

  if (groupBy === 'type') {
    const typeLabels: Record<string, string> = {
      'video': '🎬 视频',
      'image': '🖼️ 图片',
      'audio': '🎵 音频',
      'application': '⚙️ 应用程序',
      'document': '📄 文档',
      'source': '💻 源代码',
      'config': '⚙️ 配置文件',
      'archive': '📦 压缩包',
      'other': '📋 其他',
    };
    return typeLabels[key] || '📋 其他';
  }

  if (groupBy === 'extension') {
    return key === 'NO_EXT' ? '无扩展名' : `.${key}`;
  }

  return key;
}

/**
 * 将文件节点按分组方式分组
 */
export function groupFileNodes(
  nodes: FileNode[],
  groupBy: GroupBy,
  parentPath?: string,
  flatGrouping: boolean = false
): FileNode[] {
  if (groupBy === 'none' || !nodes || nodes.length === 0) {
    return nodes;
  }

  // 如果已经在一个分组内，不再进行分组
  if (parentPath && parentPath.startsWith('__group__:')) {
    return nodes;
  }

  let files = nodes.filter(n => !n.is_dir);
  const directories = nodes.filter(n => n.is_dir);

  if (flatGrouping) {
    files = collectAllFiles(nodes);
  }

  if (files.length === 0) {
    return directories;
  }

  const groups = new Map<string, FileNode[]>();

  for (const file of files) {
    const key = getGroupKey(file, groupBy);
    if (!groups.has(key)) {
      groups.set(key, []);
    }
    groups.get(key)!.push(file);
  }

  const groupedNodes: FileNode[] = [];

  for (const [groupKey, groupedChildren] of groups.entries()) {
    let totalSize = 0;
    for (const child of groupedChildren) {
      totalSize += child.size;
    }
    
    const totalFileCount = groupedChildren.length;
    const totalDirCount = 0;

    const displayName = getGroupDisplayName(groupKey, groupBy);
    
    try {
      let maxModifiedTime = 0;
      for (const child of groupedChildren) {
        const modTime = child.modified_time || 0;
        if (modTime > maxModifiedTime) {
          maxModifiedTime = modTime;
        }
      }

      const groupNode: FileNode = {
        name: displayName,
        path: `__group__:${groupKey}`,
        size: totalSize,
        is_dir: true,
        children: groupedChildren,
        file_count: totalFileCount,
        dir_count: totalDirCount,
        modified_time: maxModifiedTime,
      };

      groupedNodes.push(groupNode);
    } catch (error) {
    }
  }

  // 扁平分组模式只返回分组节点
  // 普通分组模式将分组节点和目录合并返回
  return flatGrouping ? groupedNodes : [...groupedNodes, ...directories];
}

/**
 * 按排序字段和排序顺序排序分组节点
 */
export function sortGroupedNodes(
  nodes: FileNode[],
  sortField: 'name' | 'size' | 'modified' | 'fileCount',
  sortOrder: 'asc' | 'desc'
): FileNode[] {
  return [...nodes].sort((a, b) => {
    if (sortField === 'name') {
      if (a.is_dir !== b.is_dir) {
        return a.is_dir ? -1 : 1;
      }
    }

    let comparison = 0;

    switch (sortField) {
      case 'name':
        comparison = a.name.localeCompare(b.name);
        break;
      case 'size':
        comparison = a.size - b.size;
        break;
      case 'modified':
        comparison = (a.modified_time || 0) - (b.modified_time || 0);
        break;
      case 'fileCount':
        comparison = a.file_count - b.file_count;
        break;
    }

    return sortOrder === 'asc' ? comparison : -comparison;
  });
}
