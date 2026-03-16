import { get, upload } from './client'
import type { ListData, ApiFileAsset, UploadAssetResponse } from './types'

export const assetApi = {
  list: async (environmentKey: string, pipelineKey: string) => {
    const resp = await get<ListData<ApiFileAsset>>('/api/v1/asset/list', {
      environment_key: environmentKey,
      pipeline_key: pipelineKey,
    })
    return { total: resp.data?.total || 0, list: resp.data?.list || [] }
  },

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

    const resp = await upload<UploadAssetResponse['data']>('/api/v1/asset/upload', formData)
    return {
      asset: resp.data?.asset || null,
      reference: resp.data?.reference || '',
    }
  },

  getFileUrl: (fileId: string): string => {
    return `/api/v1/asset/file/${fileId}`
  },
}
