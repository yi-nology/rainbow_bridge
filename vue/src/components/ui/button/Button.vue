<script setup lang="ts">
import { computed } from 'vue'
import { cva, type VariantProps } from 'class-variance-authority'
import { cn } from '@/lib/utils'

const buttonVariants = cva(
  'inline-flex items-center justify-center gap-2 whitespace-nowrap rounded-md text-sm font-medium transition-all-standard feedback-focus feedback-disabled [&_svg]:pointer-events-none [&_svg]:size-4 [&_svg]:shrink-0',
  {
    variants: {
      variant: {
        default: 'bg-primary text-primary-foreground shadow hover:bg-primary/90 active:bg-primary/80 feedback-click feedback-hover',
        destructive: 'bg-destructive text-destructive-foreground shadow-sm hover:bg-destructive/90 active:bg-destructive/80 feedback-click feedback-hover',
        outline: 'border border-input bg-background shadow-sm hover:bg-accent hover:text-accent-foreground active:bg-accent/80 feedback-click feedback-hover',
        secondary: 'bg-secondary text-secondary-foreground shadow-sm hover:bg-secondary/80 active:bg-secondary/70 feedback-click feedback-hover',
        ghost: 'hover:bg-accent hover:text-accent-foreground active:bg-accent/80 feedback-click',
        link: 'text-primary underline-offset-4 hover:underline active:underline feedback-click',
      },
      size: {
        default: 'h-8 sm:h-9 px-3 sm:px-4 py-2 sm:py-2',
        sm: 'h-7 sm:h-8 rounded-md px-2 sm:px-3 text-xs sm:text-sm',
        lg: 'h-9 sm:h-10 rounded-md px-6 sm:px-8',
        icon: 'h-8 sm:h-9 w-8 sm:w-9',
      },
    },
    defaultVariants: {
      variant: 'default',
      size: 'default',
    },
  }
)

type ButtonVariants = VariantProps<typeof buttonVariants>

interface Props {
  variant?: ButtonVariants['variant']
  size?: ButtonVariants['size']
  class?: string
  disabled?: boolean
  type?: 'button' | 'submit' | 'reset'
  loading?: boolean
}

const props = withDefaults(defineProps<Props>(), {
  variant: 'default',
  size: 'default',
  type: 'button',
  loading: false,
})

const classes = computed(() => cn(buttonVariants({ variant: props.variant, size: props.size }), props.class))
</script>

<template>
  <button :type="type" :class="classes" :disabled="disabled || loading">
    <slot />
  </button>
</template>
