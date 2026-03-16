import { defineStore } from 'pinia'
import { ref } from 'vue'
import { versionApi } from '@/lib/api/version'

interface VersionInfo {
  version: string
  git_commit: string
  build_time: string
}

interface Release {
  tag_name: string
  name: string
  html_url: string
  prerelease: boolean
}

export const useVersionStore = defineStore('version', () => {
  const versionInfo = ref<VersionInfo | null>(null)
  const latestRelease = ref<Release | null>(null)
  const loading = ref(false)

  const fetchVersion = async () => {
    try {
      const response = await versionApi.getVersion()
      if (response.data?.version_info) {
        versionInfo.value = {
          version: response.data.version_info.version,
          git_commit: response.data.version_info.git_commit,
          build_time: response.data.version_info.build_time,
        }
      }
    } catch (e) {
      console.error('获取版本信息失败:', e)
    }
  }

  const fetchLatestRelease = async () => {
    try {
      const response = await versionApi.getLatestRelease()
      if (response.data?.release_info) {
        latestRelease.value = {
          tag_name: response.data.release_info.tag_name,
          name: response.data.release_info.name,
          html_url: response.data.release_info.html_url,
          prerelease: response.data.release_info.prerelease,
        }
      }
    } catch (e) {
      console.error('获取最新版本失败:', e)
    }
  }

  const init = async () => {
    loading.value = true
    await Promise.all([fetchVersion(), fetchLatestRelease()])
    loading.value = false
  }

  return {
    versionInfo,
    latestRelease,
    loading,
    fetchVersion,
    fetchLatestRelease,
    init,
  }
})
