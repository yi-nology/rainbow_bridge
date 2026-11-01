<script setup lang="ts">
import { Button } from '@/components/ui/button'
import type { MaintenanceIntent } from '@/lib/api/maintenance-backup'
defineProps<{ pending: MaintenanceIntent | null; error: string; busy: boolean; notFound: boolean; canRetry: boolean }>()
defineEmits<{ check: []; retry: [] }>()
</script>
<template>
  <div v-if="error" class="backup-alert is-danger" role="alert">{{ error }}</div>
  <section v-if="pending" class="backup-alert" role="status">
    <h2>提交结果尚未确认</h2><p>任务可能已受理。先查询原请求，避免重复操作。</p>
    <div class="backup-actions mt-3"><Button variant="outline" :disabled="busy" @click="$emit('check')">查询原请求结果</Button><Button v-if="notFound" variant="outline" :disabled="busy || !canRetry" @click="$emit('retry')">原样重试本次操作</Button></div>
  </section>
</template>
