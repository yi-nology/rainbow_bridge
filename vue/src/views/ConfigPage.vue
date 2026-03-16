<script setup lang="ts">
import { ref, computed, onMounted, watch } from 'vue'
import AppSidebar from '@/components/AppSidebar.vue'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Table, TableHeader, TableBody, TableRow, TableHead, TableCell } from '@/components/ui/table'
import { Dialog, DialogTrigger, DialogContent, DialogHeader, DialogTitle, DialogDescription, DialogFooter } from '@/components/ui/dialog'
import { Select, SelectTrigger, SelectValue, SelectContent, SelectItem } from '@/components/ui/select'
import { Label } from '@/components/ui/label'
import { Textarea } from '@/components/ui/textarea'
import { Badge } from '@/components/ui/badge'
import { Switch } from '@/components/ui/switch'
import { Plus, Pencil, Trash2, Search, Layers, GitBranch, Upload, FileText, AlertCircle, Loader2, X, Image } from 'lucide-vue-next'
import { useEnvironmentStore } from '@/stores/environment'
import { useConfigStore } from '@/stores/config'
import { useAssetStore } from '@/stores/asset'
import { type ConfigItem, type ConfigType, CONFIG_TYPE_META } from '@/lib/types'
import { resolveAssetUrl } from '@/lib/utils'

const environmentStore = useEnvironmentStore()
const configStore = useConfigStore()
const assetStore = useAssetStore()

const searchTerm = ref('')
const selectedEnvKey = ref('')
const selectedPipelineKey = ref('')
const isAddDialogOpen = ref(false)
const editingConfig = ref<ConfigItem | null>(null)
const errors = ref<{ field: string; message: string }[]>([])

const formData = ref({
  name: '',
  alias: '',
  type: 'text' as ConfigType,
  content: '',
})

const keyValuePairs = ref<{ key: string; value: string }[]>([{ key: '', value: '' }])
const booleanValue = ref(false)
const colorValue = ref('#3B82F6')
const imageSize = ref<{ width: number; height: number } | null>(null)
const imagePreviewUrl = ref<string | null>(null)

onMounted(() => {
  environmentStore.fetchOverview()
})

const selectedEnvironment = computed(() =>
  environmentStore.environments.find((env) => env.key === selectedEnvKey.value)
)

const pipelines = computed(() => selectedEnvironment.value?.pipelines || [])

const filteredConfigs = computed(() => {
  if (!searchTerm.value) return configStore.configs
  return configStore.configs.filter(
    (config) =>
      config.name.toLowerCase().includes(searchTerm.value.toLowerCase()) ||
      config.alias.toLowerCase().includes(searchTerm.value.toLowerCase())
  )
})

watch(selectedEnvKey, () => {
  selectedPipelineKey.value = ''
})

watch([selectedEnvKey, selectedPipelineKey], ([envKey, pipelineKey]) => {
  if (envKey && pipelineKey) {
    configStore.fetchConfigs(envKey, pipelineKey)
  }
})

const handleEnvChange = (envKey: string) => {
  selectedEnvKey.value = envKey
  selectedPipelineKey.value = ''
}

const getFieldError = (field: string) => {
  return errors.value.find(e => e.field === field)?.message
}

const resetForm = () => {
  formData.value = { name: '', alias: '', type: 'text', content: '' }
  keyValuePairs.value = [{ key: '', value: '' }]
  booleanValue.value = false
  colorValue.value = '#3B82F6'
  imageSize.value = null
  editingConfig.value = null
  errors.value = []
}

const handleTypeChange = (type: string) => {
  formData.value = { ...formData.value, type: type as ConfigType, content: '' }
  keyValuePairs.value = [{ key: '', value: '' }]
  booleanValue.value = false
  colorValue.value = '#3B82F6'
  imageSize.value = null
  errors.value = []
}

const getFinalContent = (): string => {
  switch (formData.value.type) {
    case 'keyvalue':
      const pairs = keyValuePairs.value.filter(p => p.key.trim())
      return JSON.stringify(Object.fromEntries(pairs.map(p => [p.key, p.value])))
    case 'boolean':
      return String(booleanValue.value)
    case 'color':
      return colorValue.value
    default:
      return formData.value.content
  }
}

