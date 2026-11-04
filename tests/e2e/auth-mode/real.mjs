import { chromium, expect } from '@playwright/test'
import { writeFile } from 'node:fs/promises'
import { join } from 'node:path'

const base = process.env.RAINBOW_AUTH_UI_URL
const disabled = process.env.RB_QA_AUTH_DISABLED === 'true'
const evidence = process.env.RB_AUTH_MODE_EVIDENCE
if (base !== 'http://127.0.0.1:18108/rainbow-bridge/' || !evidence) throw Error('Owned local auth-mode fixture required')
const browser = await chromium.launch({ headless: true })
const context = await browser.newContext({ viewport: { width: 1440, height: 1000 } })
const report = { mode: disabled ? 'explicit-false' : 'default-enabled', production_frontend: true, cleanup: false, business_mutations: 0 }
const key = 'qa_auth_mode_' + Date.now()
let environmentId = '', csrf = '', loggedIn = false
async function api(path, body) {
  const headers = { Origin: new URL(base).origin, ...(csrf ? { 'X-CSRF-Token': csrf } : {}) }
  const response = body === undefined ? await context.request.get(base + 'api/v1/' + path, { headers }) : await context.request.post(base + 'api/v1/' + path, { headers, data: body })
  if (response.status() !== 200) throw Error(path.split('?')[0] + ': HTTP ' + response.status())
  return (await response.json()).data
}
try {
  const anonymous = await context.request.get(base + 'api/v1/environment/list')
  report.anonymous_read_http = anonymous.status()
  if (disabled) {
    if (anonymous.status() !== 200) throw Error('Explicit false unexpectedly requires authentication')
  } else if (anonymous.status() !== 401) throw Error('Default mode unexpectedly permits anonymous management')
  const page = await context.newPage()
  await page.goto(base + 'config')
  if (!disabled) {
    await expect(page.getByRole('heading', { name: '登录工作台', exact: true })).toBeVisible()
    await page.getByLabel('账号', { exact: true }).fill(process.env.RB_QA_ADMIN_USERNAME)
    await page.getByLabel('密码', { exact: true }).fill(process.env.RB_QA_ADMIN_PASSWORD)
    await page.getByRole('button', { name: '登录', exact: true }).click()
    await expect(page.getByRole('heading', { name: '配置管理', exact: true })).toBeVisible()
    loggedIn = true
  } else await expect(page.getByText('免鉴权模式', { exact: true })).toBeVisible()
  const me = await api('auth/me')
  csrf = me.csrf_token
  report.identity_valid = disabled ? me.auth_enabled === false && me.user.id === '0' && me.session === null && csrf === '' : me.auth_enabled !== false && !!csrf && !!me.session
  if (!report.identity_valid) throw Error('Unexpected identity contract')
  await api('environment/create', { environment: { environment_key: key, environment_name: '鉴权模式临时验证', is_active: true } })
  const row = (await api('runtime/overview')).list.find(item => item.environment_key === key)
  environmentId = row.environment_id
  const scopeId = row.pipelines[0].scope_id
  const query = new URLSearchParams({ env: key, pipeline: 'default' })
  const writeHeaders = []
  page.on('request', request => {
    if (request.method() === 'POST' && request.url().includes('/api/v1/config/')) {
      writeHeaders.push(request.allHeaders().then(headers => ({ cookie: !!headers.cookie, csrf: !!headers['x-csrf-token'], authorization: !!headers.authorization })))
    }
  })
  await page.goto(base + 'config?' + query)
  await page.getByRole('button', { name: '新增配置', exact: true }).click()
  let dialog = page.getByRole('dialog', { name: '新增配置', exact: true })
  await dialog.locator('#name').fill('模式测试')
  await dialog.locator('#alias').fill('auth_mode_qa')
  await dialog.locator('#content').fill('temporary fixture')
  await dialog.getByRole('button', { name: '保存', exact: true }).click()
  await expect(dialog).toBeHidden()
  report.business_mutations++
  await page.getByRole('button', { name: '编辑配置', exact: true }).click()
  dialog = page.getByRole('dialog', { name: '编辑配置', exact: true })
  await expect(dialog.locator('#content')).toBeEnabled()
  await dialog.locator('#content').fill('updated fixture')
  await dialog.getByRole('button', { name: '保存', exact: true }).click()
  await expect(dialog).toBeHidden()
  report.business_mutations++
  await page.getByRole('button', { name: '删除 模式测试', exact: true }).click()
  await page.getByRole('dialog', { name: '删除配置', exact: true }).getByRole('button', { name: '确认删除', exact: true }).click()
  await expect(page.getByRole('dialog', { name: '删除配置', exact: true })).toBeHidden()
  report.business_mutations++
  const confirmedHeaders = await Promise.all(writeHeaders)
  report.write_headers = confirmedHeaders
  if (confirmedHeaders.length !== 3 || confirmedHeaders.some(item => item.authorization || (disabled ? item.cookie || item.csrf : !item.cookie || !item.csrf))) throw Error('UI credential policy mismatch')
  for (const [path, heading] of [['config', '配置管理'], ['resources', '资源管理'], ['releases', '版本发布'], ['backups', '备份与恢复']]) {
    report.checking_page = path
    await page.goto(base + path + '?' + query)
    await expect(page.getByRole('heading', { name: heading, exact: true })).toBeVisible()
    await page.reload()
    await expect(page.getByRole('heading', { name: heading, exact: true })).toBeVisible()
  }
  if (disabled) {
    await page.goto(base + 'login?redirect=' + encodeURIComponent('/resources?' + query))
    await expect(page.getByRole('heading', { name: '资源管理', exact: true })).toBeVisible()
    await expect(page.getByRole('button', { name: '退出', exact: true })).toHaveCount(0)
    await page.screenshot({ path: join(evidence, 'real-no-auth.png'), animations: 'disabled' })
  }
  const configs = await api('config/list?' + new URLSearchParams({ environment_key: key, pipeline_key: 'default', scope_id: scopeId }))
  if ((configs.list || []).length) throw Error('Temporary config deletion did not persist')
  report.basic_pages_refreshed = true
  delete report.checking_page
} catch (error) {
  // Do not retain Playwright call logs from credential input.
  report.failure = error instanceof Error ? error.message.split('\n')[0] : 'Basic fixture failed'
  process.exitCode = 1
} finally {
  try {
    if (environmentId) report.cleanup = (await api('environment/delete', { environment_key: key, expected_environment_id: environmentId })).deleted === true
    if (loggedIn) { await api('auth/logout', {}); report.logged_out = true }
  } finally {
    await context.close(); await browser.close()
    await writeFile(join(evidence, disabled ? 'real-disabled.json' : 'real-default.json'), JSON.stringify(report, null, 2))
  }
}
console.log(JSON.stringify({ mode: report.mode, passed: !report.failure, cleanup: report.cleanup }))
