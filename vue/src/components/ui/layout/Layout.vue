<script setup lang="ts">
import AppSidebar from '../../AppSidebar.vue'

const props = defineProps({
  title: {
    type: String,
    required: false
  },
  description: {
    type: String,
    required: false
  }
})
</script>

<template>
  <div class="flex min-h-screen bg-background text-foreground">
    <AppSidebar />
    <main class="flex-1 p-4 sm:p-6 md:p-8 overflow-auto">
      <div class="max-w-5xl mx-auto space-y-6">
        <div v-if="title || $slots.header" class="mb-6 sm:mb-8">
          <slot name="header">
            <h1 v-if="title" class="text-xl sm:text-2xl md:text-3xl font-bold tracking-tight">{{ title }}</h1>
            <p v-if="description" class="text-muted-foreground mt-1 text-sm sm:text-base">
              {{ description }}
            </p>
          </slot>
        </div>
        <slot />
      </div>
    </main>
  </div>
</template>