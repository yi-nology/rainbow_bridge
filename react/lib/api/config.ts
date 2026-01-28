import { get, post, getBasePath } from './client'
import type {
  ApiResourceConfig,
  ConfigListResponse,
  ConfigResponse,
  ConfigDetailResponse,
  DeleteConfigResponse,
} from './types'

const BASE_PATH = `${getBasePath()}/api/v1/config`

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
  // 获取配置列表
  list: async (params: ListConfigParams) => {
    const resp = await get<ConfigListResponse>(`${BASE_PATH}/list`, params)
    return { total: resp.data?.total || 0, list: resp.data?.list || [] }
  },

  // 获取配置详情
  detail: async (
    environmentKey: string,
    pipelineKey: string,
    resourceKey: string
  ) => {
    const resp = await get<ConfigDetailResponse>(`${BASE_PATH}/detail`, {
      environment_key: environmentKey,
      pipeline_key: pipelineKey,
      resource_key: resourceKey,
    })
    return { config: resp.data?.config || null }
  },

  // 创建配置
  create: async (config: ApiResourceConfig) => {
    const resp = await post<ConfigResponse>(`${BASE_PATH}/create`, {
      config,
    })
    return { config: resp.data?.config || null }
  },

  // 更新配置
  update: async (config: ApiResourceConfig) => {
    const resp = await post<ConfigResponse>(`${BASE_PATH}/update`, {
      config,
    })
    return { config: resp.data?.config || null }
  },

  // 删除配置
  delete: async (
    environmentKey: string,
    pipelineKey: string,
    resourceKey: string
  ) => {
    await post<DeleteConfigResponse>(`${BASE_PATH}/delete`, {
      environment_key: environmentKey,
      pipeline_key: pipelineKey,
      resource_key: resourceKey,
    })
  },
}
