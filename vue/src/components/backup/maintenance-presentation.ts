import { ApiError } from '@/lib/api/error'
import type { Decimal, MaintenanceNotice, MaintenanceProgress, MaintenanceTask } from '@/lib/api/maintenance-backup'

export function decimalCount(value?: Decimal): string {
  return typeof value === 'string' && /^\d+$/.test(value) ? BigInt(value).toLocaleString('zh-CN') : '—'
}
export function decimalSize(value?: Decimal): string {
  if (typeof value !== 'string' || !/^\d+$/.test(value)) return '大小待确认'
  const bytes = BigInt(value)
  for (const [unit, size] of [['GiB', 1024n ** 3n], ['MiB', 1024n ** 2n], ['KiB', 1024n]] as const) {
    if (bytes >= size) return `${bytes / size}.${bytes % size * 10n / size} ${unit}`
  }
  return `${bytes} B`
}
export const maintenanceKinds: Record<string, string> = { plan: '核对方案', backup: '创建备份', verify: '核验备份', restore: '恢复业务', resume: '继续任务', abort: '恢复原服务', cancel: '取消排队' }
export const maintenanceStates: Record<string, string> = { queued: '已提交，等待执行', running: '执行中', succeeded: '已完成', failed: '失败', interrupted: '已中断', blocked: '需要处理', cancelled: '已取消' }
export const maintenancePhases: Record<string, string> = { planned: '方案已核对', queued: '等待执行', draining: '暂停业务', exporting: '导出业务数据', copying: '复制配套资源', verifying: '核验完整性', preparing: '准备恢复数据', switching: '切换业务数据', checking: '检查恢复结果', resuming: '恢复业务服务', aborting: '恢复原服务', completed: '处理结束' }
export const taskInProgress = (task: MaintenanceTask) => ['queued', 'running'].includes(task.state)
export function progressText(progress: MaintenanceProgress | null | undefined) {
  if (!progress) return ''
  const chunks: string[] = []
  if (progress.completed_objects != null) chunks.push(`已处理 ${decimalCount(progress.completed_objects)} 项${progress.total_objects != null ? ` / 共 ${decimalCount(progress.total_objects)} 项` : ''}`)
  if (progress.completed_bytes != null) chunks.push(`${decimalSize(progress.completed_bytes)}${progress.total_bytes != null ? ` / ${decimalSize(progress.total_bytes)}` : ''}`)
  return chunks.join(' · ')
}
export function progressPercent(progress: MaintenanceProgress | null | undefined): number | undefined {
  const useBytes = progress?.completed_bytes != null && progress?.total_bytes != null
  const done = useBytes ? progress?.completed_bytes : progress?.completed_objects, total = useBytes ? progress?.total_bytes : progress?.total_objects
  if (typeof done !== 'string' || typeof total !== 'string' || !/^\d+$/.test(done) || !/^\d+$/.test(total) || BigInt(total) === 0n) return undefined
  return Number(BigInt(done) * 100n / BigInt(total) > 100n ? 100n : BigInt(done) * 100n / BigInt(total))
}
const errors: Record<string, string> = {
  MAINTENANCE_NOT_READY: '备份服务准备条件尚未完成，请刷新核对。', MAINTENANCE_ACTIVE: '业务已暂停，请查看当前维护任务。',
  TASK_BUSY: '已有任务正在处理，请核对当前任务。', PLAN_STALE: '方案已变化，请重新核对后确认。', PLAN_EXPIRED: '方案已过期，请重新核对。',
  REQUEST_CONFLICT: '原请求内容不一致，请核对先前任务。', STATE_CONFLICT: '任务状态已变化，请刷新后核对可用操作。',
  BACKUP_INVALID: '备份核验未通过，暂时不能恢复。', EXECUTOR_NOT_STOPPED: '原任务执行者尚未确认停止，请稍后刷新。',
  CONTROL_UNAVAILABLE: '控制服务暂不可用，请稍后重试。', AUTH_REQUIRED: '请重新登录查看或处理任务。', AUTH_FORBIDDEN: '账号不可用，请联系管理员。',
}
export function maintenanceError(cause: unknown): string {
  if (cause instanceof ApiError) return errors[cause.errorType] || (cause.code < 0 ? '连接中断，任务可能仍在执行。请查询原请求结果。' : cause.message)
  return cause instanceof Error ? cause.message : '操作暂不可用，请刷新核对。'
}
export function noticeText(item: MaintenanceNotice) {
  // DTO messages are safe, public projections from the console, never Operation.Data.
  return errors[item.code] || (typeof item.message === 'string' && item.message.length <= 500 ? item.message : '还有待核对的条件，请查看任务状态。')
}
