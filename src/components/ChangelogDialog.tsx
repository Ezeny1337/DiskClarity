import React from 'react';
import {CircularProgress, Dialog, DialogContent, DialogTitle} from '@mui/material';
import {ExternalLink, X} from 'lucide-react';
import {openUrl} from '@tauri-apps/plugin-opener';
import {useTranslation} from 'react-i18next';
import {motion} from 'framer-motion';
import type {GitHubRelease} from '../types';

interface ChangelogDialogProps {
    open: boolean;
    onClose: () => void;
    loading: boolean;
    error: string | null;
    releases: GitHubRelease[];
}

export const ChangelogDialog: React.FC<ChangelogDialogProps> = ({
                                                                    open,
                                                                    onClose,
                                                                    loading,
                                                                    error,
                                                                    releases,
                                                                }) => {
    const {t} = useTranslation();

    return (
        <Dialog open={open} onClose={onClose} maxWidth="md" fullWidth
                slotProps={{paper: {sx: {maxHeight: '85vh'}}}}
        >
            <DialogTitle>
                <div className="flex items-center gap-3">
                    <div className="w-2 h-2 rounded-full bg-linear-to-r from-blue-400 to-purple-500"/>
                    <span className="text-lg font-semibold text-white tracking-tight">
                        {t('app.changelogTitle')}
                    </span>
                </div>
                <button
                    onClick={onClose}
                    className="p-1.5 rounded-md text-white/40 hover:text-white/70 hover:bg-white/5 transition-colors"
                >
                    <X size={18}/>
                </button>
            </DialogTitle>

            <DialogContent>
                {loading ? (
                    <div className="h-56 flex items-center justify-center">
                        <CircularProgress size={26}/>
                    </div>
                ) : error ? (
                    <p className="text-[13px] text-red-400">{error}</p>
                ) : releases.length === 0 ? (
                    <p className="text-[13px] text-white/45">{t('app.changelogEmpty')}</p>
                ) : (
                    <div className="space-y-4">
                        {releases.map((release, index) => (
                            <motion.div
                                key={`${release.tag_name}-${release.published_at ?? 'na'}`}
                                initial={{opacity: 0, y: 20}}
                                animate={{opacity: 1, y: 0}}
                                transition={{delay: index * 0.1, duration: 0.4}}
                                className="rounded-xl border px-4 py-4 transition-colors hover:border-white/12 hover:bg-white/5"
                                style={{
                                    borderColor: 'rgba(255,255,255,0.06)',
                                    background: 'linear-gradient(135deg, rgba(255,255,255,0.03) 0%, rgba(255,255,255,0.01) 100%)',
                                }}
                            >
                                <div className="flex items-start justify-between gap-4 mb-3">
                                    <div className="min-w-0 flex-1">
                                        <div className="flex items-center gap-2 mb-1">
                                            <div
                                                className="w-1.5 h-1.5 rounded-full bg-linear-to-r from-emerald-400 to-blue-500"/>
                                            <span className="text-[15px] font-semibold text-slate-200 tracking-tight">
                                                {release.name || release.tag_name}
                                            </span>
                                        </div>
                                        <span className="text-xs text-white/45 font-mono pl-2.5 block">
                                            {release.published_at
                                                ? new Date(release.published_at).toLocaleString(undefined, {
                                                    year: 'numeric', month: 'short', day: '2-digit',
                                                    hour: '2-digit', minute: '2-digit', hour12: false,
                                                })
                                                : release.tag_name}
                                        </span>
                                    </div>

                                    {release.html_url && (
                                        <button
                                            onClick={() => openUrl(release.html_url!)}
                                            className="text-xs px-3 py-1.5 rounded-lg border flex items-center gap-1.5 transition-all duration-200 hover:scale-105 text-white/70 border-white/15 bg-white/5 hover:text-white/90 hover:border-white/25 hover:bg-white/10"
                                        >
                                            <ExternalLink size={11}/>
                                            <span className="font-medium">GitHub</span>
                                        </button>
                                    )}
                                </div>

                                <div className="relative pl-2.5">
                                    <div
                                        className="absolute left-0 top-0 bottom-0 w-px bg-linear-to-b from-transparent via-white/10 to-transparent"/>
                                    <pre
                                        className="whitespace-pre-wrap break-words text-sm leading-relaxed m-0 pl-3 text-white/75"
                                        style={{fontFamily: 'inherit'}}>
                    {release.body?.trim() || t('app.changelogNoNotes')}
                  </pre>
                                </div>
                            </motion.div>
                        ))}
                    </div>
                )}
            </DialogContent>
        </Dialog>
    );
};
