import { get } from './client'
import type {
  RuntimeOverviewResponse,
  RuntimeConfigResponse,
  ApiEnvironmentOverview,
  RuntimeConfigData,
} from './types'

const BASE_PATH = '/rainbow-bridge/api/v1/runtime'

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
    const response = await fetch(`${BASE_PATH}/config`, {
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
    const response = await fetch(
      `${BASE_PATH}/static?environment_key=${environmentKey}&pipeline_key=${pipelineKey}`
    )

    if (!response.ok) {
      throw new Error(`HTTP error: ${response.status}`)
    }

    return response.blob()
  },
}
