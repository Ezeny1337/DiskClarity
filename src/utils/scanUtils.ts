/**
 * 获取扫描阶段的显示文本
 */
export function getStageText(stage: string, t: (key: string) => string): string {
    switch (stage) {
        case 'scanning':
            return t('scanControl.scanning');
        case 'fetching_sizes':
            return t('scanControl.fetchingSizes');
        case 'building_tree':
            return t('scanControl.buildingTree');
        case 'serializing':
            return t('scanControl.serializing');
        case 'complete':
            return t('scanControl.complete');
        default:
            return t('scanControl.processing');
    }
}

/**
 * 格式化时间间隔为可读的字符串
 */
export function formatDuration(ms: number, t: (key: string, options?: any) => string): string {
    if (ms < 1000) return t('common.time.millisecond', { count: ms });

    const seconds = Math.floor(ms / 1000);
    if (seconds < 60) return t('common.time.second', { count: seconds });

    const minutes = Math.floor(seconds / 60);
    const remainingSeconds = seconds % 60;

    if (minutes < 60) {
        return remainingSeconds > 0
            ? t('common.time.minuteWithSeconds', { minutes, seconds: remainingSeconds })
            : t('common.time.minute', { minutes });
    }

    const hours = Math.floor(minutes / 60);
    const remainingMinutes = minutes % 60;

    return remainingMinutes > 0
        ? t('common.time.hourWithMinutes', { hours, minutes: remainingMinutes })
        : t('common.time.hour', { hours });
}
