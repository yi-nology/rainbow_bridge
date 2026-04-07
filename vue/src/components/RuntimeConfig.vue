<script setup lang="ts">
import { ref, computed, onMounted, watch } from 'vue'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import { Badge } from '@/components/ui/badge'
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select'
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@/components/ui/table'
import { Copy, Check, RefreshCw, Download, Loader2 } from 'lucide-vue-next'
import { useEnvironmentStore } from '@/stores/environment'
import { runtimeApi } from '@/lib/api/runtime'
import { CONFIG_TYPE_META, type ConfigItem, type ConfigType } from '@/lib/types'
import { toast } from 'vue-sonner'

const environmentStore = useEnvironmentStore()

const selectedEnv = ref<string>('')
const selectedPipeline = ref<string>('')
const configs = ref<ConfigItem[]>([])
const loading = ref(false)
const copiedId = ref<string | null>(null)
const exporting = ref(false)

const environments = computed(() => environmentStore.environments)

const selectedEnvData = computed(() => 
  environments.value.find(e => e.key === selectedEnv.value)
)

const pipelines = computed(() => selectedEnvData.value?.pipelines || [])

const fetchConfigs = async () => {
  if (!selectedEnv.value || !selectedPipeline.value) {
    configs.value = []
    return
  }
  
  loading.value = true
  try {
    const response = await runtimeApi.config(selectedEnv.value, selectedPipeline.value)
    if (response?.configs) {
      configs.value = response.configs.map(config => ({
        id: config.resource_key,
        name: config.name,
        alias: config.alias,
        type: config.type as ConfigType,
        content: typeof config.content === 'object' ? JSON.stringify(config.content, null, 2) : config.content,
        environmentId: config.environment_key,
        pipelineId: config.pipeline_key,
        createdAt: new Date().toISOString(),
        updatedAt: new Date().toISOString()
      }))
    } else {
      configs.value = []
    }
  } catch (e) {
    console.error('获取配置列表失败:', e)
    toast.error('获取配置列表失败')
  } finally {
    loading.value = false
  }
}

const handleEnvChange = (value: string) => {
  selectedEnv.value = value
  selectedPipeline.value = ''
  configs.value = []
}

const handlePipelineChange = (value: string) => {
  selectedPipeline.value = value
}

const handleRefresh = () => {
  fetchConfigs()
}

const handleExport = async () => {
  if (!selectedEnv.value || !selectedPipeline.value) return
  
  setExporting(true)
  try {
    const blob = await runtimeApi.exportStatic(selectedEnv.value, selectedPipeline.value)
    const url = URL.createObjectURL(blob)
    const a = document.createElement('a')
    a.href = url
    a.download = `config-${selectedEnv.value}-${selectedPipeline.value}.zip`
    a.click()
    URL.revokeObjectURL(url)
    toast.success('导出成功')
  } catch {
    const data = JSON.stringify(configs.value, null, 2)
    const blob = new Blob([data], { type: 'application/json' })
    const url = URL.createObjectURL(blob)
    const a = document.createElement('a')
    a.href = url
    a.download = `config-${selectedEnv.value}-${selectedPipeline.value}.json`
    a.click()
    URL.revokeObjectURL(url)
    toast.success('已导出为 JSON 格式')
  } finally {
    setExporting(false)
  }
}

const setExporting = (value: boolean) => {
  exporting.value = value
}

const handleCopy = async (content: string, id: string) => {
  await navigator.clipboard.writeText(content)
  copiedId.value = id
  toast.success('已复制到剪贴板')
  setTimeout(() => {
    copiedId.value = null
  }, 2000)
}

watch(selectedPipeline, () => {
  if (selectedPipeline.value) {
    fetchConfigs()
  }
})

onMounted(() => {
  environmentStore.fetchOverview()
})
</script>

