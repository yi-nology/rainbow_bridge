<script setup lang="ts">
import { computed, ref, watch } from 'vue'
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription, DialogFooter } from '@/components/ui/dialog'
import { Button } from '@/components/ui/button'
import { useAssetStore } from '@/stores/asset'
import { useFreezeStore } from '@/stores/freeze'
import type { Asset } from '@/lib/api/transformers'
import { ApiError, isFreezeBlockedError } from '@/lib/api/error'
import { assetReferences, type AssetReferences } from '@/lib/api/asset-delete'
import { scopeIdFor } from '@/lib/scope'
import { sessionIdentity } from '@/lib/auth/session'
import { useDialogAttempt } from '@/composables/useDialogAttempt'

const props = defineProps<{ target: Asset | null; environmentKey: string; pipelineKey: string; scopeId: string; scopeLabel: string; frozen: boolean; ready: boolean }>()
const emit = defineEmits<{ close: []; deleted: [asset: Asset, scopeId: string] }>()
const store = useAssetStore(), freeze = useFreezeStore()
const deleting = ref(false), error = ref(''), references = ref<AssetReferences | null>(null)
const startAttempt = useDialogAttempt(() => [props.target?.id, props.scopeId, props.environmentKey, props.pipelineKey], () => { deleting.value = false; error.value = ''; references.value = null })
watch(sessionIdentity, () => emit('close'), { flush: 'sync' })
const available = computed(() => !!sessionIdentity.value && props.ready && !props.frozen && !!props.target &&
  props.target.scopeId === props.scopeId && scopeIdFor(props.environmentKey, props.pipelineKey) === props.scopeId)

function close(open: boolean) { if (!open && !deleting.value) emit('close') }
function focusCancel(event: Event) {
  event.preventDefault()
  if (event.target instanceof HTMLElement) event.target.querySelector<HTMLButtonElement>('[data-safe-cancel]')?.focus()
}
async function confirm() {
  if (!available.value || deleting.value || !props.target) return
  const target = props.target, scopeId = props.scopeId, environment = props.environmentKey, pipeline = props.pipelineKey
  const current = startAttempt()
  deleting.value = true; error.value = ''; references.value = null
  try {
    await store.removeAsset(target.id, environment, pipeline, scopeId)
    if (current()) emit('deleted', target, scopeId)
  } catch (cause) {
    if (!current()) return
    references.value = assetReferences(cause)
    error.value = cause instanceof ApiError && cause.errorType === 'ASSET_IN_USE'
      ? '该资源正在被配置使用，请先修改或删除引用配置。'
      : cause instanceof ApiError && (cause.code < 0 || cause.code >= 500) ? '删除结果未确认，请刷新资源列表核对后重试。'
      : cause instanceof Error ? cause.message : '删除失败，请稍后重试。'
    if (isFreezeBlockedError(cause)) await freeze.loadStatus(environment, pipeline)
  } finally { if (current()) deleting.value = false }
}
</script>

<template>
  <!-- §2.1/§2.8: target and consequence first; persistent references on failure.
       Existing Spectrum dialog/button/destructive tokens and 16/24px spacing. -->
  <Dialog :open="!!target" @update:open="close">
    <DialogContent class="spectrum-dialog asset-delete-dialog" :close-disabled="deleting" @pointer-down-outside="event => { if (deleting) event.preventDefault() }" @escape-key-down="event => { if (deleting) event.preventDefault() }" @open-auto-focus="focusCancel">
      <DialogHeader><DialogTitle>删除资源</DialogTitle><DialogDescription>删除后原链接将无法访问，已发布快照不受影响。</DialogDescription></DialogHeader>
      <div class="asset-delete-target"><strong>{{ target?.name }}</strong><span>{{ scopeLabel }}</span></div>
      <p v-if="frozen" class="text-sm text-destructive" role="status">当前范围已冻结，无法删除资源。</p>
      <div v-if="error" class="asset-delete-error" role="alert"><p>{{ error }}</p>
        <ul v-if="references" aria-label="引用此资源的配置"><li v-for="item in references.references" :key="item.scope_id + ':' + item.resource_key"><strong>{{ item.name || item.alias }}</strong><code>{{ item.alias }}</code><span>{{ item.environment_key }} / {{ item.pipeline_key }}</span><RouterLink :to="{ path: '/config', query: { env: item.environment_key, pipeline: item.pipeline_key } }">查看配置</RouterLink></li></ul>
        <p v-if="references?.references_truncated" class="asset-delete-more">共 {{ references.reference_count }} 条引用，已显示 {{ references.references.length }} 条。</p>
      </div>
      <DialogFooter><Button data-safe-cancel variant="outline" :disabled="deleting" @click="emit('close')">取消</Button><Button variant="destructive" :disabled="deleting || !available" @click="confirm">{{ deleting ? '正在删除…' : '确认删除' }}</Button></DialogFooter>
    </DialogContent>
  </Dialog>
</template>

<style scoped>
.asset-delete-target { display: grid; gap: 8px; overflow-wrap: anywhere; }
.asset-delete-target span { color: var(--muted-foreground); font-size: 13px; }
.asset-delete-error { display: grid; gap: 16px; font-size: 14px; line-height: 1.6; }
.asset-delete-error > p:first-child { color: var(--destructive); }
.asset-delete-error ul { max-height: 256px; overflow-y: auto; display: grid; gap: 12px; padding: 16px; border-radius: 8px; background: var(--muted); }
.asset-delete-error li { display: flex; flex-wrap: wrap; gap: 8px 12px; align-items: baseline; overflow-wrap: anywhere; }
.asset-delete-error li code, .asset-delete-error li span, .asset-delete-more { font-size: 12px; color: var(--muted-foreground); }
.asset-delete-error li a { margin-left: auto; color: var(--spectrum-link); font-size: 12px; }
</style>
