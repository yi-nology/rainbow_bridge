<script setup lang="ts">
import { Toaster } from 'vue-sonner'
</script>

<template>
  <div class="min-h-screen bg-background text-foreground">
    <RouterView />
    <Toaster position="top-center" :richColors="true" />
  </div>
</template>