const validateForm = (): boolean => {
  errors.value = []
  
  if (!formData.value.name.trim()) {
    errors.value.push({ field: 'name', message: '名称不能为空' })
  }

  if (!formData.value.alias.trim()) {
    errors.value.push({ field: 'alias', message: '别名不能为空' })
  } else if (!/^[A-Z_][A-Z0-9_]*$/i.test(formData.value.alias)) {
    errors.value.push({ field: 'alias', message: '别名只能包含字母、数字和下划线，且不能以数字开头' })
  }

  switch (formData.value.type) {
    case 'text':
    case 'textarea':
    case 'richtext':
      if (!formData.value.content.trim()) {
        errors.value.push({ field: 'content', message: '内容不能为空' })
      }
      break
    case 'number':
      if (!formData.value.content.trim()) {
        errors.value.push({ field: 'content', message: '请输入整数' })
      } else if (!/^-?\d+$/.test(formData.value.content)) {
        errors.value.push({ field: 'content', message: '请输入有效的整数' })
      }
      break
    case 'decimal':
      if (!formData.value.content.trim()) {
        errors.value.push({ field: 'content', message: '请输入小数' })
      } else if (!/^-?\d+(\.\d+)?$/.test(formData.value.content)) {
        errors.value.push({ field: 'content', message: '请输入有效的小数' })
      }
      break
    case 'object':
      if (!formData.value.content.trim()) {
        errors.value.push({ field: 'content', message: 'JSON对象不能为空' })
      } else {
        try {
          const parsed = JSON.parse(formData.value.content)
          if (typeof parsed !== 'object' || Array.isArray(parsed)) {
            errors.value.push({ field: 'content', message: '请输入有效的JSON对象（非数组）' })
          }
        } catch {
          errors.value.push({ field: 'content', message: 'JSON格式无效' })
        }
      }
      break
    case 'keyvalue':
      const validPairs = keyValuePairs.value.filter(p => p.key.trim() || p.value.trim())
      if (validPairs.length === 0) {
        errors.value.push({ field: 'content', message: '请至少添加一个键值对' })
      } else {
        const hasEmptyKey = validPairs.some(p => !p.key.trim())
        if (hasEmptyKey) {
          errors.value.push({ field: 'content', message: '键名不能为空' })
        }
        const keys = validPairs.map(p => p.key.trim()).filter(k => k)
        const uniqueKeys = new Set(keys)
        if (keys.length !== uniqueKeys.size) {
          errors.value.push({ field: 'content', message: '键名不能重复' })
        }
      }
      break
    case 'color':
      if (!/^#[0-9A-Fa-f]{6}$/.test(colorValue.value)) {
        errors.value.push({ field: 'content', message: '请输入有效的颜色值' })
      }
      break
    case 'file':
    case 'image':
      if (!formData.value.content.trim()) {
        errors.value.push({ field: 'content', message: formData.value.type === 'image' ? '请上传图片' : '请上传文件' })
      }
      break
  }

  return errors.value.length === 0
}

const handleAdd = async () => {
  if (!validateForm()) return
  if (!selectedEnvKey.value || !selectedPipelineKey.value) return

  await configStore.createConfig(selectedEnvKey.value, selectedPipelineKey.value, {
    name: formData.value.name,
    alias: formData.value.alias,
    type: formData.value.type,
    content: getFinalContent(),
  })

  isAddDialogOpen.value = false
  resetForm()
}

const handleEdit = (config: ConfigItem) => {
  editingConfig.value = config
  
  let formattedContent = config.content
  if (config.type === 'object' && config.content.trim()) {
    try {
      const parsed = JSON.parse(config.content)
      formattedContent = JSON.stringify(parsed, null, 2)
    } catch {
      formattedContent = config.content
    }
  }

  formData.value = {
    name: config.name,
    alias: config.alias,
    type: config.type,
    content: formattedContent,
  }

  if (config.type === 'keyvalue') {
    try {
      const obj = JSON.parse(config.content)
      keyValuePairs.value = Object.entries(obj).map(([key, value]) => ({ key, value: String(value) }))
    } catch {
      keyValuePairs.value = [{ key: '', value: '' }]
    }
  } else if (config.type === 'boolean') {
    booleanValue.value = config.content === 'true'
  } else if (config.type === 'color') {
    colorValue.value = config.content || '#3B82F6'
  }

  errors.value = []
}

