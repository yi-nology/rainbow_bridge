import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import { assetApi } from '../lib/api/asset'
import { fromApiAsset, type Asset } from '../lib/api/transformers'
import { toast } from 'sonner'

// 获取资源列表
export function useAssets(
  environmentKey: string | undefined,
  pipelineKey: string | undefined
) {
  return useQuery({
    queryKey: ['assets', environmentKey, pipelineKey],
    queryFn: async () => {
      if (!environmentKey || !pipelineKey) return []
      const response = await assetApi.list(environmentKey, pipelineKey)
      return (response.list || []).map(fromApiAsset)
    },
    enabled: !!environmentKey && !!pipelineKey,
  })
}

// 上传资源
export function useUploadAsset() {
  const queryClient = useQueryClient()

  return useMutation({
    mutationFn: async ({
      file,
      environmentKey,
      pipelineKey,
      remark,
    }: {
      file: File
      environmentKey: string
      pipelineKey: string
      remark?: string
    }) => {
      return assetApi.upload(file, environmentKey, pipelineKey, remark)
    },
    onSuccess: (_, variables) => {
      queryClient.invalidateQueries({
        queryKey: ['assets', variables.environmentKey, variables.pipelineKey],
      })
      toast.success('文件上传成功')
    },
  })
}

// 获取文件 URL
export function getAssetUrl(fileId: string): string {
  return assetApi.getFileUrl(fileId)
}
