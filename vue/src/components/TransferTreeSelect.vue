<script setup lang="ts">
import ExportTreeSelect from '@/components/ExportTreeSelect.vue'
import ImportPreviewTree from '@/components/ImportPreviewTree.vue'
import type {
  ExportTreeEnvironment,
  ImportPreviewEnvironment,
  ExportSelection,
} from '@/lib/api/transfer'

interface TransferTreeSelectProps {
  mode: 'export' | 'import'
  data: ExportTreeEnvironment[] | ImportPreviewEnvironment[]
  loading?: boolean
}

const props = defineProps<TransferTreeSelectProps>()

const emit = defineEmits<{
  change: [selections: ExportSelection[]]
}>()

function handleChange(selections: ExportSelection[]) {
  emit('change', selections)
}
</script>

<template>
  <div class="transfer-tree-select">
    <ExportTreeSelect
      v-if="props.mode === 'export'"
      :data="props.data as ExportTreeEnvironment[]"
      :loading="props.loading"
      @change="handleChange"
    />
    <ImportPreviewTree
      v-else-if="props.mode === 'import'"
      :data="props.data as ImportPreviewEnvironment[]"
      @change="handleChange"
    />
  </div>
</template>