const handleUpdate = async () => {
  if (!validateForm()) return
  if (!editingConfig.value || !selectedEnvKey.value || !selectedPipelineKey.value) return

  await configStore.updateConfig(selectedEnvKey.value, selectedPipelineKey.value, {
    id: editingConfig.value.id,
    name: formData.value.name,
    alias: formData.value.alias,
    type: formData.value.type,
    content: getFinalContent(),
  })

  resetForm()
}

const handleDelete = async (resourceKey: string) => {
  if (!selectedEnvKey.value || !selectedPipelineKey.value) return
  await configStore.deleteConfig(selectedEnvKey.value, selectedPipelineKey.value, resourceKey)
}

const handleFileUpload = async (type: 'file' | 'image') => {
  const input = document.createElement('input')
  input.type = 'file'
  input.accept = type === 'image' ? 'image/*' : '*/*'

  input.onchange = async (e) => {
    const file = (e.target as HTMLInputElement).files?.[0]
    if (!file || !selectedEnvKey.value || !selectedPipelineKey.value) return

    try {
      const result = await assetStore.uploadAsset(file, selectedEnvKey.value, selectedPipelineKey.value)
      if (result?.url) {
        formData.value.content = result.url
        errors.value = errors.value.filter(e => e.field !== 'content')
      }
    } catch (e) {
      console.error('上传失败:', e)
    }
  }

  input.click()
}

const addKeyValuePair = () => {
  keyValuePairs.value.push({ key: '', value: '' })
}

const removeKeyValuePair = (index: number) => {
  keyValuePairs.value = keyValuePairs.value.filter((_, i) => i !== index)
}

const updateKeyValuePair = (index: number, field: 'key' | 'value', value: string) => {
  keyValuePairs.value[index][field] = value
}

const openImagePreview = (url: string) => {
  imagePreviewUrl.value = resolveAssetUrl(url)
}

const closeImagePreview = () => {
  imagePreviewUrl.value = null
}
</script>

