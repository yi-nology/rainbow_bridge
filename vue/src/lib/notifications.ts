import { toast as sonner } from 'vue-sonner'

// The transport and a store may surface the same rejection. Keep one visible
// service-state notice without merging unrelated validation/operation errors.
const serviceNotices = new Set([
  '业务已暂停，备份与恢复管理仍可继续。',
  '控制服务暂不可用，请稍后重试。',
  '服务处于维护保护状态，暂时无法操作。请稍后重试；持续不可用请联系部署人员。',
])
export const toast = {
  ...sonner,
  error(message: Parameters<typeof sonner.error>[0], options?: Parameters<typeof sonner.error>[1]) {
    const id = typeof message === 'string' && serviceNotices.has(message) ? 'rainbow-service-state' : undefined
    return sonner.error(message, id ? { ...options, id: options?.id ?? id } : options)
  },
}
