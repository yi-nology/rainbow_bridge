import type { Environment, Pipeline, ConfigItem } from '../types'
import type {
  ApiEnvironment,
  ApiPipeline,
  ApiResourceConfig,
  ApiEnvironmentOverview,
  ApiFileAsset,
} from './types'

// Environment 转换
export function fromApiEnvironment(api: ApiEnvironment, pipelines: Pipeline[] = []): Environment {
  return {
    id: api.environment_key,
    key: api.environment_key,
    name: api.environment_name,
    pipelines,
  }
}

export function toApiEnvironment(env: Partial<Environment> & { key: string; name: string }): ApiEnvironment {
  return {
    environment_key: env.key,
    environment_name: env.name,
    description: '',
    sort_order: 0,
    is_active: true,
  }
}

// Pipeline 转换
export function fromApiPipeline(api: ApiPipeline): Pipeline {
  return {
    id: api.pipeline_key,
    key: api.pipeline_key,
    name: api.pipeline_name,
  }
}

export function toApiPipeline(
  pipeline: Partial<Pipeline> & { key: string; name: string },
  environmentKey: string
): ApiPipeline {
  return {
    environment_key: environmentKey,
    pipeline_key: pipeline.key,
    pipeline_name: pipeline.name,
    description: '',
    sort_order: 0,
    is_active: true,
  }
}

// Config 转换

// 前端类型直接透传到后端，不做转换
function mapFrontendTypeToBackend(frontendType: string): string {
  return frontendType
}

// 前端内容直接透传到后端，不做转换
function transformContentToBackend(frontendType: string, content: string): string {
  return content
}

// 后端类型直接透传到前端，不做转换
function transformContentFromBackend(backendType: string, content: string): { type: string; content: string } {
  return { type: backendType, content }
}

export function fromApiConfig(api: ApiResourceConfig): ConfigItem {
  const { type, content } = transformContentFromBackend(api.type, api.content)
  
  return {
    id: api.resource_key,
    name: api.name,
    alias: api.alias,
    type: type as ConfigItem['type'],
    content,
    environmentId: api.environment_key,
    pipelineId: api.pipeline_key,
    createdAt: new Date().toISOString(),
    updatedAt: new Date().toISOString(),
  }
}

export function toApiConfig(
  config: Partial<ConfigItem> & {
    name: string
    type: string
    content: string
    environmentId: string
    pipelineId: string
  }
): ApiResourceConfig {
  const backendType = mapFrontendTypeToBackend(config.type)
  const backendContent = transformContentToBackend(config.type, config.content)
  
  return {
    resource_key: config.id || '',
    alias: config.alias || '',
    name: config.name,
    environment_key: config.environmentId,
    pipeline_key: config.pipelineId,
    content: backendContent,
    type: backendType,
    remark: '',
    is_perm: false,
  }
}

// Runtime Overview 转换
export function fromApiEnvironmentOverview(api: ApiEnvironmentOverview): Environment {
  return {
    id: api.environment_key,
    key: api.environment_key,
    name: api.environment_name,
    pipelines: api.pipelines.map((p) => ({
      id: p.pipeline_key,
      key: p.pipeline_key,
      name: p.pipeline_name,
    })),
  }
}

// Asset 类型（前端使用）
export interface Asset {
  id: string
  name: string
  type: string
  size: number
  url: string
  environmentKey: string
  pipelineKey: string
  remark: string
}

export function fromApiAsset(api: ApiFileAsset): Asset {
  return {
    id: api.file_id,
    name: api.file_name,
    type: api.content_type,
    size: api.file_size,
    url: api.url,
    environmentKey: api.environment_key,
    pipelineKey: api.pipeline_key,
    remark: api.remark,
  }
}
