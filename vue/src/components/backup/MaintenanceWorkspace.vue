<script setup lang="ts">
import { computed, reactive, ref } from 'vue'
import { useRouter } from 'vue-router'
import { RefreshCw, ShieldCheck, ArrowUpRight, Plus } from 'lucide-vue-next'
import { Button } from '@/components/ui/button'
import { useMaintenanceBackups } from '@/composables/useMaintenanceBackups'
import { useMaintenanceCommand } from '@/composables/useMaintenanceCommand'
import { backupTime } from './presentation'
import { decimalSize, maintenanceKinds, maintenanceStates, noticeText } from './maintenance-presentation'
import MaintenanceCounts from './MaintenanceCounts.vue'
import MaintenanceCommandNotice from './MaintenanceCommandNotice.vue'
import type { MaintenanceBackup, MaintenanceTask } from '@/lib/api/maintenance-backup'
import { intentAllowed } from '@/lib/api/maintenance-backup'

const router = useRouter(), workspace = reactive(useMaintenanceBackups())
const canWrite = computed(() => Boolean(workspace.capabilities?.ready && !workspace.loading))
const accepted = (task: MaintenanceTask) => { void router.push('/backups/tasks/' + task.task_id) }
const command = reactive(useMaintenanceCommand(intent => canWrite.value && (!intent || intentAllowed(workspace.capabilities, intent)), accepted))
const current = computed(() => workspace.tasks.find(task => ['queued', 'running'].includes(task.state) ||
  (workspace.capabilities?.maintenance.active && task.operation_id === workspace.capabilities.maintenance.operation_id && ['blocked', 'interrupted'].includes(task.state))))
const verifying = ref('')
async function plan(item?: MaintenanceBackup) {
  const actions = workspace.capabilities?.actions
  if (!actions?.plan || (item ? !actions.restore || !item.restorable : !actions.create)) return
  await command.submit('plans', item ? { kind: 'restore', backup_id: item.backup_id, expected_sha256: item.manifest_sha256 } : { kind: 'backup' })
}
async function verify(item: MaintenanceBackup) {
  if (!workspace.capabilities?.actions.verify) return
  verifying.value = item.backup_id
  await command.submit(`backups/${item.backup_id}/verify`, { expected_sha256: item.manifest_sha256 })
  verifying.value = ''
}
</script>
<template>
  <!-- §2.1/§2.8/§3.6: current task first; backup list next; one create action.
       Spectrum panels, 16/24/32 spacing and semantic alerts; no simulated progress. -->
  <div class="maintenance-workspace">
    <header class="spectrum-page-heading"><div><p class="spectrum-eyebrow">BACKUP / RECOVERY</p><h1>备份与恢复</h1></div><Button variant="outline" :disabled="workspace.loading" @click="workspace.refresh"><RefreshCw :size="16" />刷新</Button></header>
    <section class="backup-overview"><ShieldCheck :size="24" /><div><h2>手动全量备份</h2><p>备份期间业务暂停，管理页面可继续查看进度。</p></div><span class="spectrum-state-pill is-active">网页管理</span></section>
    <p v-if="workspace.loading && !workspace.capabilities" class="backup-empty" role="status">正在确认维护服务</p>
    <p v-if="workspace.error" class="backup-alert is-danger" role="alert">{{ workspace.error }}</p>
    <section v-if="workspace.capabilities && !workspace.capabilities.ready" class="backup-alert"><h2>备份服务尚未准备就绪</h2><ul><li v-for="(item, index) in workspace.capabilities.reasons" :key="index">{{ noticeText(item) }}</li></ul><p>刷新可重新确认；已有任务仍可查看。</p></section>
    <section v-if="current || workspace.capabilities?.maintenance.active" class="spectrum-panel maintenance-current"><div><p class="spectrum-eyebrow">CURRENT TASK</p><h2>{{ workspace.capabilities?.maintenance.business_available ? '当前任务' : '业务已暂停' }}</h2><p v-if="current">{{ maintenanceKinds[current.kind] || '维护任务' }} · {{ maintenanceStates[current.state] || '状态待确认' }}</p><p v-else>请在任务记录中查看当前操作。</p></div><Button v-if="current" variant="outline" @click="accepted(current)">查看任务<ArrowUpRight :size="16" /></Button></section>
    <MaintenanceCommandNotice v-bind="command" :can-retry="canWrite" @check="command.check" @retry="command.retry" />
    <section class="spectrum-panel maintenance-list" aria-labelledby="maintenance-backup-list">
      <div class="backup-section-heading"><div><p class="spectrum-eyebrow">RECOVERY POINTS</p><h2 id="maintenance-backup-list">全量备份</h2></div><Button :disabled="!canWrite || !workspace.capabilities?.actions.plan || !workspace.capabilities?.actions.create || command.busy || !!command.pending" @click="plan()"><Plus :size="16" />{{ workspace.backups.length ? '创建备份' : '创建第一份备份' }}</Button></div>
      <p v-if="!workspace.backups.length && !workspace.loading" class="backup-empty">尚无可用备份。先创建一份恢复点。</p>
      <div v-else class="backup-table-wrap"><table class="backup-table"><thead><tr><th>恢复点</th><th>业务内容</th><th>大小</th><th>核验</th><th>操作</th></tr></thead><tbody>
        <tr v-for="item in workspace.backups" :key="item.backup_id"><td><strong>{{ backupTime(item.consistent_at) }}</strong><p>{{ item.reason || '未填写备注' }}</p><details><summary>生成信息</summary><p>生成时间：{{ backupTime(item.created_at) }} · {{ item.actor }}</p></details></td><td><MaintenanceCounts :counts="item.counts" /></td><td>{{ decimalSize(item.size_bytes) }}</td><td><span>{{ {unknown:'尚未核验',running:'核验中',passed:'核验通过',failed:'核验失败'}[item.verification.state] || '状态待确认' }}</span><small v-if="item.verification.checked_at">{{ backupTime(item.verification.checked_at) }}</small></td><td><div class="backup-actions"><Button variant="ghost" :disabled="!canWrite || !workspace.capabilities?.actions.verify || command.busy || !!command.pending || item.verification.state === 'running'" @click="verify(item)">{{ verifying === item.backup_id ? '提交中…' : '核验' }}</Button><Button variant="outline" :disabled="!canWrite || !workspace.capabilities?.actions.plan || !workspace.capabilities?.actions.restore || !item.restorable || command.busy || !!command.pending" @click="plan(item)">核对并恢复</Button></div></td></tr>
      </tbody></table></div>
      <Button v-if="workspace.moreBackups" variant="outline" :disabled="workspace.loading" @click="workspace.more('backups')">加载更多备份</Button>
    </section>
    <section class="spectrum-panel maintenance-list" aria-labelledby="maintenance-history"><div class="backup-section-heading"><h2 id="maintenance-history">任务记录</h2><span class="backup-secondary">关闭页面不会取消任务</span></div><p v-if="!workspace.tasks.length" class="backup-secondary">暂无任务记录</p><ul class="maintenance-task-list"><li v-for="task in workspace.tasks" :key="task.task_id"><RouterLink :to="'/backups/tasks/' + task.task_id"><span>{{ maintenanceKinds[task.kind] || '维护任务' }}<small>{{ backupTime(task.updated_at) }}</small></span><span>{{ maintenanceStates[task.state] || '状态待确认' }} <ArrowUpRight :size="14" /></span></RouterLink></li></ul><Button v-if="workspace.moreTasks" variant="outline" :disabled="workspace.loading" @click="workspace.more('tasks')">加载更多任务</Button></section>
  </div>
</template>
