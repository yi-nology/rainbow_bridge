import { test, expect, type Page, type Route } from '@playwright/test'
import { mkdir } from 'node:fs/promises'
import { join } from 'node:path'
import { backupFixture, backupItem, job, preview, packageFile, ok, accepted } from '../auth/backup-fixture'
import { fail, login, scopeQuery } from '../auth/mock'

const maintenanceMessage = '全局维护保护：控制状态不可用、正在维护或实例代次不匹配'
const protection = (route: Route) => route.fulfill({ status: 503, contentType: 'application/json', body: JSON.stringify({ message: maintenanceMessage }) })
const caps = (mode: string | undefined = undefined, supported = true, reasons: string[] = []) => ({ supported, reasons,
  ...(mode === undefined ? {} : { mode }), limits: { package_bytes: 2 ** 31, max_backups: 10 }, restore_requires_restart: true,
  rollback_retention: { keep_count: 3, managed: true } })
const pending = { action: 'create', payload: { request_id: '12345678-1234-4234-8234-123456789000', reason: '原始操作' } }
const storageKey = 'rainbow-bridge:/rainbow-bridge/:backup-tasks'
async function seed(page: Page) {
  await page.addInitScript(({ key, value }) => sessionStorage.setItem(key, JSON.stringify(value)), {
    key: storageKey, value: { pending, jobs: [{ job_id: job().job_id, kind: 'create' }] },
  })
}

for (const supported of [false, true]) test(`维护CLI优先mode，supported=${supported}且旧pending不重放`, async ({ page }) => {
  const { mock } = await backupFixture(page)
  await seed(page)
  mock.overrides.set('backup/capabilities', route => ok(route, caps('maintenance_cli_only', supported, ['分布式全量维护备份仅支持运维 CLI；网页不提供远程恢复执行'])))
  await page.goto('backups')
  await expect(page.getByText('运维维护备份', { exact: true })).toBeVisible()
  await expect(page.getByRole('heading', { name: '由部署人员执行备份与恢复' })).toBeVisible()
  await expect(page.getByText('操作期间全部应用停服，网页不提供执行入口。')).toBeVisible()
  await expect(page.getByText(/浏览器留有先前网页操作记录/)).toBeVisible()
  await expect(page.getByLabel('业务备份包', { exact: true })).toHaveCount(0)
  await expect(page.getByRole('button', { name: /创建备份|确认上次请求|查询恢复|取消待恢复|上传并校验/ })).toHaveCount(0)
  await expect(page.getByLabel('备份恢复任务')).toHaveCount(0)
  await expect(page.locator('main')).not.toContainText(/SQLite|Redis|第一版|最近 3 次|最大 2.0 GiB|最多保留/)
  await page.getByText('维护备份须知', { exact: true }).click()
  await expect(page.getByText('请联系部署人员，参阅《多 Pod 手动维护备份》。')).toBeVisible()
  expect(mock.requests.filter(r => r.url().includes('/backup/')).map(r => new URL(r.url()).pathname.split('/backup/')[1])).toEqual(['capabilities'])
  const saved = await page.evaluate(key => JSON.parse(sessionStorage.getItem(key)!), storageKey)
  expect(saved.pending).toEqual(pending)
  expect(saved.jobs).toHaveLength(1)
})

for (const mode of ['business_full', undefined]) test(`网页能力支持新旧mode=${mode}，创建/下载/删除可操作`, async ({ page }) => {
  const { mock, state } = await backupFixture(page); state.items = [backupItem]; state.currentJob = job('create', 'succeeded')
  mock.overrides.set('backup/capabilities', route => ok(route, caps(mode)))
  mock.overrides.set('backup/download', route => route.fulfill({ status: 200, contentType: 'application/zip', body: Buffer.from([0x50, 0x4b, 3, 4]) }))
  await page.goto('backups')
  await expect(page.getByTestId('rollback-retention')).toContainText('最近 3 次')
  const download = page.waitForEvent('download')
  await page.getByRole('button', { name: /^下载备份 / }).click(); await download
  await page.getByRole('button', { name: '创建备份', exact: true }).click()
  await page.getByRole('button', { name: '开始备份', exact: true }).click()
  await expect(page.getByRole('heading', { name: '备份完成', exact: true })).toBeVisible()
  await page.getByRole('button', { name: /^删除备份 / }).click()
  await page.getByRole('button', { name: '确认删除备份', exact: true }).click()
  await expect(page.getByRole('heading', { name: '尚无业务备份' })).toBeVisible()
  expect(mock.count('backup/create')).toBe(1)
  expect(mock.count('backup/delete')).toBe(1)
})

