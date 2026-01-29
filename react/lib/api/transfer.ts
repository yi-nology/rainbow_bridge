import { get, post, upload, getBasePath } from './client'
import type {
  ApiResourceConfig,
  ImportResponse,
  ImportSummary,
} from './types'

const BASE_PATH = `${getBasePath()}/api/v1/transfer`

export interface ImportJsonData {
  configs: ApiResourceConfig[]
  overwrite?: boolean
  environment_mapping?: Record<string, string>
  pipeline_mapping?: Record<string, string>
}

export interface MigrateParams {
  source_environment_key: string
  source_pipeline_key: string
  target_environment_key: string
  target_pipeline_key: string
  resource_keys?: string[]
  overwrite?: boolean
}

export interface MigrateResultItem {
  resource_key: string
  name: string
  alias: string
  status: 'succeeded' | 'skipped' | 'failed'
  message?: string
}

export interface MigrateSummary {
  total: number
  succeeded: number
  skipped: number
  failed?: number  // 后端可能不返回，需要从 items 中计算
  items: MigrateResultItem[]
}

export interface MigrateResponse {
  code: number
  msg: string
  error?: string
  data?: MigrateSummary
}

// ==================== Export Tree Types ====================

export interface ExportTreeConfig {
  resource_key: string
  name: string
  alias: string
  type: string
}

export interface ExportTreePipeline {
  pipeline_key: string
  pipeline_name: string
  description: string
  is_active: boolean
  config_count: number
  configs: ExportTreeConfig[]
}

export interface ExportTreeEnvironment {
  environment_key: string
  environment_name: string
  description: string
  is_active: boolean
  pipelines: ExportTreePipeline[]
}

export interface ExportTreeData {
  environments: ExportTreeEnvironment[]
}

export interface ExportTreeResponse {
  code: number
  msg: string
  error?: string
  data?: ExportTreeData
}

// ==================== Selective Export Types ====================

export interface ExportSelection {
  environment_key: string
  pipeline_key?: string      // empty means all pipelines in this environment
  resource_keys?: string[]   // empty means all configs in this pipeline
}

export interface ExportSelectiveParams {
  format: 'zip' | 'tar.gz'
  selections: ExportSelection[]
}

// ==================== Import Preview Types ====================

export interface ImportPreviewConfig {
  resource_key: string
  name: string
  alias: string
  type: string
  status: 'new' | 'exists' | 'conflict'
}

export interface ImportPreviewPipeline {
  pipeline_key: string
  pipeline_name: string
  status: 'new' | 'exists'
  configs: ImportPreviewConfig[]
}

export interface ImportPreviewEnvironment {
  environment_key: string
  environment_name: string
  status: 'new' | 'exists'
  pipelines: ImportPreviewPipeline[]
}

export interface ImportPreviewSummary {
  total_environments: number
  total_pipelines: number
  total_configs: number
  total_assets: number
  new_count: number
  existing_count: number
  conflict_count: number
}

export interface ImportPreviewData {
  format: string
  environments: ImportPreviewEnvironment[]
  summary: ImportPreviewSummary
}

export interface ImportPreviewResponse {
  code: number
  msg: string
  error?: string
  data?: ImportPreviewData
}

export const transferApi = {
  // 导入配置（JSON 格式）
  importJson: async (data: ImportJsonData): Promise<ImportSummary | null> => {
    const resp = await post<ImportResponse>(`${BASE_PATH}/import`, data)
    return resp.data || null
  },

  // 导入配置（文件上传）
  importFile: async (file: File): Promise<ImportSummary | null> => {
    const formData = new FormData()
    formData.append('file', file)

    const resp = await upload<ImportResponse>(`${BASE_PATH}/import`, formData)
    return resp.data || null
  },

  // 迁移配置
  migrate: async (params: MigrateParams): Promise<MigrateSummary | null> => {
    const resp = await post<MigrateResponse>(`${BASE_PATH}/migrate`, params)
    return resp.data || null
  },

  // ==================== Export APIs ====================

  // 获取导出树形结构
  getExportTree: async (): Promise<ExportTreeEnvironment[]> => {
    const resp = await get<ExportTreeResponse>(`${BASE_PATH}/export-tree`)
    return resp.data?.environments || []
  },

  // 按选择导出
  exportSelective: async (params: ExportSelectiveParams): Promise<Blob> => {
    // 使用环境变量中的 API 基础 URL（开发环境指向后端服务器）
    const apiBaseUrl = process.env.NEXT_PUBLIC_API_BASE_URL || ''
    const baseUrl = apiBaseUrl || (typeof window !== 'undefined' ? window.location.origin : '')
    const url = `${baseUrl}${BASE_PATH}/export`
    
    const response = await fetch(url, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
      },
      body: JSON.stringify(params),
    })

    if (!response.ok) {
      const errorText = await response.text()
      throw new Error(`HTTP error: ${response.status} - ${errorText}`)
    }

    return response.blob()
  },

  // ==================== Import APIs ====================

  // 导入预览
  importPreview: async (file: File): Promise<ImportPreviewData | null> => {
    const formData = new FormData()
    formData.append('file', file)

    const resp = await upload<ImportPreviewResponse>(`${BASE_PATH}/import-preview`, formData)
    return resp.data || null
  },

  // 选择性导入
  importSelective: async (
    file: File,
    selections: ExportSelection[],
    overwrite: boolean
  ): Promise<ImportSummary | null> => {
    const formData = new FormData()
    formData.append('file', file)
    formData.append('selections', JSON.stringify(selections))
    formData.append('overwrite', String(overwrite))

    const resp = await upload<ImportResponse>(`${BASE_PATH}/import-selective`, formData)
    return resp.data || null
  },
}
