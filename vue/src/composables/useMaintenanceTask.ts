import { computed, onUnmounted, ref, watch } from 'vue'
import { maintenanceApi, type MaintenanceTaskResult, type MaintenanceCapabilities, type MaintenancePreview, type MaintenanceBackup } from '@/lib/api/maintenance-backup'
import { useAuthStore } from '@/stores/auth'
import { clearSession, sessionGeneration } from '@/lib/auth/session'
import { ApiError } from '@/lib/api/error'
import { isSessionError } from '@/lib/api/http'
import { maintenanceError, taskInProgress } from '@/components/backup/maintenance-presentation'

export function useMaintenanceTask(id: () => string) {
  const auth = useAuthStore()
  const data = ref<MaintenanceTaskResult | null>(null), capabilities = ref<MaintenanceCapabilities | null>(null)
  const preview = ref<MaintenancePreview | null>(null), error = ref(''), loading = ref(false), confirmedAt = ref('')
  const backup = ref<MaintenanceBackup | null>(null)
  const now = ref(Date.now())
  let epoch = 0, failures = 0, stopped = false, denied = false, timer: ReturnType<typeof setTimeout> | undefined
  const expiry = setInterval(() => { now.value = Date.now() }, 1000)
  const previewValid = computed(() => preview.value?.state === 'valid' && !preview.value.issues.length && Date.parse(preview.value.expires_at) > now.value)
  function schedule() {
    clearTimeout(timer)
    if (stopped || denied) return
    if (!data.value || taskInProgress(data.value.task) || failures) timer = setTimeout(refresh, Math.min(10000, failures ? 1500 * 2 ** failures : document.hidden ? 8000 : 1500))
  }
  async function refresh() {
    if (loading.value || stopped) return
    const current = ++epoch, taskId = id(), generation = sessionGeneration()
    const valid = () => !stopped && current === epoch && id() === taskId && generation === sessionGeneration()
    loading.value = true; error.value = ''; denied = false
    try {
      const result = await maintenanceApi.task(taskId)
      if (!valid()) return
      const previous = data.value
      if (previous?.task.task_id === taskId && BigInt(result.task.revision) < BigInt(previous.task.revision)) return
      if (previous?.operation && result.operation && previous.operation.operation_id === result.operation.operation_id && BigInt(result.operation.revision) < BigInt(previous.operation.revision)) return
      data.value = result; confirmedAt.value = new Date().toISOString(); failures = 0
      if (result.task.kind !== 'plan') { preview.value = null; backup.value = null }
      if (auth.status === 'unknown') await auth.restore()
      // A historic restore can keep reauth_required=true. Verify the actual current
      // session instead of revoking a freshly reauthenticated user on every read.
      if (result.task.result?.reauth_required && auth.authenticated) await auth.restore(true)
      if (stopped || current !== epoch || id() !== taskId) return
      if (!auth.authenticated) { capabilities.value = null; return }
      const nextGeneration = sessionGeneration()
      const stillValid = () => !stopped && current === epoch && taskId === id() && nextGeneration === sessionGeneration()
      const caps = await maintenanceApi.capabilities()
      if (!stillValid()) return
      capabilities.value = caps
      const previewId = result.task.result?.preview_id
      if (result.task.kind === 'plan' && result.task.state === 'succeeded' && previewId && preview.value?.preview_id !== previewId) {
        const value = await maintenanceApi.preview(previewId)
        if (!stillValid()) return
        if (value.preview_id !== previewId) throw new ApiError(502, '方案响应不一致，请重新核对')
        preview.value = value
        if (value.kind === 'restore' && value.backup_id) {
          let cursor = '', found = false
          const visited = new Set<string>()
          do {
            if (!stillValid()) return
            if (visited.has(cursor)) throw new ApiError(502, '备份列表分页异常，请返回列表重新核对')
            visited.add(cursor)
            const page = await maintenanceApi.backups(cursor)
            if (!stillValid()) return
            backup.value = page.items.find(item => item.backup_id === value.backup_id && item.manifest_sha256 === value.manifest_sha256) || null
            found = Boolean(backup.value)
            cursor = page.has_more ? page.next_cursor || '' : ''
          } while (!found && cursor)
          if (!found) throw new ApiError(409, '所选备份记录已变化，请返回列表重新核对')
        }
      }
    } catch (cause) {
      if (!valid()) return
      if (cause instanceof ApiError && [401, 403].includes(cause.code) && isSessionError(cause)) {
        denied = true
        if (auth.authenticated) clearSession('anonymous', cause.code === 403 ? 'forbidden' : 'expired')
        error.value = '结果暂不可读取，请重新登录查看任务。'
      } else {
        if (cause instanceof ApiError && cause.code === 404) denied = true
        error.value = cause instanceof ApiError && cause.code < 0 ? '连接中断，任务可能仍在执行。' : maintenanceError(cause)
        if (!(cause instanceof ApiError) || ![401, 403, 404].includes(cause.code)) failures++
      }
    } finally { if (current === epoch) loading.value = false; schedule() }
  }
  watch(id, () => { ++epoch; loading.value = false; data.value = null; preview.value = null; backup.value = null; capabilities.value = null; clearTimeout(timer); void refresh() }, { immediate: true })
  onUnmounted(() => { stopped = true; ++epoch; clearTimeout(timer); clearInterval(expiry) })
  return { data, capabilities, preview, backup, previewValid, error, loading, confirmedAt, now, refresh }
}