test('不支持原因限定网页模式、快照目录库存原因有中文、未知原因去重不泄露', async ({ page }) => {
  const { mock } = await backupFixture(page)
  mock.overrides.set('backup/capabilities', route => ok(route, caps('business_full', false, [
    'database_driver_not_supported', 'storage_not_local', 'snapshot_storage_not_local', 'redis_enabled',
    'snapshot_history_not_local', 'snapshot_inventory_unavailable', 'database_outside_business_root', 'release_snapshots_outside_business_root',
    'backup_control_dir_missing', 'backup_control_dir_not_absolute', 'backup_control_dir_unavailable', 'backup_control_dir_inside_business_root',
    'backup_control_dir_contains_business_root', 'backup_control_dir_contains_program', 'backup_control_dir_different_volume',
    'backup_disabled', 'unknown_secret_dsn', 'another_unknown',
  ])))
  await page.goto('backups')
  await expect(page.getByRole('heading', { name: '当前部署未开放网页备份与恢复' })).toBeVisible()
  await expect(page.getByText('网页本地备份模式要求发布快照使用本地存储。', { exact: true })).toBeVisible()
  await expect(page.getByText('还有未识别的部署条件，请联系部署人员核对。', { exact: true })).toHaveCount(1)
  await expect(page.locator('main')).not.toContainText(/第一版|unknown_secret_dsn|another_unknown|运维维护备份/)
  expect(mock.count('backup/list')).toBe(0)
})

test('未知mode即使supported=true也不放行', async ({ page }) => {
  const { mock } = await backupFixture(page)
  mock.overrides.set('backup/capabilities', route => ok(route, caps('future_secret_mode', true)))
  await page.goto('backups')
  await expect(page.getByRole('heading', { name: '当前备份模式尚不能在网页操作' })).toBeVisible()
  await expect(page.locator('main')).not.toContainText('future_secret_mode')
  expect(mock.count('backup/list')).toBe(0)
})

test('首次能力加载及刷新失败不沿用网页能力，显式成功刷新后才开放', async ({ page }) => {
  const { mock } = await backupFixture(page)
  let finish!: () => void
  mock.overrides.set('backup/capabilities', async route => { await new Promise<void>(r => { finish = r }); await ok(route, caps()) })
  await page.goto('backups')
  await expect(page.getByRole('status').filter({ hasText: '正在确认当前部署' })).toBeVisible()
  await expect(page.getByRole('button', { name: '创建备份', exact: true })).toHaveCount(0)
  finish()
  await expect(page.getByRole('button', { name: '创建备份', exact: true })).toBeEnabled()
  mock.overrides.set('backup/capabilities', route => route.fulfill({ status: 503, contentType: 'application/json', body: JSON.stringify({ message: 'private diagnostics' }) }))
  await page.getByRole('button', { name: '刷新', exact: true }).click()
  await expect(page.getByRole('heading', { name: '备份服务暂不可用' })).toBeVisible()
  await expect(page.getByRole('alert')).toContainText('服务暂不可用')
  await expect(page.getByRole('alert')).not.toContainText(/维护|private/)
  await expect(page.getByRole('button', { name: '创建备份', exact: true })).toHaveCount(0)
  mock.overrides.set('backup/capabilities', route => ok(route, caps()))
  await page.getByRole('button', { name: '刷新', exact: true }).click()
  await expect(page.getByRole('button', { name: '创建备份', exact: true })).toBeEnabled()
})

test('模式切换使迟到列表失效，重新进入web也不能回填旧列表', async ({ page }) => {
  const { mock } = await backupFixture(page)
  let finish!: () => void
  mock.overrides.set('backup/list', async route => { await new Promise<void>(r => { finish = r }); await ok(route, { items: [backupItem], has_more: false }) })
  await page.goto('backups')
  await expect.poll(() => Boolean(finish)).toBe(true)
  mock.overrides.set('backup/capabilities', route => ok(route, caps('maintenance_cli_only', false)))
  await page.getByRole('button', { name: '刷新', exact: true }).click()
  await expect(page.getByText('运维维护备份', { exact: true })).toBeVisible()
  mock.overrides.set('backup/list', route => ok(route, { items: [], has_more: false }))
  mock.overrides.set('backup/capabilities', route => ok(route, caps()))
  await page.getByRole('button', { name: '刷新', exact: true }).click()
  await expect(page.getByRole('heading', { name: '尚无业务备份' })).toBeVisible()
  finish()
  await expect(page.getByRole('button', { name: /^下载备份 / })).toHaveCount(0)
})

