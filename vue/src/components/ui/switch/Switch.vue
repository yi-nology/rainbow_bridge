<script setup lang="ts">
import { SwitchRoot, SwitchThumb } from 'radix-vue'
import { cn } from '@/lib/utils'

interface Props {
  modelValue?: boolean
  defaultValue?: boolean
  disabled?: boolean
  class?: string
}

const props = defineProps<Props>()

const emit = defineEmits<{
  'update:modelValue': [value: boolean]
}>()
</script>

<template>
  <SwitchRoot
    :checked="modelValue"
    :default-checked="defaultValue"
    :disabled="disabled"
    :class="cn(
      'peer inline-flex h-5 w-9 shrink-0 cursor-pointer items-center rounded-full border-2 border-transparent shadow-sm transition-all-standard feedback-focus disabled:cursor-not-allowed disabled:opacity-50 data-[state=checked]:bg-primary data-[state=unchecked]:bg-input',
      props.class
    )"
    @update:checked="emit('update:modelValue', $event)"
  >
    <SwitchThumb
      class="pointer-events-none block h-4 w-4 rounded-full bg-background shadow-lg ring-0 transition-transform duration-[var(--duration-normal)] ease-[var(--ease-in-out)] data-[state=checked]:translate-x-4 data-[state=unchecked]:translate-x-0"
    />
  </SwitchRoot>
</template>
