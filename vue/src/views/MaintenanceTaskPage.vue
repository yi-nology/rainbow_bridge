<script setup lang="ts">
import { computed, reactive, ref, watch } from 'vue'
import { useRoute, useRouter } from 'vue-router'
import { RefreshCw, ArrowLeft, Link2, Loader2 } from 'lucide-vue-next'
import SpectrumLayout from '@/components/spectrum/SpectrumLayout.vue'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription, DialogFooter } from '@/components/ui/dialog'
import MaintenanceCommandNotice from '@/components/backup/MaintenanceCommandNotice.vue'
import MaintenanceCounts from '@/components/backup/MaintenanceCounts.vue'
import { backupTime } from '@/components/backup/presentation'
import { decimalSize, maintenanceKinds, maintenancePhases, maintenanceStates, noticeText, progressPercent, progressText } from '@/components/backup/maintenance-presentation'
import { useMaintenanceTask } from '@/composables/useMaintenanceTask'
import { useMaintenanceCommand } from '@/composables/useMaintenanceCommand'
import { useAuthStore } from '@/stores/auth'
import '@/styles/spectrum-backup.css'
import { intentAllowed } from '@/lib/api/maintenance-backup'

const route = useRoute(), router = useRouter(), auth = useAuthStore()
const taskId = () => String(route.params.task_id || '')
const state = reactive(useMaintenanceTask(taskId))
const task = computed(() => state.data?.task), operation = computed(() => state.data?.operation)
const canWrite = computed(() => auth.authenticated && Boolean(state.capabilities?.ready) && !state.loading && !state.error)
const command = reactive(useMaintenanceCommand(intent => canWrite.value && (!intent || intentAllowed(state.capabilities, intent)), task => { void router.push('/backups/tasks/' + task.task_id); if (task.task_id === taskId()) void state.refresh() }))
const reason = ref(''), acknowledged = ref(false), action = ref<'resume' | 'abort' | 'cancel' | null>(null), copied = ref(false)
watch(() => command.rejected, kind => { if (['PLAN_STALE', 'PLAN_EXPIRED'].includes(kind) && state.preview) state.preview.state = 'expired' })
const availability = computed(() => operation.value?.business_available ?? task.value?.result?.business_available ?? (task.value?.kind === 'plan' ? state.capabilities?.maintenance.business_available : undefined))
const complete = computed(() => task.value?.state === 'succeeded' && availability.value === true && (!operation.value || operation.value.state === 'succeeded'))
const label = computed(() => {
  if (task.value?.kind === 'plan') return task.value.state === 'succeeded' ? '方案已核对，等待确认' : ['queued','running'].includes(task.value.state) ? '正在核对备份' : maintenanceStates[task.value.state]
  if (task.value?.state === 'succeeded' && operation.value?.state === 'cancelled' && availability.value === true) return '已取消，原服务已恢复'
  if (complete.value && (task.value?.kind === 'restore' || operation.value?.kind === 'restore')) return '恢复完成，业务已恢复'
  if (complete.value && task.value?.result?.backup_id) return '备份完成，业务已恢复'
  return maintenanceStates[task.value?.state || ''] || '状态待确认'
})
function allowed(value: 'resume' | 'abort' | 'cancel') {
  if (!canWrite.value || command.busy || command.pending || !state.capabilities?.actions[value]) return false
  if (value === 'cancel') return task.value?.state === 'queued' && task.value.allowed_actions.includes('cancel')
  return Boolean(operation.value?.allowed_actions.includes(value) && (value !== 'abort' || !operation.value.writes_opened))
}
const canConfirmPlan = computed(() => canWrite.value && state.previewValid && (state.preview?.kind !== 'restore' || state.backup?.restorable === true) && state.capabilities?.actions[state.preview?.kind === 'restore' ? 'restore' : 'create'] && !command.pending && !command.busy)
async function confirmPlan() {
  const preview = state.preview
  if (!canConfirmPlan.value || !preview || !acknowledged.value || reason.value.trim().length > 500) return
  if (preview.kind === 'restore') {
    if (!preview.backup_id || !preview.manifest_sha256) return
    await command.submit('restores', { preview_id: preview.preview_id, plan_fingerprint: preview.plan_fingerprint,
      backup_id: preview.backup_id, manifest_sha256: preview.manifest_sha256, confirmation: 'RESTORE_ALL_BUSINESS_DATA', reason: reason.value.trim() })
  } else await command.submit('backups', { preview_id: preview.preview_id, plan_fingerprint: preview.plan_fingerprint, confirmation: 'BACKUP_ALL_BUSINESS_DATA', reason: reason.value.trim() })
}
async function confirmAction() {
  if (!action.value || !allowed(action.value) || !task.value) return
  if (action.value === 'cancel') await command.submit(`tasks/${task.value.task_id}/cancel`, { expected_revision: task.value.revision })
  else if (operation.value) await command.submit(`operations/${operation.value.operation_id}/${action.value}`, { expected_revision: operation.value.revision, confirmation: action.value === 'resume' ? 'RESUME_OPERATION' : 'ABORT_BEFORE_COMMIT' })
  action.value = null
}
async function copyLink() {
  try { await navigator.clipboard.writeText(location.origin + router.resolve('/backups/tasks/' + taskId()).href); copied.value = true }
  catch { copied.value = false; command.error = '复制失败，可复制浏览器地址栏中的任务地址。' }
}
</script>
<template>
  <!-- §2.1/§2.8: confirmed phase and business availability first; progress second;
       actions only from server allowance. Spectrum type/spacing/material tokens. -->
  <SpectrumLayout><div class="spectrum-operations maintenance-task-page">
    <header class="spectrum-page-heading"><div><p class="spectrum-eyebrow">BACKUP / TASK</p><h1>{{ maintenanceKinds[task?.kind || ''] || '维护任务' }}</h1></div><div class="backup-actions"><Button v-if="auth.authenticated" variant="ghost" @click="router.push('/backups')"><ArrowLeft :size="16" />备份与恢复</Button><Button variant="outline" @click="copyLink"><Link2 :size="16" />{{ copied ? '已复制地址' : '复制任务地址' }}</Button><Button variant="outline" :disabled="state.loading" @click="state.refresh"><RefreshCw :size="16" />刷新任务</Button></div></header>
    <p v-if="!auth.authenticated" class="backup-alert" role="status">当前为只读结果页面。<RouterLink :to="{path:'/login',query:{redirect:'/backups/tasks/'+taskId()}}">重新登录查看或处理任务</RouterLink></p>
    <p v-if="state.error" class="backup-alert is-danger" role="alert">{{ state.error }}</p>
    <p v-if="state.loading && !task" class="backup-empty" role="status"><Loader2 class="animate-spin" />正在读取任务</p>
    <MaintenanceCommandNotice v-bind="command" :can-retry="canWrite" @check="command.check" @retry="command.retry" />
    <section v-if="task" class="spectrum-panel maintenance-status" aria-labelledby="task-status-title">
      <div class="backup-section-heading"><span class="spectrum-state-pill" :class="complete ? 'is-active' : 'is-idle'">{{ availability === true ? '业务可用' : availability === false ? '业务已暂停' : '业务状态待确认' }}</span><span class="backup-secondary">最后确认：{{ backupTime(state.confirmedAt) }}</span></div>
      <h2 id="task-status-title" role="status">{{ label }}</h2><p class="maintenance-phase">{{ maintenancePhases[task.phase] || '正在核对任务阶段' }}</p>
      <template v-if="task.state === 'queued' || task.state === 'running'"><progress v-if="progressPercent(task.progress) !== undefined" :value="progressPercent(task.progress)" max="100" aria-label="已确认处理进度" /><p v-if="progressText(task.progress)" class="backup-secondary">{{ progressText(task.progress) }}</p><p v-else class="backup-secondary">总量尚未确认，以当前阶段为准。</p></template>
      <p v-if="task.state === 'succeeded' && availability === false" class="backup-alert" role="alert">任务步骤已结束，业务仍未恢复。请核对当前阻塞原因。</p>
      <p v-if="task.error" class="backup-alert is-danger" role="alert">{{ noticeText(task.error) }}</p>
      <ul v-if="operation?.blocking_reasons.length" class="backup-alert"><li v-for="(item,index) in operation.blocking_reasons" :key="index">{{ noticeText(item) }}</li></ul>
      <p v-if="task.result?.reauth_required && complete && !auth.authDisabled" class="backup-alert">恢复完成，请使用当前密码重新登录后核对业务数据。<RouterLink :to="{path:'/login',query:{redirect:'/config'}}">重新登录</RouterLink></p>
      <div class="backup-actions maintenance-task-actions"><Button v-if="allowed('resume')" @click="action='resume'">继续任务</Button><Button v-if="allowed('abort')" variant="outline" @click="action='abort'">取消并恢复原服务</Button><Button v-if="allowed('cancel')" variant="outline" @click="action='cancel'">取消排队</Button></div>
      <p class="backup-secondary">关闭页面不会取消任务；连接中断时，可刷新此地址继续查看。</p>
      <details class="spectrum-help"><summary>任务信息</summary><dl class="maintenance-counts"><div><dt>提交时间</dt><dd>{{ backupTime(task.created_at) }}</dd></div><div><dt>状态更新时间</dt><dd>{{ backupTime(task.updated_at) }}</dd></div><div><dt>提交人</dt><dd>{{ task.actor }}</dd></div></dl><p class="backup-secondary">{{ task.reason || '未填写备注' }}</p><code class="backup-secondary">{{ task.task_id }}</code></details>
    </section>
    <section v-if="state.preview" class="spectrum-panel maintenance-preview" aria-labelledby="maintenance-preview-title">
      <p class="spectrum-eyebrow">REVIEW / CONFIRM</p><h2 id="maintenance-preview-title">{{ state.preview.kind === 'restore' ? '核对恢复方案' : '核对备份方案' }}</h2>
      <p class="maintenance-phase">目标：{{ state.preview.target_label }}</p><MaintenanceCounts :counts="state.preview.counts" /><p v-if="state.preview.bytes" class="backup-secondary">{{ decimalSize(state.preview.bytes) }}</p>
      <p v-if="state.backup" class="maintenance-phase">恢复点：{{ backupTime(state.backup.consistent_at) }}</p>
      <div v-if="state.preview.warnings.length" class="backup-alert"><p v-for="(item,index) in state.preview.warnings" :key="index">{{ noticeText(item) }}</p></div>
      <div v-if="state.preview.issues.length" class="backup-alert is-danger" role="alert"><p v-for="(item,index) in state.preview.issues" :key="index">{{ noticeText(item) }}</p></div>
      <p v-if="!state.previewValid" class="backup-alert" role="alert">方案已过期或未通过核验，请返回备份列表重新核对。</p><p v-else class="backup-secondary">方案有效至 {{ backupTime(state.preview.expires_at) }}</p>
      <div class="backup-confirm-risk"><template v-if="state.preview.kind === 'restore'"><p>全部业务将暂停，业务数据切换到此备份状态。</p><ul><li>当前账号密码保留，旧会话会退出。</li><li>原库和资源副本保留；开放新业务写入后不能直接撤销。</li></ul></template><p v-else>备份期间业务暂停，管理页面可继续查看进度；关闭页面不会取消任务。</p></div>
      <div class="backup-reason"><Label for="maintenance-reason">备注（选填）</Label><Input id="maintenance-reason" v-model="reason" maxlength="500" :disabled="command.busy || !!command.pending" placeholder="例如：升级前备份" /></div>
      <label class="backup-acknowledgement"><input v-model="acknowledged" type="checkbox" :disabled="!canConfirmPlan" />{{ state.preview.kind === 'restore' ? '我已核对方案，确认恢复全部业务数据' : '我已了解业务暂停，确认创建全量备份' }}</label>
      <Button :variant="state.preview.kind === 'restore' ? 'destructive' : 'default'" :disabled="!canConfirmPlan || !acknowledged" @click="confirmPlan">{{ command.busy ? '提交中…' : state.preview.kind === 'restore' ? '确认恢复全部业务数据' : '确认创建备份' }}</Button>
    </section>
  </div>
  <Dialog :open="!!action" @update:open="value => { if(!value && !command.busy) action=null }"><DialogContent :close-disabled="command.busy"><DialogHeader><DialogTitle>{{ action === 'abort' ? '取消并恢复原服务' : action === 'cancel' ? '取消排队任务' : '继续维护任务' }}</DialogTitle><DialogDescription>{{ action === 'abort' ? '提交后将核对状态并尝试恢复原服务，请等待任务确认。不会跳过停止或完整性检查。' : action === 'cancel' ? '只取消尚未开始执行的任务。' : '沿用当前操作继续处理，以服务端确认的阶段为准。' }}</DialogDescription></DialogHeader><DialogFooter><Button variant="outline" :disabled="command.busy" @click="action=null">暂不操作</Button><Button :disabled="command.busy || !action || !allowed(action)" @click="confirmAction">确认{{ action === 'abort' ? '恢复原服务' : action === 'cancel' ? '取消排队' : '继续任务' }}</Button></DialogFooter></DialogContent></Dialog>
  </SpectrumLayout>
</template>