test('切CLI后迟到任务不回填、不读取预览、不继续轮询', async ({ page }) => {
  const { mock } = await backupFixture(page)
  await page.addInitScript(({ key, id }) => sessionStorage.setItem(key, JSON.stringify({
    pending: null, jobs: [{ job_id: id, kind: 'validate' }],
  })), { key: storageKey, id: job().job_id })
  let finish!: () => void
  mock.overrides.set('backup/status', async route => {
    await new Promise<void>(r => { finish = r })
    await ok(route, { job: job('validate', 'succeeded', { preview_id: preview.preview_id }) })
  })
  await page.clock.install()
  await page.goto('backups')
  await expect.poll(() => Boolean(finish)).toBe(true)
  mock.overrides.set('backup/capabilities', route => ok(route, caps('maintenance_cli_only', false)))
  await page.getByRole('button', { name: '刷新', exact: true }).click()
  await expect(page.getByText('运维维护备份', { exact: true })).toBeVisible()
  finish()
  await page.clock.fastForward(60000)
  await expect(page.getByLabel('备份恢复任务')).toHaveCount(0)
  expect(mock.count('backup/status')).toBe(1)
  expect(mock.count('backup/restore/preview')).toBe(0)
})

test('切模式使在途预览和下载失效，回web不能使用旧预览或下载', async ({ page }) => {
  const { mock, state } = await backupFixture(page); state.items = [backupItem]
  let finishPreview!: () => void, finishDownload!: () => void
  let downloaded = 0; page.on('download', () => downloaded++)
  mock.overrides.set('backup/restore/preview', async route => {
    if (route.request().method() === 'POST') return accepted(route, job('validate', 'succeeded', { preview_id: preview.preview_id }))
    await new Promise<void>(r => { finishPreview = r }); await ok(route, preview)
  })
  mock.overrides.set('backup/download', async route => {
    await new Promise<void>(r => { finishDownload = r })
    await route.fulfill({ status: 200, contentType: 'application/zip', body: Buffer.from([0x50, 0x4b, 3, 4]) })
  })
  await page.goto('backups')
  await page.getByRole('button', { name: /^下载备份 / }).click()
  await page.getByLabel('业务备份包', { exact: true }).setInputFiles(packageFile)
  await page.getByRole('button', { name: '上传并校验', exact: true }).click()
  await expect.poll(() => Boolean(finishPreview && finishDownload)).toBe(true)
  mock.overrides.set('backup/capabilities', route => ok(route, caps('maintenance_cli_only', false)))
  await page.getByRole('button', { name: '刷新', exact: true }).click()
  await expect(page.getByText('运维维护备份', { exact: true })).toBeVisible()
  finishPreview(); finishDownload()
  // The current task query is independent of the stale preview request.
  state.currentJob = job('validate', 'interrupted', { phase: 'interrupted' })
  mock.overrides.set('backup/capabilities', route => ok(route, caps()))
  await page.getByRole('button', { name: '刷新', exact: true }).click()
  await expect(page.getByRole('button', { name: '创建备份', exact: true })).toBeEnabled()
  await expect(page.getByRole('button', { name: '核对并恢复', exact: true })).toHaveCount(0)
  expect(downloaded).toBe(0)
})

for (const mode of ['maintenance_cli_only', 'future_mode']) test(`公共操作方法在${mode}+supported=true同样被门控`, async ({ page, baseURL }) => {
  const { mock } = await backupFixture(page)
  mock.overrides.set('backup/capabilities', route => ok(route, caps(mode, true)))
  await page.goto('resources')
  await expect(page.getByRole('heading', { name: '资源管理', exact: true })).toBeVisible()
  const results = await page.evaluate(async ({ source, item }) => {
    const { useBackups } = await import(/* @vite-ignore */ source)
    const app = (document.querySelector('#app') as unknown as { __vue_app__: { runWithContext: (f: () => unknown) => unknown } }).__vue_app__
    // Exercise the public composable methods without adding test hooks to product code.
    const backup = app.runWithContext(() => useBackups()) as ReturnType<typeof useBackups>
    await backup.refresh()
    await backup.loadList(); await backup.poll(); await backup.download(item)
    return { create: await backup.create('blocked'), remove: await backup.remove(item), upload: await backup.upload(),
      execute: await backup.execute('blocked'), cancel: await backup.cancelRestore(), confirm: await backup.sendPending() }
  }, { source: new URL('src/composables/useBackups.ts', baseURL!).href, item: backupItem })
  expect(Object.values(results).every(value => value === false)).toBe(true)
  expect(mock.requests.filter(r => r.url().includes('/backup/')).map(r => new URL(r.url()).pathname.split('/backup/')[1])).toEqual(['capabilities'])
})

