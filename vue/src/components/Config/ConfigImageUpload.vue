<script setup lang="ts">
import { computed, ref, watch } from 'vue'
import { ImageOff, Loader2, Upload } from 'lucide-vue-next'
import { Button } from '@/components/ui/button'
import { IMAGE_ACCEPT } from '@/lib/image-upload'
import { resolveAssetUrl } from '@/lib/utils'
import { useDialogAttempt } from '@/composables/useDialogAttempt'

const props = defineProps<{ content: string; disabled: boolean; uploading: boolean; invalid?: boolean; selectionContext: string }>()
const emit = defineEmits<{ select: [files: File[]] }>()
const input = ref<HTMLInputElement | null>(null)
const dragging = ref(false), failed = ref(false), retry = ref(0)
const source = computed(() => resolveAssetUrl(props.content))
let selectionValid = () => false
const beginSelection = useDialogAttempt(() => [props.selectionContext, props.disabled], () => { selectionValid = () => false })
watch(() => [props.content, props.disabled], () => { dragging.value = false; failed.value = false })

function choose() { if (!props.disabled) { selectionValid = beginSelection(); input.value?.click() } }
function selected(event: Event) {
  const target = event.target as HTMLInputElement
  const files = Array.from(target.files || [])
  target.value = '' // Choosing the same file again must still trigger change.
  if (selectionValid() && !props.disabled && files.length) emit('select', files)
}
function dragOver(event: DragEvent) {
  if (!event.dataTransfer?.types.includes('Files')) return
  event.preventDefault()
  event.dataTransfer.dropEffect = props.disabled ? 'none' : 'copy'
  dragging.value = !props.disabled
}
function dragLeave(event: DragEvent) {
  if (!(event.relatedTarget instanceof Node) || !(event.currentTarget as HTMLElement).contains(event.relatedTarget)) dragging.value = false
}
function drop(event: DragEvent) {
  dragging.value = false
  if (!event.dataTransfer?.types.includes('Files')) return
  event.preventDefault()
  if (props.disabled) return
  // Reject directory/URL drops, never traverse a directory or silently pick a file.
  const items = Array.from(event.dataTransfer.items || [])
  if (items.some(item => item.kind !== 'file' || item.webkitGetAsEntry?.()?.isDirectory)) {
    emit('select', [])
    return
  }
  emit('select', Array.from(event.dataTransfer.files))
}
function reload() { failed.value = false; retry.value++ }
</script>

<template>
  <!-- §2.1/§3.6: image or drop target first, selection second, size hint last.
       Existing Spectrum card/input/link/ring tokens; one shared upload action. -->
  <div id="content" tabindex="-1" class="spectrum-image-upload" :class="{ 'is-dragging': dragging, 'is-invalid': invalid, 'is-disabled': disabled }"
    :aria-busy="uploading" @click="choose" @dragover="dragOver" @dragleave="dragLeave" @drop="drop">
    <input ref="input" type="file" class="hidden" :accept="IMAGE_ACCEPT" :disabled="disabled" aria-label="选择配置图片" @click.stop @change="selected" />
    <div v-if="uploading" class="spectrum-image-upload-placeholder" role="status"><Loader2 :size="24" class="animate-spin" /><span>上传中…</span></div>
    <template v-else>
      <img v-if="content && !failed" :key="retry" :src="source" alt="配置图片预览" @error="failed = true" />
      <div v-else class="spectrum-image-upload-placeholder">
        <ImageOff v-if="failed" :size="24" /><Upload v-else :size="24" />
        <p v-if="failed" role="status">图片暂无法预览，可能加载失败或浏览器不支持此格式。已保留图片引用。</p>
        <span v-else>{{ dragging ? '松开以上传图片' : '点击或拖拽图片到此处' }}</span>
      </div>
      <div class="spectrum-image-upload-actions">
        <Button v-if="failed" type="button" variant="ghost" size="sm" @click.stop="reload">重试预览</Button>
        <Button type="button" variant="outline" size="sm" :disabled="disabled" @click.stop="choose">{{ content ? '重新选择图片' : '选择图片' }}</Button>
      </div>
      <p class="spectrum-image-upload-hint">{{ content ? '可拖入一张图片替换 · ' : '' }}单张图片，不超过 10 MiB</p>
    </template>
  </div>
</template>

<style scoped>
.spectrum-image-upload { display: grid; justify-items: center; gap: 16px; padding: 24px; min-height: 160px; border: 1px dashed var(--input); border-radius: 12px; background: var(--card); color: var(--muted-foreground); transition: border-color 160ms ease, background-color 160ms ease; }
.spectrum-image-upload.is-dragging { border-color: var(--spectrum-link); background: var(--spectrum-hover); outline: 2px solid var(--ring); outline-offset: 2px; }
.spectrum-image-upload.is-invalid { border-color: var(--destructive); }
.spectrum-image-upload:focus-visible { outline: 2px solid var(--ring); outline-offset: 2px; }
.spectrum-image-upload img { display: block; max-width: 100%; max-height: 192px; object-fit: contain; border-radius: 8px; }
.spectrum-image-upload-placeholder { display: grid; justify-items: center; gap: 8px; text-align: center; font-size: 14px; line-height: 1.6; }
.spectrum-image-upload-placeholder p { max-width: 32em; }
.spectrum-image-upload-actions { display: flex; align-items: center; gap: 8px; }
.spectrum-image-upload-hint { font-size: 12px; line-height: 1.5; }
.spectrum-image-upload.is-disabled { border-style: solid; }
@media (prefers-reduced-motion: reduce) { .spectrum-image-upload { transition: none; } }
</style>
