import { computed, onUnmounted, ref } from 'vue'
import { useAuthStore } from '@/stores/auth'
import { sessionGeneration } from '@/lib/auth/session'
import { createRequestId } from '@/lib/request-id'
import { getBasePath } from '@/lib/utils'
import { ApiError } from '@/lib/api/error'
import { isMaintenanceWritePath, maintenanceApi, type MaintenanceIntent, type MaintenanceTask } from '@/lib/api/maintenance-backup'
import { maintenanceError } from '@/components/backup/maintenance-presentation'

/** One bounded original intent per console user; never auto-replay on mount. */
export function useMaintenanceCommand(allowed: (intent?: MaintenanceIntent) => boolean, accepted: (task: MaintenanceTask) => void) {
  const auth = useAuthStore()
  const owner = computed(() => auth.user?.id || '')
  const key = () => `rainbow-bridge:${getBasePath()}:maintenance-command:${owner.value}`
  const pending = ref<MaintenanceIntent | null>(null), busy = ref(false), error = ref(''), notFound = ref(false), rejected = ref('')
  let stopped = false
  function restore() {
    if (!owner.value) return
    try {
      const value = JSON.parse(sessionStorage.getItem(key()) || 'null')
      if (value && isMaintenanceWritePath(value.path) && typeof value.payload?.request_id === 'string' && Object.values(value.payload).every(v => typeof v === 'string')) pending.value = value
    } catch { error.value = '浏览器无法读取先前操作，请核对服务端任务后再继续。' }
  }
  restore()
  function persist(value: MaintenanceIntent | null) {
    if (value) sessionStorage.setItem(key(), JSON.stringify(value))
    else sessionStorage.removeItem(key())
    pending.value = value
  }
  async function run(intent: MaintenanceIntent) {
    if (busy.value || !auth.authenticated || !allowed(intent)) return
    const generation = sessionGeneration(), user = owner.value
    const valid = () => !stopped && generation === sessionGeneration() && user === owner.value
    busy.value = true; error.value = ''; notFound.value = false; rejected.value = ''
    try {
      persist(intent)
      const task = await maintenanceApi.submit(intent)
      if (!valid()) return
      persist(null); accepted(task)
    } catch (cause) {
      if (!valid()) return
      error.value = maintenanceError(cause)
      rejected.value = cause instanceof ApiError ? cause.errorType : ''
      // Explicit front-door rejection is not an uncertain accepted command.
      if (cause instanceof ApiError && ['PLAN_STALE', 'PLAN_EXPIRED', 'BACKUP_INVALID', 'MAINTENANCE_NOT_READY', 'STATE_CONFLICT', 'EXECUTOR_NOT_STOPPED', 'TASK_BUSY'].includes(cause.errorType)) persist(null)
    } finally { busy.value = false }
  }
  async function submit(path: string, payload: Record<string, string>) {
    if (busy.value || pending.value || !auth.authenticated || !allowed()) return
    try { await run({ path, payload: { ...payload, request_id: createRequestId() } }) }
    catch (cause) { error.value = maintenanceError(cause) }
  }
  async function check() {
    if (!pending.value || busy.value || !auth.authenticated) return
    const generation = sessionGeneration(), original = pending.value
    busy.value = true; error.value = ''; notFound.value = false
    try {
      const task = await maintenanceApi.byRequest(original.payload.request_id!)
      if (stopped || generation !== sessionGeneration() || pending.value !== original) return
      persist(null); accepted(task)
    } catch (cause) {
      if (stopped || generation !== sessionGeneration()) return
      if (cause instanceof ApiError && cause.code === 404) {
        notFound.value = true; error.value = '尚未查到该请求。可再次查询，或原样重试同一次操作。'
      } else error.value = maintenanceError(cause)
    } finally { busy.value = false }
  }
  onUnmounted(() => { stopped = true })
  return { pending, busy, error, notFound, rejected, submit, check, retry: () => notFound.value && pending.value ? run(pending.value) : Promise.resolve() }
}
