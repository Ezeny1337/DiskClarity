/**
 * 文件类型分类工具
 */

export type FileType =
    'video'
    | 'image'
    | 'audio'
    | 'executable'
    | 'document'
    | 'code'
    | 'config'
    | 'archive'
    | 'other';

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

    // 可执行文件 / 安装包
    'exe': 'executable',
    'msi': 'executable',
    'app': 'executable',
    'dmg': 'executable',
    'apk': 'executable',
    'deb': 'executable',
    'rpm': 'executable',

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

    // 代码
    'js': 'code',
    'ts': 'code',
    'tsx': 'code',
    'jsx': 'code',
    'py': 'code',
    'java': 'code',
    'cpp': 'code',
    'c': 'code',
    'h': 'code',
    'cs': 'code',
    'rb': 'code',
    'go': 'code',
    'rs': 'code',
    'php': 'code',
    'swift': 'code',
    'kt': 'code',
    'scala': 'code',
    'sh': 'code',
    'bash': 'code',
    'json': 'code',
    'html': 'code',
    'css': 'code',
    'scss': 'code',
    'less': 'code',
    'sql': 'code',

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