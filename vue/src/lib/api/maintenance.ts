import { ApiError, ErrorType } from './error'

const middlewareMessage = '全局维护保护：控制状态不可用、正在维护或实例代次不匹配'
const internalKind = 'FRONTEND_MAINTENANCE_PROTECTION'

class MaintenanceProtectionError extends ApiError {
  constructor() {
    super(503, '服务处于维护保护状态，暂时无法操作。请稍后重试；持续不可用请联系部署人员。', '', ErrorType.HTTP)
    this.errorType = internalKind
  }
}

/** A bounded compatibility adapter, not a new server error_type contract. */
export function maintenanceProtectionError(status: number, body: unknown, trusted: boolean): ApiError | null {
  if (!trusted || status !== 503 || !body || typeof body !== 'object' ||
    !('message' in body) || body.message !== middlewareMessage) return null
  return new MaintenanceProtectionError()
}

// A server-supplied error_type with the same spelling cannot impersonate this adapter.
export const isMaintenanceProtection = (cause: unknown): boolean => cause instanceof MaintenanceProtectionError
