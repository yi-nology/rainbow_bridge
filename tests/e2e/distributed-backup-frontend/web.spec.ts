import { test, expect, type Page } from '@playwright/test'
import { mkdir } from 'node:fs/promises'
import { readFile } from 'node:fs/promises'
import { join } from 'node:path'
import { maintenanceFixture, taskFixture, operationFixture, taskId, operationId, alternateTaskId, previewId, requestId, backupId, taskURL } from './web-fixture'
import { fail, login } from '../auth/mock'
import { ok } from '../auth/backup-fixture'
const uuid = /^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/
test.beforeEach(async ({ page }) => { page.on('pageerror', error => process.stdout.write('Page error: ' + error.message + '\n')) })
async function createPlan(page: Page) {
  await page.goto('backups'); await page.getByRole('button', { name: '创建备份', exact: true }).click()
  await expect(page.getByRole('heading', { name: '核对备份方案' })).toBeVisible()
}

test('maintenance_web独立列表、真实核验时间/大整数，创建方案只读并显式确认202', async ({ page }) => {
  const { mock, state, CSRF } = await maintenanceFixture(page)
  await createPlan(page)
  expect(mock.count('backup/list')).toBe(0)
  expect(mock.count('maintenance/backups')).toBe(1)
  expect(mock.writes('maintenance/plans')[0].postDataJSON()).toMatchObject({ kind: 'backup' })
  expect(mock.writes('maintenance/plans')[0].postDataJSON().request_id).toMatch(uuid)
  await expect(page.getByText('9,007,199,254,740,993', { exact: true })).toBeVisible()
  expect(mock.writes('maintenance/backups')).toHaveLength(0)
  await page.getByLabel('备注（选填）').fill('升级前备份')
  await expect(page.getByRole('button', { name: '确认创建备份', exact: true })).toBeDisabled()
  await page.getByRole('checkbox').check()
  state.task = taskFixture({ state: 'queued', phase: 'queued' })
  await page.getByRole('button', { name: '确认创建备份', exact: true }).dblclick()
  await expect(page.getByRole('heading', { name: '创建备份', exact: true })).toBeVisible()
  expect(mock.writes('maintenance/backups')).toHaveLength(1)
  const payload = mock.writes('maintenance/backups')[0].postDataJSON()
  expect(payload).toMatchObject({ preview_id: previewId, plan_fingerprint: 'p'.repeat(64), confirmation: 'BACKUP_ALL_BUSINESS_DATA', reason: '升级前备份' })
  expect(mock.writes('maintenance/backups')[0].headers()['x-csrf-token']).toBe(CSRF)
  await expect(page.getByRole('status').filter({ hasText: '已提交' })).toBeVisible()
  await expect(page.getByText('备份完成，业务已恢复', { exact: true })).toHaveCount(0)
})

test('restore先核验预览再确认，字段保持原方案；可用性未恢复不能宣称恢复完成', async ({ page }) => {
  const { mock, state } = await maintenanceFixture(page)
  await page.goto('backups')
  await page.getByRole('button', { name: '核对并恢复', exact: true }).click()
  await expect(page.getByRole('heading', { name: '核对恢复方案' })).toBeVisible()
  expect(mock.writes('maintenance/plans')[0].postDataJSON()).toMatchObject({ kind: 'restore', backup_id: backupId, expected_sha256: 'a'.repeat(64) })
  await expect(page.getByText('全部业务将暂停，业务数据切换到此备份状态。')).toBeVisible()
  await page.getByRole('checkbox').check()
  await page.getByRole('button', { name: '确认恢复全部业务数据', exact: true }).click()
  const payload = mock.writes('maintenance/restores')[0].postDataJSON()
  expect(payload).toMatchObject({ preview_id: previewId, plan_fingerprint: 'p'.repeat(64), backup_id: backupId, manifest_sha256: 'a'.repeat(64), confirmation: 'RESTORE_ALL_BUSINESS_DATA' })
  state.task = taskFixture({ kind: 'restore', state: 'succeeded', phase: 'completed', revision: '10', result: { business_available: false } })
  state.operation = operationFixture({ kind: 'restore', business_available: false })
  await page.getByRole('button', { name: '刷新任务', exact: true }).click()
  await expect(page.getByRole('alert')).toContainText('业务仍未恢复')
  await expect(page.getByText('恢复完成，业务已恢复', { exact: true })).toHaveCount(0)
})

