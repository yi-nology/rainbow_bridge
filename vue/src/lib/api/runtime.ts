import { get } from './client'
import type {
  ApiEnvironmentOverview,
  RuntimeConfigData,
} from './types'

interface RuntimeConfigResponse {
  code: number
  msg: string
  error?: string
  data?: RuntimeConfigData
}

export const runtimeApi = {
  overview: async () => {
    const resp = await get<{ total: number; list: ApiEnvironmentOverview[] }>('/api/v1/runtime/overview')
    return {
      total: resp.data?.total || 0,
      list: resp.data?.list || [],
    }
  },

  config: async (
    environmentKey: string,
    pipelineKey: string
  ): Promise<RuntimeConfigData | null> => {
    const response = await fetch('/api/v1/runtime/config', {
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

  exportStatic: async (
    environmentKey: string,
    pipelineKey: string
  ): Promise<Blob> => {
    const response = await fetch(
      `/api/v1/runtime/static?environment_key=${environmentKey}&pipeline_key=${pipelineKey}`
    )

    if (!response.ok) {
      throw new Error(`HTTP error: ${response.status}`)
    }

    return response.blob()
  },
}
