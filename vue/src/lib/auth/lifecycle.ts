import type { Pinia } from 'pinia'
import type { Router } from 'vue-router'
import { toast } from 'vue-sonner'
import { onSessionCleared, sessionStatus } from './session'
import { safeReturnTo } from './redirect'
import { useConfigStore } from '@/stores/config'
import { useAssetStore } from '@/stores/asset'
import { useEnvironmentStore } from '@/stores/environment'
import { useFreezeStore } from '@/stores/freeze'
import { useReleaseStore } from '@/stores/release'
import { useTransferStore } from '@/stores/transfer'
import { clearScopeSelection } from '@/composables/useScopeSelection'
import { isMaintenanceTaskPath } from '../maintenance-route'

export function installAuthLifecycle(pinia: Pinia, router: Router) {
  onSessionCleared(reason => {
    if (reason === 'logout') clearScopeSelection()
    useConfigStore(pinia).resetConfigs()
    useAssetStore(pinia).resetAssets()
    useEnvironmentStore(pinia).reset()
    useFreezeStore(pinia).reset()
    useReleaseStore(pinia).resetSession()
    useTransferStore(pinia).reset()
    const current = router.currentRoute.value
    // Keep this operation's read-only result view alive across auth epoch changes.
    // Its API adapter permits only GET on the exact task; actions still need login.
    if (isMaintenanceTaskPath(current.path) && reason !== 'logout' && reason !== 'forbidden') return
    if (reason === 'restore' && sessionStatus.value === 'anonymous' && !['/', '/login'].includes(current.path)) {
      void router.replace({ path: '/login', query: { redirect: safeReturnTo(current.fullPath) } })
      return
    }
    if (reason !== 'expired' && reason !== 'forbidden') return
    toast.error(reason === 'forbidden' ? '账号不可用，请联系管理员' : '请重新登录', { id: 'auth-session' })
    if (current.path !== '/login') void router.replace({ path: '/login', query: { redirect: safeReturnTo(current.fullPath) } })
  })
}