for (const kind of ['expired', 'invalid', 'stale']) test(`方案${kind}不可继续恢复`, async ({ page }) => {
  const { mock, state } = await maintenanceFixture(page)
  if (kind !== 'stale') mock.overrides.set('maintenance/plans/' + previewId, route => ok(route, { ...state.preview, state: kind }))
  await createPlan(page)
  if (kind !== 'stale') { await expect(page.getByRole('button', { name: '确认创建备份', exact: true })).toBeDisabled(); return }
  mock.overrides.set('maintenance/backups', route => fail(route, 409, 'PLAN_STALE'))
  await page.getByRole('checkbox').check()
  await page.getByRole('button', { name: '确认创建备份', exact: true }).click()
  await expect(page.getByRole('alert').first()).toContainText('方案已变化')
  await expect(page.getByRole('button', { name: '确认创建备份', exact: true })).toBeDisabled()
  expect(mock.writes('maintenance/backups')).toHaveLength(1)
})

test('未知contract/prefix禁止新维护接口，not-ready保持任务可读', async ({ page }) => {
  const { mock, state } = await maintenanceFixture(page)
  mock.overrides.set('backup/capabilities', route => ok(route, { supported: true, mode: 'maintenance_web', contract_version: 2, maintenance_api_prefix: 'https://evil.invalid/' }))
  await page.goto('backups')
  await expect(page.getByRole('heading', { name: '当前备份模式尚不能在网页操作' })).toBeVisible()
  expect(mock.count('maintenance/capabilities')).toBe(0)
  mock.overrides.set('backup/capabilities', route => ok(route, { supported: true, mode: 'maintenance_web', contract_version: 1, maintenance_api_prefix: '/api/v1/maintenance' }))
  state.caps.ready = false
  await page.reload()
  await expect(page.getByRole('heading', { name: '备份服务尚未准备就绪' })).toBeVisible()
  await expect(page.getByRole('button', { name: '创建备份', exact: true })).toBeDisabled()
  await expect(page.getByRole('heading', { name: '任务记录', exact: true })).toBeVisible()
  expect(mock.writes('maintenance/plans')).toHaveLength(0)
})

test('未知总量展示已处理原文，不造百分比，已知总量才用真实进度', async ({ page }) => {
  const { state, mock } = await maintenanceFixture(page)
  await page.goto(taskURL)
  await expect.poll(() => mock.count('maintenance/tasks/' + taskId)).toBeGreaterThan(0)
  await expect(page.getByText(/已处理 9,007,199,254,740,993 项/)).toBeVisible()
  await expect(page.getByRole('progressbar')).toHaveCount(0)
  state.task = taskFixture({ revision: '3', progress: { completed_bytes: '50', total_bytes: '200' } })
  await page.getByRole('button', { name: '刷新任务', exact: true }).click()
  await expect(page.getByRole('progressbar')).toHaveAttribute('value', '25')
})

test('核验失败备份不能恢复，核验触发独立任务', async ({ page }) => {
  const { mock, state } = await maintenanceFixture(page)
  state.backups[0].verification.state = 'failed'; state.backups[0].restorable = false
  await page.goto('backups')
  await expect(page.getByRole('button', { name: '核对并恢复', exact: true })).toBeDisabled()
  await page.getByRole('button', { name: '核验', exact: true }).click()
  await expect(page).toHaveURL(new RegExp(alternateTaskId))
  expect(mock.writes(`maintenance/backups/${backupId}/verify`)[0].postDataJSON()).toMatchObject({ expected_sha256: 'a'.repeat(64) })
})

