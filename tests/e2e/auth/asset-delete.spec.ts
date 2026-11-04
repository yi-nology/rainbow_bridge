import { test, expect, type Page } from '@playwright/test'
import { mkdir } from 'node:fs/promises'
import { join } from 'node:path'
import { mockApi, ok, fixtureIdentity, CSRF } from './mock'

async function assets(page: Page, frozen = false) {
  const mock = await mockApi(page, true)
  mock.locked = frozen
  let removed = false
  mock.overrides.set('runtime/overview', route => ok(route, { list: ['qa', 'other'].map(key => ({ environment_key: key, environment_name: key, pipelines: [{ pipeline_key: 'web', pipeline_name: '网页渠道' }] })), total: 2 }))
  mock.overrides.set('asset/list', route => {
    const environment = new URL(route.request().url()).searchParams.get('environment_key') || 'qa'
    return ok(route, { list: removed && environment === 'qa' ? [] : [{ environment_key: environment, pipeline_key: 'web', file_id: environment === 'qa' ? 'cover' : 'other-file', file_name: environment === 'qa' ? 'cover.svg' : 'other.svg', content_type: 'image/svg+xml', file_size: 120, url: '/rainbow-bridge/api/v1/asset/file/cover' }], total: removed && environment === 'qa' ? 0 : 1 })
  })
  mock.overrides.set('asset/file/cover', route => route.fulfill({ contentType: 'image/svg+xml', body: '<svg xmlns="http://www.w3.org/2000/svg" width="160" height="80"><rect width="160" height="80" fill="#ff8000"/></svg>' }))
  mock.overrides.set('asset/delete', route => { removed = true; return ok(route, { file_id: 'cover', deleted: true, already_deleted: false }) })
  await page.goto('resources?env=qa&pipeline=web')
  return { mock, remove: () => { removed = true } }
}
async function capture(page: Page, name: string) {
  if (!process.env.RB_QA_VISUAL_DIR) return
  await mkdir(process.env.RB_QA_VISUAL_DIR, { recursive: true })
  for (const width of [1280, 1440]) for (const theme of ['light', 'dark']) {
    await page.setViewportSize({ width, height: 1000 })
    await page.evaluate(dark => document.documentElement.classList.toggle('dark', dark), theme === 'dark')
    expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true)
    await page.screenshot({ path: join(process.env.RB_QA_VISUAL_DIR, `${name}-${theme}-${width}.png`), animations: 'disabled' })
  }
}

test('取消无请求，确认绑定scope且等待中禁重复，成功刷新数量并保留搜索词', async ({ page }) => {
  const { mock } = await assets(page)
  await page.getByRole('textbox', { name: '搜索资源名称' }).fill('cover')
  const remove = page.getByRole('button', { name: '删除 cover.svg', exact: true })
  await remove.click()
  const dialog = page.getByRole('dialog', { name: '删除资源', exact: true })
  await expect(dialog.getByRole('button', { name: '取消', exact: true })).toBeFocused()
  await expect(dialog).toContainText('cover.svg')
  await expect(dialog).toContainText('已发布快照不受影响')
  await capture(page, 'confirm')
  await dialog.getByRole('button', { name: '取消', exact: true }).click()
  expect(mock.count('asset/delete')).toBe(0)
  await remove.click()
  let release!: () => void
  const gate = new Promise<void>(resolve => { release = resolve })
  mock.overrides.set('asset/delete', async route => { await gate; await ok(route, { file_id: 'cover', deleted: true, already_deleted: false }) })
  await dialog.getByRole('button', { name: '确认删除', exact: true }).click()
  await expect(dialog.getByRole('button', { name: '正在删除…', exact: true })).toBeDisabled()
  await expect(dialog.getByRole('button', { name: '取消', exact: true })).toBeDisabled()
  await page.keyboard.press('Escape')
  await expect(dialog).toBeVisible()
  const request = mock.writes('asset/delete')[0]!
  expect(request.postDataJSON()).toEqual({ file_id: 'cover', environment_key: 'qa', pipeline_key: 'web', expected_scope_id: fixtureIdentity('qa', 'web') })
  expect(request.headers()['x-csrf-token']).toBe(CSRF)
  mock.overrides.set('asset/list', route => ok(route, { list: [], total: 0 }))
  release()
  await expect(dialog).toBeHidden()
  await expect(remove).toHaveCount(0)
  await expect(page.getByText('0 份资源', { exact: true })).toBeVisible()
  await expect(page.getByRole('textbox', { name: '搜索资源名称' })).toHaveValue('cover')
  expect(mock.count('asset/delete')).toBe(1)
})

test('引用摘要留在弹窗且错误只显示一次，解除引用后可重试already_deleted成功', async ({ page }) => {
  const { mock, remove } = await assets(page)
  mock.overrides.set('asset/delete', route => route.fulfill({ status: 409, contentType: 'application/json', body: JSON.stringify({ code: 409, error_type: 'ASSET_IN_USE', msg: 'in use', data: {
    reference_count: 21, references: [{ environment_key: 'qa', pipeline_key: 'web', scope_id: fixtureIdentity('qa', 'web'), resource_key: 'config-id', name: '首页封面', alias: 'COVER' }], references_truncated: true,
  } }) }))
  await page.getByRole('button', { name: '删除 cover.svg', exact: true }).click()
  const dialog = page.getByRole('dialog', { name: '删除资源', exact: true })
  await dialog.getByRole('button', { name: '确认删除', exact: true }).click()
  await expect(dialog.getByRole('alert')).toContainText('请先修改或删除引用配置')
  await expect(dialog.getByRole('list', { name: '引用此资源的配置' })).toContainText('首页封面')
  await expect(dialog).toContainText('COVER')
  await expect(dialog).toContainText('qa / web')
  await expect(dialog).toContainText('共 21 条引用，已显示 1 条')
  await expect(page.locator('[data-sonner-toast]')).toHaveCount(0)
  await expect(dialog.getByRole('button', { name: /强制/ })).toHaveCount(0)
  await capture(page, 'in-use')
  mock.overrides.set('asset/delete', route => { remove(); return ok(route, { file_id: 'cover', deleted: true, already_deleted: true }) })
  await dialog.getByRole('button', { name: '确认删除', exact: true }).click()
  await expect(dialog).toBeHidden()
  await expect(page.getByRole('button', { name: '删除 cover.svg', exact: true })).toHaveCount(0)
})

test('冻结禁止删除，已提交请求切换scope后不污染新范围', async ({ page }) => {
  const { mock } = await assets(page, true)
  await expect(page.getByRole('button', { name: '删除 cover.svg', exact: true })).toBeDisabled()
  expect(mock.count('asset/delete')).toBe(0)
  mock.locked = false
  await page.reload()
  await page.getByRole('button', { name: '删除 cover.svg', exact: true }).click()
  let release!: () => void
  const gate = new Promise<void>(resolve => { release = resolve })
  mock.overrides.set('asset/delete', async route => { await gate; await ok(route, { file_id: 'cover', deleted: true, already_deleted: false }) })
  await page.getByRole('button', { name: '确认删除', exact: true }).click()
  await expect(page.getByRole('button', { name: '正在删除…', exact: true })).toBeVisible()
  await page.goto('resources?env=other&pipeline=web')
  release()
  await expect(page.getByRole('button', { name: '删除 other.svg', exact: true })).toBeVisible()
  await expect(page.getByRole('dialog', { name: '删除资源', exact: true })).toHaveCount(0)
  expect(mock.count('asset/delete')).toBe(1)
})
