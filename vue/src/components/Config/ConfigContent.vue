<script setup lang="ts">
import { Badge } from '@/components/ui/badge'
import { FileText, Image } from 'lucide-vue-next'
import { resolveAssetUrl } from '@/lib/utils'
import { type ConfigItem } from '@/lib/types'

const props = defineProps<{
  config: ConfigItem
  onImagePreview: (url: string, name: string) => void
}>()

const handleImagePreview = (url: string) => {
  const imageName = url.split('/').pop() || '图片预览'
  props.onImagePreview(url, imageName)
}
</script>

<template>
  <div>
    <template v-if="config.type === 'text'">
      <div class="flex items-center gap-2">
        <FileText class="w-4 h-4 text-blue-500 flex-shrink-0" />
        <span class="text-sm truncate max-w-md">{{ config.content }}</span>
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
        <div class="text-sm line-clamp-2 prose prose-sm max-w-md" v-html="config.content"></div>
      </div>
    </template>
    <template v-else-if="config.type === 'number'">
      <div class="flex items-center gap-2">
        <Badge variant="outline" class="font-mono text-amber-700 border-amber-300 bg-amber-50 dark:bg-amber-950 dark:text-amber-400 px-2 py-1">
          {{ config.content }}
        </Badge>
      </div>
    </template>
    <template v-else-if="config.type === 'decimal'">
      <div class="flex items-center gap-2">
        <Badge variant="outline" class="font-mono text-orange-700 border-orange-300 bg-orange-50 dark:bg-orange-950 dark:text-orange-400 px-2 py-1">
          {{ config.content }}
        </Badge>
      </div>
    </template>
    <template v-else-if="config.type === 'boolean'">
      <div class="flex items-center gap-2">
        <div :class="`w-3 h-3 rounded-full ${config.content === 'true' ? 'bg-green-500' : 'bg-gray-400'}`" />
        <Badge :variant="config.content === 'true' ? 'default' : 'secondary'" class="px-2 py-1">
          {{ config.content === 'true' ? 'true' : 'false' }}
        </Badge>
      </div>
    </template>
    <template v-else-if="config.type === 'color'">
      <div class="flex items-center gap-3">
        <div 
          class="w-10 h-10 rounded-md border-2 shadow-sm ring-1 ring-gray-200 dark:ring-gray-700"
          :style="{ backgroundColor: config.content }"
          :title="config.content"
        />
        <span class="font-mono text-sm text-muted-foreground">{{ config.content }}</span>
      </div>
    </template>
    <template v-else-if="config.type === 'image'">
      <div 
        class="flex items-center gap-4 group cursor-pointer"
        @click="handleImagePreview(config.content)"
      >
        <div class="relative">
          <img 
            :src="resolveAssetUrl(config.content)" 
            alt="缩略图" 
            class="w-16 h-16 object-cover rounded-md border-2 shadow-sm group-hover:scale-110 transition-transform duration-300"
            @error="($event.target as HTMLImageElement).style.display = 'none'"
            @load="($event.target as HTMLImageElement).setAttribute('title', `${($event.target as HTMLImageElement).naturalWidth} × ${($event.target as HTMLImageElement).naturalHeight} px\n点击查看大图`)"
          />
          <div class="absolute inset-0 bg-black/0 group-hover:bg-black/20 rounded-md transition-colors duration-300 flex items-center justify-center">
            <span class="text-white text-xs opacity-0 group-hover:opacity-100 transition-opacity font-medium">查看</span>
          </div>
        </div>
        <div class="flex-1 min-w-0">
          <div class="flex items-center gap-2 mb-1">
            <Image class="w-4 h-4 text-rose-500 flex-shrink-0" />
            <span class="text-sm font-medium text-muted-foreground">图片资源</span>
          </div>
          <span class="text-sm text-muted-foreground truncate block">
            {{ config.content.split('/').pop() || config.content }}
          </span>
        </div>
      </div>
    </template>
    <template v-else-if="config.type === 'keyvalue'">
      <div class="flex items-center gap-2">
        <Badge variant="outline" class="text-cyan-700 border-cyan-300 bg-cyan-50 dark:bg-cyan-950 dark:text-cyan-400 px-2 py-1">
          <span class="font-mono text-sm">{{ Object.keys(JSON.parse(config.content || '{}')).length }} 项</span>
        </Badge>
        <span v-if="Object.keys(JSON.parse(config.content || '{}')).length > 0" class="text-sm text-muted-foreground truncate max-w-md">
          {{ Object.keys(JSON.parse(config.content || '{}')).slice(0, 2).join(', ') }}{{ Object.keys(JSON.parse(config.content || '{}')).length > 2 ? '...' : '' }}
        </span>
      </div>
    </template>
    <template v-else-if="config.type === 'object'">
      <div class="flex items-center gap-2">
        <Badge variant="outline" class="text-emerald-700 border-emerald-300 bg-emerald-50 dark:bg-emerald-950 dark:text-emerald-400 px-2 py-1">
          <span class="font-mono text-sm">{ {{ Object.keys(JSON.parse(config.content || '{}')).length }} }</span>
        </Badge>
        <span v-if="Object.keys(JSON.parse(config.content || '{}')).length > 0" class="text-sm text-muted-foreground truncate max-w-md font-mono">
          {{ Object.keys(JSON.parse(config.content || '{}')).slice(0, 3).join(', ') }}{{ Object.keys(JSON.parse(config.content || '{}')).length > 3 ? '...' : '' }}
        </span>
      </div>
    </template>
    <template v-else-if="config.type === 'file'">
      <div class="flex items-center gap-3">
        <div class="w-10 h-10 rounded-md border-2 bg-gray-100 dark:bg-gray-800 flex items-center justify-center">
          <FileText class="w-5 h-5 text-gray-500" />
        </div>
        <div class="flex-1 min-w-0">
          <div class="flex items-center gap-2">
            <span class="text-sm font-medium truncate">{{ config.content.split('/').pop() || config.content }}</span>
            <Badge v-if="config.content.split('.').pop()" variant="secondary" class="text-xs px-2 py-0.5">{{ config.content.split('.').pop()?.toUpperCase() }}</Badge>
          </div>
          <span class="text-xs text-muted-foreground truncate block">{{ config.content }}</span>
        </div>
      </div>
    </template>
    <template v-else>
      <div class="flex items-center gap-2">
        <FileText class="w-4 h-4 text-blue-500 flex-shrink-0" />
        <span class="text-sm truncate max-w-md">{{ config.content }}</span>
      </div>
    </template>
  </div>
</template>