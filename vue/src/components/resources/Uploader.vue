<script setup lang="ts">
import { ref } from 'vue'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Upload, Loader2, Search } from 'lucide-vue-next'
import { useAssetStore } from '@/stores/asset'

const assetStore = useAssetStore()

const props = defineProps<{
  selectedEnvKey: string
  selectedPipelineKey: string
  searchTerm: string
  onSearchChange: (value: string) => void
}>()

const fileInputRef = ref<HTMLInputElement | null>(null)

const handleUploadClick = () => {
  fileInputRef.value?.click()
}

const handleFileChange = async (e: Event) => {
  const file = (e.target as HTMLInputElement).files?.[0]
  if (!file || !props.selectedEnvKey || !props.selectedPipelineKey) return

  await assetStore.uploadAsset(file, props.selectedEnvKey, props.selectedPipelineKey)

  if (fileInputRef.value) {
    fileInputRef.value.value = ''
  }
}
</script>

<template>
  <div class="flex items-center gap-3">
    <div class="relative">
      <Search class="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground" />
      <Input
        placeholder="搜索资源..."
        class="pl-9 w-64"
        :value="searchTerm"
        @input="onSearchChange($event.target.value)"
        :disabled="!selectedEnvKey || !selectedPipelineKey"
      />
    </div>
    <input
      type="file"
      ref="fileInputRef"
      class="hidden"
      @change="handleFileChange"
      accept="image/*,application/json,text/*"
    />
    <Button
      @click="handleUploadClick"
      :disabled="!selectedEnvKey || !selectedPipelineKey || assetStore.loading"
    >
      <Loader2 v-if="assetStore.loading" class="w-4 h-4 mr-2 animate-spin" />
      <Upload v-else class="w-4 h-4 mr-2" />
      上传资源
    </Button>
  </div>
</template>