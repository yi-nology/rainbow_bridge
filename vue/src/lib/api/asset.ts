import { BaseApiService } from './base-api'
import { apiClient } from './client'
import { toCamelCase } from '../utils'
import type { FileAsset, UploadAssetResponse } from './types'
import { assertScope, readScope } from '@/lib/scope'
import { ApiError } from './error'
import type { AssetDeleteResult } from './asset-delete'

class AssetApiService extends BaseApiService<FileAsset> {
  protected baseUrl = '/api/v1/asset'

  protected getIdParamName(): string {
    return 'file_id'
  }

  async removeInScope(fileId: string, environmentKey: string, pipelineKey: string, expectedScopeId: string): Promise<AssetDeleteResult> {
    assertScope(environmentKey, pipelineKey, expectedScopeId)
    const response = await apiClient.post<AssetDeleteResult>('/api/v1/asset/delete', {
      file_id: fileId, environment_key: environmentKey, pipeline_key: pipelineKey, expected_scope_id: expectedScopeId,
    }, { showErrorToast: false })
    assertScope(environmentKey, pipelineKey, expectedScopeId)
    if (response.data?.file_id !== fileId || response.data.deleted !== true || typeof response.data.already_deleted !== 'boolean') {
      throw new ApiError(502, '删除结果未确认，请刷新资源列表核对。')
    }
    return response.data
  }

  // 重写list方法，因为需要环境和管道key参数
  async list(params: { environmentKey: string; pipelineKey: string; scopeId?: string }): Promise<{ total: number; list: FileAsset[] }> {
    return readScope(params.environmentKey, params.pipelineKey, scopeId => super.list({ ...params, scopeId }), params.scopeId)
  }

  // 上传文件
  async upload(
    file: File,
    environmentKey: string,
    pipelineKey: string,
    expectedScopeId: string,
    remark?: string
  ) {
    assertScope(environmentKey, pipelineKey, expectedScopeId)
    const formData = new FormData()
    formData.append('file', file)
    formData.append('environment_key', environmentKey)
    formData.append('pipeline_key', pipelineKey)
    formData.append('expected_scope_id', expectedScopeId)
    if (remark) {
      formData.append('remark', remark)
    }

    const resp = await apiClient.upload<UploadAssetResponse['data']>('/api/v1/asset/upload', formData)
    const asset = resp.data?.asset
    const camelCaseAsset = asset ? toCamelCase(asset) as unknown as FileAsset : null
    return {
      asset: camelCaseAsset,
      reference: resp.data?.reference || '',
    }
  }

  // 获取文件URL
  getFileUrl(fileId: string): string {
    return `/api/v1/asset/file/${fileId}`
  }
}

export const assetApi = new AssetApiService()

