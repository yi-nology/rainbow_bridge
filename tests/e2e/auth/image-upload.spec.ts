import { test, expect, type Page, type Locator } from '@playwright/test'
import { mkdir } from 'node:fs/promises'
import { join } from 'node:path'
import { mockApi, ok, fail, config } from './mock'

const png = Buffer.from('iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAwMCAO+jRZkAAAAASUVORK5CYII=', 'base64')
async function openImage(page: Page) {
  const mock = await mockApi(page, true)
  let uploaded = 0, saved = ''
  mock.overrides.set('asset/upload', route => ok(route, { asset: { file_id: 'image-' + ++uploaded, file_name: 'cover.png', content_type: 'image/png', file_size: png.length, url: '/api/v1/asset/file/image-' + uploaded }, reference: 'asset://image-' + uploaded }))
  for (const id of ['image-1', 'image-2']) mock.overrides.set('asset/file/' + id, route => route.fulfill({ contentType: 'image/png', body: png }))
  mock.overrides.set('config/create', route => { saved = route.request().postDataJSON().config.content; return ok(route, {}) })
  mock.overrides.set('config/list', route => ok(route, { list: [{ ...config, type: 'image', content: saved || 'asset://image-1' }], total: 1 }))
  mock.overrides.set('config/detail', route => ok(route, { config: { ...config, type: 'image', content: saved || 'asset://image-1' } }))
  await page.goto('config?env=qa&pipeline=web')
  await page.getByRole('button', { name: '新增配置', exact: true }).click()
  const dialog = page.getByRole('dialog', { name: '新增配置', exact: true })
  await dialog.locator('#name').fill('图片测试')
  await dialog.locator('#alias').fill('image_test')
  await dialog.getByRole('combobox', { name: '配置类型' }).click()
  await page.getByRole('option').filter({ hasText: '图片' }).click()
  return { mock, dialog, saved: () => saved }
}
async function selectImage(page: Page, dialog: Locator) {
  const chooser = page.waitForEvent('filechooser')
  await dialog.getByRole('button', { name: /^(选择图片|重新选择图片)$/ }).click()
  await (await chooser).setFiles({ name: 'cover.png', mimeType: 'image/png', buffer: png })
}
async function transfer(page: Page, files: { name: string; type: string; bytes?: number[] }[]) {
  return page.evaluateHandle(items => {
    const data = new DataTransfer()
    for (const item of items) data.items.add(new File([new Uint8Array(item.bytes || [1, 2, 3])], item.name, { type: item.type }))
    return data
  }, files)
}
async function screenshot(page: Page, name: string) {
  if (!process.env.RB_QA_VISUAL_DIR) return
  await mkdir(process.env.RB_QA_VISUAL_DIR, { recursive: true })
  for (const width of [1280, 1440]) for (const theme of ['light', 'dark']) {
    await page.setViewportSize({ width, height: 1000 })
    await page.evaluate(dark => document.documentElement.classList.toggle('dark', dark), theme === 'dark')
    expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true)
    await page.screenshot({ path: join(process.env.RB_QA_VISUAL_DIR, `${name}-${theme}-${width}.png`), animations: 'disabled' })
  }
}

test('资源解析与API根一致，空BasePath、旧前缀及外链不重复拼接', async ({ page }) => {
  test.skip(process.env.IMAGE_TEST_PRODUCTION === '1', 'production artifact exercised through rendered image requests')
  await mockApi(page, true)
  await page.goto('config?env=qa&pipeline=web')
  const result = await page.evaluate(async () => {
    const { resolveAssetUrl } = await import('/rainbow-bridge/src/lib/asset-url.ts')
    const { apiURL } = await import('/rainbow-bridge/src/lib/api/url.ts')
    const actual = [resolveAssetUrl('asset://example'), resolveAssetUrl('/api/v1/asset/file/example'), resolveAssetUrl('/rainbow-bridge/api/v1/asset/file/example')].map(value => new URL(value, location.origin).href)
    const expected = apiURL('/api/v1/asset/file/example').href
    const external = resolveAssetUrl('https://cdn.example.org/cover.png')
    const released = new URL(resolveAssetUrl('/rainbow-bridge/api/v1/release/asset/snapshot/file'), location.origin).href
    window.__BASE_PATH__ = ''
    const root = resolveAssetUrl('asset://example'), rootExpected = apiURL('/api/v1/asset/file/example').href
    delete window.__BASE_PATH__
    return { actual, expected, external, released, releaseExpected: apiURL('/api/v1/release/asset/snapshot/file').href, root, rootExpected }
  })
  expect(result.actual).toEqual([result.expected, result.expected, result.expected])
  expect(result.root).toBe(result.rootExpected)
  expect(result.released).toBe(result.releaseExpected)
  expect(result.external).toBe('https://cdn.example.org/cover.png')
})

