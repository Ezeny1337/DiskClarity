import React, {useState} from 'react';
import {
    Button,
    Chip,
    FormControl,
    FormControlLabel,
    MenuItem,
    Select,
    SelectChangeEvent,
    Switch,
    TextField,
} from '@mui/material';
import {Layers, Plus, Search, X} from 'lucide-react';
import {useTranslation} from 'react-i18next';
import type {GroupBy} from '../../types';
import {useTabStore} from '../../store/tabStore';
import {DEFAULT_GROUP_CONFIG} from '../../constants';

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
        <div className="bg-zinc-900/50 backdrop-blur-md border border-white/5 rounded-xl text-white p-4">
            <div className="flex items-center gap-2 mb-4">
                <Layers size={20} color="white"/>
                <span className="text-base font-semibold text-white">{t('groupOptions.title')}</span>
            </div>

            <div className="flex flex-col gap-4">
                <FormControl fullWidth size="small">
                    <span className="text-xs text-white/70 mb-1 block">{t('groupOptions.groupBy')}</span>
                    <Select
                        value={groupBy}
                        onChange={handleGroupChange}
                        MenuProps={{transitionDuration: 120}}
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
                                checked={flatGrouping}
                                onChange={handleFlatGroupingChange}
                                size="small"
                            />
                        }
                        label={
                            <span className="text-xs text-white/70">{t('groupOptions.flatGrouping')}</span>
                        }
                    />
                )}

                <div className="pt-3 border-t border-white/8">
                    <span className="text-xs text-white/70 mb-2 block font-semibold">{t('snapshot.search')}</span>

                    <div className="flex flex-col gap-3">
                        <div className="flex gap-2">
                            <TextField
                                value={localSearchQuery}
                                onChange={(e) => setLocalSearchQuery(e.target.value)}
                                size="small"
                                placeholder={t('snapshot.searchPlaceholder')}
                                sx={{flex: 1}}
                                onKeyDown={(e) => e.key === 'Enter' && handleSearch()}
                            />
                            <Button
                                variant="outlined"
                                size="small"
                                onClick={handleSearch}
                                sx={{minWidth: 'auto', px: 1.5}}
                            >
                                <Search size={14}/>
                            </Button>
                        </div>

                        <div className="grid grid-cols-2 gap-2">
                            <FormControl size="small" fullWidth>
                                <Select
                                    value={localSearchMode}
                                    onChange={(e) => setLocalSearchMode(e.target.value as 'contains' | 'regex' | 'exclude')}
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
                                >
                                    <MenuItem value="all">{t('snapshot.searchNodeTypeAll')}</MenuItem>
                                    <MenuItem value="file">{t('snapshot.searchNodeTypeFile')}</MenuItem>
                                    <MenuItem value="dir">{t('snapshot.searchNodeTypeDir')}</MenuItem>
                                </Select>
                            </FormControl>
                        </div>

                        <div className="grid grid-cols-2 gap-2">
                            <div className="flex gap-1">
                                <TextField
                                    size="small"
                                    value={localSearchMinSizeMb}
                                    onChange={(e) => setLocalSearchMinSizeMb(e.target.value)}
                                    placeholder={t('snapshot.searchMin')}
                                    sx={{flex: 1}}
                                />
                                <FormControl size="small" sx={{minWidth: 60}}>
                                    <Select
                                        value={localSearchMinSizeUnit}
                                        onChange={(e) => setLocalSearchMinSizeUnit(e.target.value as 'B' | 'KB' | 'MB' | 'GB')}
                                    >
                                        <MenuItem value="B">B</MenuItem>
                                        <MenuItem value="KB">KB</MenuItem>
                                        <MenuItem value="MB">MB</MenuItem>
                                        <MenuItem value="GB">GB</MenuItem>
                                    </Select>
                                </FormControl>
                            </div>
                            <div className="flex gap-1">
                                <TextField
                                    size="small"
                                    value={localSearchMaxSizeMb}
                                    onChange={(e) => setLocalSearchMaxSizeMb(e.target.value)}
                                    placeholder={t('snapshot.searchMax')}
                                    sx={{flex: 1}}
                                />
                                <FormControl size="small" sx={{minWidth: 60}}>
                                    <Select
                                        value={localSearchMaxSizeUnit}
                                        onChange={(e) => setLocalSearchMaxSizeUnit(e.target.value as 'B' | 'KB' | 'MB' | 'GB')}
                                    >
                                        <MenuItem value="B">B</MenuItem>
                                        <MenuItem value="KB">KB</MenuItem>
                                        <MenuItem value="MB">MB</MenuItem>
                                        <MenuItem value="GB">GB</MenuItem>
                                    </Select>
                                </FormControl>
                            </div>
                        </div>

                        <div>
                            <span className="text-xs text-white/60 mb-2 block">{t('snapshot.extensionFilter')}</span>
                            <div className="flex gap-1 mb-2">
                                <TextField
                                    size="small"
                                    value={newExtension}
                                    onChange={(e) => setNewExtension(e.target.value)}
                                    placeholder={t('snapshot.extensionPlaceholder')}
                                    sx={{flex: 1}}
                                    onKeyDown={(e) => e.key === 'Enter' && handleAddExtension()}
                                />
                                <Button
                                    size="small"
                                    onClick={handleAddExtension}
                                    sx={{minWidth: 'auto', px: 1}}
                                >
                                    <Plus size={14}/>
                                </Button>
                            </div>
                            <div className="flex flex-wrap gap-1 mb-2">
                                {localSearchExtensions.map((ext) => (
                                    <Chip
                                        key={ext}
                                        label={ext}
                                        size="small"
                                        onDelete={() => handleRemoveExtension(ext)}
                                        deleteIcon={<X size={12}/>}
                                        sx={{
                                            bgcolor: 'rgba(59,130,246,0.2)',
                                            color: 'rgba(255,255,255,0.8)',
                                        }}
                                    />
                                ))}
                            </div>
                            <FormControl size="small" fullWidth>
                                <Select
                                    value={localSearchExtensionMode}
                                    onChange={(e) => setLocalSearchExtensionMode(e.target.value as 'include' | 'exclude')}
                                >
                                    <MenuItem value="include">{t('snapshot.includeExtensions')}</MenuItem>
                                    <MenuItem value="exclude">{t('snapshot.excludeExtensions')}</MenuItem>
                                </Select>
                            </FormControl>
                        </div>

                        <FormControlLabel
                            control={
                                <Switch
                                    checked={localSearchCaseSensitive}
                                    onChange={(e) => setLocalSearchCaseSensitive(e.target.checked)}
                                    size="small"
                                />
                            }
                            label={<span className="text-xs text-white/60">{t('snapshot.searchCaseSensitive')}</span>}
                        />
                    </div>
                </div>
            </div>
        </div>
    );
};
