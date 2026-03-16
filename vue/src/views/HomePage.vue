<script setup lang="ts">
import AppSidebar from '@/components/AppSidebar.vue'
import ProjectIntro from '@/components/ProjectIntro.vue'
import ApiDocs from '@/components/ApiDocs.vue'
import RuntimeConfig from '@/components/RuntimeConfig.vue'
</script>

<template>
  <div class="flex min-h-screen">
    <AppSidebar />
    <main class="flex-1 p-8 overflow-auto">
      <div class="max-w-5xl mx-auto space-y-6">
        <div class="mb-8">
          <h1 class="text-2xl font-bold tracking-tight">项目概览</h1>
          <p class="text-muted-foreground mt-1">
            虹桥计划 · 前端资源配置中台
          </p>
        </div>

        <ProjectIntro />
        <ApiDocs />
        <RuntimeConfig />
      </div>
    </main>
  </div>
</template>