test('开着的确认框切模式会关闭，结果不明pending跨CLI保留且仅用户确认后原样重发', async ({ page }) => {
  const { mock, state } = await backupFixture(page)
  mock.overrides.set('backup/create', route => route.abort())
  await page.goto('backups')
  await page.getByRole('button', { name: '创建备份', exact: true }).click()
  await page.getByLabel('备注（选填）').fill('保持原备注')
  await page.getByRole('button', { name: '开始备份', exact: true }).click()
  await expect(page.getByRole('button', { name: '确认上次请求结果', exact: true })).toBeVisible()
  const first = mock.writes('backup/create')[0].postDataJSON()
  mock.overrides.set('backup/capabilities', route => ok(route, caps('maintenance_cli_only', false)))
  // Dispatch the page's refresh handler to exercise an external capability refresh
  // while Radix has made the surrounding page inert.
  await page.locator('header.spectrum-page-heading button').dispatchEvent('click')
  await expect(page.getByRole('dialog')).toHaveCount(0)
  await expect(page.getByText(/浏览器留有先前网页操作记录/)).toBeVisible()
  expect(mock.count('backup/create')).toBe(1)
  mock.overrides.set('backup/capabilities', route => ok(route, caps()))
  state.currentJob = job('create', 'succeeded')
  mock.overrides.set('backup/create', route => accepted(route, state.currentJob))
  await page.getByRole('button', { name: '刷新', exact: true }).click()
  await expect(page.getByRole('button', { name: '确认上次请求结果', exact: true })).toBeVisible()
  expect(mock.count('backup/create')).toBe(1)
  await page.getByRole('button', { name: '确认上次请求结果', exact: true }).click()
  await expect(page.getByRole('heading', { name: '备份完成', exact: true })).toBeVisible()
  expect(mock.writes('backup/create')[1].postDataJSON()).toEqual(first)
})

test('维护拦截上传保留文件与备注，不当成未知受理或自动重试', async ({ page }) => {
  const { mock } = await backupFixture(page)
  mock.overrides.set('backup/restore/preview', protection)
  mock.overrides.set('backup/create', protection)
  await page.goto('backups')
  await page.getByLabel('业务备份包', { exact: true }).setInputFiles(packageFile)
  await page.getByRole('button', { name: '上传并校验', exact: true }).click()
  await expect(page.getByRole('alert')).toContainText('维护保护状态')
  await expect(page.getByText(packageFile.name, { exact: true })).toBeVisible()
  await expect(page.getByRole('button', { name: '确认上次请求结果', exact: true })).toHaveCount(0)
  await page.getByRole('button', { name: '创建备份', exact: true }).click()
  await page.getByLabel('备注（选填）').fill('保留备注')
  await page.getByRole('button', { name: '开始备份', exact: true }).click()
  await expect(page.getByRole('dialog').getByRole('alert')).toContainText('维护保护状态')
  await expect(page.getByLabel('备注（选填）')).toHaveValue('保留备注')
  await expect(page.getByRole('button', { name: '开始备份', exact: true })).toBeEnabled()
  expect(mock.count('backup/create')).toBe(1); expect(mock.count('backup/restore/preview')).toBe(1)
  await expect(page).toHaveURL(/\/backups$/)
})

test('服务端同名error_type不能冒充内部维护识别，普通503仍保留不明原请求', async ({ page }) => {
  const { mock } = await backupFixture(page)
  mock.overrides.set('backup/create', route => route.fulfill({ status: 503, contentType: 'application/json',
    body: JSON.stringify({ error_type: 'FRONTEND_MAINTENANCE_PROTECTION', message: 'different diagnostic' }) }))
  await page.goto('backups')
  await page.getByRole('button', { name: '创建备份', exact: true }).click()
  await page.getByLabel('备注（选填）').fill('原请求待核对')
  await page.getByRole('button', { name: '开始备份', exact: true }).click()
  await expect(page.getByRole('dialog').getByRole('alert')).toContainText('服务暂不可用')
  await expect(page.getByRole('button', { name: '确认上次请求结果', exact: true })).toBeVisible()
  expect(mock.count('backup/create')).toBe(1)
})

