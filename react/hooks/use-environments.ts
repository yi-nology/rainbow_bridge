import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import { environmentApi } from '../lib/api/environment'
import { pipelineApi } from '../lib/api/pipeline'
import { runtimeApi } from '../lib/api/runtime'
import {
  fromApiEnvironment,
  fromApiPipeline,
  toApiEnvironment,
  toApiPipeline,
  fromApiEnvironmentOverview,
} from '../lib/api/transformers'
import type { Environment, Pipeline } from '../lib/types'
import { toast } from 'sonner'

// 获取运行时概览（包含环境和渠道）
export function useRuntimeOverview() {
  return useQuery({
    queryKey: ['runtime', 'overview'],
    queryFn: async () => {
      const response = await runtimeApi.overview()
      return response.list.map(fromApiEnvironmentOverview)
    },
  })
}

// 获取环境列表
export function useEnvironments() {
  return useQuery({
    queryKey: ['environments'],
    queryFn: async () => {
      const response = await environmentApi.list()
      return response.list.map((env) => fromApiEnvironment(env))
    },
  })
}

// 获取渠道列表
export function usePipelines(environmentKey: string | undefined) {
  return useQuery({
    queryKey: ['pipelines', environmentKey],
    queryFn: async () => {
      if (!environmentKey) return []
      const response = await pipelineApi.list(environmentKey)
      return response.list.map(fromApiPipeline)
    },
    enabled: !!environmentKey,
  })
}

// 创建环境
export function useCreateEnvironment() {
  const queryClient = useQueryClient()

  return useMutation({
    mutationFn: async (env: { key: string; name: string }) => {
      const apiEnv = toApiEnvironment(env)
      return environmentApi.create(apiEnv)
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['environments'] })
      queryClient.invalidateQueries({ queryKey: ['runtime', 'overview'] })
      toast.success('环境创建成功')
    },
  })
}

// 更新环境
export function useUpdateEnvironment() {
  const queryClient = useQueryClient()

  return useMutation({
    mutationFn: async (env: { key: string; name: string }) => {
      const apiEnv = toApiEnvironment(env)
      return environmentApi.update(apiEnv)
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['environments'] })
      queryClient.invalidateQueries({ queryKey: ['runtime', 'overview'] })
      toast.success('环境更新成功')
    },
  })
}

// 删除环境
export function useDeleteEnvironment() {
  const queryClient = useQueryClient()

  return useMutation({
    mutationFn: async (environmentKey: string) => {
      return environmentApi.delete(environmentKey)
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['environments'] })
      queryClient.invalidateQueries({ queryKey: ['runtime', 'overview'] })
      toast.success('环境删除成功')
    },
  })
}

// 创建渠道
export function useCreatePipeline() {
  const queryClient = useQueryClient()

  return useMutation({
    mutationFn: async ({
      environmentKey,
      pipeline,
    }: {
      environmentKey: string
      pipeline: { key: string; name: string }
    }) => {
      const apiPipeline = toApiPipeline(pipeline, environmentKey)
      return pipelineApi.create(apiPipeline)
    },
    onSuccess: (_, variables) => {
      queryClient.invalidateQueries({
        queryKey: ['pipelines', variables.environmentKey],
      })
      queryClient.invalidateQueries({ queryKey: ['runtime', 'overview'] })
      toast.success('渠道创建成功')
    },
  })
}

// 更新渠道
export function useUpdatePipeline() {
  const queryClient = useQueryClient()

  return useMutation({
    mutationFn: async ({
      environmentKey,
      pipeline,
    }: {
      environmentKey: string
      pipeline: { key: string; name: string }
    }) => {
      const apiPipeline = toApiPipeline(pipeline, environmentKey)
      return pipelineApi.update(apiPipeline)
    },
    onSuccess: (_, variables) => {
      queryClient.invalidateQueries({
        queryKey: ['pipelines', variables.environmentKey],
      })
      queryClient.invalidateQueries({ queryKey: ['runtime', 'overview'] })
      toast.success('渠道更新成功')
    },
  })
}

// 删除渠道
export function useDeletePipeline() {
  const queryClient = useQueryClient()

  return useMutation({
    mutationFn: async ({
      environmentKey,
      pipelineKey,
    }: {
      environmentKey: string
      pipelineKey: string
    }) => {
      return pipelineApi.delete(environmentKey, pipelineKey)
    },
    onSuccess: (_, variables) => {
      queryClient.invalidateQueries({
        queryKey: ['pipelines', variables.environmentKey],
      })
      queryClient.invalidateQueries({ queryKey: ['runtime', 'overview'] })
      toast.success('渠道删除成功')
    },
  })
}
