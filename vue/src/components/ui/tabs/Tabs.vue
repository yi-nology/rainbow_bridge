<script setup lang="ts">
import { TabsRoot } from 'radix-vue'
import { cn } from '@/lib/utils'

interface Props {
  modelValue?: string
  defaultValue?: string
  class?: string
}

const props = defineProps<Props>()

const emit = defineEmits<{
  'update:modelValue': [value: string]
}>()
</script>

<template>
  <TabsRoot
    :model-value="modelValue"
    :default-value="defaultValue"
    data-slot="tabs"
    :class="cn('flex flex-col gap-2', props.class)"
    @update:model-value="emit('update:modelValue', $event)"
  >
    <slot />
  </TabsRoot>
</template>