for (const authPath of ['auth/me', 'auth/login']) test(`确切维护响应在${authPath}保留安全提示`, async ({ page }) => {
  const { mock } = await backupFixture(page)
  if (authPath === 'auth/login') mock.authenticated = false
  mock.overrides.set(authPath, protection)
  await page.goto('backups')
  if (authPath === 'auth/login') await login(page)
  await expect(page.getByRole('alert')).toContainText('维护保护状态')
  await expect(page.getByRole('alert')).not.toContainText(/密码错误|正在备份|会话过期/)
  expect(mock.count(authPath)).toBe(1)
})

test('维护恢复后真实401沿用安全登录，迟到旧列表不能回填新会话', async ({ page }) => {
  const { mock } = await backupFixture(page)
  let finish!: () => void
  mock.overrides.set('backup/list', async route => { await new Promise<void>(r => { finish = r }); await ok(route, { items: [backupItem], has_more: false }) })
  await page.goto('backups')
  await expect.poll(() => Boolean(finish)).toBe(true)
  mock.overrides.set('backup/capabilities', protection)
  await page.getByRole('button', { name: '刷新', exact: true }).click()
  await expect(page.getByRole('alert')).toContainText('维护保护状态')
  mock.overrides.set('backup/capabilities', route => fail(route, 401, 'AUTH_REQUIRED'))
  await page.getByRole('button', { name: '刷新', exact: true }).click()
  await expect(page).toHaveURL(/login\?redirect=\/backups/)
  mock.overrides.set('backup/capabilities', route => ok(route, caps()))
  mock.overrides.set('backup/list', route => ok(route, { items: [], has_more: false }))
  await login(page)
  await expect(page.getByRole('heading', { name: '尚无业务备份' })).toBeVisible()
  finish()
  await expect(page.getByRole('button', { name: /^下载备份 / })).toHaveCount(0)
  expect(mock.writes('backup/create')).toHaveLength(0)
  expect(await page.evaluate(() => JSON.stringify({ ...sessionStorage, ...localStorage }))).not.toMatch(/mock-password|csrf/)
})

test('共享HTTP只信任精确API维护503，其他响应与第三方均通用不可用', async ({ page, baseURL }) => {
  const { mock } = await backupFixture(page)
  await page.goto('backups')
  await expect(page.getByRole('button', { name: '创建备份', exact: true })).toBeEnabled()
  const scenarios = [
    { status: 503, json: { message: maintenanceMessage }, maintained: true },
    { status: 503, json: { message: maintenanceMessage + ' details' }, maintained: false },
    { status: 500, json: { message: maintenanceMessage }, maintained: false },
    { status: 503, json: { message: 'password=private-diagnostic' }, maintained: false },
    { status: 502, html: '<h1>private proxy error</h1>', maintained: false },
    { abort: true, maintained: false },
  ]
  for (const scenario of scenarios) {
    mock.overrides.set('config/create', route => scenario.abort ? route.abort() : route.fulfill({
      status: scenario.status, contentType: scenario.html ? 'text/html' : 'application/json', body: scenario.html || JSON.stringify(scenario.json),
    }))
    const result = await page.evaluate(async url => {
      const { fetchApi } = await import(/* @vite-ignore */ url)
      try { await fetchApi(new URL('api/v1/config/create', location.origin + '/rainbow-bridge/'), { method: 'POST', body: '{}' }); return null }
      catch (error) { const e = error as { message: string; errorType: string }; return { message: e.message, kind: e.errorType } }
    }, new URL('src/lib/api/http.ts', baseURL!).href)
    expect(result?.message).toContain(scenario.maintained ? '维护保护状态' : '服务暂不可用')
    expect(result?.message).not.toContain('private')
  }
  await page.route('https://third-party.invalid/api/v1/config/create', route => route.fulfill({ status: 503, contentType: 'application/json',
    headers: { 'Access-Control-Allow-Origin': '*' }, body: JSON.stringify({ message: maintenanceMessage }) }))
  const external = await page.evaluate(async url => {
    const { fetchApi } = await import(/* @vite-ignore */ url)
    try { await fetchApi('https://third-party.invalid/api/v1/config/create'); return '' } catch (e) { return (e as Error).message }
  }, new URL('src/lib/api/http.ts', baseURL!).href)
  expect(external).not.toContain('维护保护')
  expect(mock.count('config/create')).toBe(scenarios.length)
})

