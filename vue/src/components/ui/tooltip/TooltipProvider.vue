<script setup lang="ts">
import { TooltipProvider } from 'radix-vue'

interface Props {
  delayDuration?: number
  skipDelayDuration?: number
  disableHoverableContent?: boolean
}

const props = withDefaults(defineProps<Props>(), {
  delayDuration: 0,
})
</script>

<template>
  <TooltipProvider
    data-slot="tooltip-provider"
    :delay-duration="props.delayDuration"
    :skip-delay-duration="skipDelayDuration"
    :disable-hoverable-content="disableHoverableContent"
  >
    <slot />
  </TooltipProvider>
</template>
