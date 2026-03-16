<script setup lang="ts">
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Zap, Shield, GitBranch, Settings } from 'lucide-vue-next'

const features = [
  {
    icon: Zap,
    title: '轻量高效',
    description: '基于 Go 语言开发，内存占用低，启动速度快，适合容器化部署',
  },
  {
    icon: Shield,
    title: '安全可靠',
    description: '支持写锁机制，防止并发写入冲突，数据安全有保障',
  },
  {
    icon: GitBranch,
    title: '多环境管理',
    description: '支持多环境、多渠道配置管理，轻松应对复杂的业务场景',
  },
  {
    icon: Settings,
    title: '丰富类型',
    description: '支持文本、数字、布尔、JSON、图片等多种配置类型',
  },
]
</script>

<template>
  <Card>
    <CardHeader>
      <CardTitle class="text-lg">项目特性</CardTitle>
    </CardHeader>
    <CardContent>
      <div class="grid grid-cols-2 gap-4">
        <div
          v-for="feature in features"
          :key="feature.title"
          class="p-4 rounded-lg border bg-muted/30"
        >
          <div class="flex items-center gap-3 mb-2">
            <div class="p-2 rounded-md bg-primary/10">
              <component :is="feature.icon" class="w-4 h-4 text-primary" />
            </div>
            <h3 class="font-medium text-sm">{{ feature.title }}</h3>
          </div>
          <p class="text-xs text-muted-foreground">{{ feature.description }}</p>
        </div>
      </div>
    </CardContent>
  </Card>
</template>
