import type {ProgressStage} from '../types';

/**
 * 获取扫描阶段的显示文本
 */
export function getStageText(stage: ProgressStage, t: (key: string) => string): string {
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
 * 精确格式化时间间隔
 */
export function formatDurationPrecise(ms: number): string {
    if (ms < 60000) {
        return `${(ms / 1000).toFixed(3)} s`;
    }
    const seconds = Math.floor(ms / 1000);
    const minutes = Math.floor(seconds / 60);
    const remainingSeconds = (ms / 1000 - minutes * 60).toFixed(3);
    return `${minutes}m ${remainingSeconds}s`;
}

