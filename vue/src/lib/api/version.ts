import { apiClient } from './client'

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
  getVersion: async (): Promise<VersionResponse> => {
    const resp = await apiClient.get<VersionResponse['data']>('/api/v1/version')
    return {
      code: resp.code,
      msg: resp.msg,
      error: resp.error,
      data: resp.data!,
    }
  },

  getLatestRelease: async (): Promise<GitHubReleaseResponse> => {
    const resp = await apiClient.get<GitHubReleaseResponse['data']>('/api/v1/version/latest')
    return {
      code: resp.code,
      msg: resp.msg,
      error: resp.error,
      data: resp.data!,
    }
  },
}