for (const action of ['resume', 'abort', 'cancel']) test(`allowed_actions控制${action}且沿用revision`, async ({ page }) => {
  const { mock, state } = await maintenanceFixture(page)
  state.task = taskFixture({ state: action === 'cancel' ? 'queued' : 'blocked', allowed_actions: [action] })
  state.operation = operationFixture({ allowed_actions: [action], revision: '9007199254740993' })
  await page.goto(taskURL)
  const label = action === 'resume' ? '继续任务' : action === 'abort' ? '取消并恢复原服务' : '取消排队'
  await page.getByRole('button', { name: label, exact: true }).click()
  await page.getByRole('dialog').getByRole('button', { name: action === 'resume' ? '确认继续任务' : action === 'abort' ? '确认恢复原服务' : '确认取消排队', exact: true }).click()
  const path = action === 'cancel' ? `maintenance/tasks/${taskId}/cancel` : `maintenance/operations/${operationId}/${action}`
  expect(mock.writes(path)[0].postDataJSON()).toMatchObject({ expected_revision: action === 'cancel' ? '2' : '9007199254740993' })
  expect(mock.writes(path)[0].postDataJSON().request_id).toMatch(uuid)
})

test('已开放写入即使allowed含abort也不显示回退，执行中不提供取消排队', async ({ page }) => {
  const { state } = await maintenanceFixture(page)
  state.task = taskFixture({ state: 'running', allowed_actions: ['cancel'] }); state.operation = operationFixture({ writes_opened: true, allowed_actions: ['abort'] })
  await page.goto(taskURL)
  await expect(page.getByRole('button', { name: '取消并恢复原服务', exact: true })).toHaveCount(0)
  await expect(page.getByRole('button', { name: '取消排队', exact: true })).toHaveCount(0)
})

test('提交丢响应后刷新不重写，by-request查回原ID；404仅用户显式原样重试', async ({ page }) => {
  const { mock } = await maintenanceFixture(page)
  mock.overrides.set('maintenance/plans', route => route.abort())
  await page.goto('backups'); await page.getByRole('button', { name: '创建备份', exact: true }).click()
  await expect(page.getByRole('heading', { name: '提交结果尚未确认' })).toBeVisible()
  const first = mock.writes('maintenance/plans')[0].postDataJSON()
  mock.overrides.set('maintenance/tasks/by-request/' + first.request_id, route => fail(route, 404, 'TASK_NOT_FOUND'))
  await page.reload()
  expect(mock.writes('maintenance/plans')).toHaveLength(1)
  await page.getByRole('button', { name: '查询原请求结果', exact: true }).click()
  await expect(page.getByRole('button', { name: '原样重试本次操作', exact: true })).toBeVisible()
  mock.overrides.set('maintenance/plans', route => ok(route, { task: taskFixture() }))
  await page.getByRole('button', { name: '原样重试本次操作', exact: true }).click()
  await expect(page).toHaveURL(new RegExp(taskId))
  expect(mock.writes('maintenance/plans')[1].postDataJSON()).toEqual(first)
})

test('任务网络中断保留已确认阶段；旧revision不能覆盖且卸载停止轮询', async ({ page }) => {
  const { mock, state } = await maintenanceFixture(page)
  await page.clock.install()
  await page.goto(taskURL)
  await expect(page.getByText('复制配套资源', { exact: true })).toBeVisible()
  mock.overrides.set('maintenance/tasks/' + taskId, route => route.abort())
  await page.getByRole('button', { name: '刷新任务', exact: true }).click()
  await expect(page.getByRole('alert')).toContainText('任务可能仍在执行')
  await expect(page.getByText('复制配套资源', { exact: true })).toBeVisible()
  mock.overrides.set('maintenance/tasks/' + taskId, route => ok(route, { task: taskFixture({ revision: '1', phase: 'draining' }), operation: state.operation }))
  await page.getByRole('button', { name: '刷新任务', exact: true }).click()
  await expect(page.getByText('复制配套资源', { exact: true })).toBeVisible()
  await page.getByRole('button', { name: '备份与恢复', exact: true }).click()
  await expect(page).toHaveURL(/\/backups$/)
  await expect(page.getByRole('heading', { name: '任务记录', exact: true })).toBeVisible()
  const count = mock.count('maintenance/tasks/' + taskId)
  await page.clock.fastForward(60000)
  expect(mock.count('maintenance/tasks/' + taskId)).toBe(count)
})

