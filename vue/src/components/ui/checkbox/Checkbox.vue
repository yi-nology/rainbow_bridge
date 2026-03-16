<script setup lang="ts">
import { CheckboxRoot, CheckboxIndicator } from 'radix-vue'
import { Check } from 'lucide-vue-next'
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
  <CheckboxRoot
    :checked="modelValue"
    :default-checked="defaultValue"
    :disabled="disabled"
    data-slot="checkbox"
    :class="cn(
      'peer border-input dark:bg-input/30 data-[state=checked]:bg-primary data-[state=checked]:text-primary-foreground dark:data-[state=checked]:bg-primary data-[state=checked]:border-primary focus-visible:border-ring focus-visible:ring-ring/50 aria-invalid:ring-destructive/20 dark:aria-invalid:ring-destructive/40 aria-invalid:border-destructive size-4 shrink-0 rounded-[4px] border shadow-xs transition-shadow outline-none focus-visible:ring-[3px] disabled:cursor-not-allowed disabled:opacity-50',
      props.class
    )"
    @update:checked="emit('update:modelValue', $event)"
  >
    <CheckboxIndicator
      data-slot="checkbox-indicator"
      class="flex items-center justify-center text-current transition-none"
    >
      <Check class="size-3.5" />
    </CheckboxIndicator>
  </CheckboxRoot>
</template>
