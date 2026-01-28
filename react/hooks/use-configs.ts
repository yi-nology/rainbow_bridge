import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import { configApi, type ListConfigParams } from '../lib/api/config'
import { fromApiConfig, toApiConfig } from '../lib/api/transformers'
import type { ConfigItem, ConfigType } from '../lib/types'
import { toast } from 'sonner'

// 获取配置列表
export function useConfigs(
  environmentKey: string | undefined,
  pipelineKey: string | undefined,
  options?: { type?: string }
) {
  return useQuery({
    queryKey: ['configs', environmentKey, pipelineKey, options?.type],
    queryFn: async () => {
      if (!environmentKey || !pipelineKey) return []
      
      const params: ListConfigParams = {
        environment_key: environmentKey,
        pipeline_key: pipelineKey,
      }
      
      if (options?.type) {
        params.type = options.type
      }
      
      const response = await configApi.list(params)
      return response.list.map(fromApiConfig)
    },
    enabled: !!environmentKey && !!pipelineKey,
  })
}

// 获取配置详情
export function useConfigDetail(
  environmentKey: string | undefined,
  pipelineKey: string | undefined,
  resourceKey: string | undefined
) {
  return useQuery({
    queryKey: ['config', environmentKey, pipelineKey, resourceKey],
    queryFn: async () => {
      if (!environmentKey || !pipelineKey || !resourceKey) return null
      const response = await configApi.detail(
        environmentKey,
        pipelineKey,
        resourceKey
      )
      return response.config ? fromApiConfig(response.config) : null
    },
    enabled: !!environmentKey && !!pipelineKey && !!resourceKey,
  })
}

// 创建配置
export function useCreateConfig() {
  const queryClient = useQueryClient()

  return useMutation({
    mutationFn: async (config: {
      name: string
      alias?: string
      type: ConfigType
      content: string
      environmentId: string
      pipelineId: string
    }) => {
      const apiConfig = toApiConfig({
        name: config.name,
        alias: config.alias,
        type: config.type,
        content: config.content,
        environmentId: config.environmentId,
        pipelineId: config.pipelineId,
      })
      return configApi.create(apiConfig)
    },
    onSuccess: (_, variables) => {
      queryClient.invalidateQueries({
        queryKey: ['configs', variables.environmentId, variables.pipelineId],
      })
      toast.success('配置创建成功')
    },
  })
}

// 更新配置
export function useUpdateConfig() {
  const queryClient = useQueryClient()

  return useMutation({
    mutationFn: async (config: {
      id: string
      name: string
      alias?: string
      type: ConfigType
      content: string
      environmentId: string
      pipelineId: string
    }) => {
      const apiConfig = toApiConfig({
        id: config.id,
        name: config.name,
        alias: config.alias,
        type: config.type,
        content: config.content,
        environmentId: config.environmentId,
        pipelineId: config.pipelineId,
      })
      return configApi.update(apiConfig)
    },
    onSuccess: (_, variables) => {
      queryClient.invalidateQueries({
        queryKey: ['configs', variables.environmentId, variables.pipelineId],
      })
      toast.success('配置更新成功')
    },
  })
}

// 删除配置
export function useDeleteConfig() {
  const queryClient = useQueryClient()

  return useMutation({
    mutationFn: async ({
      environmentKey,
      pipelineKey,
      resourceKey,
    }: {
      environmentKey: string
      pipelineKey: string
      resourceKey: string
    }) => {
      return configApi.delete(environmentKey, pipelineKey, resourceKey)
    },
    onSuccess: (_, variables) => {
      queryClient.invalidateQueries({
        queryKey: ['configs', variables.environmentKey, variables.pipelineKey],
      })
      toast.success('配置删除成功')
    },
  })
}
