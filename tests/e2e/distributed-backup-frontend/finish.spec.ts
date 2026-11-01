import { test, expect } from '@playwright/test'
import { mkdir } from 'node:fs/promises'
import { join } from 'node:path'
import { maintenanceFixture, taskFixture, operationFixture, taskId, taskURL } from './web-fixture'
import { fail, scopeQuery } from '../auth/mock'
import { ok } from '../auth/backup-fixture'

test('维护503请求层与多个数据层只显示一条浮层，普通失败继续可见且登录保留', async ({ page }) => {
  const { mock } = await maintenanceFixture(page)
  for (const path of ['runtime/overview','environment/list','asset/list']) mock.overrides.set(path, route => fail(route,503,'MAINTENANCE_ACTIVE'))
  await page.goto('resources'+scopeQuery)
  await expect(page.locator('[data-sonner-toast]')).toHaveCount(1)
  const toaster = page.locator('[data-sonner-toaster]')
  await expect(page.locator('[data-sonner-toast]')).toContainText('业务已暂停')
  expect(await toaster.evaluate(e=>getComputedStyle(e).position)).toBe('fixed')
  const rect = await toaster.boundingBox()
  expect(rect!.y).toBeLessThan(100)
  await expect(page.getByRole('button',{name:'退出',exact:true})).toBeVisible()
  await page.evaluate(async()=>{
    const {toast}=await import('/rainbow-bridge/src/lib/notifications.ts')
    toast.error('普通错误仍然显示')
  })
  await expect(page.locator('[data-sonner-toast]')).toHaveCount(2)
  await expect(page.locator('[data-sonner-toast]').filter({hasText:'普通错误仍然显示'})).toBeVisible()
})

for(const phase of ['switching','checking']) test(`资源100%但仍${phase}不能报恢复成功或制造执行者阻塞`,async({page})=>{
  const {state}=await maintenanceFixture(page)
  state.task=taskFixture({kind:'restore',state:'running',phase,progress:{completed_objects:'100',total_objects:'100',completed_bytes:'1024',total_bytes:'1024'}})
  state.operation=operationFixture({kind:'restore',state:'running',blocking_reasons:[],allowed_actions:[]})
  await page.goto(taskURL)
  await expect(page.getByRole('progressbar')).toHaveAttribute('value','100')
  await expect(page.getByText(phase==='switching'?'切换业务数据':'检查恢复结果',{exact:true})).toBeVisible()
  await expect(page.getByText('恢复完成，业务已恢复',{exact:true})).toHaveCount(0)
  await expect(page.getByText(/原任务执行者尚未确认停止/)).toHaveCount(0)
  await expect(page.getByRole('button',{name:'继续任务',exact:true})).toHaveCount(0)
})

test('allowed_actions刷新收回后已打开确认框不能继续提交',async({page})=>{
  const {state,mock}=await maintenanceFixture(page)
  state.task=taskFixture({state:'interrupted'})
  state.operation=operationFixture({allowed_actions:['resume','abort']})
  await page.goto(taskURL)
  await page.getByRole('button',{name:'继续任务',exact:true}).click()
  state.operation=operationFixture({revision:'10',allowed_actions:[]})
  await page.locator('header.spectrum-page-heading button').last().dispatchEvent('click')
  await expect(page.getByRole('dialog').getByRole('button',{name:'确认继续任务',exact:true})).toBeDisabled()
  expect(mock.writes('maintenance/operations/'+state.operation.operation_id+'/resume')).toHaveLength(0)
})

test('迟到旧会话任务结果不复活认证或替换新任务',async({page})=>{
  const {mock,state}=await maintenanceFixture(page)
  let finish!:()=>void
  await page.goto(taskURL)
  await expect(page.getByRole('heading',{name:'创建备份',exact:true})).toBeVisible()
  mock.overrides.set('maintenance/tasks/'+taskId,async route=>{await new Promise<void>(r=>{finish=r});await ok(route,{task:taskFixture({kind:'restore',state:'succeeded',revision:'999',result:{business_available:true}}),operation:operationFixture({state:'succeeded',business_available:true})})})
  await page.getByRole('button',{name:'刷新任务',exact:true}).click()
  await expect.poll(()=>Boolean(finish)).toBe(true)
  await page.getByRole('button',{name:'退出',exact:true}).click()
  finish()
  await expect(page).toHaveURL(/\/login$/)
  await expect(page.getByRole('heading',{name:'登录工作台',exact:true})).toBeVisible()
  await expect(page.getByText('恢复完成，业务已恢复',{exact:true})).toHaveCount(0)
})

test('1280/1440明暗维护提示/阶段/只读终态截图与浮层布局',async({page})=>{
  const {mock,state}=await maintenanceFixture(page)
  const dir=join(process.env.DBF_EVIDENCE_DIR!,'finish-screenshots');await mkdir(dir,{recursive:true})
  for(const width of [1280,1440])for(const theme of ['light','dark'])for(const view of ['notice','checking','readonly']){
    await page.setViewportSize({width,height:1000})
    state.task=taskFixture({kind:'restore',state:view==='readonly'?'succeeded':'running',phase:view==='readonly'?'completed':'checking',progress:{completed_bytes:'1024',total_bytes:'1024'},result:view==='readonly'?{business_available:true,reauth_required:true}:null})
    state.operation=operationFixture({kind:'restore',state:view==='readonly'?'succeeded':'running',business_available:view==='readonly',writes_opened:view==='readonly'})
    if(view==='readonly')mock.authenticated=false
    else mock.authenticated=true
    await page.goto(taskURL)
    await page.evaluate(theme=>document.documentElement.classList.toggle('dark',theme==='dark'),theme)
    await expect(page.getByRole('heading',{name:'恢复业务',exact:true})).toBeVisible()
    if(view==='notice')await page.evaluate(async()=>{
      const {toast}=await import('/rainbow-bridge/src/lib/notifications.ts')
      toast.error('业务已暂停，备份与恢复管理仍可继续。');toast.error('业务已暂停，备份与恢复管理仍可继续。')
    })
    if(view==='notice'){
      await expect(page.locator('[data-sonner-toast]')).toHaveCount(1)
      expect(await page.locator('[data-sonner-toaster]').evaluate(e=>getComputedStyle(e).position)).toBe('fixed')
      const box=await page.locator('[data-sonner-toast]').boundingBox();expect(box!.y).toBeLessThan(120)
    }
    if(view==='readonly')await expect(page.getByText(/当前为只读结果页面/)).toBeVisible()
    expect(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth)).toBe(true)
    await page.screenshot({path:join(dir,`${view}-${theme}-${width}.png`),fullPage:true,animations:'disabled'})
  }
})