test('maintenance会话登录回维护页，任务深链接可刷新，业务导航不可修改', async ({ page }) => {
  const { mock, state } = await maintenanceFixture(page); state.scope = 'maintenance'; mock.authenticated = false
  await page.goto('login?redirect=/config'); await login(page)
  await expect(page).toHaveURL(/\/backups$/)
  await expect(page.getByRole('status').filter({ hasText: '业务维护中' })).toBeVisible()
  await expect(page.getByRole('link', { name: '配置管理', exact: true })).toHaveCount(0)
  await page.goto(taskURL); await page.reload()
  await expect(page.getByRole('heading', { name: '创建备份', exact: true })).toBeVisible()
  await page.goto('config'); await expect(page).toHaveURL(/\/backups$/)
})

test('恢复终态清旧会话但结果页不消失；刷新匿名结果只读，不能发操作', async ({ page }) => {
  const { mock, state } = await maintenanceFixture(page)
  state.task = taskFixture({ kind: 'restore', state: 'succeeded', phase: 'completed', result: { business_available: true, reauth_required: true } })
  state.operation = operationFixture({ kind: 'restore', business_available: true, writes_opened: true, state: 'succeeded' })
  mock.overrides.set('maintenance/tasks/' + taskId, route => { mock.authenticated = false; return ok(route, { task: state.task, operation: state.operation }) })
  await page.goto(taskURL)
  await expect(page.getByRole('status').filter({ hasText: '恢复完成，业务已恢复' })).toBeVisible()
  await expect(page.getByText(/当前为只读结果页面/)).toBeVisible()
  await expect(page).toHaveURL(new RegExp(taskId))
  mock.authenticated = false
  await page.reload()
  await expect(page.getByRole('status').filter({ hasText: '恢复完成，业务已恢复' })).toBeVisible()
  await expect(page.getByRole('button', { name: '继续任务', exact: true })).toHaveCount(0)
  expect(mock.writes(`maintenance/operations/${operationId}/resume`)).toHaveLength(0)
  expect(await page.evaluate(() => JSON.stringify({ ...sessionStorage, ...localStorage }))).not.toMatch(/mock-csrf|mock-password|token/)
})

test('历史恢复reauth标记不撤销刚重新登录的有效会话', async ({ page }) => {
  const { state } = await maintenanceFixture(page)
  state.task = taskFixture({ kind: 'restore', state: 'succeeded', result: { business_available: true, reauth_required: true } })
  state.operation = operationFixture({ state: 'succeeded', business_available: true, writes_opened: true })
  await page.goto(taskURL)
  await expect(page.getByRole('status').filter({ hasText: '恢复完成' })).toBeVisible()
  await expect(page.getByRole('button', { name: '退出', exact: true })).toBeVisible()
  await expect(page.getByText(/当前为只读结果页面/)).toHaveCount(0)
})

test('结果读取仅放行精确任务GET，不能放行列表/by-request/POST或外部URL', async ({ page, baseURL }) => {
  const { mock, state } = await maintenanceFixture(page); mock.authenticated = false
  state.task = taskFixture({ state: 'succeeded' })
  await page.goto(taskURL)
  await expect(page.getByRole('heading', { name: '创建备份', exact: true })).toBeVisible()
  const results = await page.evaluate(async url => {
    const { fetchApi } = await import(/* @vite-ignore */ url)
    const root = location.origin + '/rainbow-bridge/api/v1/maintenance/'
    const rejected: number[] = []
    for (const [path, method] of [['tasks','GET'], ['tasks/by-request/abc','GET'], ['tasks/abc','POST'], ['tasks/abc?x=1','GET'], ['https://evil.invalid/api/v1/maintenance/tasks/abc','GET']]) {
      try { await fetchApi(path.startsWith('https') ? path : root + path, { method }, { taskResultRead: true }); rejected.push(0) } catch (e) { rejected.push((e as { code: number }).code) }
    }
    return rejected
  }, new URL('src/lib/api/http.ts', baseURL!).href)
  expect(results).toEqual([400,400,400,400,400])
  expect(mock.count('maintenance/tasks')).toBe(0)
})

