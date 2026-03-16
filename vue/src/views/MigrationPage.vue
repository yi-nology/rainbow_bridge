<script setup lang="ts">
import { ref, computed, onMounted } from 'vue'
import AppSidebar from '@/components/AppSidebar.vue'
import { Button } from '@/components/ui/button'
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/card'
import { Select, SelectTrigger, SelectValue, SelectContent, SelectItem } from '@/components/ui/select'
import { Badge } from '@/components/ui/badge'
import { Checkbox } from '@/components/ui/checkbox'
import { Alert, AlertDescription, AlertTitle } from '@/components/ui/alert'
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table'
import { ArrowRight, Check, AlertCircle, Loader2 } from 'lucide-vue-next'
import { useEnvironmentStore } from '@/stores/environment'
import { transferApi } from '@/lib/api/transfer'
import { configApi } from '@/lib/api/config'
import { fromApiConfig } from '@/lib/api/transformers'
import { toast } from 'vue-sonner'
import type { ConfigItem, ConfigType, Environment } from '@/lib/types'

type MigrationStatus = 'idle' | 'previewing' | 'migrating' | 'success' | 'error'

interface MigrationConfig {
  id: string
  name: string
  alias: string
  type: ConfigType
  sourceValue: string
  targetValue: string | null
  hasConflict: boolean
  isNew: boolean
}

const environmentStore = useEnvironmentStore()

const sourceEnvKey = ref('')
const sourcePipelineKey = ref('')
const targetEnvKey = ref('')
const targetPipelineKey = ref('')
const selectedConfigs = ref<string[]>([])
const status = ref<MigrationStatus>('idle')
const previewData = ref<MigrationConfig[]>([])
const overwriteConflicts = ref(false)
const sourceConfigs = ref<ConfigItem[]>([])

onMounted(() => {
  environmentStore.fetchOverview()
})

const sourceEnvironment = computed(() =>
  environmentStore.environments.find((e: Environment) => e.key === sourceEnvKey.value)
)

const sourcePipelines = computed(() => sourceEnvironment.value?.pipelines || [])

const targetEnvironment = computed(() =>
  environmentStore.environments.find((e: Environment) => e.key === targetEnvKey.value)
)

const targetPipelines = computed(() => targetEnvironment.value?.pipelines || [])

const conflictCount = computed(() =>
  previewData.value.filter((p) => p.hasConflict && selectedConfigs.value.includes(p.id)).length
)

const newCount = computed(() =>
  previewData.value.filter((p) => p.isNew && selectedConfigs.value.includes(p.id)).length
)

const handlePreview = async () => {
  if (!sourceEnvKey.value || !sourcePipelineKey.value || !targetEnvKey.value || !targetPipelineKey.value) return

  status.value = 'previewing'

  try {
    const sourceResponse = await configApi.list({
      environment_key: sourceEnvKey.value,
      pipeline_key: sourcePipelineKey.value,
    })
    const sourceList = (sourceResponse.list || []).map(fromApiConfig)
    sourceConfigs.value = sourceList

    const targetResponse = await configApi.list({
      environment_key: targetEnvKey.value,
      pipeline_key: targetPipelineKey.value,
    })
    const targetList = (targetResponse.list || []).map(fromApiConfig)
    const targetMap: Map<string, ConfigItem> = new Map(targetList.map((c: ConfigItem) => [c.name, c]))

    const preview: MigrationConfig[] = sourceList.map((config: ConfigItem) => {
      const targetConfig = targetMap.get(config.name)
      const hasConflict = targetConfig !== undefined && targetConfig.content !== config.content
      const isNew = targetConfig === undefined

      return {
        id: config.id,
        name: config.name,
        alias: config.alias,
        type: config.type,
        sourceValue: config.content,
        targetValue: targetConfig ? targetConfig.content : null,
        hasConflict,
        isNew,
      }
    })

    previewData.value = preview
    selectedConfigs.value = preview.map((p) => p.id)
    status.value = 'idle'
  } catch (error) {
    status.value = 'error'
    toast.error('获取配置失败，请重试')
  }
}

