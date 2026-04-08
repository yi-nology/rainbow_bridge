<script setup lang="ts">
import { SelectTrigger as RadixSelectTrigger, SelectIcon } from 'radix-vue'
import { ChevronDown } from 'lucide-vue-next'
import { cva, type VariantProps } from 'class-variance-authority'
import { cn } from '@/lib/utils'

const selectTriggerVariants = cva(
  'flex w-full items-center justify-between whitespace-nowrap rounded-md border border-input bg-transparent px-3 py-2 text-sm shadow-sm transition-all-standard ring-offset-background placeholder:text-muted-foreground feedback-focus disabled:cursor-not-allowed disabled:opacity-50 [&>span]:line-clamp-1 sm:text-sm',
  {
    variants: {
      size: {
        default: 'h-9',
        sm: 'h-8',
        lg: 'h-10',
      },
    },
    defaultVariants: {
      size: 'default',
    },
  }
)

type SelectTriggerVariants = VariantProps<typeof selectTriggerVariants>

interface Props {
  size?: SelectTriggerVariants['size']
  class?: string
  disabled?: boolean
}

const props = withDefaults(defineProps<Props>(), {
  size: 'default',
})
</script>

<template>
  <RadixSelectTrigger
    :class="cn(
      selectTriggerVariants({ size: props.size }),
      props.class
    )"
    :disabled="disabled"
  >
    <slot />
    <SelectIcon as-child>
      <ChevronDown class="h-4 w-4 opacity-50 transition-transform duration-[var(--duration-normal)]" />
    </SelectIcon>
  </RadixSelectTrigger>
</template>
