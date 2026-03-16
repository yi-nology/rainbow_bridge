<script setup lang="ts">
import { ref, computed, watch, onMounted } from 'vue'
import AppSidebar from '@/components/AppSidebar.vue'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Table, TableHeader, TableBody, TableRow, TableHead, TableCell } from '@/components/ui/table'
import { Select, SelectTrigger, SelectValue, SelectContent, SelectItem } from '@/components/ui/select'
import { Badge } from '@/components/ui/badge'
import { Upload, Copy, Check, FileImage, FileJson, FileText, File, Search, Layers, GitBranch, Loader2, Eye } from 'lucide-vue-next'
import { useEnvironmentStore } from '@/stores/environment'
import { useAssetStore } from '@/stores/asset'
import { resolveAssetUrl } from '@/lib/utils'

const environmentStore = useEnvironmentStore()
const assetStore = useAssetStore()

const searchTerm = ref('')
const selectedEnvKey = ref('')
const selectedPipelineKey = ref('')
const copiedId = ref<string | null>(null)
const fileInputRef = ref<HTMLInputElement | null>(null)

onMounted(() => {
  environmentStore.fetchOverview()
})

const selectedEnvironment = computed(() =>
  environmentStore.environments.find((e) => e.key === selectedEnvKey.value)
)

const pipelines = computed(() => selectedEnvironment.value?.pipelines || [])

const filteredAssets = computed(() =>
  assetStore.assets.filter((r) =>
    r.name.toLowerCase().includes(searchTerm.value.toLowerCase())
  )
)

watch(selectedEnvKey, () => {
  selectedPipelineKey.value = ''
})

watch([selectedEnvKey, selectedPipelineKey], ([envKey, pipelineKey]) => {
  if (envKey && pipelineKey) {
    assetStore.fetchAssets(envKey, pipelineKey)
  }
})

const handleEnvChange = (envKey: string) => {
  selectedEnvKey.value = envKey
  selectedPipelineKey.value = ''
}

const handleCopy = async (url: string, id: string) => {
  const fullUrl = url.startsWith('http') ? url : `${window.location.origin}${url}`
  await navigator.clipboard.writeText(fullUrl)
  copiedId.value = id
  setTimeout(() => copiedId.value = null, 2000)
}

const handleUploadClick = () => {
  fileInputRef.value?.click()
}

const handleFileChange = async (e: Event) => {
  const file = (e.target as HTMLInputElement).files?.[0]
  if (!file || !selectedEnvKey.value || !selectedPipelineKey.value) return

  await assetStore.uploadAsset(file, selectedEnvKey.value, selectedPipelineKey.value)

  if (fileInputRef.value) {
    fileInputRef.value.value = ''
  }
}

const getFileIcon = (type: string) => {
  if (type.startsWith('image/')) return FileImage
  if (type.includes('json')) return FileJson
  if (type.includes('text')) return FileText
  return File
}

const formatFileSize = (bytes: number): string => {
  if (bytes === 0) return '0 B'
  const k = 1024
  const sizes = ['B', 'KB', 'MB', 'GB']
  const i = Math.floor(Math.log(bytes) / Math.log(k))
  return parseFloat((bytes / Math.pow(k, i)).toFixed(1)) + ' ' + sizes[i]
}

const handlePreviewImage = (url: string, name: string) => {
  const resolvedUrl = resolveAssetUrl(url)
  const dialog = document.createElement('div')
  dialog.className = 'fixed inset-0 z-50 flex items-center justify-center bg-black/80 backdrop-blur-sm'
  dialog.onclick = () => dialog.remove()

  const imgContainer = document.createElement('div')
  imgContainer.className = 'relative max-w-4xl max-h-[90vh] p-4'
  imgContainer.onclick = (e) => e.stopPropagation()

  const img = document.createElement('img')
  img.src = resolvedUrl
  img.className = 'max-w-full max-h-[85vh] object-contain rounded-lg shadow-2xl'
  img.alt = name

  const closeBtn = document.createElement('button')
  closeBtn.innerHTML = '✕'
  closeBtn.className = 'absolute top-6 right-6 w-8 h-8 rounded-full bg-white dark:bg-gray-800 text-gray-700 dark:text-gray-300 shadow-lg hover:bg-gray-100 dark:hover:bg-gray-700 flex items-center justify-center font-bold'
  closeBtn.onclick = () => dialog.remove()

  imgContainer.appendChild(img)
  imgContainer.appendChild(closeBtn)
  dialog.appendChild(imgContainer)
  document.body.appendChild(dialog)
}

const handleImageError = (e: Event) => {
  const target = e.target as HTMLImageElement
  target.style.display = 'none'
  const parent = target.parentElement
  if (parent) {
    parent.innerHTML = '<div class="w-12 h-12 rounded-md border-2 bg-gray-100 dark:bg-gray-800 flex items-center justify-center"><svg class="w-6 h-6 text-gray-400" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M4 16l4.586-4.586a2 2 0 012.828 0L16 16m-2-2l1.586-1.586a2 2 0 012.828 0L20 14m-6-6h.01M6 20h12a2 2 0 002-2V6a2 2 0 00-2-2H6a2 2 0 00-2 2v12a2 2 0 002 2z"></path></svg></div>'
  }
}
</script>

