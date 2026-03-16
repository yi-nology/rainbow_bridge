export interface ApiResponse<T = unknown> {
  code: number
  msg: string
  error?: string
  data?: T
}

export interface OperateResponse {
  code: number
  msg: string
  error?: string
}

export interface ListData<T> {
  total: number
  list: T[]
}

export interface ApiEnvironment {
  environment_key: string
  environment_name: string
  description: string
  sort_order: number
  is_active: boolean
}

export interface ApiPipeline {
  environment_key: string
  pipeline_key: string
  pipeline_name: string
  description: string
  sort_order: number
  is_active: boolean
}

export interface ApiResourceConfig {
  resource_key: string
  alias: string
  name: string
  environment_key: string
  pipeline_key: string
  content: string
  type: string
  remark: string
  is_perm: boolean
}

export interface ApiFileAsset {
  file_id: string
  environment_key: string
  pipeline_key: string
  file_name: string
  content_type: string
  file_size: number
  url: string
  remark: string
}

export interface ApiPipelineOverview {
  pipeline_key: string
  pipeline_name: string
}

export interface ApiEnvironmentOverview {
  environment_key: string
  environment_name: string
  pipelines: ApiPipelineOverview[]
}

export interface EnvironmentListResponse extends ApiResponse<ListData<ApiEnvironment>> {}
export interface EnvironmentResponse extends ApiResponse<{ environment: ApiEnvironment }> {}
export interface EnvironmentDetailResponse extends ApiResponse<{ environment: ApiEnvironment }> {}
export interface DeleteEnvironmentResponse extends ApiResponse<null> {}

export interface PipelineListResponse extends ApiResponse<ListData<ApiPipeline>> {}
export interface PipelineResponse extends ApiResponse<{ pipeline: ApiPipeline }> {}
export interface PipelineDetailResponse extends ApiResponse<{ pipeline: ApiPipeline }> {}
export interface DeletePipelineResponse extends ApiResponse<null> {}

export interface ConfigListResponse extends ApiResponse<ListData<ApiResourceConfig>> {}
export interface ConfigResponse extends ApiResponse<{ config: ApiResourceConfig }> {}
export interface ConfigDetailResponse extends ApiResponse<{ config: ApiResourceConfig }> {}
export interface DeleteConfigResponse extends ApiResponse<null> {}

export interface AssetListResponse extends ApiResponse<ListData<ApiFileAsset>> {}
export interface UploadAssetResponse extends ApiResponse<{ asset: ApiFileAsset; reference: string }> {}

export interface RuntimeOverviewResponse extends ApiResponse<ListData<ApiEnvironmentOverview>> {}
export interface RuntimeConfigData {
  configs: ApiResourceConfig[]
  environment: {
    environment_key: string
    environment_name: string
    pipeline_key: string
    pipeline_name: string
  }
}
export interface RuntimeConfigResponse extends ApiResponse<RuntimeConfigData> {}

export interface ImportSummaryItem {
  resource_key: string
  environment_key: string
  pipeline_key: string
  name: string
  alias: string
  type: string
}

export interface ImportSummary {
  total: number
  environment_keys: string[]
  pipeline_keys: string[]
  items: ImportSummaryItem[]
}

export interface ImportResponse extends ApiResponse<ImportSummary> {}