test('配置保存与资源上传遇维护保护时保留页面，不报成功或自动重发', async ({ page }) => {
  const { mock } = await backupFixture(page)
  mock.overrides.set('config/create', protection); mock.overrides.set('asset/upload', protection)
  await page.goto('config' + scopeQuery)
  await page.getByRole('button', { name: '新增配置', exact: true }).click()
  const dialog = page.getByRole('dialog', { name: '新增配置', exact: true })
  await dialog.getByLabel('名称', { exact: false }).fill('维护时保存')
  await dialog.getByLabel('别名', { exact: false }).fill('MAINTENANCE_TEST')
  await dialog.getByLabel('内容', { exact: true }).fill('保留配置输入')
  await dialog.getByRole('button', { name: '保存', exact: true }).click()
  await expect(page.getByText(/服务处于维护保护状态/).first()).toBeVisible()
  await expect(dialog).toBeVisible()
  await expect(dialog.getByLabel('名称', { exact: false })).toHaveValue('维护时保存')
  await expect(dialog.getByLabel('内容', { exact: true })).toHaveValue('保留配置输入')
  expect(mock.count('config/create')).toBe(1)
  await dialog.getByRole('button', { name: '取消', exact: true }).click()
  await page.goto('resources' + scopeQuery)
  await expect(page.getByRole('button', { name: '上传资源', exact: true })).toBeEnabled()
  await page.locator('input[type=file]').setInputFiles({ name: 'maintenance.txt', mimeType: 'text/plain', buffer: Buffer.from('fixture') })
  await expect(page.getByText(/服务处于维护保护状态/).first()).toBeVisible()
  expect(mock.count('asset/upload')).toBe(1)
  await expect(page).toHaveURL(/\/resources/)
})

test('首次能力失败保持未确认，可用键盘刷新为维护模式', async ({ page }) => {
  const { mock } = await backupFixture(page)
  mock.overrides.set('backup/capabilities', route => route.abort())
  await page.goto('backups')
  await expect(page.getByRole('heading', { name: '备份服务暂不可用' })).toBeVisible()
  await expect(page.getByRole('heading', { name: '当前部署未开放网页备份与恢复' })).toHaveCount(0)
  await expect(page.getByRole('button', { name: '创建备份', exact: true })).toHaveCount(0)
  mock.overrides.set('backup/capabilities', route => ok(route, caps('maintenance_cli_only', false)))
  const refresh = page.getByRole('button', { name: '刷新', exact: true })
  await refresh.focus(); await expect(refresh).toBeFocused(); await page.keyboard.press('Enter')
  await expect(page.getByRole('heading', { name: '由部署人员执行备份与恢复' })).toBeVisible()
  expect(mock.count('backup/capabilities')).toBe(2)
  expect(mock.count('backup/list')).toBe(0)
})

test('1280/1440明暗主题的CLI、未开放和网页状态截图', async ({ page }) => {
  const { mock, state } = await backupFixture(page); state.items = [backupItem]
  const dir = join(process.env.DBF_EVIDENCE_DIR!, 'screenshots'); await mkdir(dir, { recursive: true })
  for (const width of [1280, 1440]) for (const theme of ['light', 'dark']) for (const mode of ['maintenance', 'unsupported', 'web']) {
    await page.setViewportSize({ width, height: 1000 })
    mock.overrides.set('backup/capabilities', route => ok(route, caps(mode === 'maintenance' ? 'maintenance_cli_only' : 'business_full', mode === 'web', mode === 'unsupported' ? ['database_driver_not_supported', 'storage_not_local', 'snapshot_storage_not_local', 'redis_enabled'] : [])))
    await page.goto('backups')
    await page.evaluate(theme => { document.documentElement.classList.toggle('dark', theme === 'dark') }, theme)
    await expect(page.getByRole('heading', { name: mode === 'maintenance' ? '由部署人员执行备份与恢复' : mode === 'unsupported' ? '当前部署未开放网页备份与恢复' : '业务备份', exact: true })).toBeVisible()
    expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true)
    await page.screenshot({ path: join(dir, `${mode}-${theme}-${width}.png`), fullPage: true, animations: 'disabled' })
  }
})
