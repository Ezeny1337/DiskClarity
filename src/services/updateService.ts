import { invoke } from '@tauri-apps/api/core';
import { getVersion } from '@tauri-apps/api/app';

export interface UpdateInfo {
  hasUpdate: boolean;
  latestVersion: string;
  currentVersion: string;
  downloadUrl?: string;
  releaseNotes?: string;
}

const GITHUB_REPO = 'Ezeny1337/DiskClarity';

export async function checkForUpdates(): Promise<UpdateInfo> {
  let currentVersion = '0.0.0';
  try {
    currentVersion = await getVersion();
  } catch {
  }

  let data: any;
  try {
    data = await invoke('get_latest_release', { repo: GITHUB_REPO });
  } catch {
    throw new Error('update_check_failed');
  }

  const latestVersion = String(data?.tag_name || '').replace(/^v/, '').trim() || currentVersion;
  const hasUpdate = compareVersions(latestVersion, currentVersion) > 0;

  return {
    hasUpdate,
    latestVersion,
    currentVersion,
    downloadUrl: data.html_url,
    releaseNotes: data.body,
  };
}

function compareVersions(v1: string, v2: string): number {
  const toParts = (v: string) =>
    v
      .trim()
      .split('.')
      .map((part) => {
        const match = part.match(/^\d+/);
        return match ? Number(match[0]) : 0;
      });

  const parts1 = toParts(v1);
  const parts2 = toParts(v2);

  for (let i = 0; i < Math.max(parts1.length, parts2.length); i++) {
    const part1 = parts1[i] || 0;
    const part2 = parts2[i] || 0;

    if (part1 > part2) return 1;
    if (part1 < part2) return -1;
  }

  return 0;
}
