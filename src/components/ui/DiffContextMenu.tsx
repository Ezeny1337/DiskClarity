import React from 'react';
import {Menu, MenuItem} from '@mui/material';
import {FolderOpen, TrendingUp} from 'lucide-react';
import {useTranslation} from 'react-i18next';

interface DiffContextMenuProps {
    anchor: { mouseX: number; mouseY: number } | null;
    isVirtual: boolean;
    onClose: () => void;
    onOpenExplorer: () => void;
    onViewTrend: () => void;
}

export const DiffContextMenu: React.FC<DiffContextMenuProps> = ({
                                                                    anchor,
                                                                    isVirtual,
                                                                    onClose,
                                                                    onOpenExplorer,
                                                                    onViewTrend,
                                                                }) => {
    const {t} = useTranslation();

    return (
        <Menu
            open={anchor !== null}
            onClose={onClose}
            anchorReference="anchorPosition"
            anchorPosition={anchor ? {top: anchor.mouseY, left: anchor.mouseX} : undefined}
            slotProps={{paper: {sx: {minWidth: 180}}}}
        >
            <MenuItem
                disabled={isVirtual}
                onClick={() => {
                    onOpenExplorer();
                    onClose();
                }}
                sx={{gap: 1.5}}
            >
                <FolderOpen size={16} style={{color: '#60a5fa'}}/>
                {t('snapshot.openInExplorer')}
            </MenuItem>
            <MenuItem
                disabled={isVirtual}
                onClick={() => {
                    onViewTrend();
                    onClose();
                }}
                sx={{gap: 1.5}}
            >
                <TrendingUp size={16} style={{color: '#a78bfa'}}/>
                {t('snapshot.viewTrend')}
            </MenuItem>
        </Menu>
    );
};
