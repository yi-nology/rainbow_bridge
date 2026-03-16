<script setup lang="ts">
import { Label as LabelPrimitive } from 'radix-vue'
import { cn } from '@/lib/utils'

interface Props {
  for?: string
  class?: string
}

const props = defineProps<Props>()
</script>

<template>
  <LabelPrimitive
    :for="props.for"
    :class="cn('text-sm font-medium leading-none peer-disabled:cursor-not-allowed peer-disabled:opacity-70', props.class)"
  >
    <slot />
  </LabelPrimitive>
</template>
