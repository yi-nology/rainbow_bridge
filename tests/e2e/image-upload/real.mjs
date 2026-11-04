// Basic UI flow against authorized APIs. Only this browser serves local dist;
// no remote static/deployment changes, no stored authentication or traces.
import { chromium, expect } from '@playwright/test'
import { readFile, writeFile, mkdir } from 'node:fs/promises'
import { resolve, join, extname, sep } from 'node:path'
import { createHash, randomUUID } from 'node:crypto'

const root = resolve(import.meta.dirname, '../../..')
const output = join(root, '.local-qa/image-upload-20261104')
await mkdir(output, { recursive: true })
// Reuse the credentials already used by the authorized backend B1/B2 validator.
// Read literal values in memory; never execute the script or print its contents.
const credentialSource = await readFile(join(root, '.local-qa/deploy-v5.1.2/origin-verify.ps1'), 'utf8')
function credential(key) {
  const match = credentialSource.match(new RegExp('\\b' + key + '\\s*=\\s*[\'\"]([^\'\"]+)[\'\"]', 'i'))
  if (!match) throw Error('Authorized QA credential source unavailable')
  return match[1]
}
const png = await readFile(join(root, 'vue/public/icon-light-32x32.png'))
const html = (await readFile(join(root, 'vue/dist/index.html'), 'utf8'))
  .replace("'__BASE_PATH__'", "'/rainbow-bridge'")
  .replaceAll('"__BASE_PATH__/', '"/rainbow-bridge/')
