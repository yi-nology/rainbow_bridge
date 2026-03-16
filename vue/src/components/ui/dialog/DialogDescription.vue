<script setup lang="ts">
import { DialogDescription, type DialogDescriptionProps } from 'radix-vue'
import { cn } from '@/lib/utils'

interface Props extends DialogDescriptionProps {
  class?: string
}

const props = defineProps<Props>()
</script>

<template>
  <DialogDescription :class="cn('text-sm text-muted-foreground', props.class)">
    <slot />
  </DialogDescription>
</template>
