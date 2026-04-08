<script setup lang="ts">
import { cva, type VariantProps } from 'class-variance-authority'
import { cn } from '@/lib/utils'

const cardVariants = cva(
  'rounded-xl border bg-card text-card-foreground transition-all duration-200',
  {
    variants: {
      variant: {
        default: 'shadow',
        elevated: 'shadow-lg',
        outline: 'border border-input',
        plain: '',
      },
      size: {
        default: 'p-4 sm:p-6',
        sm: 'p-3 sm:p-4',
        md: 'p-4 sm:p-6',
        lg: 'p-6 sm:p-8',
      },
    },
    defaultVariants: {
      variant: 'default',
      size: 'default',
    },
  }
)

type CardVariants = VariantProps<typeof cardVariants>

interface Props {
  variant?: CardVariants['variant']
  size?: CardVariants['size']
  class?: string
}

const props = withDefaults(defineProps<Props>(), {
  variant: 'default',
  size: 'default',
})

const classes = cn(cardVariants({ variant: props.variant, size: props.size }), props.class)
</script>

<template>
  <div :class="classes">
    <slot />
  </div>
</template>
