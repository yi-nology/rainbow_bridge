import { onMounted, onUnmounted, ref } from 'vue'
import { maintenanceApi, type MaintenanceBackup, type MaintenanceTask, type MaintenanceCapabilities } from '@/lib/api/maintenance-backup'
import { sessionGeneration } from '@/lib/auth/session'
import { maintenanceError } from '@/components/backup/maintenance-presentation'

export function useMaintenanceBackups() {
  const capabilities = ref<MaintenanceCapabilities | null>(null)
  const backups = ref<MaintenanceBackup[]>([]), tasks = ref<MaintenanceTask[]>([])
  const loading = ref(false), error = ref(''), backupCursor = ref(''), taskCursor = ref('')
  const moreBackups = ref(false), moreTasks = ref(false)
  let epoch = 0, stopped = false
  async function refresh() {
    if (loading.value) return
    const current = ++epoch, generation = sessionGeneration()
    const valid = () => !stopped && current === epoch && generation === sessionGeneration()
    loading.value = true; capabilities.value = null; error.value = ''
    try {
      const caps = await maintenanceApi.capabilities()
      if (!valid()) return
      capabilities.value = caps
      const [list, history] = await Promise.all([maintenanceApi.backups(), maintenanceApi.tasks()])
      if (!valid()) return
      backups.value = list.items; tasks.value = history.items
      backupCursor.value = list.next_cursor || ''; moreBackups.value = list.has_more
      taskCursor.value = history.next_cursor || ''; moreTasks.value = history.has_more
    } catch (cause) { if (valid()) error.value = maintenanceError(cause) }
    finally { if (valid()) loading.value = false }
  }
  async function more(kind: 'backups' | 'tasks') {
    if (loading.value || !capabilities.value) return
    const current = epoch, generation = sessionGeneration()
    const valid = () => !stopped && current === epoch && generation === sessionGeneration()
    loading.value = true
    try {
      if (kind === 'backups') {
        const list = await maintenanceApi.backups(backupCursor.value)
        if (!valid()) return
        backups.value = [...backups.value, ...list.items.filter(row => !backups.value.some(old => old.backup_id === row.backup_id))]
        backupCursor.value = list.next_cursor || ''; moreBackups.value = list.has_more
      } else {
        const list = await maintenanceApi.tasks(taskCursor.value)
        if (!valid()) return
        tasks.value = [...tasks.value, ...list.items.filter(row => !tasks.value.some(old => old.task_id === row.task_id))]
        taskCursor.value = list.next_cursor || ''; moreTasks.value = list.has_more
      }
    } catch (cause) { if (valid()) error.value = maintenanceError(cause) }
    finally { if (valid()) loading.value = false }
  }
  onMounted(refresh)
  onUnmounted(() => { stopped = true; ++epoch })
  return { capabilities, backups, tasks, loading, error, refresh, more, moreBackups, moreTasks }
}
