<script setup lang="ts">
import { TooltipProvider, TooltipRoot } from 'radix-vue'

interface Props {
  modelValue?: boolean
  defaultOpen?: boolean
  delayDuration?: number
  disableHoverableContent?: boolean
}

const props = withDefaults(defineProps<Props>(), {
  delayDuration: 0,
})

const emit = defineEmits<{
  'update:modelValue': [value: boolean]
}>()
</script>

<template>
  <TooltipProvider :delay-duration="props.delayDuration">
    <TooltipRoot
      :open="modelValue"
      :default-open="defaultOpen"
      :disable-hoverable-content="disableHoverableContent"
      data-slot="tooltip"
      @update:open="emit('update:modelValue', $event)"
    >
      <slot />
    </TooltipRoot>
  </TooltipProvider>
</template>
