import { createRouter, createWebHistory } from 'vue-router'
import type { RouteRecordRaw } from 'vue-router'
import { useAuthStore } from '@/stores/auth'
import { safeReturnTo } from '@/lib/auth/redirect'
import { maintenanceSession } from '@/lib/auth/session'
import { isMaintenanceTaskPath } from '@/lib/maintenance-route'

const routes: RouteRecordRaw[] = [
  { path: '/backups/tasks/:task_id([a-zA-Z0-9_-]{1,128})', name: 'MaintenanceTask', component: () => import('@/views/MaintenanceTaskPage.vue') },
  { path: '/backups', name: 'Backups', component: () => import('@/views/BackupsPage.vue') },
  { path: '/login', name: 'Login', component: () => import('@/views/LoginPage.vue') },
  {
    path: '/',
    name: 'Home',
    component: () => import('@/views/HomePage.vue'),
  },
  {
    path: '/config',
    name: 'Config',
    component: () => import('@/views/ConfigPage.vue'),
  },
  {
    path: '/environments',
    name: 'Environments',
    component: () => import('@/views/EnvironmentsPage.vue'),
  },
  {
    path: '/resources',
    name: 'Resources',
    component: () => import('@/views/ResourcesPage.vue'),
  },
  {
    path: '/migration',
    name: 'Migration',
    component: () => import('@/views/MigrationPage.vue'),
  },
  {
    path: '/import-export',
    name: 'ImportExport',
    component: () => import('@/views/ImportExportPage.vue'),
  },
  {
    path: '/releases',
    name: 'Releases',
    component: () => import('@/views/ReleasesPage.vue'),
  },
]

const router = createRouter({
  history: createWebHistory(import.meta.env.BASE_URL),
  routes,
  scrollBehavior(to, from, savedPosition) {
    if (savedPosition) return savedPosition
    if (to.path !== from.path) return { top: 0 }
    return false
  },
})

router.beforeEach(async to => {
  const auth = useAuthStore()
  if (to.path === '/') {
    if (auth.authenticated && maintenanceSession()) return '/backups'
    void auth.restore().then(() => { if (auth.authenticated && maintenanceSession() && router.currentRoute.value.path === '/') void router.replace('/backups') })
    return true
  }
  if (isMaintenanceTaskPath(to.path)) { void auth.restore(); return true }
  await auth.restore()
  if (to.path === '/login') {
    const target = safeReturnTo(to.query.redirect)
    return auth.authenticated ? (maintenanceSession() && target !== '/backups' && !isMaintenanceTaskPath(target) ? '/backups' : target) : true
  }
  if (auth.authenticated && maintenanceSession() && to.path !== '/backups') return '/backups'
  return auth.authenticated ? true : { path: '/login', query: { redirect: safeReturnTo(to.fullPath) } }
})

export default router
