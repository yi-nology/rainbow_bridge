import { test, expect, type Page } from '@playwright/test'
import { mkdir } from 'node:fs/promises'
import { join } from 'node:path'
import { mockApi, ok, fail, identity, scopeQuery } from './mock'
import { maintenanceFixture, taskId } from '../distributed-backup-frontend/web-fixture'

const openIdentity = { auth_enabled: false, user: { id: '0', username: 'anonymous-admin', role: 'admin' }, session: null, csrf_token: '', access_scope: 'admin', active_operation_id: null }
async function openMode(page: Page) {
  const mock = await mockApi(page, true)
  mock.overrides.set('auth/me', route => ok(route, openIdentity))
  mock.overrides.set('backup/capabilities', route => ok(route, { supported: false, reasons: [] }))
  return mock
}

test('明确false可刷新各工作页和login深链，旧Cookie不进入业务请求，账号仅显示免鉴权', async ({ page, context }) => {
  const mock = await openMode(page)
  await context.addCookies([{ name: 'old-session', value: 'expired-fixture', url: 'http://127.0.0.1:3002' }])
  for (const [path, heading] of [['config', '配置管理'], ['resources', '资源管理'], ['releases', '版本发布'], ['backups', '备份与恢复']]) {
    await page.goto(path + scopeQuery)
    await expect(page.getByRole('heading', { name: heading, exact: true })).toBeVisible()
    await expect(page.getByText('免鉴权模式', { exact: true })).toBeVisible()
    await expect(page.getByRole('button', { name: '退出', exact: true })).toHaveCount(0)
    await expect(page.getByRole('link', { name: '登录', exact: true })).toHaveCount(0)
    await page.reload()
    await expect(page.getByRole('heading', { name: heading, exact: true })).toBeVisible()
  }
  await page.goto('login?redirect=' + encodeURIComponent('/resources' + scopeQuery))
  await expect(page.getByRole('heading', { name: '资源管理', exact: true })).toBeVisible()
  expect(mock.count('auth/login')).toBe(0)
  expect(mock.requests.filter(request => !request.url().includes('/auth/me')).every(request => !request.headers().cookie && !request.headers().authorization && !request.headers()['x-csrf-token'])).toBe(true)
})

test('false页面写入不带凭据且仍受冻结约束，错误保留草稿', async ({ page }) => {
  const mock = await openMode(page)
  mock.overrides.set('config/create', route => fail(route, 409, 'SCOPE_FROZEN'))
  await page.goto('config' + scopeQuery)
  await expect(page.getByText('免鉴权模式', { exact: true })).toBeVisible()
  await page.getByRole('button', { name: '新增配置', exact: true }).click()
  const dialog = page.getByRole('dialog', { name: '新增配置', exact: true })
  await dialog.locator('#name').fill('冻结保护草稿')
  await dialog.locator('#alias').fill('frozen_draft')
  await dialog.locator('#content').fill('保留输入')
  await dialog.getByRole('button', { name: '保存', exact: true }).click()
  await expect(dialog.getByRole('alert')).toContainText('冻结')
  await expect(dialog.locator('#content')).toHaveValue('保留输入')
  const write = mock.writes('config/create')[0]!
  expect(write.headers().authorization).toBeUndefined()
  expect(write.headers()['x-csrf-token']).toBeUndefined()
  expect(write.headers().cookie).toBeUndefined()
  await expect(page.getByText('免鉴权模式', { exact: true })).toBeVisible()
})

test('缺省或true仍需会话；非法响应不能开免鉴权，控制503不伪装成功', async ({ page }) => {
  const mock = await openMode(page)
  for (const data of [{ ...identity, auth_enabled: true, session: null }, { ...openIdentity, auth_enabled: 'false' }, { ...openIdentity, auth_enabled: undefined }]) {
    mock.overrides.set('auth/me', route => ok(route, data))
    await page.goto('resources' + scopeQuery)
    await expect(page.getByRole('button', { name: '重新确认登录状态', exact: true })).toBeVisible()
    await expect(page.getByText('免鉴权模式', { exact: true })).toHaveCount(0)
  }
  mock.overrides.set('auth/me', route => fail(route, 503, 'CONTROL_UNAVAILABLE'))
  await page.reload()
  await expect(page.getByRole('alert')).toContainText('控制服务暂不可用')
  mock.overrides.set('auth/me', route => fail(route, 401, 'AUTH_REQUIRED'))
  await page.reload()
  await expect(page.getByRole('heading', { name: '登录工作台', exact: true })).toBeVisible()
})

test('免鉴权维护态仍只分流备份任务，完成结果不要求虚构重登', async ({ page }) => {
  const { mock, state } = await maintenanceFixture(page)
  mock.overrides.set('auth/me', route => ok(route, { ...openIdentity, access_scope: 'maintenance', active_operation_id: state.operation.operation_id }))
  await page.goto('config' + scopeQuery)
  await expect(page.getByRole('heading', { name: '备份与恢复', exact: true })).toBeVisible()
  await page.goto('login?redirect=/resources')
  await expect(page.getByRole('heading', { name: '备份与恢复', exact: true })).toBeVisible()
  state.task = { ...state.task, kind: 'restore', state: 'succeeded', phase: 'completed', result: { business_available: true, reauth_required: true } }
  state.operation = { ...state.operation, kind: 'restore', state: 'succeeded', business_available: true }
  await page.goto('backups/tasks/' + taskId)
  await expect(page.getByRole('status').filter({ hasText: '恢复完成，业务已恢复' })).toBeVisible()
  await expect(page.getByRole('link', { name: '重新登录', exact: true })).toHaveCount(0)
  expect(mock.count('auth/login')).toBe(0)
})

test('免鉴权账号标识沿用光谱桌面明暗主题', async ({ page }) => {
  await openMode(page)
  await page.goto('resources' + scopeQuery)
  await expect(page.getByText('免鉴权模式', { exact: true })).toBeVisible()
  if (!process.env.RB_QA_VISUAL_DIR) return
  await mkdir(process.env.RB_QA_VISUAL_DIR, { recursive: true })
  for (const width of [1280, 1440]) for (const theme of ['light', 'dark']) {
    await page.setViewportSize({ width, height: 900 })
    await page.evaluate(dark => document.documentElement.classList.toggle('dark', dark), theme === 'dark')
    expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true)
    await page.screenshot({ path: join(process.env.RB_QA_VISUAL_DIR, `auth-disabled-${theme}-${width}.png`), animations: 'disabled' })
  }
})
