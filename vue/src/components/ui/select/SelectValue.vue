<script setup lang="ts">
import { SelectValue as RadixSelectValue } from 'radix-vue'

interface Props {
  placeholder?: string
}

defineProps<Props>()
</script>

<template>
  <RadixSelectValue :placeholder="placeholder">
    <slot />
  </RadixSelectValue>
</template>
