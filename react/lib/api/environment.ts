import { get, post, getBasePath } from './client'
import type {
  ApiEnvironment,
  EnvironmentListResponse,
  EnvironmentResponse,
  EnvironmentDetailResponse,
  DeleteEnvironmentResponse,
} from './types'

const BASE_PATH = `${getBasePath()}/api/v1/environment`

export const environmentApi = {
  // 获取环境列表
  list: async (isActive?: boolean) => {
    const resp = await get<EnvironmentListResponse>(`${BASE_PATH}/list`, {
      is_active: isActive,
    })
    return { total: resp.data?.total || 0, list: resp.data?.list || [] }
  },

  // 获取环境详情
  detail: async (environmentKey: string) => {
    const resp = await get<EnvironmentDetailResponse>(`${BASE_PATH}/detail`, {
      environment_key: environmentKey,
    })
    return { environment: resp.data?.environment || null }
  },

  // 创建环境
  create: async (environment: ApiEnvironment) => {
    const resp = await post<EnvironmentResponse>(`${BASE_PATH}/create`, {
      environment,
    })
    return { environment: resp.data?.environment || null }
  },

  // 更新环境
  update: async (environment: ApiEnvironment) => {
    const resp = await post<EnvironmentResponse>(`${BASE_PATH}/update`, {
      environment,
    })
    return { environment: resp.data?.environment || null }
  },

  // 删除环境
  delete: async (environmentKey: string) => {
    await post<DeleteEnvironmentResponse>(`${BASE_PATH}/delete`, {
      environment_key: environmentKey,
    })
  },
}
