import { defineStore } from 'pinia'
import { ref } from 'vue'
import { assetApi } from '@/lib/api/asset'
import { fromApiAsset } from '@/lib/api/transformers'
import type { Asset } from '@/lib/api/transformers'
import { toast } from 'vue-sonner'

export const useAssetStore = defineStore('asset', () => {
  const assets = ref<Asset[]>([])
  const loading = ref(false)
  const error = ref<string | null>(null)

  const fetchAssets = async (environmentKey: string, pipelineKey: string) => {
    loading.value = true
    error.value = null
    try {
      const response = await assetApi.list(environmentKey, pipelineKey)
      assets.value = response.list.map(fromApiAsset)
    } catch (e) {
      error.value = e instanceof Error ? e.message : '获取资源列表失败'
      toast.error(error.value)
    } finally {
      loading.value = false
    }
  }

  const uploadAsset = async (
    file: File,
    environmentKey: string,
    pipelineKey: string
  ): Promise<Asset | null> => {
    try {
      const result = await assetApi.upload(file, environmentKey, pipelineKey)
      await fetchAssets(environmentKey, pipelineKey)
      toast.success('资源上传成功')
      return result.asset ? fromApiAsset(result.asset) : null
    } catch (e) {
      const message = e instanceof Error ? e.message : '上传资源失败'
      toast.error(message)
      throw e
    }
  }

  return {
    assets,
    loading,
    error,
    fetchAssets,
    uploadAsset,
    getAssetUrl: assetApi.getFileUrl,
  }
})
