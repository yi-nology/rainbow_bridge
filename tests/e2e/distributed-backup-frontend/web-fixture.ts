import type { Page } from '@playwright/test'
import { mockApi, identity, fail, CSRF } from '../auth/mock'
import { ok } from '../auth/backup-fixture'

export const taskId = '11111111-1111-4111-8111-111111111111'
export const operationId = '22222222-2222-4222-8222-222222222222'
export const backupId = '33333333-3333-4333-8333-333333333333'
export const previewId = '44444444-4444-4444-8444-444444444444'
export const requestId = '55555555-5555-4555-8555-555555555555'
export const alternateTaskId = '66666666-6666-4666-8666-666666666666'
export const taskURL = 'backups/tasks/' + taskId
export const capabilities = () => ({ mode: 'maintenance_web', contract_version: 1, supported: true, ready: true, reasons: [],
  actions: { plan: true, create: true, verify: true, restore: true, resume: true, abort: true, cancel: true },
  maintenance: { active: false, business_available: true, operation_id: null }, limits: { plan_ttl_seconds: 600, task_deadline_seconds: 7200 } })
export const taskFixture = (extra: Record<string, unknown> = {}) => ({ task_id: taskId, request_id: requestId, kind: 'backup', state: 'running', phase: 'copying', revision: '2',
  operation_id: operationId, created_at: '2026-10-30T01:00:00Z', updated_at: '2026-10-30T01:01:00Z', started_at: '2026-10-30T01:00:01Z', finished_at: null,
  actor: 'admin', reason: '', parent_task_id: null, result: null, error: null, allowed_actions: [],
  progress: { completed_objects: '9007199254740993', total_objects: null, completed_bytes: '1024', total_bytes: null }, ...extra })
export const operationFixture = (extra: Record<string, unknown> = {}) => ({ operation_id: operationId, kind: 'backup', state: 'running', revision: '9', maintenance_active: true,
  business_available: false, writes_opened: false, allowed_actions: [], blocking_reasons: [], ...extra })
export const backupFixture = () => ({ backup_id: backupId, created_at: '2026-10-30T01:00:00Z', consistent_at: '2026-10-30T00:59:00Z', manifest_sha256: 'a'.repeat(64), size_bytes: '9007199254740993',
  counts: { environments: '2', pipelines: '3', configs: '9007199254740993', assets: '8', versions: '12', deleted_versions: null },
  reason: '升级前备份', actor: 'admin', verification: { state: 'passed', checked_at: '2026-10-30T01:02:00Z', message: null }, restorable: true })
export const previewFixture = (kind = 'backup') => ({ preview_id: previewId, state: 'valid', kind, expires_at: '2099-10-30T02:00:00Z', target_label: '虹桥验收实例',
  backup_id: kind === 'restore' ? backupId : null, manifest_sha256: kind === 'restore' ? 'a'.repeat(64) : null,
  counts: { configs: '9007199254740993', assets: '8', versions: '12' }, bytes: '1024', warnings: [], issues: [], plan_fingerprint: 'p'.repeat(64), revision: '7' })

export async function maintenanceFixture(page: Page) {
  const mock = await mockApi(page, true)
  const state = { caps: capabilities(), task: taskFixture(), operation: operationFixture(), preview: previewFixture(), backups: [backupFixture()],
    scope: 'admin', resultOnly: false, resultDenied: false }
  mock.overrides.set('auth/me', route => mock.authenticated ? ok(route, { ...identity, access_scope: state.scope, active_operation_id: state.scope === 'maintenance' ? operationId : null }) : fail(route, 401, 'AUTH_REQUIRED'))
  mock.overrides.set('auth/login', route => { mock.authenticated = true; return ok(route, { ...identity, access_scope: state.scope, active_operation_id: state.scope === 'maintenance' ? operationId : null }) })
  mock.overrides.set('backup/capabilities', route => ok(route, { mode: 'maintenance_web', supported: true, contract_version: 1, maintenance_api_prefix: '/api/v1/maintenance' }))
  mock.overrides.set('maintenance/capabilities', route => ok(route, state.caps))
  mock.overrides.set('maintenance/backups', route => route.request().method() === 'GET' ? ok(route, { items: state.backups, next_cursor: null, has_more: false }) :
    route.fulfill({ status: 202, contentType: 'application/json', body: JSON.stringify({ code: 202, data: { task: state.task } }) }))
  mock.overrides.set('maintenance/tasks', route => ok(route, { items: [state.task], next_cursor: null, has_more: false }))
  const taskRead = (id: string) => mock.overrides.set('maintenance/tasks/' + id, route => {
    if (state.resultDenied) return fail(route, 401, 'AUTH_REQUIRED')
    return ok(route, { task: { ...state.task, task_id: id }, operation: state.task.operation_id ? state.operation : null })
  })
  taskRead(taskId); taskRead(alternateTaskId)
  mock.overrides.set('maintenance/plans', route => {
    const p = route.request().postDataJSON(); state.preview = previewFixture(p.kind)
    state.task = taskFixture({ kind: 'plan', state: 'succeeded', phase: 'planned', operation_id: null, request_id: p.request_id, result: { preview_id: previewId } })
    return route.fulfill({ status: 202, contentType: 'application/json', body: JSON.stringify({ code: 202, data: { task: state.task } }) })
  })
  mock.overrides.set('maintenance/plans/' + previewId, route => ok(route, state.preview))
  for (const path of ['restores', `backups/${backupId}/verify`, `operations/${operationId}/resume`, `operations/${operationId}/abort`, `tasks/${taskId}/cancel`]) {
    mock.overrides.set('maintenance/' + path, route => route.fulfill({ status: 202, contentType: 'application/json', body: JSON.stringify({ code: 202,
      data: { task: taskFixture({ task_id: alternateTaskId, kind: path === 'restores' ? 'restore' : path.endsWith('verify') ? 'verify' : path.endsWith('cancel') ? 'cancel' : path.endsWith('abort') ? 'abort' : 'resume', state: 'queued', request_id: route.request().postDataJSON().request_id }) } }) }))
  }
  return { mock, state, CSRF }
}
