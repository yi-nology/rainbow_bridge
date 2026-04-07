<script setup lang="ts">
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/card'
import { FileArchive } from 'lucide-vue-next'

type ExportFormat = 'zip' | 'tar.gz'

const { format } = defineProps<{
  format: ExportFormat
}>()

const emit = defineEmits<{
  (e: 'change', format: ExportFormat): void
}>()

const handleFormatChange = (newFormat: ExportFormat) => {
  emit('change', newFormat)
}
</script>

<template>
  <Card>
    <CardHeader>
      <CardTitle class="text-lg">导出格式</CardTitle>
      <CardDescription>选择导出文件的格式</CardDescription>
    </CardHeader>
    <CardContent>
      <div class="grid grid-cols-2 gap-4">
        <div
          :class="[
            'flex items-center gap-4 p-4 rounded-lg border-2 cursor-pointer transition-colors',
            format === 'zip'
              ? 'border-primary bg-primary/5'
              : 'border-border hover:border-muted-foreground/50'
          ]"
          @click="handleFormatChange('zip')"
        >
          <FileArchive class="w-8 h-8 text-amber-500" />
          <div>
            <div class="font-medium">ZIP</div>
            <div class="text-sm text-muted-foreground">推荐格式</div>
          </div>
        </div>
        <div
          :class="[
            'flex items-center gap-4 p-4 rounded-lg border-2 cursor-pointer transition-colors',
            format === 'tar.gz'
              ? 'border-primary bg-primary/5'
              : 'border-border hover:border-muted-foreground/50'
          ]"
          @click="handleFormatChange('tar.gz')"
        >
          <FileArchive class="w-8 h-8 text-blue-500" />
          <div>
            <div class="font-medium">TAR.GZ</div>
            <div class="text-sm text-muted-foreground">通用压缩格式</div>
          </div>
        </div>
      </div>
    </CardContent>
  </Card>
</template>