test('结果Cookie失效显示重新登录且不循环跳转，安全task redirect去除token/外链', async ({ page }) => {
  const { mock, state } = await maintenanceFixture(page); mock.authenticated = false; state.resultDenied = true
  await page.goto(taskURL)
  await expect(page.getByRole('alert')).toContainText('重新登录')
  await expect(page).toHaveURL(new RegExp(taskId))
  state.resultDenied = false
  await page.getByRole('link', { name: '重新登录查看或处理任务', exact: true }).click()
  await login(page)
  await expect(page).toHaveURL(new RegExp(taskId))
})

test('任务与预览在1280/1440明暗主题可读', async ({ page }) => {
  const { state } = await maintenanceFixture(page)
  const dir = join(process.env.DBF_EVIDENCE_DIR!, 'web-screenshots'); await mkdir(dir, { recursive: true })
  for (const width of [1280,1440]) for (const theme of ['light','dark']) for (const mode of ['workspace','blocked','completed','preview','restore-preview']) {
    await page.setViewportSize({ width, height: 1000 })
    if (mode === 'workspace') await page.goto('backups')
    else if (mode === 'preview') await createPlan(page)
    else if (mode === 'restore-preview') {
      await page.goto('backups'); await page.getByRole('button', { name:'核对并恢复',exact:true }).click()
    }
    else {
      state.task = taskFixture({ kind: 'restore', state: mode === 'blocked' ? 'blocked' : 'succeeded', phase: mode === 'blocked' ? 'checking' : 'completed', revision: '4', result: { business_available: mode !== 'blocked' } })
      state.operation = operationFixture({ kind: 'restore', state: mode === 'blocked' ? 'blocked' : 'succeeded', business_available: mode !== 'blocked', allowed_actions: mode === 'blocked' ? ['resume','abort'] : [], blocking_reasons: mode === 'blocked' ? [{ code:'EXECUTOR_NOT_STOPPED',message:'执行者尚未停止' }] : [] })
      await page.goto(taskURL)
    }
    await page.evaluate(theme => document.documentElement.classList.toggle('dark', theme === 'dark'), theme)
    await expect(page.getByRole('heading', { name: mode === 'preview' ? '核对备份方案' : mode === 'restore-preview' ? '核对恢复方案' : mode === 'workspace' ? '全量备份' : '恢复业务', exact: true })).toBeVisible()
    expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true)
    await page.screenshot({ path: join(dir, `${mode}-${theme}-${width}.png`), fullPage: true, animations: 'disabled' })
  }
})

test('后端共享DTO fixture任务可直接读取', async ({ page }) => {
  const fixture = JSON.parse(await readFile(join(process.cwd(), '../../docs/contracts/maintenance-web-v1/fixtures.json'), 'utf8'))
  const { mock } = await maintenanceFixture(page)
  const id = fixture.task_detail.data.task.task_id
  mock.overrides.set('maintenance/tasks/' + id, route => route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify(fixture.task_detail) }))
  await page.goto('backups/tasks/' + id)
  await expect(page.getByRole('heading', { name: '恢复业务', exact: true })).toBeVisible()
  await expect(page.getByText('暂停业务', { exact: true })).toBeVisible()
  await expect(page.getByRole('progressbar')).toHaveCount(0)
})

