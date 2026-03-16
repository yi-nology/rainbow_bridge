import { get, post, upload, getBasePath } from './client'
import type {
  ApiResourceConfig,
  ImportSummary,
} from './types'

function buildApiUrl(path: string): string {
  const basePath = getBasePath()
  const normalizedBasePath = basePath.replace(/\/$/, '')
  if (normalizedBasePath && path.startsWith('/api/')) {
    return `${normalizedBasePath}${path}`
  }
  return path
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
  failed?: number
  items: MigrateResultItem[]
}

export interface MigrateResponse {
  code: number
  msg: string
  error?: string
  data?: MigrateSummary
}

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

export interface ExportSelection {
  environment_key: string
  pipeline_key?: string
  resource_keys?: string[]
}

export interface ExportSelectiveParams {
  format: 'zip' | 'tar.gz'
  selections: ExportSelection[]
}

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
  importJson: async (data: ImportJsonData): Promise<ImportSummary | null> => {
    const resp = await post<ImportSummary>('/api/v1/transfer/import', data as unknown as Record<string, unknown>)
    return resp.data || null
  },

  importFile: async (file: File): Promise<ImportSummary | null> => {
    const formData = new FormData()
    formData.append('file', file)

    const resp = await upload<ImportSummary>('/api/v1/transfer/import', formData)
    return resp.data || null
  },

  migrate: async (params: MigrateParams): Promise<MigrateSummary | null> => {
    const resp = await post<MigrateSummary>('/api/v1/transfer/migrate', params as unknown as Record<string, unknown>)
    return resp.data || null
  },

  getExportTree: async (): Promise<ExportTreeEnvironment[]> => {
    const resp = await get<ExportTreeData>('/api/v1/transfer/export-tree')
    return resp.data?.environments || []
  },

  exportSelective: async (params: ExportSelectiveParams): Promise<Blob> => {
    const response = await fetch(buildApiUrl('/api/v1/transfer/export'), {
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

  importPreview: async (file: File): Promise<ImportPreviewData | null> => {
    const formData = new FormData()
    formData.append('file', file)

    const resp = await upload<ImportPreviewData>('/api/v1/transfer/import-preview', formData)
    return resp.data || null
  },

  importSelective: async (
    file: File,
    selections: ExportSelection[],
    overwrite: boolean
  ): Promise<ImportSummary | null> => {
    const formData = new FormData()
    formData.append('file', file)
    formData.append('selections', JSON.stringify(selections))
    formData.append('overwrite', String(overwrite))

    const resp = await upload<ImportSummary>('/api/v1/transfer/import-selective', formData)
    return resp.data || null
  },
}
