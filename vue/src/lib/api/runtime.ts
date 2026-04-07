import { apiClient } from './client'
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
    const resp = await apiClient.get<RuntimeConfigData>('/api/v1/runtime/config', {
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
    const response = await fetch(
      `/api/v1/runtime/static?environment_key=${environmentKey}&pipeline_key=${pipelineKey}`,
      {
        credentials: 'include',
      }
    )

    if (!response.ok) {
      throw new Error(`HTTP error: ${response.status}`)
    }

    return response.blob()
  },
}