const handleMigrate = async () => {
  if (selectedConfigs.value.length === 0) return

  const hasConflicts = previewData.value.some((p) => p.hasConflict && selectedConfigs.value.includes(p.id))
  if (hasConflicts && !overwriteConflicts.value) {
    return
  }

  status.value = 'migrating'

  try {
    const selectedResourceKeys = sourceConfigs.value
      .filter((c: ConfigItem) => selectedConfigs.value.includes(c.id))
      .map((c: ConfigItem) => c.id)

    const result = await transferApi.migrate({
      source_environment_key: sourceEnvKey.value,
      source_pipeline_key: sourcePipelineKey.value,
      target_environment_key: targetEnvKey.value,
      target_pipeline_key: targetPipelineKey.value,
      resource_keys: selectedResourceKeys,
      overwrite: overwriteConflicts.value,
    })

    if (result) {
      const { succeeded, skipped, items } = result
      const failed = items?.filter(item => item.status === 'failed').length || 0

      if (failed === 0) {
        status.value = 'success'
        toast.success(`成功迁移 ${succeeded} 个配置${skipped > 0 ? `，跳过 ${skipped} 个` : ''}`)
      } else {
        status.value = 'error'
        toast.error(`部分配置迁移失败：成功 ${succeeded}，跳过 ${skipped}，失败 ${failed}`)
      }
    } else {
      status.value = 'error'
      toast.error('迁移失败，请重试')
    }
  } catch (error) {
    status.value = 'error'
    toast.error('迁移失败，请重试')
  }
}

const handleReset = () => {
  sourceEnvKey.value = ''
  sourcePipelineKey.value = ''
  targetEnvKey.value = ''
  targetPipelineKey.value = ''
  selectedConfigs.value = []
  previewData.value = []
  sourceConfigs.value = []
  status.value = 'idle'
  overwriteConflicts.value = false
}

const toggleConfig = (id: string) => {
  if (selectedConfigs.value.includes(id)) {
    selectedConfigs.value = selectedConfigs.value.filter((c) => c !== id)
  } else {
    selectedConfigs.value = [...selectedConfigs.value, id]
  }
}

const toggleAll = () => {
  if (selectedConfigs.value.length === previewData.value.length) {
    selectedConfigs.value = []
  } else {
    selectedConfigs.value = previewData.value.map((p) => p.id)
  }
}

const handleSourceEnvChange = (v: string) => {
  sourceEnvKey.value = v
  sourcePipelineKey.value = ''
  previewData.value = []
}

const handleTargetEnvChange = (v: string) => {
  targetEnvKey.value = v
  targetPipelineKey.value = ''
  previewData.value = []
}

const handleSourcePipelineChange = (v: string) => {
  sourcePipelineKey.value = v
  previewData.value = []
}

const handleTargetPipelineChange = (v: string) => {
  targetPipelineKey.value = v
  previewData.value = []
}
</script>

