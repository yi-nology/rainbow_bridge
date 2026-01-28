import { get, post, upload } from './client'
import type {
  ApiResourceConfig,
  ImportResponse,
  ExportResponse,
  ImportSummary,
} from './types'

const BASE_PATH = '/rainbow-bridge/api/v1/transfer'

export interface ExportParams {
  environment_key: string
  pipeline_key: string
  format?: 'json' | 'zip' | 'static'
}

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

export const transferApi = {
  // 导出配置
  export: async (params: ExportParams) => {
    const resp = await get<ExportResponse>(`${BASE_PATH}/export`, {
      environment_key: params.environment_key,
      pipeline_key: params.pipeline_key,
      format: params.format || 'json',
    })
    return {
      total: resp.data?.total || 0,
      list: resp.data?.list || [],
    }
  },

  // 导出为文件（ZIP 或 Static）
  exportAsFile: async (params: ExportParams): Promise<Blob> => {
    const searchParams = new URLSearchParams({
      environment_key: params.environment_key,
      pipeline_key: params.pipeline_key,
      format: params.format || 'zip',
    })

    const response = await fetch(`${BASE_PATH}/export?${searchParams}`)

    if (!response.ok) {
      throw new Error(`HTTP error: ${response.status}`)
    }

    return response.blob()
  },

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
}
