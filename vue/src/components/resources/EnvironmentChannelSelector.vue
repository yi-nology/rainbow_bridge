<script setup lang="ts">
import { ref, computed, watch } from 'vue'
import { Select, SelectTrigger, SelectValue, SelectContent, SelectItem } from '@/components/ui/select'
import { Badge } from '@/components/ui/badge'
import { Layers, GitBranch } from 'lucide-vue-next'
import { useEnvironmentStore } from '@/stores/environment'

const environmentStore = useEnvironmentStore()

const props = defineProps<{
  modelValue: {
    envKey: string
    pipelineKey: string
  }
}>()

const emit = defineEmits<{
  (e: 'update:modelValue', value: { envKey: string; pipelineKey: string }): void
}>()

const selectedEnvKey = ref(props.modelValue.envKey)
const selectedPipelineKey = ref(props.modelValue.pipelineKey)

const selectedEnvironment = computed(() =>
  environmentStore.environments.find((e) => e.key === selectedEnvKey.value)
)

const pipelines = computed(() => selectedEnvironment.value?.pipelines || [])

watch(selectedEnvKey, () => {
  selectedPipelineKey.value = ''
  emit('update:modelValue', {
    envKey: selectedEnvKey.value,
    pipelineKey: ''
  })
})

watch([selectedEnvKey, selectedPipelineKey], ([envKey, pipelineKey]) => {
  emit('update:modelValue', {
    envKey,
    pipelineKey
  })
})

const handleEnvChange = (envKey: string) => {
  selectedEnvKey.value = envKey
}
</script>

<template>
  <div class="flex items-center gap-6">
    <div class="flex items-center gap-3">
      <div class="flex items-center gap-2 text-muted-foreground">
        <Layers class="w-4 h-4" />
        <span class="text-sm font-medium">环境</span>
      </div>
      <Select :model-value="selectedEnvKey" @update:model-value="handleEnvChange" :disabled="environmentStore.loading">
        <SelectTrigger class="w-48">
          <SelectValue :placeholder="environmentStore.loading ? '加载中...' : '请选择环境'" />
        </SelectTrigger>
        <SelectContent>
          <SelectItem v-for="env in environmentStore.environments" :key="env.key" :value="env.key">
            {{ env.name }} ({{ env.key }})
          </SelectItem>
        </SelectContent>
      </Select>
    </div>

    <div class="flex items-center gap-3">
      <div class="flex items-center gap-2 text-muted-foreground">
        <GitBranch class="w-4 h-4" />
        <span class="text-sm font-medium">渠道</span>
      </div>
      <Select
        :model-value="selectedPipelineKey"
        @update:model-value="selectedPipelineKey = $event"
        :disabled="!selectedEnvKey"
      >
        <SelectTrigger class="w-48">
          <SelectValue :placeholder="selectedEnvKey ? '请选择渠道' : '先选择环境'" />
        </SelectTrigger>
        <SelectContent>
          <SelectItem v-for="pipeline in pipelines" :key="pipeline.key" :value="pipeline.key">
            {{ pipeline.name }} ({{ pipeline.key }})
          </SelectItem>
        </SelectContent>
      </Select>
    </div>

    <Badge v-if="selectedEnvKey && selectedPipelineKey" variant="secondary" class="ml-auto">
      已选择: {{ selectedEnvironment?.name }} / {{ pipelines.find(p => p.key === selectedPipelineKey)?.name }}
    </Badge>
  </div>
</template>