<template>
  <div class="flex min-h-screen">
    <AppSidebar />
    <main class="flex-1 p-8 overflow-auto">
      <div class="max-w-5xl mx-auto space-y-6">
        <div class="mb-8">
          <h1 class="text-2xl font-bold tracking-tight">配置迁移</h1>
          <p class="text-muted-foreground mt-1">
            在不同环境和渠道之间迁移配置项
          </p>
        </div>

        <Card v-if="status === 'success'">
          <CardContent class="pt-6">
            <div class="text-center py-12">
              <div class="w-16 h-16 rounded-full bg-emerald-100 dark:bg-emerald-900/30 flex items-center justify-center mx-auto mb-4">
                <Check class="w-8 h-8 text-emerald-600" />
              </div>
              <h3 class="text-lg font-medium text-foreground mb-2">
                迁移完成
              </h3>
              <p class="text-muted-foreground mb-6">
                已成功迁移 {{ selectedConfigs.length }} 个配置项
              </p>
              <Button @click="handleReset">开始新的迁移</Button>
            </div>
          </CardContent>
        </Card>

        <template v-else>
          <Card>
            <CardHeader>
              <CardTitle class="text-base">选择源和目标</CardTitle>
              <CardDescription>
                选择要迁移配置的源环境/渠道和目标环境/渠道
              </CardDescription>
            </CardHeader>
            <CardContent>
              <div class="flex items-center gap-4">
                <div class="flex-1 space-y-3">
                  <p class="text-sm font-medium text-foreground">源</p>
                  <div class="grid grid-cols-2 gap-3">
                    <Select :model-value="sourceEnvKey" @update:model-value="handleSourceEnvChange" :disabled="environmentStore.loading">
                      <SelectTrigger>
                        <SelectValue :placeholder="environmentStore.loading ? '加载中...' : '选择环境'" />
                      </SelectTrigger>
                      <SelectContent>
                        <SelectItem v-for="env in environmentStore.environments" :key="env.key" :value="env.key">
                          {{ env.name }}
                        </SelectItem>
                      </SelectContent>
                    </Select>
                    <Select :model-value="sourcePipelineKey" @update:model-value="handleSourcePipelineChange" :disabled="!sourceEnvKey">
                      <SelectTrigger>
                        <SelectValue placeholder="选择渠道" />
                      </SelectTrigger>
                      <SelectContent>
                        <SelectItem v-for="pipeline in sourcePipelines" :key="pipeline.key" :value="pipeline.key">
                          {{ pipeline.name }}
                        </SelectItem>
                      </SelectContent>
                    </Select>
                  </div>
                </div>

                <div class="flex items-center justify-center w-12 h-12 rounded-full bg-muted mt-6">
                  <ArrowRight class="w-5 h-5 text-muted-foreground" />
                </div>

                <div class="flex-1 space-y-3">
                  <p class="text-sm font-medium text-foreground">目标</p>
                  <div class="grid grid-cols-2 gap-3">
                    <Select :model-value="targetEnvKey" @update:model-value="handleTargetEnvChange" :disabled="environmentStore.loading">
                      <SelectTrigger>
                        <SelectValue :placeholder="environmentStore.loading ? '加载中...' : '选择环境'" />
                      </SelectTrigger>
                      <SelectContent>
                        <SelectItem v-for="env in environmentStore.environments" :key="env.key" :value="env.key">
                          {{ env.name }}
                        </SelectItem>
                      </SelectContent>
                    </Select>
                    <Select :model-value="targetPipelineKey" @update:model-value="handleTargetPipelineChange" :disabled="!targetEnvKey">
                      <SelectTrigger>
                        <SelectValue placeholder="选择渠道" />
                      </SelectTrigger>
                      <SelectContent>
                        <SelectItem v-for="pipeline in targetPipelines" :key="pipeline.key" :value="pipeline.key">
                          {{ pipeline.name }}
                        </SelectItem>
                      </SelectContent>
                    </Select>
                  </div>
                </div>
              </div>

              <div class="mt-6 flex justify-end">
                <Button
                  @click="handlePreview"
                  :disabled="!sourceEnvKey || !sourcePipelineKey || !targetEnvKey || !targetPipelineKey || status === 'previewing'"
                >
                  <Loader2 v-if="status === 'previewing'" class="w-4 h-4 mr-2 animate-spin" />
                  {{ status === 'previewing' ? '预览中...' : '预览变更' }}
                </Button>
              </div>
            </CardContent>
          </Card>

          <Card v-if="previewData.length > 0">
            <CardHeader>
              <div class="flex items-center justify-between">
                <div>
                  <CardTitle class="text-base">变更预览</CardTitle>
                  <CardDescription>
                    共 {{ previewData.length }} 个配置项，已选择 {{ selectedConfigs.length }} 个
                    <span v-if="newCount > 0" class="text-emerald-600 dark:text-emerald-500">，{{ newCount }} 个新增</span>
                    <span v-if="conflictCount > 0" class="text-amber-600 dark:text-amber-500">，{{ conflictCount }} 个存在冲突</span>
                  </CardDescription>
                </div>
                <Button variant="outline" size="sm" @click="toggleAll" class="bg-transparent">
                  {{ selectedConfigs.length === previewData.length ? '取消全选' : '全选' }}
                </Button>
              </div>
            </CardHeader>
            <CardContent>
              <div class="border border-border rounded-lg overflow-hidden">
                <Table>
                  <TableHeader>
                    <TableRow>
                      <TableHead class="w-12" />
                      <TableHead>配置名</TableHead>
                      <TableHead>别名</TableHead>
                      <TableHead>类型</TableHead>
                      <TableHead>状态</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    <TableRow
                      v-for="config in previewData"
                      :key="config.id"
                      :class="config.hasConflict ? 'bg-amber-50 dark:bg-amber-900/10' : config.isNew ? 'bg-emerald-50 dark:bg-emerald-900/10' : ''"
                    >
                      <TableCell>
                        <Checkbox
                          :model-value="selectedConfigs.includes(config.id)"
                          @update:model-value="() => toggleConfig(config.id)"
                        />
                      </TableCell>
                      <TableCell class="font-mono text-sm">{{ config.name }}</TableCell>
                      <TableCell>{{ config.alias }}</TableCell>
                      <TableCell>
                        <Badge variant="secondary">{{ config.type }}</Badge>
                      </TableCell>
                      <TableCell>
                        <Badge v-if="config.isNew" variant="outline" class="border-emerald-500 text-emerald-600 dark:text-emerald-500">
                          新增
                        </Badge>
                        <Badge v-else-if="config.hasConflict" variant="outline" class="border-amber-500 text-amber-600 dark:text-amber-500">
                          值不同
                        </Badge>
                        <Badge v-else variant="outline" class="border-gray-400 text-gray-500">
                          无变更
                        </Badge>
                      </TableCell>
                    </TableRow>
                  </TableBody>
                </Table>
              </div>

              <div class="mt-4 p-4 bg-muted/50 rounded-lg space-y-3">
                <div class="flex items-center gap-2">
                  <Checkbox
                    id="overwrite"
                    :model-value="overwriteConflicts"
                    @update:model-value="(v: boolean) => overwriteConflicts = v"
                  />
                  <label for="overwrite" class="text-sm text-foreground cursor-pointer">
                    覆盖目标环境中已存在的不同值
                  </label>
                </div>
              </div>

              <Alert v-if="conflictCount > 0 && !overwriteConflicts" variant="destructive" class="mt-4">
                <AlertCircle class="h-4 w-4" />
                <AlertTitle>存在冲突</AlertTitle>
                <AlertDescription>
                  {{ conflictCount }} 个配置项在目标环境中已存在不同的值。
                  请勾选"覆盖"以继续，或取消选择这些配置项。
                </AlertDescription>
              </Alert>

              <div class="mt-6 flex items-center justify-between">
                <Button variant="outline" @click="handleReset" class="bg-transparent">
                  重置
                </Button>
                <Button
                  @click="handleMigrate"
                  :disabled="selectedConfigs.length === 0 || status === 'migrating' || (conflictCount > 0 && !overwriteConflicts)"
                >
                  <Loader2 v-if="status === 'migrating'" class="w-4 h-4 mr-2 animate-spin" />
                  {{ status === 'migrating' ? '迁移中...' : `迁移 ${selectedConfigs.length} 个配置` }}
                </Button>
              </div>
            </CardContent>
          </Card>
        </template>
      </div>
    </main>
  </div>
</template>
