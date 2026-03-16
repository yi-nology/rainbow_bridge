<script setup lang="ts">
import { ref } from 'vue'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import { Badge } from '@/components/ui/badge'
import { Copy, Check, ExternalLink } from 'lucide-vue-next'
import { toast } from 'vue-sonner'

const copiedIndex = ref<number | null>(null)

const apiEndpoints = [
  {
    method: 'GET',
    path: '/api/v1/runtime/overview',
    description: '获取运行时概览（环境和渠道列表）',
  },
  {
    method: 'GET',
    path: '/api/v1/runtime/config',
    description: '获取运行时配置',
  },
  {
    method: 'POST',
    path: '/api/v1/runtime/static',
    description: '实时获取运行时状态',
  },
]

const methodColors: Record<string, string> = {
  GET: 'bg-green-100 text-green-800 dark:bg-green-900 dark:text-green-300',
  POST: 'bg-blue-100 text-blue-800 dark:bg-blue-900 dark:text-blue-300',
  PUT: 'bg-yellow-100 text-yellow-800 dark:bg-yellow-900 dark:text-yellow-300',
  DELETE: 'bg-red-100 text-red-800 dark:bg-red-900 dark:text-red-300',
}

const copyPath = async (path: string, index: number) => {
  await navigator.clipboard.writeText(path)
  copiedIndex.value = index
  toast.success('已复制到剪贴板')
  setTimeout(() => {
    copiedIndex.value = null
  }, 2000)
}
</script>

<template>
  <Card>
    <CardHeader>
      <div class="flex items-center justify-between">
        <CardTitle class="text-lg">前端对接</CardTitle>
        <a
          href="https://yi-nology.github.io/rainbow_bridge/api/"
          target="_blank"
          class="text-sm text-muted-foreground hover:text-primary flex items-center gap-1"
        >
          查看完整 API
          <ExternalLink class="w-3 h-3" />
        </a>
      </div>
    </CardHeader>
    <CardContent>
      <div class="space-y-2">
        <div
          v-for="(endpoint, index) in apiEndpoints"
          :key="endpoint.path"
          class="flex items-center justify-between p-3 rounded-lg border bg-muted/30"
        >
          <div class="flex items-center gap-3">
            <Badge :class="methodColors[endpoint.method]" class="font-mono text-xs">
              {{ endpoint.method }}
            </Badge>
            <code class="text-sm font-mono">{{ endpoint.path }}</code>
          </div>
          <div class="flex items-center gap-2">
            <span class="text-xs text-muted-foreground hidden md:block">{{ endpoint.description }}</span>
            <Button
              variant="ghost"
              size="icon"
              class="h-8 w-8"
              @click="copyPath(endpoint.path, index)"
            >
              <Check v-if="copiedIndex === index" class="w-4 h-4 text-green-600" />
              <Copy v-else class="w-4 h-4" />
            </Button>
          </div>
        </div>
      </div>
    </CardContent>
  </Card>
</template>
