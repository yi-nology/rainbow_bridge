import { get, post } from './client'
import type {
  ApiEnvironment,
  ListData,
} from './types'

export const environmentApi = {
  list: async (isActive?: boolean) => {
    const resp = await get<ListData<ApiEnvironment>>('/api/v1/environment/list', {
      is_active: isActive,
    })
    return { total: resp.data?.total || 0, list: resp.data?.list || [] }
  },

  detail: async (environmentKey: string) => {
    const resp = await get<{ environment: ApiEnvironment }>('/api/v1/environment/detail', {
      environment_key: environmentKey,
    })
    return { environment: resp.data?.environment || null }
  },

  create: async (environment: ApiEnvironment) => {
    const resp = await post<{ environment: ApiEnvironment }>('/api/v1/environment/create', {
      environment,
    })
    return { environment: resp.data?.environment || null }
  },

  update: async (environment: ApiEnvironment) => {
    const resp = await post<{ environment: ApiEnvironment }>('/api/v1/environment/update', {
      environment,
    })
    return { environment: resp.data?.environment || null }
  },

  delete: async (environmentKey: string) => {
    await post<null>('/api/v1/environment/delete', {
      environment_key: environmentKey,
    })
  },
}