<template>
  <div class="flex min-h-screen">
    <AppSidebar />
    <main class="flex-1 p-8 overflow-auto">
      <div class="max-w-5xl mx-auto space-y-6">
        <div class="mb-8">
          <h1 class="text-2xl font-bold tracking-tight">配置管理</h1>
          <p class="text-muted-foreground mt-1">
            管理指定环境和渠道的运行时配置项
          </p>
        </div>

        <Card>
          <CardHeader>
            <CardTitle class="text-lg">选择环境与渠道</CardTitle>
          </CardHeader>
          <CardContent>
            <div class="flex items-center gap-6">
              <div class="flex items-center gap-3">
                <div class="flex items-center gap-2 text-muted-foreground">
                  <Layers class="w-4 h-4" />
                  <span class="text-sm font-medium">环境</span>
                </div>
                <Select :model-value="selectedEnvKey" @update:model-value="handleEnvChange" :disabled="environmentStore.loading">
                  <SelectTrigger class="w-48">
                    <SelectValue :placeholder="environmentStore.loading ? '加载中...' : '请选择环境'" />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem v-for="env in environmentStore.environments" :key="env.key" :value="env.key">
                      {{ env.name }} ({{ env.key }})
                    </SelectItem>
                  </SelectContent>
                </Select>
              </div>

              <div class="flex items-center gap-3">
                <div class="flex items-center gap-2 text-muted-foreground">
                  <GitBranch class="w-4 h-4" />
                  <span class="text-sm font-medium">渠道</span>
                </div>
                <Select
                  :model-value="selectedPipelineKey"
                  @update:model-value="selectedPipelineKey = $event"
                  :disabled="!selectedEnvKey"
                >
                  <SelectTrigger class="w-48">
                    <SelectValue :placeholder="selectedEnvKey ? '请选择渠道' : '先选择环境'" />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem v-for="pipeline in pipelines" :key="pipeline.key" :value="pipeline.key">
                      {{ pipeline.name }} ({{ pipeline.key }})
                    </SelectItem>
                  </SelectContent>
                </Select>
              </div>

              <Badge v-if="selectedEnvKey && selectedPipelineKey" variant="secondary" class="ml-auto">
                已选择: {{ selectedEnvironment?.name }} / {{ pipelines.find(p => p.key === selectedPipelineKey)?.name }}
              </Badge>
            </div>
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <div class="flex items-center justify-between">
              <CardTitle class="text-lg">配置列表</CardTitle>
              <div class="flex items-center gap-3">
                <div class="relative">
                  <Search class="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground" />
                  <Input
                    placeholder="搜索配置..."
                    class="pl-9 w-64"
                    v-model="searchTerm"
                    :disabled="!selectedEnvKey || !selectedPipelineKey"
                  />
                </div>
                <Dialog v-model:open="isAddDialogOpen">
                  <DialogTrigger as-child>
                    <Button :disabled="!selectedEnvKey || !selectedPipelineKey">
                      <Plus class="w-4 h-4 mr-2" />
                      新增配置
                    </Button>
                  </DialogTrigger>
                  <DialogContent class="max-w-xl max-h-[85vh] overflow-y-auto">
                    <DialogHeader>
                      <DialogTitle>新增配置</DialogTitle>
                      <DialogDescription>
                        为 {{ selectedEnvironment?.name }} - {{ pipelines.find(p => p.key === selectedPipelineKey)?.name }} 添加配置项
                      </DialogDescription>
                    </DialogHeader>
                    <div class="space-y-4">
                      <div v-if="errors.length > 0" class="p-3 rounded-md bg-destructive/10 border border-destructive/20">
                        <div class="flex items-center gap-2 text-destructive font-medium text-sm mb-1">
                          <AlertCircle class="w-4 h-4" />
                          保存失败，请检查以下问题：
                        </div>
                        <ul class="list-disc list-inside text-sm text-destructive/80 space-y-0.5">
                          <li v-for="(error, index) in errors" :key="index">{{ error.message }}</li>
                        </ul>
                      </div>

                      <div class="grid grid-cols-2 gap-4">
                        <div class="space-y-2">
                          <Label for="name">名称 *</Label>
                          <Input
                            id="name"
                            placeholder="例如: API基础地址"
                            v-model="formData.name"
                            :class="getFieldError('name') ? 'border-destructive' : ''"
                          />
                          <p v-if="getFieldError('name')" class="text-sm text-destructive flex items-center gap-1">
                            <AlertCircle class="w-3 h-3" />{{ getFieldError('name') }}
                          </p>
                        </div>
                        <div class="space-y-2">
                          <Label for="alias">别名 *</Label>
                          <Input
                            id="alias"
                            placeholder="例如: API_BASE_URL"
                            v-model="formData.alias"
                            :class="getFieldError('alias') ? 'border-destructive' : ''"
                          />
                          <p v-if="getFieldError('alias')" class="text-sm text-destructive flex items-center gap-1">
                            <AlertCircle class="w-3 h-3" />{{ getFieldError('alias') }}
                          </p>
                        </div>
                      </div>

                      <div class="space-y-2">
                        <Label for="type">类型</Label>
                        <Select :model-value="formData.type" @update:model-value="handleTypeChange">
                          <SelectTrigger>
                            <SelectValue />
                          </SelectTrigger>
                          <SelectContent>
                            <SelectItem v-for="[key, config] in Object.entries(CONFIG_TYPE_META)" :key="key" :value="key">
                              <div class="flex items-center gap-2">
                                <Badge variant="secondary" :class="config.color + ' text-xs'">
                                  {{ config.label }}
                                </Badge>
                                <span class="text-muted-foreground text-xs">{{ config.description }}</span>
                              </div>
                            </SelectItem>
                          </SelectContent>
                        </Select>
                      </div>

                      <div class="space-y-2">
                        <Label for="content">内容</Label>
                        <Input
                          v-if="formData.type === 'text' || formData.type === 'number' || formData.type === 'decimal'"
                          id="content"
                          :placeholder="formData.type === 'text' ? '请输入文本内容...' : '请输入数值...'"
                          v-model="formData.content"
                          :class="getFieldError('content') ? 'border-destructive' : ''"
                        />
                        <Textarea
                          v-else-if="formData.type === 'textarea' || formData.type === 'richtext' || formData.type === 'object'"
                          id="content"
                          :placeholder="formData.type === 'object' ? '{&quot;key&quot;: &quot;value&quot;}' : '请输入内容...'"
                          :rows="formData.type === 'object' ? 8 : 4"
                          v-model="formData.content"
                          :class="getFieldError('content') ? 'border-destructive' : ''"
                        />
                        <div v-else-if="formData.type === 'boolean'" class="flex items-center gap-4 p-4 border rounded-md">
                          <Switch v-model="booleanValue" />
                          <span class="text-sm">
                            当前值: <Badge :variant="booleanValue ? 'default' : 'secondary'">{{ booleanValue ? 'true' : 'false' }}</Badge>
                          </span>
                        </div>
                        <div v-else-if="formData.type === 'color'" class="flex items-center gap-3">
                          <input
                            type="color"
                            :value="colorValue"
                            @input="colorValue = ($event.target as HTMLInputElement).value"
                            class="w-16 h-16 rounded-lg cursor-pointer border-2 border-border"
                          />
                          <Input
                            :value="colorValue"
                            @update:model-value="colorValue = $event"
                            class="font-mono text-lg"
                            maxlength="7"
                          />
                        </div>
                        <div v-else-if="formData.type === 'keyvalue'" class="space-y-2">
                          <div class="flex items-center justify-between">
                            <Label>键值对</Label>
                            <Button type="button" variant="outline" size="sm" @click="addKeyValuePair">
                              <Plus class="w-3 h-3 mr-1" />
                              添加
                            </Button>
                          </div>
                          <div class="space-y-2 max-h-48 overflow-y-auto">
                            <div v-for="(pair, index) in keyValuePairs" :key="index" class="flex items-center gap-2">
                              <Input
                                placeholder="键名"
                                :value="pair.key"
                                @update:model-value="updateKeyValuePair(index, 'key', $event)"
                                class="flex-1"
                              />
                              <span class="text-muted-foreground">=</span>
                              <Input
                                placeholder="键值"
                                :value="pair.value"
                                @update:model-value="updateKeyValuePair(index, 'value', $event)"
                                class="flex-1"
                              />
                              <Button
                                v-if="keyValuePairs.length > 1"
                                type="button"
                                variant="ghost"
                                size="icon"
                                @click="removeKeyValuePair(index)"
                              >
                                <X class="w-4 h-4" />
                              </Button>
                            </div>
                          </div>
                        </div>
                        <div
                          v-else-if="formData.type === 'file' || formData.type === 'image'"
                          class="border-2 border-dashed rounded-lg p-6 text-center cursor-pointer hover:border-primary/50 transition-colors"
                          :class="getFieldError('content') ? 'border-destructive' : ''"
                          @click="handleFileUpload(formData.type)"
                        >
                          <Upload v-if="!formData.content" class="w-8 h-8 mx-auto text-muted-foreground" />
                          <p v-if="!formData.content" class="text-sm text-muted-foreground mt-2">
                            点击上传{{ formData.type === 'image' ? '图片' : '文件' }}
                          </p>
                          <img
                            v-else-if="formData.type === 'image' && formData.content"
                            :src="resolveAssetUrl(formData.content)"
                            alt="预览"
                            class="max-w-full max-h-48 mx-auto object-contain"
                          />
                          <p v-else class="text-sm">{{ formData.content }}</p>
                        </div>
                        <p v-if="getFieldError('content')" class="text-sm text-destructive flex items-center gap-1">
                          <AlertCircle class="w-3 h-3" />{{ getFieldError('content') }}
                        </p>
                      </div>

                      <DialogFooter>
                        <Button variant="outline" @click="isAddDialogOpen = false; resetForm()">
                          取消
                        </Button>
                        <Button @click="handleAdd" :disabled="configStore.loading">
                          <Loader2 v-if="configStore.loading" class="w-4 h-4 mr-2 animate-spin" />
                          保存
                        </Button>
                      </DialogFooter>
                    </div>
                  </DialogContent>
                </Dialog>
              </div>
            </div>
          </CardHeader>
          <CardContent>
            <div v-if="!selectedEnvKey || !selectedPipelineKey" class="flex flex-col items-center justify-center py-16 text-center">
              <div class="w-16 h-16 rounded-full bg-muted flex items-center justify-center mb-4">
                <Layers class="w-8 h-8 text-muted-foreground" />
              </div>
              <h3 class="text-lg font-medium mb-2">请先选择环境和渠道</h3>
              <p class="text-muted-foreground text-sm max-w-sm">
                配置项与环境和渠道关联，请在上方选择要管理的环境和渠道后查看对应的配置列表
              </p>
            </div>
            <div v-else-if="configStore.loading" class="flex items-center justify-center py-16">
              <Loader2 class="w-8 h-8 animate-spin text-muted-foreground" />
            </div>
            <div v-else class="border rounded-lg overflow-hidden">
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead class="w-48">名称</TableHead>
                    <TableHead class="w-40">别名</TableHead>
                    <TableHead class="w-24">类型</TableHead>
                    <TableHead>内容</TableHead>
                    <TableHead class="w-32 text-right">操作</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  <TableRow v-if="filteredConfigs.length === 0">
                    <TableCell colspan="5" class="text-center py-8 text-muted-foreground">
                      {{ searchTerm ? '未找到匹配的配置' : '当前环境和渠道下暂无配置' }}
                    </TableCell>
                  </TableRow>
                  <TableRow v-for="config in filteredConfigs" :key="config.id">
                    <TableCell class="font-mono text-sm break-all max-w-xs">
                      {{ config.name }}
                    </TableCell>
                    <TableCell class="text-muted-foreground break-all max-w-xs">
                      {{ config.alias }}
                    </TableCell>
                    <TableCell>
                      <Badge variant="secondary" :class="CONFIG_TYPE_META[config.type]?.color || ''">
                        {{ CONFIG_TYPE_META[config.type]?.label || config.type }}
                      </Badge>
                    </TableCell>
                    <TableCell>
                      <template v-if="config.type === 'text'">
                        <div class="flex items-center gap-2">
                          <FileText class="w-4 h-4 text-blue-500 flex-shrink-0" />
                          <span class="text-sm truncate max-w-xs">{{ config.content }}</span>
                        </div>
                      </template>
                      <template v-else-if="config.type === 'textarea'">
                        <div class="flex items-start gap-2">
                          <FileText class="w-4 h-4 text-slate-500 flex-shrink-0 mt-0.5" />
                          <span class="text-sm line-clamp-2 text-muted-foreground">{{ config.content }}</span>
                        </div>
                      </template>
                      <template v-else-if="config.type === 'richtext'">
                        <div class="flex items-start gap-2">
                          <FileText class="w-4 h-4 text-indigo-500 flex-shrink-0 mt-0.5" />
                          <div class="text-sm line-clamp-2 prose prose-sm max-w-xs" v-html="config.content"></div>
                        </div>
                      </template>
                      <template v-else-if="config.type === 'number'">
                        <div class="flex items-center gap-2">
                          <Badge variant="outline" class="font-mono text-amber-700 border-amber-300 bg-amber-50 dark:bg-amber-950 dark:text-amber-400">
                            {{ config.content }}
                          </Badge>
                        </div>
                      </template>
                      <template v-else-if="config.type === 'decimal'">
                        <div class="flex items-center gap-2">
                          <Badge variant="outline" class="font-mono text-orange-700 border-orange-300 bg-orange-50 dark:bg-orange-950 dark:text-orange-400">
                            {{ config.content }}
                          </Badge>
                        </div>
                      </template>
                      <template v-else-if="config.type === 'boolean'">
                        <div class="flex items-center gap-2">
                          <div :class="`w-2 h-2 rounded-full ${config.content === 'true' ? 'bg-green-500' : 'bg-gray-400'}`" />
                          <Badge :variant="config.content === 'true' ? 'default' : 'secondary'">
                            {{ config.content === 'true' ? 'true' : 'false' }}
                          </Badge>
                        </div>
                      </template>
                      <template v-else-if="config.type === 'color'">
                        <div class="flex items-center gap-2">
                          <div 
                            class="w-8 h-8 rounded-md border-2 shadow-sm ring-1 ring-gray-200 dark:ring-gray-700"
                            :style="{ backgroundColor: config.content }"
                            :title="config.content"
                          />
                          <span class="font-mono text-xs text-muted-foreground">{{ config.content }}</span>
                        </div>
                      </template>
                      <template v-else-if="config.type === 'image'">
                        <div 
                          class="flex items-center gap-3 group cursor-pointer"
                          @click="openImagePreview(config.content)"
                        >
                          <div class="relative">
                            <img 
                              :src="resolveAssetUrl(config.content)" 
                              alt="缩略图" 
                              class="w-12 h-12 object-cover rounded-md border-2 shadow-sm group-hover:scale-105 transition-transform"
                              @error="($event.target as HTMLImageElement).style.display = 'none'"
                              @load="($event.target as HTMLImageElement).setAttribute('title', `${($event.target as HTMLImageElement).naturalWidth} × ${($event.target as HTMLImageElement).naturalHeight} px\n点击查看大图`)"
                            />
                            <div class="absolute inset-0 bg-black/0 group-hover:bg-black/20 rounded-md transition-colors flex items-center justify-center">
                              <span class="text-white text-xs opacity-0 group-hover:opacity-100 transition-opacity font-medium">查看</span>
                            </div>
                          </div>
                          <div class="flex-1 min-w-0">
                            <div class="flex items-center gap-2 mb-1">
                              <Image class="w-3.5 h-3.5 text-rose-500 flex-shrink-0" />
                              <span class="text-xs font-medium text-muted-foreground">图片资源</span>
                            </div>
                            <span class="text-xs text-muted-foreground truncate block">
                              {{ config.content.split('/').pop() || config.content }}
                            </span>
                          </div>
                        </div>
                      </template>
                      <template v-else-if="config.type === 'keyvalue'">
                        <div class="flex items-center gap-2">
                          <Badge variant="outline" class="text-cyan-700 border-cyan-300 bg-cyan-50 dark:bg-cyan-950 dark:text-cyan-400">
                            <span class="font-mono text-xs">{{ Object.keys(JSON.parse(config.content || '{}')).length }} 项</span>
                          </Badge>
                          <span v-if="Object.keys(JSON.parse(config.content || '{}')).length > 0" class="text-xs text-muted-foreground truncate max-w-[200px]">
                            {{ Object.keys(JSON.parse(config.content || '{}')).slice(0, 2).join(', ') }}{{ Object.keys(JSON.parse(config.content || '{}')).length > 2 ? '...' : '' }}
                          </span>
                        </div>
                      </template>
                      <template v-else-if="config.type === 'object'">
                        <div class="flex items-center gap-2">
                          <Badge variant="outline" class="text-emerald-700 border-emerald-300 bg-emerald-50 dark:bg-emerald-950 dark:text-emerald-400">
                            <span class="font-mono text-xs">{ {{ Object.keys(JSON.parse(config.content || '{}')).length }} }</span>
                          </Badge>
                          <span v-if="Object.keys(JSON.parse(config.content || '{}')).length > 0" class="text-xs text-muted-foreground truncate max-w-[200px] font-mono">
                            {{ Object.keys(JSON.parse(config.content || '{}')).slice(0, 3).join(', ') }}{{ Object.keys(JSON.parse(config.content || '{}')).length > 3 ? '...' : '' }}
                          </span>
                        </div>
                      </template>
                      <template v-else-if="config.type === 'file'">
                        <div class="flex items-center gap-2">
                          <div class="w-8 h-8 rounded-md border-2 bg-gray-100 dark:bg-gray-800 flex items-center justify-center">
                            <FileText class="w-4 h-4 text-gray-500" />
                          </div>
                          <div class="flex-1 min-w-0">
                            <div class="flex items-center gap-2">
                              <span class="text-xs font-medium truncate">{{ config.content.split('/').pop() || config.content }}</span>
                              <Badge v-if="config.content.split('.').pop()" variant="secondary" class="text-xs">{{ config.content.split('.').pop()?.toUpperCase() }}</Badge>
                            </div>
                            <span class="text-xs text-muted-foreground truncate block">{{ config.content }}</span>
                          </div>
                        </div>
                      </template>
                      <template v-else>
                        <div class="flex items-center gap-2">
                          <FileText class="w-4 h-4 text-blue-500 flex-shrink-0" />
                          <span class="text-sm truncate max-w-xs">{{ config.content }}</span>
                        </div>
                      </template>
                    </TableCell>
                    <TableCell class="text-right">
                      <div class="flex items-center justify-end gap-1">
                        <Dialog :open="editingConfig?.id === config.id" @update:open="(open) => { if (!open) resetForm(); else handleEdit(config) }">
                          <DialogTrigger as-child>
                            <Button variant="ghost" size="icon" @click="handleEdit(config)">
                              <Pencil class="w-4 h-4" />
                            </Button>
                          </DialogTrigger>
                          <DialogContent class="max-w-xl max-h-[85vh] overflow-y-auto">
                            <DialogHeader>
                              <DialogTitle>编辑配置</DialogTitle>
                              <DialogDescription>修改配置项信息</DialogDescription>
                            </DialogHeader>
                            <div class="space-y-4">
                              <div class="grid grid-cols-2 gap-4">
                                <div class="space-y-2">
                                  <Label for="edit-name">名称 *</Label>
                                  <Input id="edit-name" v-model="formData.name" />
                                </div>
                                <div class="space-y-2">
                                  <Label for="edit-alias">别名 *</Label>
                                  <Input id="edit-alias" v-model="formData.alias" disabled />
                                  <p class="text-xs text-muted-foreground">别名在创建后不可修改</p>
                                </div>
                              </div>
                              <div class="space-y-2">
                                <Label for="edit-type">类型</Label>
                                <Select :model-value="formData.type" disabled>
                                  <SelectTrigger>
                                    <SelectValue />
                                  </SelectTrigger>
                                </Select>
                              </div>
                              <div class="space-y-2">
                                <Label for="edit-content">内容</Label>
                                <Input v-if="formData.type === 'text'" v-model="formData.content" />
                                <Textarea v-else-if="formData.type === 'textarea' || formData.type === 'object'" v-model="formData.content" :rows="4" />
                                <div v-else-if="formData.type === 'boolean'" class="flex items-center gap-4 p-4 border rounded-md">
                                  <Switch v-model="booleanValue" />
                                  <span class="text-sm">当前值: {{ booleanValue ? 'true' : 'false' }}</span>
                                </div>
                                <div v-else-if="formData.type === 'keyvalue'" class="space-y-2">
                                  <div class="flex items-center justify-between">
                                    <Label>键值对</Label>
                                    <Button type="button" variant="outline" size="sm" @click="addKeyValuePair">
                                      <Plus class="w-3 h-3 mr-1" />
                                      添加
                                    </Button>
                                  </div>
                                  <div class="space-y-2 max-h-48 overflow-y-auto">
                                    <div v-for="(pair, index) in keyValuePairs" :key="index" class="flex items-center gap-2">
                                      <Input
                                        placeholder="键名"
                                        :value="pair.key"
                                        @update:model-value="updateKeyValuePair(index, 'key', $event)"
                                        class="flex-1"
                                      />
                                      <span class="text-muted-foreground">=</span>
                                      <Input
                                        placeholder="键值"
                                        :value="pair.value"
                                        @update:model-value="updateKeyValuePair(index, 'value', $event)"
                                        class="flex-1"
                                      />
                                      <Button
                                        v-if="keyValuePairs.length > 1"
                                        type="button"
                                        variant="ghost"
                                        size="icon"
                                        @click="removeKeyValuePair(index)"
                                      >
                                        <X class="w-4 h-4" />
                                      </Button>
                                    </div>
                                  </div>
                                </div>
                              </div>
                              <DialogFooter>
                                <Button variant="outline" @click="resetForm()">取消</Button>
                                <Button @click="handleUpdate" :disabled="configStore.loading">
                                  <Loader2 v-if="configStore.loading" class="w-4 h-4 mr-2 animate-spin" />
                                  保存
                                </Button>
                              </DialogFooter>
                            </div>
                          </DialogContent>
                        </Dialog>
                        <Button
                          variant="ghost"
                          size="icon"
                          :disabled="configStore.loading"
                          @click="handleDelete(config.id)"
                        >
                          <Loader2 v-if="configStore.loading" class="w-4 h-4 animate-spin" />
                          <Trash2 v-else class="w-4 h-4 text-destructive" />
                        </Button>
                      </div>
                    </TableCell>
                  </TableRow>
                </TableBody>
              </Table>
            </div>
          </CardContent>
        </Card>
      </div>
    </main>

    <Teleport to="body">
      <div 
        v-if="imagePreviewUrl" 
        class="fixed inset-0 z-50 flex items-center justify-center bg-black/80 backdrop-blur-sm"
        @click="closeImagePreview"
      >
        <div class="relative max-w-4xl max-h-[90vh] p-4" @click.stop>
          <img 
            :src="imagePreviewUrl" 
            class="max-w-full max-h-[85vh] object-contain rounded-lg shadow-2xl"
            alt="图片预览"
          />
          <button 
            class="absolute top-6 right-6 w-8 h-8 rounded-full bg-white dark:bg-gray-800 text-gray-700 dark:text-gray-300 shadow-lg hover:bg-gray-100 dark:hover:bg-gray-700 flex items-center justify-center font-bold"
            @click="closeImagePreview"
          >
            ✕
          </button>
        </div>
      </div>
    </Teleport>
  </div>
</template>