test('点击选择、同文件重选与保存刷新后的图片都使用服务资源预览', async ({ page }) => {
  const { mock, dialog, saved } = await openImage(page)
  const accept = await dialog.getByLabel('选择配置图片').getAttribute('accept')
  for (const extension of ['.png', '.jpg', '.jpeg', '.heic', '.tiff']) expect(accept).toContain(extension)
  await selectImage(page, dialog)
  await expect(dialog.getByAltText('配置图片预览')).toHaveJSProperty('naturalWidth', 1)
  await expect(dialog.getByAltText('配置图片预览')).toHaveAttribute('src', /\/rainbow-bridge\/api\/v1\/asset\/file\/image-1$/)
  await selectImage(page, dialog)
  await expect(dialog.getByAltText('配置图片预览')).toHaveAttribute('src', /image-2$/)
  expect(mock.count('asset/upload')).toBe(2)
  await dialog.getByRole('button', { name: '保存', exact: true }).click()
  await expect(dialog).toBeHidden()
  expect(saved()).toBe('asset://image-2')
  await page.reload()
  await expect(page.locator('img[src$="/api/v1/asset/file/image-2"]').first()).toHaveJSProperty('naturalWidth', 1)
  await page.getByRole('button', { name: '编辑配置', exact: true }).click()
  await expect(page.getByRole('dialog', { name: '编辑配置', exact: true }).getByAltText('配置图片预览')).toHaveJSProperty('naturalWidth', 1)
  await expect(page.getByRole('dialog', { name: '编辑配置', exact: true }).getByRole('button', { name: '重新选择图片' })).toBeEnabled()
  expect(mock.requests.some(request => request.url().endsWith('/rainbow-bridge/api/v1/asset/file/image-2'))).toBe(true)
})

test('拖入单图与空MIME扩展名，拒绝多文件和非图片，上传失败保留原图草稿', async ({ page }) => {
  const { mock, dialog } = await openImage(page)
  const zone = dialog.locator('.spectrum-image-upload')
  const data = await transfer(page, [{ name: '麒麟.PNG', type: '', bytes: [...png] }])
  await zone.dispatchEvent('dragover', { dataTransfer: data })
  await screenshot(page, 'dragging')
  await zone.dispatchEvent('drop', { dataTransfer: data })
  await expect(dialog.getByAltText('配置图片预览')).toHaveJSProperty('naturalWidth', 1)
  await screenshot(page, 'uploaded')
  for (const files of [[{ name: 'a.png', type: 'image/png' }, { name: 'b.png', type: 'image/png' }], [{ name: 'x.txt', type: 'text/plain' }]]) {
    const invalid = await transfer(page, files)
    await zone.dispatchEvent('drop', { dataTransfer: invalid })
    await expect(dialog.getByRole('alert')).toBeVisible()
    expect(mock.count('asset/upload')).toBe(1)
  }
  mock.overrides.set('asset/upload', route => fail(route, 503, 'UPLOAD_FAILED'))
  await zone.dispatchEvent('drop', { dataTransfer: data })
  await expect(dialog.getByRole('alert')).toBeVisible()
  await expect(dialog.locator('#name')).toHaveValue('图片测试')
  await expect(dialog.getByAltText('配置图片预览')).toHaveAttribute('src', /image-1$/)
  mock.overrides.set('asset/file/image-1', route => fail(route, 404, 'ASSET_NOT_FOUND'))
  // Reload image through the actual preview boundary without uploading again.
  await dialog.getByAltText('配置图片预览').evaluate(image => image.dispatchEvent(new Event('error')))
  await expect(dialog.getByText(/图片暂无法预览/)).toBeVisible()
  await screenshot(page, 'preview-failed')
  await dialog.getByRole('button', { name: '重试预览' }).click()
  await expect(dialog.getByText(/图片暂无法预览/)).toBeVisible()
  expect(mock.count('asset/upload')).toBe(2)
})

test('上传中禁止重复拖入和保存，离开作用域后旧上传不回填新草稿', async ({ page }) => {
  const { mock, dialog } = await openImage(page)
  let release!: () => void
  const gate = new Promise<void>(resolve => { release = resolve })
  mock.overrides.set('asset/upload', async route => { await gate; await ok(route, { asset: { file_id: 'late-image', url: '/api/v1/asset/file/late-image' } }) })
  const data = await transfer(page, [{ name: 'a.png', type: 'image/png', bytes: [...png] }])
  await dialog.locator('.spectrum-image-upload').dispatchEvent('drop', { dataTransfer: data })
  await expect(dialog.getByText('上传中…', { exact: true })).toBeVisible()
  await dialog.locator('.spectrum-image-upload').dispatchEvent('drop', { dataTransfer: data })
  await expect(dialog.getByRole('button', { name: '保存', exact: true })).toBeDisabled()
  expect(mock.count('asset/upload')).toBe(1)
  await page.goto('config?env=qa&pipeline=other')
  release()
  await page.getByRole('button', { name: '新增配置', exact: true }).click()
  await expect(page.getByRole('dialog').locator('#name')).toHaveValue('')
  expect(mock.count('config/create')).toBe(0)
})

test('冻结范围不开放图片新增和上传', async ({ page }) => {
  const mock = await mockApi(page, true)
  mock.locked = true
  await page.goto('config?env=qa&pipeline=web')
  await expect(page.getByRole('button', { name: '新增配置', exact: true })).toBeDisabled()
  expect(mock.count('asset/upload')).toBe(0)
})
