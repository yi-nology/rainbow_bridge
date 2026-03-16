<script setup lang="ts">
import { Loader2 } from 'lucide-vue-next'
import { cn } from '@/lib/utils'

interface Props {
  class?: string
  size?: 'sm' | 'default' | 'lg'
}

const props = withDefaults(defineProps<Props>(), {
  size: 'default',
})

const sizeClasses = {
  sm: 'h-4 w-4',
  default: 'h-6 w-6',
  lg: 'h-8 w-8',
}
</script>

<template>
  <Loader2 :class="cn('animate-spin text-muted-foreground', sizeClasses[size], props.class)" />
</template>