test('回退到原服务不能误报已恢复备份，真实401过期不清空结果页', async ({ page }) => {
  const { state } = await maintenanceFixture(page)
  state.task = taskFixture({kind:'abort',state:'succeeded',result:{business_available:true}})
  state.operation = operationFixture({kind:'restore',state:'cancelled',business_available:true,writes_opened:true})
  await page.goto(taskURL)
  await expect(page.getByRole('status').filter({hasText:'已取消，原服务已恢复'})).toBeVisible()
  await expect(page.getByText('恢复完成，业务已恢复',{exact:true})).toHaveCount(0)
})

test('pending只读查回已经受理的任务，不重复提交；动作权限收回阻止原样重试', async ({ page }) => {
  const { mock, state } = await maintenanceFixture(page)
  mock.overrides.set('maintenance/plans',route=>route.abort())
  await page.goto('backups');await page.getByRole('button',{name:'创建备份',exact:true}).click()
  await expect(page.getByRole('heading',{name:'提交结果尚未确认'})).toBeVisible()
  const original = mock.writes('maintenance/plans')[0].postDataJSON()
  mock.overrides.set('maintenance/tasks/by-request/'+original.request_id,route=>ok(route,{task:taskFixture({request_id:original.request_id})}))
  await page.getByRole('button',{name:'查询原请求结果',exact:true}).click()
  await expect(page).toHaveURL(new RegExp(taskId))
  expect(mock.writes('maintenance/plans')).toHaveLength(1)
  state.caps.actions.create=false
  await page.getByRole('button',{name:'备份与恢复',exact:true}).click()
  await expect(page.getByRole('button',{name:'创建备份',exact:true})).toBeDisabled()
})

test('会话恢复尚未返回时任务结果已能显示', async ({ page }) => {
  const { mock, state } = await maintenanceFixture(page)
  let release!:()=>void
  mock.overrides.set('auth/me',async route=>{await new Promise<void>(r=>{release=r});await fail(route,401,'AUTH_REQUIRED')})
  state.task=taskFixture({state:'succeeded'})
  await page.goto(taskURL)
  await expect(page.getByRole('heading',{name:'创建备份',exact:true})).toBeVisible()
  expect(mock.count('maintenance/tasks/'+taskId)).toBeGreaterThan(0)
  release()
  await expect(page.getByText(/当前为只读结果页面/)).toBeVisible()
})

test('auth/me控制服务失效时仍允许任务结果GET，不被全局恢复页拦住', async ({ page }) => {
  const { mock, state } = await maintenanceFixture(page)
  mock.overrides.set('auth/me', route => fail(route, 503, 'CONTROL_UNAVAILABLE'))
  state.task = taskFixture({ state: 'succeeded' })
  await page.goto(taskURL)
  await expect(page.getByRole('heading', { name: '创建备份', exact: true })).toBeVisible()
  await expect(page.getByText(/当前为只读结果页面/)).toBeVisible()
  expect(mock.count('maintenance/capabilities')).toBe(0)
})

test('MAINTENANCE_ACTIVE业务503不清控制登录，CONTROL_UNAVAILABLE登录不报密码错误', async ({ page, baseURL }) => {
  const { mock } = await maintenanceFixture(page)
  await page.goto('backups')
  mock.overrides.set('config/create', route => fail(route, 503, 'MAINTENANCE_ACTIVE'))
  const result = await page.evaluate(async url => {
    const { fetchApi } = await import(/* @vite-ignore */ url)
    try { await fetchApi(location.origin + '/rainbow-bridge/api/v1/config/create', { method:'POST',body:'{}' }) } catch (e) { return (e as Error).message }
  }, new URL('src/lib/api/http.ts', baseURL!).href)
  expect(result).toContain('业务已暂停')
  await expect(page.getByRole('button', { name:'退出',exact:true })).toBeVisible()
  await page.getByRole('button', { name:'退出',exact:true }).click()
  mock.overrides.set('auth/login', route => fail(route,503,'CONTROL_UNAVAILABLE'))
  await login(page)
  await expect(page.getByRole('alert')).toContainText('控制服务暂不可用')
  await expect(page.getByRole('alert')).not.toContainText('密码错误')
})
