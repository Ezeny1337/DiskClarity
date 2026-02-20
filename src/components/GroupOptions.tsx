import React, {useState} from 'react';
import {
    alpha,
    Box,
    Button,
    Chip,
    FormControl,
    FormControlLabel,
    MenuItem,
    Paper,
    Select,
    SelectChangeEvent,
    Stack,
    Switch,
    TextField,
    Typography,
} from '@mui/material';
import {Layers, Plus, Search, X} from 'lucide-react';
import {useTranslation} from 'react-i18next';
import type {GroupBy} from '../types';
import {useTabStore} from '../store/tabStore';
import {DEFAULT_GROUP_CONFIG} from '../constants';

export const GroupOptions: React.FC = () => {
    const {t} = useTranslation();
    const {updateCurrentTab} = useTabStore();
    const activeTab = useTabStore((state) =>
        state.tabs.find((t) => t.id === state.activeTabId) ?? null
    );

    const groupBy = activeTab?.data?.groupBy || DEFAULT_GROUP_CONFIG.groupBy;
    const flatGrouping = activeTab?.data?.flatGrouping || DEFAULT_GROUP_CONFIG.flatGrouping;
    const searchQuery = activeTab?.data?.diskSearchQuery || '';
    const searchMode = activeTab?.data?.diskSearchMode || 'contains';
    const searchCaseSensitive = activeTab?.data?.diskSearchCaseSensitive || false;
    const searchNodeType = activeTab?.data?.diskSearchNodeType || 'all';
    const searchMinSizeMb = activeTab?.data?.diskSearchMinSizeMb || '';
    const searchMaxSizeMb = activeTab?.data?.diskSearchMaxSizeMb || '';
    const searchMinSizeUnit = activeTab?.data?.diskSearchMinSizeUnit || 'MB';
    const searchMaxSizeUnit = activeTab?.data?.diskSearchMaxSizeUnit || 'MB';
    const searchExtensions = activeTab?.data?.diskSearchExtensions || [];
    const searchExtensionMode = activeTab?.data?.diskSearchExtensionMode || 'include';

    const [localSearchQuery, setLocalSearchQuery] = useState(searchQuery);
    const [localSearchMode, setLocalSearchMode] = useState(searchMode);
    const [localSearchCaseSensitive, setLocalSearchCaseSensitive] = useState(searchCaseSensitive);
    const [localSearchNodeType, setLocalSearchNodeType] = useState(searchNodeType);
    const [localSearchMinSizeMb, setLocalSearchMinSizeMb] = useState(searchMinSizeMb);
    const [localSearchMaxSizeMb, setLocalSearchMaxSizeMb] = useState(searchMaxSizeMb);
    const [localSearchMinSizeUnit, setLocalSearchMinSizeUnit] = useState(searchMinSizeUnit);
    const [localSearchMaxSizeUnit, setLocalSearchMaxSizeUnit] = useState(searchMaxSizeUnit);
    const [localSearchExtensions, setLocalSearchExtensions] = useState(searchExtensions);
    const [localSearchExtensionMode, setLocalSearchExtensionMode] = useState(searchExtensionMode);
    const [newExtension, setNewExtension] = useState('');

    const handleGroupChange = (event: SelectChangeEvent<GroupBy>) => {
        updateCurrentTab({
            data: {
                ...activeTab?.data,
                groupBy: event.target.value as GroupBy,
            },
        });
    };

    const handleSearch = () => {
        updateCurrentTab({
            data: {
                ...activeTab?.data,
                diskSearchQuery: localSearchQuery,
                diskSearchMode: localSearchMode,
                diskSearchCaseSensitive: localSearchCaseSensitive,
                diskSearchNodeType: localSearchNodeType,
                diskSearchMinSizeMb: localSearchMinSizeMb,
                diskSearchMaxSizeMb: localSearchMaxSizeMb,
                diskSearchMinSizeUnit: localSearchMinSizeUnit,
                diskSearchMaxSizeUnit: localSearchMaxSizeUnit,
                diskSearchExtensions: localSearchExtensions,
                diskSearchExtensionMode: localSearchExtensionMode,
            },
        });
    };

    const handleAddExtension = () => {
        if (newExtension.trim() && !localSearchExtensions.includes(newExtension.trim())) {
            setLocalSearchExtensions([...localSearchExtensions, newExtension.trim()]);
            setNewExtension('');
        }
    };

    const handleRemoveExtension = (ext: string) => {
        setLocalSearchExtensions(localSearchExtensions.filter(e => e !== ext));
    };

    const handleFlatGroupingChange = (event: React.ChangeEvent<HTMLInputElement>) => {
        updateCurrentTab({
            data: {
                ...activeTab?.data,
                flatGrouping: event.target.checked,
            },
        });
    };

    return (
        <Paper
            elevation={0}
            className="bg-zinc-900/50 backdrop-blur-md border border-white/5 rounded-xl text-white"
            sx={{p: 2, bgcolor: 'transparent'}}
        >
            <Box sx={{display: 'flex', alignItems: 'center', gap: 1, mb: 2}}>
                <Layers size={20} color="white"/>
                <Typography variant="h6" sx={{color: 'white'}}>{t('groupOptions.title')}</Typography>
            </Box>

            <Stack spacing={2}>
                <FormControl fullWidth size="small">
                    <Typography variant="caption" sx={{mb: 0.5, color: alpha('#ffffff', 0.7)}}>
                        {t('groupOptions.groupBy')}
                    </Typography>
                    <Select
                        value={groupBy}
                        onChange={handleGroupChange}
                        sx={{
                            color: 'white',
                            bgcolor: alpha('#000', 0.2),
                            borderRadius: 1,
                            '.MuiOutlinedInput-notchedOutline': {
                                border: '1px solid',
                                borderColor: alpha('#ffffff', 0.1),
                                transition: 'border-color 0.2s',
                            },
                            '&:hover .MuiOutlinedInput-notchedOutline': {
                                borderColor: alpha('#ffffff', 0.3),
                            },
                            '&.Mui-focused .MuiOutlinedInput-notchedOutline': {
                                borderWidth: '1px',
                                borderColor: 'primary.main',
                                boxShadow: `0 0 0 3px ${alpha('#3b82f6', 0.2)}`, // blue-500 equivalent
                            },
                            '.MuiSvgIcon-root': {
                                color: 'white',
                            },
                        }}
                        MenuProps={{
                            transitionDuration: 120,
                            slotProps: {
                                paper: {
                                    sx: {
                                        background: alpha('#1a1a2e', 0.95),
                                        backdropFilter: 'blur(20px)',
                                        border: `1px solid ${alpha('#ffffff', 0.2)}`,
                                        '& .MuiMenuItem-root': {
                                            color: 'white',
                                            transition: 'background-color 80ms ease',
                                            '&:hover': {
                                                background: alpha('#ffffff', 0.1),
                                            },
                                            '&.Mui-selected': {
                                                background: alpha('#ffffff', 0.2),
                                                '&:hover': {
                                                    background: alpha('#ffffff', 0.25),
                                                },
                                            },
                                        },
                                    },
                                },
                            },
                        }}
                    >
                        <MenuItem disableRipple value="none">{t('groupOptions.none')}</MenuItem>
                        <MenuItem disableRipple value="type">{t('groupOptions.byType')}</MenuItem>
                        <MenuItem disableRipple value="extension">{t('groupOptions.byExtension')}</MenuItem>
                    </Select>
                </FormControl>

                {groupBy !== 'none' && (
                    <FormControlLabel
                        control={
                            <Switch
                                sx={{
                                    '& .MuiSwitch-switchBase.Mui-checked': {
                                        color: 'white',
                                    },
                                    '& .MuiSwitch-switchBase.Mui-checked + .MuiSwitch-track': {
                                        backgroundColor: alpha('#ffffff', 0.5),
                                    },
                                }}

                                checked={flatGrouping}
                                onChange={handleFlatGroupingChange}
                                size="small"
                            />
                        }
                        label={
                            <Typography variant="caption" sx={{color: alpha('#ffffff', 0.7)}}>
                                {t('groupOptions.flatGrouping')}
                            </Typography>
                        }
                    />
                )}

                <Box sx={{pt: 1.5, borderTop: `1px solid ${alpha('#ffffff', 0.08)}`}}>
                    <Typography variant="caption"
                                sx={{color: alpha('#ffffff', 0.7), mb: 0.8, display: 'block', fontWeight: 600}}>
                        {t('snapshot.search')}
                    </Typography>

                    <Stack spacing={1.2}>
                        <Box sx={{display: 'flex', gap: 1}}>
                            <TextField
                                value={localSearchQuery}
                                onChange={(e) => setLocalSearchQuery(e.target.value)}
                                size="small"
                                placeholder={t('snapshot.searchPlaceholder')}
                                sx={{
                                    flex: 1,
                                    '& .MuiOutlinedInput-root': {
                                        color: alpha('#ffffff', 0.82),
                                        fontSize: 12,
                                        '& fieldset': {borderColor: alpha('#ffffff', 0.12)},
                                        '&:hover fieldset': {borderColor: alpha('#ffffff', 0.2)},
                                        '&.Mui-focused fieldset': {borderColor: alpha('#3b82f6', 0.6)},
                                    },
                                }}
                                onKeyDown={(e) => e.key === 'Enter' && handleSearch()}
                            />
                            <Button
                                variant="outlined"
                                size="small"
                                onClick={handleSearch}
                                sx={{
                                    minWidth: 'auto',
                                    px: 1.5,
                                    color: alpha('#ffffff', 0.8),
                                    borderColor: alpha('#ffffff', 0.15),
                                    '&:hover': {
                                        borderColor: alpha('#3b82f6', 0.6),
                                        bgcolor: alpha('#3b82f6', 0.1)
                                    }
                                }}
                            >
                                <Search size={14}/>
                            </Button>
                        </Box>

                        <Box sx={{display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 1}}>
                            <FormControl size="small" fullWidth>
                                <Select
                                    value={localSearchMode}
                                    onChange={(e) => setLocalSearchMode(e.target.value as 'contains' | 'regex' | 'exclude')}
                                    sx={{
                                        color: alpha('#ffffff', 0.8),
                                        fontSize: 12,
                                        '& fieldset': {borderColor: alpha('#ffffff', 0.12)}
                                    }}
                                >
                                    <MenuItem value="contains">{t('snapshot.searchModeContains')}</MenuItem>
                                    <MenuItem value="regex">{t('snapshot.searchModeRegex')}</MenuItem>
                                    <MenuItem value="exclude">{t('snapshot.searchModeExclude')}</MenuItem>
                                </Select>
                            </FormControl>

                            <FormControl size="small" fullWidth>
                                <Select
                                    value={localSearchNodeType}
                                    onChange={(e) => setLocalSearchNodeType(e.target.value as 'all' | 'file' | 'dir')}
                                    sx={{
                                        color: alpha('#ffffff', 0.8),
                                        fontSize: 12,
                                        '& fieldset': {borderColor: alpha('#ffffff', 0.12)}
                                    }}
                                >
                                    <MenuItem value="all">{t('snapshot.searchNodeTypeAll')}</MenuItem>
                                    <MenuItem value="file">{t('snapshot.searchNodeTypeFile')}</MenuItem>
                                    <MenuItem value="dir">{t('snapshot.searchNodeTypeDir')}</MenuItem>
                                </Select>
                            </FormControl>
                        </Box>

                        <Box sx={{display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 1}}>
                            <Box sx={{display: 'flex', gap: 0.5}}>
                                <TextField
                                    size="small"
                                    value={localSearchMinSizeMb}
                                    onChange={(e) => setLocalSearchMinSizeMb(e.target.value)}
                                    placeholder={t('snapshot.searchMin')}
                                    sx={{
                                        flex: 1,
                                        '& .MuiOutlinedInput-root': {
                                            color: alpha('#ffffff', 0.8),
                                            fontSize: 12,
                                            '& fieldset': {borderColor: alpha('#ffffff', 0.12)}
                                        }
                                    }}
                                />
                                <FormControl size="small" sx={{minWidth: 60}}>
                                    <Select
                                        value={localSearchMinSizeUnit}
                                        onChange={(e) => setLocalSearchMinSizeUnit(e.target.value as 'B' | 'KB' | 'MB' | 'GB')}
                                        sx={{
                                            color: alpha('#ffffff', 0.8),
                                            fontSize: 11,
                                            '& fieldset': {borderColor: alpha('#ffffff', 0.12)}
                                        }}
                                    >
                                        <MenuItem value="B">B</MenuItem>
                                        <MenuItem value="KB">KB</MenuItem>
                                        <MenuItem value="MB">MB</MenuItem>
                                        <MenuItem value="GB">GB</MenuItem>
                                    </Select>
                                </FormControl>
                            </Box>
                            <Box sx={{display: 'flex', gap: 0.5}}>
                                <TextField
                                    size="small"
                                    value={localSearchMaxSizeMb}
                                    onChange={(e) => setLocalSearchMaxSizeMb(e.target.value)}
                                    placeholder={t('snapshot.searchMax')}
                                    sx={{
                                        flex: 1,
                                        '& .MuiOutlinedInput-root': {
                                            color: alpha('#ffffff', 0.8),
                                            fontSize: 12,
                                            '& fieldset': {borderColor: alpha('#ffffff', 0.12)}
                                        }
                                    }}
                                />
                                <FormControl size="small" sx={{minWidth: 60}}>
                                    <Select
                                        value={localSearchMaxSizeUnit}
                                        onChange={(e) => setLocalSearchMaxSizeUnit(e.target.value as 'B' | 'KB' | 'MB' | 'GB')}
                                        sx={{
                                            color: alpha('#ffffff', 0.8),
                                            fontSize: 11,
                                            '& fieldset': {borderColor: alpha('#ffffff', 0.12)}
                                        }}
                                    >
                                        <MenuItem value="B">B</MenuItem>
                                        <MenuItem value="KB">KB</MenuItem>
                                        <MenuItem value="MB">MB</MenuItem>
                                        <MenuItem value="GB">GB</MenuItem>
                                    </Select>
                                </FormControl>
                            </Box>
                        </Box>

                        <Box>
                            <Typography variant="caption" sx={{
                                color: alpha('#ffffff', 0.6),
                                mb: 1,
                                display: 'block'
                            }}>{t('snapshot.extensionFilter')}</Typography>
                            <Box sx={{display: 'flex', gap: 0.5, mb: 1}}>
                                <TextField
                                    size="small"
                                    value={newExtension}
                                    onChange={(e) => setNewExtension(e.target.value)}
                                    placeholder={t('snapshot.extensionPlaceholder')}
                                    sx={{
                                        flex: 1,
                                        '& .MuiOutlinedInput-root': {
                                            color: alpha('#ffffff', 0.8),
                                            fontSize: 12,
                                            '& fieldset': {borderColor: alpha('#ffffff', 0.12)}
                                        }
                                    }}
                                    onKeyDown={(e) => e.key === 'Enter' && handleAddExtension()}
                                />
                                <Button
                                    size="small"
                                    onClick={handleAddExtension}
                                    sx={{minWidth: 'auto', px: 1, color: alpha('#ffffff', 0.7)}}
                                >
                                    <Plus size={14}/>
                                </Button>
                            </Box>
                            <Box sx={{display: 'flex', flexWrap: 'wrap', gap: 0.5, mb: 1}}>
                                {localSearchExtensions.map((ext) => (
                                    <Chip
                                        key={ext}
                                        label={ext}
                                        size="small"
                                        onDelete={() => handleRemoveExtension(ext)}
                                        deleteIcon={<X size={12}/>}
                                        sx={{
                                            bgcolor: alpha('#3b82f6', 0.2),
                                            color: alpha('#ffffff', 0.8),
                                            '& .MuiChip-deleteIcon': {color: alpha('#ffffff', 0.6)}
                                        }}
                                    />
                                ))}
                            </Box>
                            <FormControl size="small" fullWidth>
                                <Select
                                    value={localSearchExtensionMode}
                                    onChange={(e) => setLocalSearchExtensionMode(e.target.value as 'include' | 'exclude')}
                                    sx={{
                                        color: alpha('#ffffff', 0.8),
                                        fontSize: 12,
                                        '& fieldset': {borderColor: alpha('#ffffff', 0.12)}
                                    }}
                                >
                                    <MenuItem value="include">{t('snapshot.includeExtensions')}</MenuItem>
                                    <MenuItem value="exclude">{t('snapshot.excludeExtensions')}</MenuItem>
                                </Select>
                            </FormControl>
                        </Box>

                        <FormControlLabel
                            control={
                                <Switch
                                    checked={localSearchCaseSensitive}
                                    onChange={(e) => setLocalSearchCaseSensitive(e.target.checked)}
                                    size="small"
                                    sx={{
                                        '& .MuiSwitch-switchBase.Mui-checked': {color: '#93c5fd'},
                                        '& .MuiSwitch-switchBase.Mui-checked + .MuiSwitch-track': {backgroundColor: alpha('#60a5fa', 0.45)},
                                    }}
                                />
                            }
                            label={<Typography variant="caption"
                                               sx={{color: alpha('#ffffff', 0.6)}}>{t('snapshot.searchCaseSensitive')}</Typography>}
                        />
                    </Stack>
                </Box>
            </Stack>
        </Paper>
    );
};
