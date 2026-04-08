<script setup lang="ts">
import { Layout } from '@/components/ui/layout'
import ProjectIntro from '@/components/ProjectIntro.vue'
import ApiDocs from '@/components/ApiDocs.vue'
import RuntimeConfig from '@/components/RuntimeConfig.vue'
</script>

<template>
  <Layout
    title="项目概览"
    description="虹桥计划 · 前端资源配置中台"
  >
    <ProjectIntro />
    <ApiDocs />
    <RuntimeConfig />
  </Layout>
</template>
