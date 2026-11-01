import type { BackupCapabilities } from './api/backup'

export type BackupMode = 'web' | 'maintenance-web' | 'maintenance' | 'unsupported' | 'unknown'

/** The same policy controls presentation and every local-backup operation. */
export function backupMode(value: BackupCapabilities): BackupMode {
  if (value.mode === 'maintenance_web') return value.contract_version === 1 && value.maintenance_api_prefix === '/api/v1/maintenance' ? 'maintenance-web' : 'unknown'
  if (value.mode === 'maintenance_cli_only') return 'maintenance'
  if (value.mode !== undefined && value.mode !== '' && value.mode !== 'business_full') return 'unknown'
  return value.supported === true ? 'web' : 'unsupported'
}
