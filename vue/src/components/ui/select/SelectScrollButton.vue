<script setup lang="ts">
import { SelectScrollUpButton, SelectScrollDownButton } from 'radix-vue'
import { ChevronUp, ChevronDown } from 'lucide-vue-next'
import { cn } from '@/lib/utils'

interface Props {
  direction: 'up' | 'down'
  class?: string
}

const props = defineProps<Props>()
</script>

<template>
  <component
    :is="direction === 'up' ? SelectScrollUpButton : SelectScrollDownButton"
    :class="cn('flex cursor-default items-center justify-center py-1', props.class)"
  >
    <ChevronUp v-if="direction === 'up'" class="h-4 w-4" />
    <ChevronDown v-else class="h-4 w-4" />
  </component>
</template>
