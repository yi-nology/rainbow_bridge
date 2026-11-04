<script setup lang="ts">
import { ref, watch, onMounted, onUnmounted, computed } from 'vue'
import { useScopeSelection } from '@/composables/useScopeSelection'
import SpectrumLayout from '@/components/spectrum/SpectrumLayout.vue'
import SpectrumPageHeader from '@/components/spectrum/SpectrumPageHeader.vue'
import { Button } from '@/components/ui/button'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Loader2, Layers, LockKeyhole } from 'lucide-vue-next'
import { toast } from 'vue-sonner'
import { useEnvironmentStore } from '@/stores/environment'
import { useAssetStore } from '@/stores/asset'
import { useFreezeStore } from '@/stores/freeze'
import { resolveAssetUrl } from '@/lib/utils'

// 导入拆分的组件
import EnvironmentChannelSelector from '@/components/resources/EnvironmentChannelSelector.vue'
import ResourceList from '@/components/resources/ResourceList.vue'
import ImagePreview from '@/components/resources/ImagePreview.vue'
import Uploader from '@/components/resources/Uploader.vue'
import DeleteAssetDialog from '@/components/resources/DeleteAssetDialog.vue'
import type { Asset } from '@/lib/api/transformers'
import { sessionIdentity } from '@/lib/auth/session'
import { scopeIdFor } from '@/lib/scope'

const environmentStore = useEnvironmentStore()
const assetStore = useAssetStore()
const freezeStore = useFreezeStore()

const searchTerm = ref('')
const { selectedEnvKey, selectedPipelineKey, selectedScopeId, envPipelineModel, initialize } = useScopeSelection(() => environmentStore.environments)
const copiedId = ref<string | null>(null)
const deleteTarget = ref<Asset | null>(null)
const previewAssetId = ref('')

// 预览相关状态
const previewImage = ref<string>('')
const previewImageName = ref<string>('')
const isPreviewOpen = ref(false)

onMounted(async () => {
  await environmentStore.fetchOverview()
  if (!environmentStore.error) initialize()
})
onUnmounted(() => assetStore.resetAssets())

// 监听环境和渠道变化
watch([selectedEnvKey, selectedPipelineKey, selectedScopeId], ([envKey, pipelineKey]) => {
  isPreviewOpen.value = false
  previewImage.value = ''
  previewAssetId.value = ''
  deleteTarget.value = null
  if (envKey && pipelineKey) {
    assetStore.fetchAssets(envKey, pipelineKey)
    freezeStore.loadStatus(envKey, pipelineKey)
  } else {
    assetStore.resetAssets()
  }
  searchTerm.value = ''
  copiedId.value = null
})

const frozen = computed(() => freezeStore.isLocked(selectedEnvKey.value, selectedPipelineKey.value))
const frozenReason = computed(() => freezeStore.statusFor(selectedEnvKey.value, selectedPipelineKey.value)?.last_reason || '')
const deleteReady = computed(() => !!sessionIdentity.value && !!selectedScopeId.value &&
  selectedScopeId.value === scopeIdFor(selectedEnvKey.value, selectedPipelineKey.value) &&
  freezeStore.statusFor(selectedEnvKey.value, selectedPipelineKey.value)?.state === 'unlocked' && !assetStore.loading)
const scopeLabel = computed(() => {
  const environment = environmentStore.environments.find(item => item.key === selectedEnvKey.value)
  const pipeline = environment?.pipelines.find(item => item.key === selectedPipelineKey.value)
  return `${environment?.name || selectedEnvKey.value} / ${pipeline?.name || selectedPipelineKey.value}`
})
watch(sessionIdentity, () => { deleteTarget.value = null; closePreview(); previewImage.value = ''; previewAssetId.value = '' }, { flush: 'sync' })

async function deleted(asset: Asset, scopeId: string) {
  if (scopeId !== selectedScopeId.value) return
  deleteTarget.value = null
  if (previewAssetId.value === asset.id) { closePreview(); previewImage.value = ''; previewImageName.value = ''; previewAssetId.value = '' }
  if (copiedId.value === asset.id) copiedId.value = null
  toast.success('资源已删除')
  await assetStore.fetchAssets(selectedEnvKey.value, selectedPipelineKey.value, scopeId)
}

// 处理复制链接
const handleCopy = async (url: string, id: string) => {
  const fullUrl = url.startsWith('http') ? url : `${window.location.origin}${url}`
  try { await navigator.clipboard.writeText(fullUrl) }
  catch { toast.error('复制失败，请手动复制资源链接'); return }
  copiedId.value = id
  setTimeout(() => copiedId.value = null, 2000)
}

