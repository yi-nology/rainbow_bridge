import { BaseApiService } from './base-api'
import type { Pipeline } from './types'

class PipelineApiService extends BaseApiService<Pipeline> {
  protected baseUrl = '/api/v1/pipeline'

  protected getIdParamName(): string {
    return 'pipeline_key'
  }

  // 重写list方法，因为需要环境key参数
  async list(params?: Record<string, unknown>): Promise<{ total: number; list: Pipeline[] }> {
    return super.list(params)
  }

  // 重写detail方法，因为需要环境key参数
  async detail(id: string | number, params?: Record<string, unknown>): Promise<{ [key: string]: Pipeline | null }> {
    return super.detail(id, params)
  }

  // 重写delete方法，因为需要环境key参数
  async delete(id: string | number, params?: Record<string, unknown>): Promise<void> {
    return super.delete(id, params)
  }

  // 重写create方法，因为需要环境key参数
  async create(data: Pipeline): Promise<{ [key: string]: Pipeline | null }> {
    return super.create(data)
  }

  // 重写update方法，因为需要环境key参数
  async update(data: Pipeline): Promise<{ [key: string]: Pipeline | null }> {
    return super.update(data)
  }
}

export const pipelineApi = new PipelineApiService()

