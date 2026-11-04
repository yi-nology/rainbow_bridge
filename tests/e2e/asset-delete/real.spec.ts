import { test, expect } from '@playwright/test'
import { readFile, writeFile } from 'node:fs/promises'
import { join } from 'node:path'
import { createHash } from 'node:crypto'
import { uiLogin, management, apiUrl, checked } from '../auth/real-helper'

test('真实页面阻止引用资源删除，解除引用后删除、重复及旧草稿保护', async ({ page }) => {
  test.setTimeout(60000)
  const evidence = process.env.RB_ASSET_DELETE_EVIDENCE!
  const key = 'qa_asset_delete_' + Date.now()
  const report: Record<string, unknown> = { fixture: key, frontend: 'local production dist with real isolated SQLite backend', cleanup: false, logged_out: false }
  let environmentId = ''
  await uiLogin(page)
  const api = await management(page)
  async function baseline() {
    const overview = await api.get('runtime/overview')
    const rows = []
    for (const environment of overview.list || []) for (const pipeline of environment.pipelines || []) {
      if (environment.environment_key === key) continue
      const query = new URLSearchParams({ environment_key: environment.environment_key, pipeline_key: pipeline.pipeline_key, scope_id: pipeline.scope_id })
      rows.push({ environment_id: environment.environment_id, scope_id: pipeline.scope_id, configs: await api.get('config/list?' + query), freeze: await api.get('freeze/status?' + query), active: await api.get('release/active?' + query) })
    }
    return createHash('sha256').update(JSON.stringify(rows)).digest('hex')
  }
  const before = await baseline()
  try {
    await api.post('environment/create', { environment: { environment_key: key, environment_name: '资源删除临时验证', description: 'qa-asset-delete', is_active: true } })
    const environment = (await api.get('runtime/overview')).list.find((item: { environment_key: string }) => item.environment_key === key)
    environmentId = environment.environment_id
    const scopeId = environment.pipelines[0].scope_id
    const scope = { environment_key: key, pipeline_key: 'default', expected_scope_id: scopeId }
    await page.goto('resources?' + new URLSearchParams({ env: key, pipeline: 'default' }))
    const upload = page.waitForResponse(response => new URL(response.url()).pathname.endsWith('/asset/upload'))
    const chooser = page.waitForEvent('filechooser')
    await page.getByRole('button', { name: '上传资源', exact: true }).click()
    await (await chooser).setFiles({ name: 'delete-qa.png', mimeType: 'image/png', buffer: await readFile(join(process.cwd(), '../../vue/public/icon-light-32x32.png')) })
    const uploaded = await checked(await upload, 'asset/upload')
    const fileId = uploaded.asset.file_id
    report.file_id = fileId
    const payload = { file_id: fileId, ...scope }
    const config = (await api.post('config/create', { config: { ...scope, scope_id: scopeId, alias: 'qa_image', name: '删除引用核对', type: 'image', content: 'asset://' + fileId }, expected_scope_id: scopeId })).config
    const remove = page.getByRole('button', { name: '删除 delete-qa.png', exact: true })
    await remove.click()
    const dialog = page.getByRole('dialog', { name: '删除资源', exact: true })
    const rejected = page.waitForResponse(response => response.url().endsWith('/asset/delete'))
    await dialog.getByRole('button', { name: '确认删除', exact: true }).click()
    expect((await rejected).status()).toBe(409)
    await expect(dialog.getByRole('alert')).toContainText('删除引用核对')
    await expect(dialog.getByRole('alert')).toContainText('qa_image')
    await page.screenshot({ path: join(evidence, 'real-in-use.png'), animations: 'disabled' })
    report.in_use_blocked = true
    await api.post('config/delete', { ...scope, resource_key: config.resource_key })
    const deleted = page.waitForResponse(response => response.url().endsWith('/asset/delete'))
    await dialog.getByRole('button', { name: '确认删除', exact: true }).click()
    report.deleted = await checked(await deleted, 'asset/delete')
    await expect(dialog).toBeHidden()
    await expect(remove).toHaveCount(0)
    await page.reload()
    await expect(page.getByText('0 份资源', { exact: true })).toBeVisible()
    report.already_deleted = (await api.post('asset/delete', payload)).already_deleted
    expect(report.already_deleted).toBe(true)
    const file = await page.request.get(apiUrl(page, 'asset/file/' + fileId))
    expect(file.status()).toBe(410)
    expect((await file.json()).error_type).toBe('ASSET_DELETED')
    report.file_http = file.status()
    const me = await api.get('auth/me')
    const stale = await page.request.post(apiUrl(page, 'config/create'), { headers: { Origin: new URL(page.url()).origin, 'X-CSRF-Token': me.csrf_token }, data: { config: { ...scope, scope_id: scopeId, alias: 'stale', name: '旧草稿', type: 'image', content: 'asset://' + fileId }, expected_scope_id: scopeId } })
    expect(stale.status()).toBe(410)
    expect((await stale.json()).error_type).toBe('ASSET_DELETED')
    report.stale_draft_rejected = true
  } finally {
    if (environmentId) report.cleanup = (await api.post('environment/delete', { environment_key: key, expected_environment_id: environmentId })).deleted === true
    report.original_scope_data_unchanged = await baseline() === before
    await api.post('auth/logout', {})
    report.logged_out = true
    await writeFile(join(evidence, 'real-result.json'), JSON.stringify(report, null, 2))
  }
})
