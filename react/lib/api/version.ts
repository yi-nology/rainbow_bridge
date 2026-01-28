import { get, getBasePath } from './client'

const BASE_PATH = `${getBasePath()}/api/v1/version`

export interface VersionInfo {
  version: string
  git_commit: string
  build_time: string
}

export interface VersionResponse {
  code: number
  msg: string
  error?: string
  data: {
    version_info: VersionInfo
  }
}

export interface GitHubReleaseInfo {
  tag_name: string
  name: string
  published_at: string
  html_url: string
  prerelease: boolean
  body: string
}

export interface GitHubReleaseResponse {
  code: number
  msg: string
  error?: string
  data: {
    release_info: GitHubReleaseInfo
  }
}

export const versionApi = {
  // 获取当前版本信息
  getVersion: async (): Promise<VersionResponse> => {
    return get<VersionResponse>(BASE_PATH)
  },

  // 获取最新GitHub发布版本
  getLatestRelease: async (): Promise<GitHubReleaseResponse> => {
    return get<GitHubReleaseResponse>(`${BASE_PATH}/latest`)
  },
}
