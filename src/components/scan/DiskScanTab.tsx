import React from 'react';
import {DiskSelector} from './DiskSelector';
import {ScanView} from './ScanView';
import {useTabStore} from '../../store/tabStore';

export const DiskScanTab: React.FC = () => {
    const {getActiveTab, updateCurrentTab} = useTabStore();
    const activeTab = getActiveTab();

    // 使用 scanStage 来判断当前阶段
    const stage = activeTab?.data?.scanStage || 'select';
    const selectedDrive = activeTab?.data?.drive || '';

    const handleDriveSelect = (drive: string) => {
        updateCurrentTab({
            data: {
                ...activeTab?.data,
                drive,
                scanStage: 'scanning',
            },
        });
    };

    if (stage === 'select') {
        return <DiskSelector onSelect={handleDriveSelect}/>;
    }

    return <ScanView drive={selectedDrive}/>;
};
