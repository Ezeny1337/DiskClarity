import React from 'react';
import {alpha, Menu, MenuItem} from '@mui/material';
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

    const menuItemSx = {
        color: alpha('#ffffff', 0.8),
        fontSize: 13,
        gap: 1.5,
        '&:hover': {bgcolor: alpha('#ffffff', 0.08)},
    };

    return (
        <Menu
            open={anchor !== null}
            onClose={onClose}
            anchorReference="anchorPosition"
            anchorPosition={anchor ? {top: anchor.mouseY, left: anchor.mouseX} : undefined}
            slotProps={{
                paper: {
                    sx: {
                        bgcolor: alpha('#1c1c1e', 0.98),
                        border: `1px solid ${alpha('#ffffff', 0.1)}`,
                        borderRadius: 2,
                        minWidth: 180,
                    },
                },
            }}
        >
            <MenuItem
                disabled={isVirtual}
                onClick={() => {
                    onOpenExplorer();
                    onClose();
                }}
                sx={menuItemSx}
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
                sx={menuItemSx}
            >
                <TrendingUp size={16} style={{color: '#a78bfa'}}/>
                {t('snapshot.viewTrend')}
            </MenuItem>
        </Menu>
    );
};
