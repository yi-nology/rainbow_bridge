<script setup lang="ts">
import { computed } from 'vue'
import { Table, TableHeader, TableBody, TableRow, TableHead, TableCell } from '@/components/ui/table'
import { Button } from '@/components/ui/button'
import { Badge } from '@/components/ui/badge'
import { Eye, Copy, Check, FileImage, FileJson, FileText, File } from 'lucide-vue-next'
import { useAssetStore } from '@/stores/asset'
import { resolveAssetUrl } from '@/lib/utils'

const assetStore = useAssetStore()

const props = defineProps<{
  selectedEnvKey: string
  selectedPipelineKey: string
  onPreviewImage: (url: string, name: string) => void
  onCopy: (url: string, id: string) => void
  copiedId: string | null
  searchTerm: string
}>()

const filteredAssets = computed(() =>
  assetStore.assets.filter((r) =>
    r.name.toLowerCase().includes(props.searchTerm?.toLowerCase() || '')
  )
)

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
  <div class="border rounded-lg overflow-hidden">
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
                @click="onPreviewImage(resource.url, resource.name)"
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
                @click="onPreviewImage(resource.url, resource.name)"
                title="预览图片"
              >
                <Eye class="w-4 h-4" />
              </Button>
              <Button
                variant="ghost"
                size="icon"
                @click="onCopy(resource.url, resource.id)"
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
</template>