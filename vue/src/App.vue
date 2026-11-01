<script setup lang="ts">
import { Toaster } from 'vue-sonner'
import 'vue-sonner/style.css'
import '@/styles/spectrum-notifications.css'
import { useAuthStore } from '@/stores/auth'
import AuthLoading from '@/components/auth/AuthLoading.vue'
import AuthRecovery from '@/components/auth/AuthRecovery.vue'
import { isMaintenanceTaskPath } from '@/lib/maintenance-route'
const auth = useAuthStore()
</script>

<template>
  <div class="min-h-screen bg-background text-foreground">
    <AuthLoading v-if="auth.restoring && !$route.matched.length" />
    <AuthRecovery v-else-if="auth.status === 'failed' && !['/', '/login'].includes($route.path) && !isMaintenanceTaskPath($route.path)" />
    <RouterView v-else />
    <Toaster class="spectrum-toaster" position="top-center" :offset="24" :rich-colors="true" :close-button="true" :toast-options="{ closeButtonAriaLabel: '关闭提示' }" />
  </div>
</template>
