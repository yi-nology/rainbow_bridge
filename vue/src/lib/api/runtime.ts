import { apiClient } from './client'
import { toCamelCase } from '../utils'
import type {
  ApiEnvironmentOverview,
  EnvironmentOverview,
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
}
