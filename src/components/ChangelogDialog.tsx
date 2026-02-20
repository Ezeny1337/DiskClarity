import React from 'react';
import {alpha, CircularProgress, Dialog, DialogContent, DialogTitle, IconButton, Typography,} from '@mui/material';
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
        <Dialog
            open={open}
            onClose={onClose}
            maxWidth="md"
            fullWidth
            slotProps={{
                paper: {
                    sx: {
                        bgcolor: '#0a0a0b',
                        border: `1px solid ${alpha('#ffffff', 0.08)}`,
                        borderRadius: 3,
                        maxHeight: '85vh',
                        backdropFilter: 'blur(20px)',
                        boxShadow: '0 25px 50px -12px rgba(0,0,0,0.8), 0 0 0 1px rgba(255,255,255,0.05)',
                    },
                },
            }}
        >
            <DialogTitle
                sx={{
                    display: 'flex',
                    alignItems: 'center',
                    justifyContent: 'space-between',
                    pb: 2, pt: 3, px: 3,
                    borderBottom: `1px solid ${alpha('#ffffff', 0.06)}`,
                }}
            >
                <div className="flex items-center gap-3">
                    <div className="w-2 h-2 rounded-full bg-linear-to-r from-blue-400 to-purple-500"/>
                    <Typography
                        component="span"
                        sx={{color: 'white', fontSize: 18, fontWeight: 600, letterSpacing: '-0.025em'}}
                    >
                        {t('app.changelogTitle')}
                    </Typography>
                </div>
                <IconButton
                    size="small"
                    onClick={onClose}
                    sx={{
                        color: alpha('#ffffff', 0.4),
                        '&:hover': {color: alpha('#ffffff', 0.7), bgcolor: alpha('#ffffff', 0.05)},
                    }}
                >
                    <X size={18}/>
                </IconButton>
            </DialogTitle>

            <DialogContent sx={{pt: 3, pb: 3, px: 3}}>
                {loading ? (
                    <div className="h-56 flex items-center justify-center">
                        <CircularProgress size={26} sx={{color: '#60a5fa'}}/>
                    </div>
                ) : error ? (
                    <Typography sx={{color: '#f87171', fontSize: 13}}>{error}</Typography>
                ) : releases.length === 0 ? (
                    <Typography sx={{color: alpha('#ffffff', 0.45), fontSize: 13}}>
                        {t('app.changelogEmpty')}
                    </Typography>
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
                                    borderColor: alpha('#ffffff', 0.06),
                                    background: `linear-gradient(135deg, ${alpha('#ffffff', 0.03)} 0%, ${alpha('#ffffff', 0.01)} 100%)`,
                                }}
                            >
                                <div className="flex items-start justify-between gap-4 mb-3">
                                    <div className="min-w-0 flex-1">
                                        <div className="flex items-center gap-2 mb-1">
                                            <div
                                                className="w-1.5 h-1.5 rounded-full bg-linear-to-r from-emerald-400 to-blue-500"/>
                                            <Typography sx={{
                                                color: '#e2e8f0',
                                                fontSize: 15,
                                                fontWeight: 600,
                                                letterSpacing: '-0.01em'
                                            }}>
                                                {release.name || release.tag_name}
                                            </Typography>
                                        </div>
                                        <Typography
                                            sx={{
                                                color: alpha('#ffffff', 0.45),
                                                fontSize: 12,
                                                fontFamily: 'ui-monospace, monospace',
                                                pl: 2.5,
                                            }}
                                        >
                                            {release.published_at
                                                ? new Date(release.published_at).toLocaleString(undefined, {
                                                    year: 'numeric', month: 'short', day: '2-digit',
                                                    hour: '2-digit', minute: '2-digit', hour12: false,
                                                })
                                                : release.tag_name}
                                        </Typography>
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
                                        className="whitespace-pre-wrap break-words text-sm leading-relaxed m-0 pl-3"
                                        style={{color: alpha('#ffffff', 0.75), fontFamily: 'inherit'}}
                                    >
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
