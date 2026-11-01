import { fetchApi, StaleSessionError } from './http'
import { ApiError } from './error'
import { getBasePath } from '../utils'
import { sessionGeneration } from '../auth/session'
import { publicId } from '../maintenance-route'

export type Decimal = string | null
export interface MaintenanceNotice { code: string; message: string }
export type MaintenanceAction = 'plan' | 'create' | 'verify' | 'restore' | 'resume' | 'abort' | 'cancel'
export interface MaintenanceCapabilities {
  mode: 'maintenance_web'; contract_version: 1; supported: boolean; ready: boolean
  reasons: MaintenanceNotice[]; actions: Record<MaintenanceAction, boolean>
  maintenance: { active: boolean; business_available: boolean; operation_id: string | null }
  limits: { plan_ttl_seconds: number; task_deadline_seconds: number }
}
export interface MaintenanceProgress {
  completed_objects?: Decimal; total_objects?: Decimal; completed_bytes?: Decimal; total_bytes?: Decimal
}
export type MaintenanceState = 'queued' | 'running' | 'succeeded' | 'failed' | 'interrupted' | 'blocked' | 'cancelled'
export interface MaintenanceTask {
  task_id: string; request_id: string; kind: 'plan' | 'backup' | 'verify' | 'restore' | 'resume' | 'abort' | 'cancel'
  state: MaintenanceState; phase: string; revision: string; operation_id: string | null
  created_at: string; updated_at: string; started_at?: string | null; finished_at?: string | null
  actor: string; reason: string; parent_task_id?: string | null
  result: { backup_id?: string | null; preview_id?: string | null; business_available?: boolean | null; reauth_required?: boolean | null } | null
  error: { code: string; message: string; retryable: boolean } | null
  allowed_actions: string[]; progress: MaintenanceProgress
}
export interface MaintenanceOperation {
  operation_id: string; kind: string; state: string; revision: string
  maintenance_active: boolean; business_available: boolean; writes_opened: boolean
  allowed_actions: string[]; blocking_reasons: MaintenanceNotice[]
}
export interface MaintenanceBackup {
  backup_id: string; created_at: string; consistent_at: string; manifest_sha256: string; size_bytes: string
  counts: Record<string, Decimal>; reason: string; actor: string
  verification: { state: 'unknown' | 'running' | 'passed' | 'failed'; checked_at?: string | null; message?: string | null }
  restorable: boolean
}
export interface MaintenancePreview {
  preview_id: string; state: 'valid' | 'invalid' | 'expired'; kind: 'backup' | 'restore'; expires_at: string
  target_label: string; backup_id?: string | null; manifest_sha256?: string | null
  counts?: Record<string, Decimal> | null; bytes?: Decimal; warnings: MaintenanceNotice[]; issues: MaintenanceNotice[]
  plan_fingerprint: string; revision: string
}
export interface MaintenanceTaskResult { task: MaintenanceTask; operation?: MaintenanceOperation | null }
export interface MaintenancePage<T> { items: T[]; next_cursor: string | null; has_more: boolean }
export interface MaintenanceIntent { path: string; payload: Record<string, string> }

export function maintenanceId(value: string): string {
  if (!publicId.test(value)) throw new Error('任务或备份编号无效')
  return value
}
export const isMaintenanceWritePath = (path: string) => /^(plans|backups|restores|backups\/[a-zA-Z0-9_-]{1,128}\/verify|operations\/[a-zA-Z0-9_-]{1,128}\/(resume|abort)|tasks\/[a-zA-Z0-9_-]{1,128}\/cancel)$/.test(path)
export function intentAllowed(caps: MaintenanceCapabilities | null, intent: MaintenanceIntent): boolean {
  if (!caps?.ready) return false
  const action: MaintenanceAction = intent.path === 'plans' ? 'plan' : intent.path === 'backups' ? 'create' : intent.path === 'restores' ? 'restore' :
    intent.path.endsWith('/verify') ? 'verify' : intent.path.endsWith('/resume') ? 'resume' : intent.path.endsWith('/abort') ? 'abort' : 'cancel'
  return caps.actions[action] === true && (intent.path !== 'plans' || caps.actions[intent.payload.kind === 'restore' ? 'restore' : 'create'] === true)
}

/** Fixed same-origin endpoint; discovery never supplies a URL to fetch. */
async function request<T>(path: string, init: RequestInit = {}, resultRead = false): Promise<T> {
  const generation = sessionGeneration()
  const url = new URL(getBasePath().replace(/\/$/, '') + '/api/v1/maintenance/' + path, location.origin)
  const response = await fetchApi(url, init, resultRead ? { handleAuth: false, taskResultRead: true } : {})
  const body = await response.json()
  if (generation !== sessionGeneration()) throw new StaleSessionError()
  if (![200, 202].includes(body?.code) || !body.data || typeof body.data !== 'object') throw new ApiError(502, '维护服务响应不完整，请刷新核对')
  return body.data as T
}
export function assertTask(task: MaintenanceTask): MaintenanceTask {
  if (!task || !publicId.test(task.task_id) || !publicId.test(task.request_id) || typeof task.revision !== 'string' || !/^\d+$/.test(task.revision) ||
    !['queued', 'running', 'succeeded', 'failed', 'interrupted', 'blocked', 'cancelled'].includes(task.state) ||
    !Array.isArray(task.allowed_actions)) throw new ApiError(502, '任务响应不完整，请刷新核对')
  return task
}
export const maintenanceApi = {
  async capabilities() {
    const value = await request<MaintenanceCapabilities>('capabilities')
    if (value.mode !== 'maintenance_web' || value.contract_version !== 1 || typeof value.ready !== 'boolean' || !value.actions || !value.maintenance) throw new ApiError(502, '维护服务版本不匹配，请确认服务版本')
    return value
  },
  backups: (cursor = '') => request<MaintenancePage<MaintenanceBackup>>('backups?' + new URLSearchParams({ limit: '20', cursor })),
  tasks: (cursor = '') => request<MaintenancePage<MaintenanceTask>>('tasks?' + new URLSearchParams({ limit: '20', cursor })),
  async task(id: string) {
    const value = await request<MaintenanceTaskResult>('tasks/' + maintenanceId(id), {}, true)
    assertTask(value.task)
    if (value.task.task_id !== id) throw new ApiError(502, '任务响应与当前页面不一致')
    if (value.operation && (value.operation.operation_id !== value.task.operation_id || typeof value.operation.revision !== 'string' || !/^\d+$/.test(value.operation.revision) || !Array.isArray(value.operation.allowed_actions))) throw new ApiError(502, '任务操作状态不一致')
    return value
  },
  async byRequest(id: string) {
    const value = await request<{ task: MaintenanceTask }>('tasks/by-request/' + maintenanceId(id))
    return assertTask(value.task)
  },
  async preview(id: string) {
    const value = await request<MaintenancePreview>('plans/' + maintenanceId(id))
    if (value.preview_id !== id || !['valid', 'invalid', 'expired'].includes(value.state) || !['backup', 'restore'].includes(value.kind) ||
      !Array.isArray(value.issues) || !Array.isArray(value.warnings) || typeof value.plan_fingerprint !== 'string' || !value.plan_fingerprint ||
      typeof value.revision !== 'string' || !/^\d+$/.test(value.revision)) throw new ApiError(502, '方案响应不完整，请重新核对')
    return value
  },
  async submit(intent: MaintenanceIntent) {
    if (!isMaintenanceWritePath(intent.path)) throw new Error('维护操作地址无效')
    const value = await request<{ task: MaintenanceTask }>(intent.path, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(intent.payload) })
    return assertTask(value.task)
  },
}
