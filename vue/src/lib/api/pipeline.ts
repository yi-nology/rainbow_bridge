import { get, post } from './client'
import type {
  ApiPipeline,
  ListData,
} from './types'

export const pipelineApi = {
  list: async (environmentKey: string) => {
    const resp = await get<ListData<ApiPipeline>>('/api/v1/pipeline/list', {
      environment_key: environmentKey,
    })
    return { total: resp.data?.total || 0, list: resp.data?.list || [] }
  },

  detail: async (environmentKey: string, pipelineKey: string) => {
    const resp = await get<{ pipeline: ApiPipeline }>('/api/v1/pipeline/detail', {
      environment_key: environmentKey,
      pipeline_key: pipelineKey,
    })
    return { pipeline: resp.data?.pipeline || null }
  },

  create: async (pipeline: ApiPipeline) => {
    const resp = await post<{ pipeline: ApiPipeline }>('/api/v1/pipeline/create', {
      environment_key: pipeline.environment_key,
      pipeline,
    })
    return { pipeline: resp.data?.pipeline || null }
  },

  update: async (pipeline: ApiPipeline) => {
    const resp = await post<{ pipeline: ApiPipeline }>('/api/v1/pipeline/update', {
      environment_key: pipeline.environment_key,
      pipeline,
    })
    return { pipeline: resp.data?.pipeline || null }
  },

  delete: async (environmentKey: string, pipelineKey: string) => {
    await post<null>('/api/v1/pipeline/delete', {
      environment_key: environmentKey,
      pipeline_key: pipelineKey,
    })
  },
}
