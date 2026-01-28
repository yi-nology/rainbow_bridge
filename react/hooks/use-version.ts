import { useQuery } from '@tanstack/react-query'
import { versionApi } from '../lib/api/version'

// 获取当前版本信息
export function useVersion() {
  return useQuery({
    queryKey: ['version'],
    queryFn: async () => {
      const response = await versionApi.getVersion()
      return response.data.version_info
    },
    staleTime: 5 * 60 * 1000, // 5分钟内不重新获取
    retry: 1,
  })
}

// 获取最新GitHub发布版本
export function useLatestRelease() {
  return useQuery({
    queryKey: ['latestRelease'],
    queryFn: async () => {
      const response = await versionApi.getLatestRelease()
      return response.data.release_info
    },
    staleTime: 10 * 60 * 1000, // 10分钟内不重新获取
    retry: 1,
  })
}
