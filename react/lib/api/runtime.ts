import { get } from './client'
import type {
  RuntimeOverviewResponse,
  RuntimeConfigResponse,
  ApiEnvironmentOverview,
  RuntimeConfigData,
} from './types'

const BASE_PATH = '/rainbow-bridge/api/v1/runtime'

// 获取 API 基础 URL（开发环境指向后端服务器，生产环境使用相对路径）
function getApiBaseUrl(): string {
  const apiBaseUrl = process.env.NEXT_PUBLIC_API_BASE_URL || ''
  return apiBaseUrl || (typeof window !== 'undefined' ? window.location.origin : '')
}

export const runtimeApi = {
  // 获取运行时概览
  overview: async () => {
    const resp = await get<RuntimeOverviewResponse>(`${BASE_PATH}/overview`)
    return {
      total: resp.data?.total || 0,
      list: (resp.data?.list || []) as ApiEnvironmentOverview[],
    }
  },

  // 获取运行时配置（通过 header）
  config: async (
    environmentKey: string,
    pipelineKey: string
  ): Promise<RuntimeConfigData | null> => {
    const baseUrl = getApiBaseUrl()
    const response = await fetch(`${baseUrl}${BASE_PATH}/config`, {
      method: 'GET',
      headers: {
        'x-environment': environmentKey,
        'x-pipeline': pipelineKey,
      },
    })

    if (!response.ok) {
      throw new Error(`HTTP error: ${response.status}`)
    }

    const resp: RuntimeConfigResponse = await response.json()
    return resp.data || null
  },

  // 导出静态包
  exportStatic: async (
    environmentKey: string,
    pipelineKey: string
  ): Promise<Blob> => {
    const baseUrl = getApiBaseUrl()
    const response = await fetch(
      `${baseUrl}${BASE_PATH}/static?environment_key=${environmentKey}&pipeline_key=${pipelineKey}`
    )

    if (!response.ok) {
      throw new Error(`HTTP error: ${response.status}`)
    }

    return response.blob()
  },
}
