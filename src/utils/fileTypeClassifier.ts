/**
 * 文件类型分类工具
 * 将文件按常用类型分类（视频、图片、音频、应用程序、文档、源代码等）
 */

export type FileType = 'video' | 'image' | 'audio' | 'application' | 'document' | 'source' | 'config' | 'archive' | 'other';

// 文件扩展名映射到类型
const extensionMap: Record<string, FileType> = {
  // 视频
  'mp4': 'video',
  'avi': 'video',
  'mov': 'video',
  'mkv': 'video',
  'flv': 'video',
  'wmv': 'video',
  'webm': 'video',
  'mts': 'video',
  'm2ts': 'video',
  '3gp': 'video',
  'mpg': 'video',
  'mpeg': 'video',
  'm4v': 'video',

  // 图片
  'jpg': 'image',
  'jpeg': 'image',
  'png': 'image',
  'gif': 'image',
  'bmp': 'image',
  'svg': 'image',
  'webp': 'image',
  'tiff': 'image',
  'ico': 'image',
  'heic': 'image',
  'heif': 'image',
  'psd': 'image',
  'raw': 'image',

  // 音频
  'mp3': 'audio',
  'wav': 'audio',
  'flac': 'audio',
  'aac': 'audio',
  'ogg': 'audio',
  'wma': 'audio',
  'm4a': 'audio',
  'aiff': 'audio',
  'ape': 'audio',

  // 应用程序
  'exe': 'application',
  'msi': 'application',
  'app': 'application',
  'dmg': 'application',
  'apk': 'application',
  'deb': 'application',
  'rpm': 'application',

  // 文档
  'pdf': 'document',
  'doc': 'document',
  'docx': 'document',
  'xls': 'document',
  'xlsx': 'document',
  'ppt': 'document',
  'pptx': 'document',
  'txt': 'document',
  'rtf': 'document',
  'odt': 'document',
  'ods': 'document',
  'odp': 'document',

  // 源代码
  'js': 'source',
  'ts': 'source',
  'tsx': 'source',
  'jsx': 'source',
  'py': 'source',
  'java': 'source',
  'cpp': 'source',
  'c': 'source',
  'h': 'source',
  'cs': 'source',
  'rb': 'source',
  'go': 'source',
  'rs': 'source',
  'php': 'source',
  'swift': 'source',
  'kt': 'source',
  'scala': 'source',
  'sh': 'source',
  'bash': 'source',
  'json': 'source',
  'html': 'source',
  'css': 'source',
  'scss': 'source',
  'less': 'source',
  'sql': 'source',

  // 配置文件
  'xml': 'config',
  'yml': 'config',
  'yaml': 'config',
  'toml': 'config',
  'ini': 'config',
  'conf': 'config',
  'config': 'config',

  // 压缩包
  'zip': 'archive',
  'rar': 'archive',
  '7z': 'archive',
  'tar': 'archive',
  'gz': 'archive',
  'bz2': 'archive',
  'xz': 'archive',
  'iso': 'archive',
};

/**
 * 根据文件扩展名获取文件类型
 */
export function getFileType(filename: string): FileType {
  const ext = filename.split('.').pop()?.toLowerCase();
  if (!ext) return 'other';
  return extensionMap[ext] || 'other';
}