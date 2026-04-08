<script setup lang="ts">
import { ref, computed, onMounted, watch } from 'vue'
import { Layout } from '@/components/ui/layout'
import { useEnvironmentStore } from '@/stores/environment'
import { useConfigStore } from '@/stores/config'
import { type ConfigType } from '@/lib/types'
import { resolveAssetUrl } from '@/lib/utils'
import EnvironmentSelector from '@/components/Config/EnvironmentSelector.vue'
import ConfigList from '@/components/Config/ConfigList.vue'
import ImagePreview from '@/components/resources/ImagePreview.vue'

const environmentStore = useEnvironmentStore()
const configStore = useConfigStore()

const selectedEnvKey = ref('')
const selectedPipelineKey = ref('')
const imagePreviewUrl = ref<string | null>(null)
const imagePreviewName = ref<string>('')

onMounted(() => {
  environmentStore.fetchOverview()
})

const selectedEnvironment = computed(() =>
  environmentStore.environments.find((env) => env.key === selectedEnvKey.value)
)

const pipelines = computed(() => selectedEnvironment.value?.pipelines || [])

const selectedPipeline = computed(() =>
  pipelines.value.find((pipeline) => pipeline.key === selectedPipelineKey.value)
)

watch(selectedEnvKey, () => {
  selectedPipelineKey.value = ''
})

watch([selectedEnvKey, selectedPipelineKey], ([envKey, pipelineKey]) => {
  if (envKey && pipelineKey) {
    configStore.fetchConfigs(envKey, pipelineKey)
  }
})

const handleCreate = async (config: {
  name: string
  alias: string
  type: string
  content: string
}) => {
  if (!selectedEnvKey.value || !selectedPipelineKey.value) return
  
  await configStore.createConfig(selectedEnvKey.value, selectedPipelineKey.value, {
    name: config.name,
    alias: config.alias,
    type: config.type as ConfigType,
    content: config.content,
  })
}

const handleUpdate = async (config: {
  id: string
  name: string
  alias: string
  type: string
  content: string
}) => {
  if (!selectedEnvKey.value || !selectedPipelineKey.value) return
  
  await configStore.updateConfig(selectedEnvKey.value, selectedPipelineKey.value, {
    id: config.id,
    name: config.name,
    alias: config.alias,
    type: config.type as ConfigType,
    content: config.content,
  })
}

const handleDelete = async (id: string) => {
  if (!selectedEnvKey.value || !selectedPipelineKey.value) return
  await configStore.deleteConfig(selectedEnvKey.value, selectedPipelineKey.value, id)
}

const handleImagePreview = (url: string, name: string = '图片预览') => {
  imagePreviewUrl.value = resolveAssetUrl(url)
  imagePreviewName.value = name
}

const handleCloseImagePreview = () => {
  imagePreviewUrl.value = null
}
</script>

<template>
  <Layout
    title="配置管理"
    description="管理指定环境和渠道的运行时配置项"
  >
    <EnvironmentSelector
      v-model:selected-env-key="selectedEnvKey"
      v-model:selected-pipeline-key="selectedPipelineKey"
    />

    <ConfigList
      :configs="configStore.configs"
      :loading="configStore.loading"
      :selected-env-key="selectedEnvKey"
      :selected-pipeline-key="selectedPipelineKey"
      :selected-environment-name="selectedEnvironment?.name"
      :selected-pipeline-name="selectedPipeline?.name"
      @create="handleCreate"
      @update="handleUpdate"
      @delete="handleDelete"
      @image-preview="handleImagePreview"
    />

    <ImagePreview
      :is-open="!!imagePreviewUrl"
      :image-url="imagePreviewUrl || ''"
      :image-name="imagePreviewName"
      :on-close="handleCloseImagePreview"
    />
  </Layout>
</template>