const hash = data => createHash('sha256').update(data).digest('hex')
const browser = await chromium.launch({ headless: true })
const report = { date: '2026-11-04', frontend: 'browser-local production static plus real API HTTP relay; no mocked API responses', entries: [] }
try {
  for (const [entry, origin] of [['direct', 'http://10.60.226.43:31880'], ['proxy', 'http://10.44.56.107:32376']]) {
    const context = await browser.newContext({ viewport: { width: entry === 'direct' ? 1440 : 1280, height: 1000 } })
    const result = { entry, origin, config_images: [], logged_out: false, cleanup: false }
    report.entries.push(result)
    let csrf = '', environmentId = '', loggedIn = false, baseline
    const key = 'qa_ui_image_' + randomUUID().replaceAll('-', '').slice(0, 10)
    const base = origin + '/rainbow-bridge/'
    async function api(path, data) {
      const headers = { Origin: origin, ...(csrf ? { 'X-CSRF-Token': csrf } : {}) }
      const response = data === undefined ? await context.request.get(base + 'api/v1/' + path, { headers }) : await context.request.post(base + 'api/v1/' + path, { headers, data })
      if (response.status() !== 200) throw Error(path.split('?')[0] + ' HTTP ' + response.status())
      const body = await response.json()
      if (![0, 200].includes(body.code)) throw Error(path.split('?')[0] + ' rejected')
      return body.data
    }
    async function snapshot() {
      const overview = await api('runtime/overview')
      const rows = []
      for (const environment of overview.list.filter(item => item.environment_key !== key).sort((a, b) => a.environment_key.localeCompare(b.environment_key))) {
        for (const pipeline of [...(environment.pipelines || [])].sort((a, b) => a.pipeline_key.localeCompare(b.pipeline_key))) {
          const query = new URLSearchParams({ environment_key: environment.environment_key, pipeline_key: pipeline.pipeline_key, scope_id: pipeline.scope_id })
          rows.push({ environment: environment.environment_key, environment_id: environment.environment_id, pipeline: pipeline.pipeline_key, scope_id: pipeline.scope_id,
            configs: ((await api('config/list?' + query)).list || []).sort((a, b) => a.resource_key.localeCompare(b.resource_key)), freeze: await api('freeze/status?' + query), active: await api('release/active?' + query) })
        }
      }
      return hash(JSON.stringify(rows))
    }
    await context.route(origin + '/rainbow-bridge/**', async route => {
      const url = new URL(route.request().url())
      if (url.pathname.includes('/api/')) {
        const response = await route.fetch()
        return route.fulfill({ response })
      }
      if (route.request().isNavigationRequest()) return route.fulfill({ contentType: 'text/html', body: html })
      const relative = url.pathname.slice('/rainbow-bridge/'.length)
      const path = resolve(root, 'vue/dist', relative)
      if (!path.startsWith(resolve(root, 'vue/dist') + sep)) throw Error('Static path out of bounds')
      try {
        const body = await readFile(path)
        return route.fulfill({ body, contentType: ({ '.js': 'text/javascript', '.css': 'text/css', '.svg': 'image/svg+xml', '.png': 'image/png', '.webp': 'image/webp' })[extname(path)] || 'application/octet-stream' })
      } catch { return route.continue() }
    })
    try {
      const page = await context.newPage()
      result.request_paths = []
      page.on('request', request => { if (request.url().includes('/api/')) result.request_paths.push(new URL(request.url()).pathname) })
      page.on('requestfailed', request => { result.request_failure = { path: new URL(request.url()).pathname, error: request.failure()?.errorText } })
      page.on('pageerror', error => { result.page_error = error.message.slice(0, 160) })
      page.on('console', message => { if (message.type() === 'error' && !result.console_error) result.console_error = message.text().slice(0, 300) })
      await page.goto(base + 'login')
      await page.getByLabel('账号', { exact: true }).fill(credential('username'))
      await page.getByLabel('密码', { exact: true }).fill(credential('password'))
      const loginResponse = page.waitForResponse(response => new URL(response.url()).pathname.endsWith('/api/v1/auth/login'), { timeout: 10000 })
      await page.getByRole('button', { name: '登录', exact: true }).click()
      result.login_http = (await loginResponse).status()
      if (result.login_http !== 200) throw Error('Login HTTP ' + result.login_http)
      loggedIn = true
      csrf = (await api('auth/me')).csrf_token
      await page.goto(base + 'config')
      await expect(page.getByRole('heading', { name: '配置管理', exact: true })).toBeVisible()
      const capabilities = await api('maintenance/capabilities')
      if (capabilities.maintenance.active || !capabilities.maintenance.business_available) throw Error('Business not idle; no fixture created')
      baseline = await snapshot()
      await api('environment/create', { environment: { environment_key: key, environment_name: '图片上传临时验证', description: 'qa-ui-image-20261104', is_active: true } })
      const overview = await api('runtime/overview')
      environmentId = overview.list.find(item => item.environment_key === key)?.environment_id
      if (!environmentId) throw Error('Fixture environment identity missing')
      result.environment_key = key
      await page.goto(base + 'config?' + new URLSearchParams({ env: key, pipeline: 'default' }))
      await page.getByRole('button', { name: '新增配置', exact: true }).click()
      let dialog = page.getByRole('dialog', { name: '新增配置', exact: true })
      await dialog.locator('#name').fill('PNG与JPEG图片')
      await dialog.locator('#alias').fill('qa_image')
      await dialog.getByRole('combobox', { name: '配置类型' }).click()
      await page.getByRole('option').filter({ hasText: '图片' }).click()
      const jpeg = Buffer.from(await page.evaluate(() => {
        const canvas = document.createElement('canvas'); canvas.width = 480; canvas.height = 160
        const paint = canvas.getContext('2d'); paint.fillStyle = '#fff2df'; paint.fillRect(0, 0, 480, 160)
        paint.fillStyle = '#9e4300'; paint.font = '24px sans-serif'; paint.fillText('Rainbow Bridge · Image QA', 48, 88)
        return canvas.toDataURL('image/jpeg').split(',')[1]
      }), 'base64')
      for (const [format, bytes] of [['png', png], ['jpeg', jpeg]]) {
        await expect(dialog.getByRole('button', { name: /^(选择图片|重新选择图片)$/ })).toBeEnabled()
        const uploadedResponse = page.waitForResponse(response => new URL(response.url()).pathname.endsWith('/api/v1/asset/upload'))
        if (format === 'png') {
          const chooser = page.waitForEvent('filechooser')
          await dialog.getByRole('button', { name: '选择图片', exact: true }).click()
          await (await chooser).setFiles({ name: 'qa.png', mimeType: 'image/png', buffer: bytes })
        } else {
          const data = await page.evaluateHandle(items => { const transfer = new DataTransfer(); transfer.items.add(new File([new Uint8Array(items)], 'qa.jpg', { type: 'image/jpeg' })); return transfer }, [...bytes])
          await dialog.locator('.spectrum-image-upload').dispatchEvent('drop', { dataTransfer: data })
          await data.dispose()
        }
        const uploaded = await uploadedResponse
        if (uploaded.status() !== 200) throw Error('UI upload HTTP ' + uploaded.status())
        const uploadedId = (await uploaded.json()).data.asset.file_id
        const image = dialog.getByAltText('配置图片预览')
        await expect(image).toBeVisible()
        await expect(image).toHaveAttribute('src', new RegExp('/api/v1/asset/file/' + uploadedId + '(?:/|$)'))
        await expect.poll(() => image.evaluate(element => element.naturalWidth)).toBeGreaterThan(0)
        const url = new URL(await image.getAttribute('src'), origin).href
        if (!url.startsWith(base + 'api/v1/asset/file/')) throw Error('Image resolved outside current origin/BasePath')
        const response = await context.request.get(url), body = await response.body()
        const mime = response.headers()['content-type'] || ''
        if (response.status() !== 200 || !mime.startsWith('image/') || hash(body) !== hash(bytes)) throw Error('Image status/MIME/bytes mismatch')
        result.config_images.push({ format, image_url: url, http: response.status(), content_type: mime, bytes_match: true, interaction: format === 'png' ? 'file chooser via Playwright (not native OS validation)' : 'single-file drag/drop' })
        await dialog.getByRole('button', { name: '保存', exact: true }).click()
        await expect(dialog).toBeHidden()
        await page.reload()
        await page.getByRole('button', { name: '编辑配置', exact: true }).click()
        dialog = page.getByRole('dialog', { name: '编辑配置', exact: true })
        await expect.poll(() => dialog.getByAltText('配置图片预览').evaluate(element => element.naturalWidth)).toBeGreaterThan(0)
        const reopenedURL = await dialog.getByAltText('配置图片预览').getAttribute('src')
        if (!new URL(reopenedURL, origin).href.startsWith(base + 'api/v1/asset/file/')) throw Error('Reopened image outside current origin/BasePath')
        const reopened = await context.request.get(new URL(reopenedURL, origin).href)
        if (reopened.status() !== 200 || hash(await reopened.body()) !== hash(bytes)) throw Error('Saved image bytes mismatch')
        const query = new URLSearchParams({ environment_key: key, pipeline_key: 'default' })
        const stored = (await api('config/list?' + query)).list.find(item => item.alias === 'qa_image')
        if (!stored || /^(blob:|data:|https?:)/.test(stored.content)) throw Error('Saved image did not retain a portable service reference/path')
        result.config_images[result.config_images.length - 1].reopened_url = new URL(reopenedURL, origin).href
        result.config_images[result.config_images.length - 1].saved_read_content = stored.content
      }
      await page.evaluate(dark => document.documentElement.classList.toggle('dark', dark), entry === 'proxy')
      await page.screenshot({ path: join(output, `real-${entry}-saved-reopened.png`), animations: 'disabled' })
      result.saved_reloaded_reopened = true
    } catch (error) {
      // Never include Playwright input call logs, response bodies or credentials.
      result.failure = error instanceof Error ? error.message.split('\n')[0].replace(/fill\(.*/, 'credential input failed') : 'Basic flow failed'
      throw Error(entry + ': basic UI flow failed; inspect safe report')
    } finally {
      if (!loggedIn) {
        const response = await context.request.get(base + 'api/v1/auth/me')
        if (response.status() === 200) { csrf = (await response.json()).data.csrf_token; loggedIn = true }
      }
      if (environmentId) {
        result.cleanup = (await api('environment/delete', { environment_key: key, expected_environment_id: environmentId })).deleted === true
        result.environment_absent = !(await api('runtime/overview')).list.some(item => item.environment_key === key)
      }
      if (loggedIn && baseline) result.original_scope_data_unchanged = (await snapshot()) === baseline
      if (loggedIn) { await api('auth/logout', {}); result.logged_out = true }
      await context.close()
      await writeFile(join(output, 'real-results.json'), JSON.stringify(report, null, 2))
    }
  }
} finally { await browser.close() }
console.log(JSON.stringify({ entries: report.entries.map(({ entry, saved_reloaded_reopened, cleanup, logged_out, original_scope_data_unchanged }) => ({ entry, saved_reloaded_reopened, cleanup, logged_out, original_scope_data_unchanged })) }))
