<script setup lang="ts">
import { computed } from 'vue'
import type { Decimal } from '@/lib/api/maintenance-backup'
import { decimalCount } from './maintenance-presentation'
const props = defineProps<{ counts?: Record<string, Decimal> | null }>()
const labels: Record<string, string> = { environments: '环境', pipelines: '渠道', configs: '配置', assets: '资源', versions: '版本', deleted_versions: '已删除版本', freeze_events: '锁版记录', release_events: '发布记录', configs_deleted: '已删除配置', assets_deleted: '已删除资源' }
const rows = computed(() => Object.entries(labels).filter(([key]) => props.counts?.[key] !== undefined))
</script>
<template><dl v-if="rows.length" class="maintenance-counts"><div v-for="[key, label] in rows" :key="key"><dt>{{ label }}</dt><dd>{{ decimalCount(counts?.[key]) }}</dd></div></dl></template>
