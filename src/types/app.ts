/** 更新信息接口 */
export interface UpdateInfo {
    version: string;
    url?: string;
    releaseNotes?: string;
}

/** 更新状态接口 */
export interface UpdateStatus {
    message: string;
    severity: 'success' | 'error' | 'info';
}

/** GitHub 发布信息接口 */
export interface GitHubRelease {
    tag_name: string;
    name?: string;
    body?: string;
    html_url?: string;
    published_at?: string;
    prerelease?: boolean;
    draft?: boolean;
    assets?: Array<{
        name: string;
        browser_download_url: string;
        size: number;
    }>;
}