<template>
  <Card>
    <CardHeader>
      <CardTitle class="text-lg">运行时配置</CardTitle>
    </CardHeader>
    <CardContent class="space-y-4">
      <div class="flex flex-wrap items-end gap-4">
        <div class="space-y-2">
          <label class="text-sm font-medium text-foreground">环境:</label>
          <Select 
            :model-value="selectedEnv" 
            @update:model-value="handleEnvChange"
            :disabled="environmentStore.loading"
          >
            <SelectTrigger class="w-48">
              <SelectValue :placeholder="environmentStore.loading ? '加载中...' : '选择环境'" />
            </SelectTrigger>
            <SelectContent>
              <SelectItem 
                v-for="env in environments" 
                :key="env.key" 
                :value="env.key"
              >
                {{ env.name }}
              </SelectItem>
            </SelectContent>
          </Select>
        </div>

        <div class="space-y-2">
          <label class="text-sm font-medium text-foreground">渠道:</label>
          <Select 
            :model-value="selectedPipeline"
            @update:model-value="handlePipelineChange"
            :disabled="!selectedEnv"
          >
            <SelectTrigger class="w-48">
              <SelectValue placeholder="选择渠道" />
            </SelectTrigger>
            <SelectContent>
              <SelectItem 
                v-for="pipeline in pipelines" 
                :key="pipeline.key" 
                :value="pipeline.key"
              >
                {{ pipeline.name }}
              </SelectItem>
            </SelectContent>
          </Select>
        </div>

        <Button
          @click="handleRefresh"
          :disabled="!selectedEnv || !selectedPipeline || loading"
        >
          <RefreshCw :class="['w-4 h-4 mr-2', { 'animate-spin': loading }]" />
          刷新配置
        </Button>

        <Button
          variant="outline"
          @click="handleExport"
          :disabled="configs.length === 0 || exporting"
        >
          <Loader2 v-if="exporting" class="w-4 h-4 mr-2 animate-spin" />
          <Download v-else class="w-4 h-4 mr-2" />
          导出静态资源
        </Button>
      </div>

      <div class="border rounded-lg overflow-hidden">
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead class="w-48">名称</TableHead>
              <TableHead class="w-40">别名</TableHead>
              <TableHead class="w-24">类型</TableHead>
              <TableHead>内容</TableHead>
              <TableHead class="w-20">操作</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            <TableRow v-if="loading">
              <TableCell colspan="5" class="text-center py-8">
                <RefreshCw class="w-5 h-5 animate-spin mx-auto text-muted-foreground" />
                <span class="text-sm text-muted-foreground mt-2 block">
                  加载中...
                </span>
              </TableCell>
            </TableRow>
            <TableRow v-else-if="!selectedEnv || !selectedPipeline">
              <TableCell colspan="5" class="text-center py-8 text-muted-foreground">
                请选择环境和渠道查看配置
              </TableCell>
            </TableRow>
            <TableRow v-else-if="configs.length === 0">
              <TableCell colspan="5" class="text-center py-8 text-muted-foreground">
                当前环境和渠道下暂无配置
              </TableCell>
            </TableRow>
            <TableRow v-else v-for="config in configs" :key="config.id">
              <TableCell class="font-mono text-sm">
                {{ config.name }}
              </TableCell>
              <TableCell class="text-muted-foreground">
                {{ config.alias }}
              </TableCell>
              <TableCell>
                <Badge
                  variant="secondary"
                  :class="CONFIG_TYPE_META[config.type]?.color || ''"
                >
                  {{ CONFIG_TYPE_META[config.type]?.label || config.type }}
                </Badge>
              </TableCell>
              <TableCell class="font-mono text-sm max-w-xs truncate">
                {{ config.content }}
              </TableCell>
              <TableCell>
                <Button
                  variant="ghost"
                  size="icon"
                  @click="handleCopy(config.content, config.id)"
                >
                  <Check v-if="copiedId === config.id" class="w-4 h-4 text-green-600" />
                  <Copy v-else class="w-4 h-4" />
                </Button>
              </TableCell>
            </TableRow>
          </TableBody>
        </Table>
      </div>
    </CardContent>
  </Card>
</template>
