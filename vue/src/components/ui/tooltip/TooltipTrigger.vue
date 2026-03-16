<script setup lang="ts">
import { TooltipTrigger } from 'radix-vue'
</script>

<template>
  <TooltipTrigger data-slot="tooltip-trigger">
    <slot />
  </TooltipTrigger>
</template>
