import { apiClient, getBasePath } from './client'
import { toCamelCase } from '../utils'
import type {
  ApiEnvironmentOverview,
  EnvironmentOverview,
  RuntimeConfigData,
} from './types'

export const runtimeApi = {
  overview: async () => {
    const resp = await apiClient.get<{ total: number; list: ApiEnvironmentOverview[] }>('/api/v1/runtime/overview')
    const list = resp.data?.list || []
    const camelCaseList = list.map(item => toCamelCase(item) as unknown as EnvironmentOverview)
    return {
      total: resp.data?.total || 0,
      list: camelCaseList,
    }
  },

  config: async (
    environmentKey: string,
    pipelineKey: string
  ): Promise<RuntimeConfigData | null> => {
    const resp = await apiClient.get<RuntimeConfigData>('/api/v1/runtime/config', undefined, {
      headers: {
        'x-environment': environmentKey,
        'x-pipeline': pipelineKey,
      },
    })
    return resp.data || null
  },

  exportStatic: async (
    environmentKey: string,
    pipelineKey: string
  ): Promise<Blob> => {
    const url = new URL('/api/v1/runtime/static', window.location.origin)
    url.searchParams.append('environment_key', environmentKey)
    url.searchParams.append('pipeline_key', pipelineKey)
    
    // 添加基础路径
    const basePath = getBasePath()
    if (basePath) {
      const pathname = url.pathname
      // 移除 basePath 末尾的斜杠，避免与 pathname 开头的斜杠重复
      const normalizedBasePath = basePath.replace(/\/$/, '')
      url.pathname = normalizedBasePath + pathname
    }

    const response = await fetch(url.toString(), {
      credentials: 'include',
    })

    if (!response.ok) {
      throw new Error(`HTTP error: ${response.status}`)
    }

    return response.blob()
  },
}
