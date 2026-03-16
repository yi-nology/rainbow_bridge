import { get, post } from './client'
import type {
  ApiResourceConfig,
  ListData,
} from './types'

export interface ListConfigParams {
  environment_key: string
  pipeline_key: string
  type?: string
  min_version?: string
  max_version?: string
  is_latest?: boolean
  [key: string]: string | boolean | undefined
}

export const configApi = {
  list: async (params: ListConfigParams) => {
    const resp = await get<ListData<ApiResourceConfig>>('/api/v1/config/list', params)
    return { total: resp.data?.total || 0, list: resp.data?.list || [] }
  },

  detail: async (
    environmentKey: string,
    pipelineKey: string,
    resourceKey: string
  ) => {
    const resp = await get<{ config: ApiResourceConfig }>('/api/v1/config/detail', {
      environment_key: environmentKey,
      pipeline_key: pipelineKey,
      resource_key: resourceKey,
    })
    return { config: resp.data?.config || null }
  },

  create: async (config: ApiResourceConfig) => {
    const resp = await post<{ config: ApiResourceConfig }>('/api/v1/config/create', {
      config,
    })
    return { config: resp.data?.config || null }
  },

  update: async (config: ApiResourceConfig) => {
    const resp = await post<{ config: ApiResourceConfig }>('/api/v1/config/update', {
      config,
    })
    return { config: resp.data?.config || null }
  },

  delete: async (
    environmentKey: string,
    pipelineKey: string,
    resourceKey: string
  ) => {
    await post<null>('/api/v1/config/delete', {
      environment_key: environmentKey,
      pipeline_key: pipelineKey,
      resource_key: resourceKey,
    })
  },
}
