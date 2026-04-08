<script setup lang="ts">
import { computed } from 'vue'
import { cva, type VariantProps } from 'class-variance-authority'
import { cn } from '@/lib/utils'

const inputVariants = cva(
  'flex w-full rounded-md border border-input bg-transparent px-3 py-2 text-sm shadow-sm transition-all-standard feedback-focus disabled:cursor-not-allowed disabled:opacity-50 file:border-0 file:bg-transparent file:text-sm file:font-medium file:text-foreground placeholder:text-muted-foreground',
  {
    variants: {
      size: {
        default: 'h-8 sm:h-9',
        sm: 'h-7 sm:h-8',
        lg: 'h-9 sm:h-10',
      },
    },
    defaultVariants: {
      size: 'default',
    },
  }
)

type InputVariants = VariantProps<typeof inputVariants>

interface Props {
  modelValue?: string | number
  type?: string
  placeholder?: string
  disabled?: boolean
  size?: InputVariants['size']
  class?: string
}

const props = withDefaults(defineProps<Props>(), {
  type: 'text',
  size: 'default',
})

const emit = defineEmits<{
  'update:modelValue': [value: string]
}>()

const classes = computed(() =>
  cn(
    inputVariants({ size: props.size }),
    props.class
  )
)

const handleInput = (e: Event) => {
  emit('update:modelValue', (e.target as HTMLInputElement).value)
}
</script>

<template>
  <input
    :type="type"
    :class="classes"
    :value="modelValue"
    :placeholder="placeholder"
    :disabled="disabled"
    @input="handleInput"
  />
</template>
