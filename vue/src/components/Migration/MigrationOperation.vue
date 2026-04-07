<script setup lang="ts">
import { Card, CardContent } from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import { Check } from 'lucide-vue-next'

interface Props {
  status: string
  selectedConfigs: string[]
}

interface Emits {
  (e: 'reset'): void
}

defineProps<Props>()
const emit = defineEmits<Emits>()

const handleReset = () => {
  emit('reset')
}
</script>

<template>
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
</template>