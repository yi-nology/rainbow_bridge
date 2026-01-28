import { get, post, getBasePath } from './client'
import type {
  ApiPipeline,
  PipelineListResponse,
  PipelineResponse,
  PipelineDetailResponse,
  DeletePipelineResponse,
} from './types'

const BASE_PATH = `${getBasePath()}/api/v1/pipeline`

export const pipelineApi = {
  // 获取渠道列表
  list: async (environmentKey: string) => {
    const resp = await get<PipelineListResponse>(`${BASE_PATH}/list`, {
      environment_key: environmentKey,
    })
    return { total: resp.data?.total || 0, list: resp.data?.list || [] }
  },

  // 获取渠道详情
  detail: async (environmentKey: string, pipelineKey: string) => {
    const resp = await get<PipelineDetailResponse>(`${BASE_PATH}/detail`, {
      environment_key: environmentKey,
      pipeline_key: pipelineKey,
    })
    return { pipeline: resp.data?.pipeline || null }
  },

  // 创建渠道
  create: async (pipeline: ApiPipeline) => {
    const resp = await post<PipelineResponse>(`${BASE_PATH}/create`, {
      environment_key: pipeline.environment_key,
      pipeline,
    })
    return { pipeline: resp.data?.pipeline || null }
  },

  // 更新渠道
  update: async (pipeline: ApiPipeline) => {
    const resp = await post<PipelineResponse>(`${BASE_PATH}/update`, {
      environment_key: pipeline.environment_key,
      pipeline,
    })
    return { pipeline: resp.data?.pipeline || null }
  },

  // 删除渠道
  delete: async (environmentKey: string, pipelineKey: string) => {
    await post<DeletePipelineResponse>(`${BASE_PATH}/delete`, {
      environment_key: environmentKey,
      pipeline_key: pipelineKey,
    })
  },
}
