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

// 前端类型到后端类型的映射
function mapFrontendTypeToBackend(frontendType: string): string {
  switch (frontendType) {
    case 'text':
    case 'textarea':
    case 'richtext':
      return 'text'
    case 'color':
      return 'color'
    case 'file':
    case 'image':
      return 'image'
    case 'keyvalue':
      return 'kv'
    case 'number':
    case 'decimal':
    case 'boolean':
    case 'object':
    default:
      return 'config'
  }
}

// 将前端内容转换为后端格式
function transformContentToBackend(frontendType: string, content: string): string {
  const backendType = mapFrontendTypeToBackend(frontendType)
  
  if (backendType !== 'config') {
    return content
  }

  // config 类型需要 JSON 对象格式
  switch (frontendType) {
    case 'number':
      return JSON.stringify({ value: parseInt(content, 10) || 0 })
    case 'decimal':
      return JSON.stringify({ value: parseFloat(content) || 0 })
    case 'boolean':
      return JSON.stringify({ value: content === 'true' })
    case 'keyvalue':
    case 'object':
      // 已经是 JSON 字符串，验证并返回
      try {
        const parsed = JSON.parse(content)
        if (typeof parsed === 'object' && parsed !== null) {
          return content
        }
        return JSON.stringify({ value: parsed })
      } catch {
        return JSON.stringify({ value: content })
      }
    default:
      // 其他类型，包装成 JSON 对象
      try {
        JSON.parse(content)
        return content
      } catch {
        return JSON.stringify({ value: content })
      }
  }
}

// 将后端内容转换为前端格式
function transformContentFromBackend(backendType: string, content: string): { type: string; content: string } {
  if (backendType === 'text' || backendType === 'color' || backendType === 'image') {
    return { type: backendType, content }
  }

  if (backendType === 'kv') {
    return { type: 'keyvalue', content }
  }

  // config 类型，尝试解析并判断原始类型
  try {
    const parsed = JSON.parse(content)
    
    if (parsed && typeof parsed === 'object' && 'value' in parsed) {
      const value = parsed.value
      if (typeof value === 'number') {
        if (Number.isInteger(value)) {
          return { type: 'number', content: String(value) }
        }
        return { type: 'decimal', content: String(value) }
      }
      if (typeof value === 'boolean') {
        return { type: 'boolean', content: String(value) }
      }
      if (typeof value === 'string') {
        return { type: 'text', content: value }
      }
    }
    
    // 是一个普通 JSON 对象
    return { type: 'object', content }
  } catch {
    return { type: 'text', content }
  }
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
