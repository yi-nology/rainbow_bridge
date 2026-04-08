<script setup lang="ts">
import { cva, type VariantProps } from 'class-variance-authority'
import { cn } from '@/lib/utils'

const cardContentVariants = cva('space-y-4', {
  variants: {
    size: {
      default: 'p-6',
      sm: 'p-4',
      md: 'p-6',
      lg: 'p-8',
    },
  },
  defaultVariants: {
    size: 'default',
  },
})

type CardContentVariants = VariantProps<typeof cardContentVariants>

interface Props {
  size?: CardContentVariants['size']
  class?: string
}

const props = withDefaults(defineProps<Props>(), {
  size: 'default',
})

const classes = cn(cardContentVariants({ size: props.size }), props.class)
</script>

<template>
  <div :class="classes">
    <slot />
  </div>
</template>
