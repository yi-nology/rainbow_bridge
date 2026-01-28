import { get, upload, getBasePath } from './client'
import type { AssetListResponse, UploadAssetResponse } from './types'

const BASE_PATH = `${getBasePath()}/api/v1/asset`

export const assetApi = {
  // 获取资源列表
  list: async (environmentKey: string, pipelineKey: string) => {
    const resp = await get<AssetListResponse>(`${BASE_PATH}/list`, {
      environment_key: environmentKey,
      pipeline_key: pipelineKey,
    })
    return { total: resp.data?.total || 0, list: resp.data?.list || [] }
  },

  // 上传资源
  upload: async (
    file: File,
    environmentKey: string,
    pipelineKey: string,
    remark?: string
  ) => {
    const formData = new FormData()
    formData.append('file', file)
    formData.append('environment_key', environmentKey)
    formData.append('pipeline_key', pipelineKey)
    if (remark) {
      formData.append('remark', remark)
    }

    const resp = await upload<UploadAssetResponse>(`${BASE_PATH}/upload`, formData)
    return {
      asset: resp.data?.asset || null,
      reference: resp.data?.reference || '',
    }
  },

  // 获取文件 URL
  getFileUrl: (fileId: string): string => {
    const apiBaseUrl = process.env.NEXT_PUBLIC_API_BASE_URL || ''
    const baseUrl = apiBaseUrl || (typeof window !== 'undefined' ? window.location.origin : '')
    return `${baseUrl}${BASE_PATH}/file/${fileId}`
  },
}