<template>
  <div class="flex min-h-screen">
    <AppSidebar />
    <main class="flex-1 p-8 overflow-auto">
      <div class="max-w-5xl mx-auto space-y-6">
        <div class="mb-8">
          <h1 class="text-2xl font-bold tracking-tight">资源管理</h1>
          <p class="text-muted-foreground mt-1">
            集中管理静态资源，自动生成 URL
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
              <CardTitle class="text-lg">资源列表</CardTitle>
              <div class="flex items-center gap-3">
                <div class="relative">
                  <Search class="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground" />
                  <Input
                    placeholder="搜索资源..."
                    class="pl-9 w-64"
                    v-model="searchTerm"
                    :disabled="!selectedEnvKey || !selectedPipelineKey"
                  />
                </div>
                <input
                  type="file"
                  ref="fileInputRef"
                  class="hidden"
                  @change="handleFileChange"
                  accept="image/*,application/json,text/*"
                />
                <Button
                  @click="handleUploadClick"
                  :disabled="!selectedEnvKey || !selectedPipelineKey || assetStore.loading"
                >
                  <Loader2 v-if="assetStore.loading" class="w-4 h-4 mr-2 animate-spin" />
                  <Upload v-else class="w-4 h-4 mr-2" />
                  上传资源
                </Button>
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
                资源与环境和渠道关联，请在上方选择要管理的环境和渠道后查看对应的资源列表
              </p>
            </div>
            <div v-else-if="assetStore.loading" class="flex items-center justify-center py-16">
              <Loader2 class="w-8 h-8 animate-spin text-muted-foreground" />
            </div>
            <div v-else class="border rounded-lg overflow-hidden">
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead class="w-20">预览</TableHead>
                    <TableHead class="w-64">文件名</TableHead>
                    <TableHead class="w-32">类型</TableHead>
                    <TableHead class="w-24">大小</TableHead>
                    <TableHead>URL</TableHead>
                    <TableHead class="w-32 text-right">操作</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  <TableRow v-if="filteredAssets.length === 0">
                    <TableCell colspan="6" class="text-center py-8 text-muted-foreground">
                      {{ searchTerm ? '未找到匹配的资源' : '当前环境和渠道下暂无资源' }}
                    </TableCell>
                  </TableRow>
                  <TableRow v-for="resource in filteredAssets" :key="resource.id">
                    <TableCell>
                      <div v-if="resource.type.startsWith('image/')" class="relative group">
                        <img
                          :src="resolveAssetUrl(resource.url)"
                          :alt="resource.name"
                          class="w-12 h-12 object-cover rounded-md border-2 cursor-pointer hover:scale-105 transition-transform"
                          @click="handlePreviewImage(resource.url, resource.name)"
                          @error="handleImageError"
                        />
                        <div class="absolute inset-0 bg-black/0 group-hover:bg-black/20 rounded-md transition-colors flex items-center justify-center">
                          <Eye class="w-4 h-4 text-white opacity-0 group-hover:opacity-100 transition-opacity" />
                        </div>
                      </div>
                      <div v-else class="w-12 h-12 rounded-md border-2 bg-gray-100 dark:bg-gray-800 flex items-center justify-center">
                        <component :is="getFileIcon(resource.type)" class="w-6 h-6 text-gray-500" />
                      </div>
                    </TableCell>
                    <TableCell>
                      <div class="flex items-center gap-2">
                        <component :is="getFileIcon(resource.type)" class="w-4 h-4 text-muted-foreground" />
                        <span class="font-medium text-sm">{{ resource.name }}</span>
                      </div>
                    </TableCell>
                    <TableCell>
                      <Badge variant="secondary" class="text-xs">
                        {{ resource.type.split('/')[1] || resource.type }}
                      </Badge>
                    </TableCell>
                    <TableCell class="text-muted-foreground text-sm">
                      {{ formatFileSize(resource.size) }}
                    </TableCell>
                    <TableCell class="font-mono text-sm text-muted-foreground truncate max-w-xs">
                      {{ resource.url }}
                    </TableCell>
                    <TableCell class="text-right">
                      <div class="flex items-center justify-end gap-1">
                        <Button
                          v-if="resource.type.startsWith('image/')"
                          variant="ghost"
                          size="icon"
                          @click="handlePreviewImage(resource.url, resource.name)"
                          title="预览图片"
                        >
                          <Eye class="w-4 h-4" />
                        </Button>
                        <Button
                          variant="ghost"
                          size="icon"
                          @click="handleCopy(resource.url, resource.id)"
                          title="复制链接"
                        >
                          <Check v-if="copiedId === resource.id" class="w-4 h-4 text-green-600" />
                          <Copy v-else class="w-4 h-4" />
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
  </div>
</template>