// 处理图片预览
const handlePreviewImage = (url: string, name: string) => {
  previewAssetId.value = assetStore.assets.find(item => item.url === url)?.id || ''
  previewImage.value = resolveAssetUrl(url)
  previewImageName.value = name
  isPreviewOpen.value = true
}

// 关闭预览
const closePreview = () => {
  isPreviewOpen.value = false
}

// 处理搜索变化
const handleSearchChange = (value: string) => {
  searchTerm.value = value
}
</script>

<template>
  <SpectrumLayout>
    <div class="spectrum-operations spectrum-resources-page">
    <SpectrumPageHeader eyebrow="ASSETS / CONTENT LIBRARY" title="资源管理" />
    <!-- 环境和渠道选择组件 -->
    <Card class="spectrum-panel spectrum-scope-panel">
      <CardHeader class="spectrum-panel-header">
        <CardTitle class="text-lg">工作范围</CardTitle>
      </CardHeader>
      <CardContent class="spectrum-panel-content">
        <EnvironmentChannelSelector
          v-model="envPipelineModel"
        />
      </CardContent>
    </Card>
    <div v-if="frozen" class="spectrum-resource-freeze"><LockKeyhole :size="16" /><strong>已冻结 · 资源只读</strong><span>{{ frozenReason || '当前范围不可上传或删除资源，预览与链接复制不受影响。' }}</span></div>

    <!-- 资源列表和上传功能 -->
    <Card class="spectrum-panel spectrum-section">
      <CardHeader class="spectrum-panel-header">
        <div class="spectrum-resource-heading">
          <CardTitle class="text-lg">资源列表 <span v-if="selectedEnvKey && selectedPipelineKey && !assetStore.loading" class="ml-3 text-xs text-muted-foreground font-normal">{{ assetStore.assets.length }} 份资源</span></CardTitle>
          <!-- 上传功能组件 -->
          <Uploader
            :key="selectedScopeId"
            :scope-id="selectedScopeId"
            :selectedEnvKey="selectedEnvKey"
            :selectedPipelineKey="selectedPipelineKey"
            :searchTerm="searchTerm"
            :onSearchChange="handleSearchChange"
            :frozen="frozen"
            :frozenReason="frozenReason"
          />
        </div>
      </CardHeader>
      <CardContent class="spectrum-panel-content">
        <div v-if="!selectedEnvKey || !selectedPipelineKey" class="spectrum-empty">
          <div class="w-16 h-16 rounded-full bg-muted flex items-center justify-center mb-4">
            <Layers class="w-8 h-8 text-muted-foreground" />
          </div>
          <h3 class="text-lg font-medium mb-2">请先选择环境和渠道</h3>
        </div>
        <div v-else-if="assetStore.loading" class="flex items-center justify-center py-16">
          <Loader2 class="w-8 h-8 animate-spin text-muted-foreground" />
        </div>
        <div v-else-if="assetStore.error" class="spectrum-empty" role="alert"><h3>资源加载失败</h3><p>{{ assetStore.error }}</p><Button variant="outline" @click="assetStore.fetchAssets(selectedEnvKey, selectedPipelineKey)">重试</Button></div>
        <div v-else>
          <!-- 资源列表组件 -->
          <ResourceList
            :scope-id="selectedScopeId"
            :can-delete="deleteReady && !frozen"
            :frozen="frozen"
            @delete="resource => { if (deleteReady && !frozen) deleteTarget = resource }"
            :selectedEnvKey="selectedEnvKey"
            :selectedPipelineKey="selectedPipelineKey"
            :onPreviewImage="handlePreviewImage"
            :onCopy="handleCopy"
            :copiedId="copiedId"
            :searchTerm="searchTerm"
          />
        </div>
      </CardContent>
    </Card>

    <!-- 图片预览组件 -->
    <ImagePreview
      :isOpen="isPreviewOpen"
      :imageUrl="previewImage"
      :imageName="previewImageName"
      :onClose="closePreview"
    />
    <DeleteAssetDialog :target="deleteTarget" :environment-key="selectedEnvKey" :pipeline-key="selectedPipelineKey" :scope-id="selectedScopeId" :scope-label="scopeLabel" :frozen="frozen" :ready="deleteReady" @close="deleteTarget = null" @deleted="deleted" />
    </div>
  </SpectrumLayout>
</template>
