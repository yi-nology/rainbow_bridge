import { chromium } from '@playwright/test'
import { readFile, writeFile, mkdir, readdir, stat } from 'node:fs/promises'
import { resolve, join, sep, extname } from 'node:path'
import { createHash } from 'node:crypto'

const root=resolve(import.meta.dirname,'../../..'),output=process.env.DBF_EVIDENCE_DIR
if(!output||!resolve(output).startsWith(join(root,'.local-qa','distributed-backup-frontend')+sep))throw Error('Owned evidence path required')
await mkdir(output,{recursive:true})
const access=JSON.parse(await readFile(join(root,'.local-qa/distributed-web/run_20261030_web01/frontend-access.private.json'),'utf8'))
if(access.namespace!=='rb-web-20261030-01'||access.instance!=='aaa4c049-987c-4751-9559-4b3626369950'||access.url!=='http://10.60.226.43:31981/rainbow-bridge/')throw Error('Shared fixture identity differs; refusing access')
const base=new URL(access.url),browser=await chromium.launch({headless:true}),context=await browser.newContext({viewport:{width:1440,height:1000}})
const report={checked_at:new Date().toISOString(),namespace:access.namespace,instance:access.instance,static_mode:process.env.DBF_STATIC_OVERLAY==='1'?'client static replacement, real API pass-through':'existing remote static; no deployment',business_mutations:0,logged_out:false}
let csrf='',loggedIn=false
async function get(path){const response=await context.request.get(new URL('api/v1/'+path,base).href,{timeout:15000});if(response.status()!==200)throw Error(`Read ${path.split('?')[0]} HTTP ${response.status()}`);return(await response.json()).data}
try{
  report.version=await get('version')
  const login=await context.request.post(new URL('api/v1/auth/login',base).href,{headers:{Origin:base.origin},data:{username:access.username,password:access.password},timeout:15000})
  if(login.status()!==200)throw Error(`Shared fixture login HTTP ${login.status()}; no credentials retained`)
  loggedIn=true; const me=await get('auth/me');csrf=me.csrf_token
  report.discovery=await get('backup/capabilities');report.capabilities=await get('maintenance/capabilities')
  if(report.discovery.mode!=='maintenance_web'||report.discovery.contract_version!==1||report.capabilities.maintenance.active)throw Error('Expected idle maintenance_web fixture; no writes attempted')
  let cursor='',tasks=[]
  const seen=new Set()
  do{if(seen.has(cursor))throw Error('Repeated task cursor');seen.add(cursor);const result=await get('maintenance/tasks?'+new URLSearchParams({limit:'100',cursor}));tasks.push(...result.items);cursor=result.has_more?result.next_cursor:''}while(cursor)
  report.task_count=tasks.length;report.active_tasks=tasks.filter(t=>['queued','running'].includes(t.state)).length
  if(report.active_tasks)throw Error('Shared fixture has an active task; no writes attempted')
  const backups=await get('maintenance/backups?limit=100&cursor=');report.available_backups=backups.items.length
  const task=tasks.find(t=>t.kind==='restore'&&t.state==='succeeded')
  if(!task)throw Error('No existing completed restore to verify read-only')
  report.existing_task_id=task.task_id;report.task_detail=await get('maintenance/tasks/'+task.task_id)
  const resultCookie=(await context.cookies()).find(cookie=>cookie.name==='rb_maintenance_result')
  if(!resultCookie){
    const elapsed=Date.now()-Date.parse(task.finished_at||task.updated_at)
    if(elapsed<15*60*1000)throw Error('Recent completed task did not issue a result cookie')
    report.result_cookie_reads={status:'not reissued: existing task terminal window exceeded 15 minutes; no new restore for visual check',finished_at:task.finished_at}
  }else{
    const cookieHeader={Cookie:`${resultCookie.name}=${resultCookie.value}`}
    const ownResult=await context.request.get(new URL('api/v1/maintenance/tasks/'+task.task_id,base).href,{headers:cookieHeader})
    const listWithResult=await context.request.get(new URL('api/v1/maintenance/tasks?limit=1',base).href,{headers:cookieHeader})
    const other=tasks.find(row=>row.operation_id&&row.operation_id!==task.operation_id)
    const otherResult=other?await context.request.get(new URL('api/v1/maintenance/tasks/'+other.task_id,base).href,{headers:cookieHeader}):null
    report.result_cookie_reads={own:ownResult.status(),list:listWithResult.status(),other_operation:otherResult?.status()??null}
    if(ownResult.status()!==200||listWithResult.status()!==401||(otherResult&&otherResult.status()!==401))throw Error('Result-cookie read permissions differ from expected contract')
  }
  const page=await context.newPage()
  if(process.env.DBF_STATIC_OVERLAY==='1'){
    const dist=join(root,'vue/dist'),localHTML=await readFile(join(dist,'index.html'),'utf8'),remoteHTML=await(await context.request.get(base.href)).text()
    const entries=(html,pattern)=>[...html.matchAll(pattern)].map(m=>new URL(m[1],base).pathname)
    const script=/<script\b[^>]*\btype="module"[^>]*\bsrc="([^"]+)"[^>]*>/g,css=/<link\b[^>]*\brel="stylesheet"[^>]*\bhref="([^"]+)"[^>]*>/g
    const mapping=new Map([...entries(remoteHTML,script).map((x,i)=>[x,entries(localHTML,script)[i]]),...entries(remoteHTML,css).map((x,i)=>[x,entries(localHTML,css)[i]])])
    const fingerprints=[]
    for(const file of await readdir(join(dist,'assets')))if(/\.(js|css)$/.test(file))fingerprints.push({file,sha256:createHash('sha256').update(await readFile(join(dist,'assets',file))).digest('hex')})
    report.local_assets=fingerprints
    await page.route(url=>url.origin===base.origin&&url.pathname.startsWith(base.pathname+'assets/'),async route=>{
      const path=new URL(route.request().url()).pathname,chosen=mapping.get(path)||path,file=resolve(dist,chosen.slice(base.pathname.length))
      if(!file.startsWith(dist+sep))throw Error('Static path outside build')
      if(!(await stat(file).catch(()=>null))?.isFile()){await route.continue();return}
      const type={'.js':'application/javascript','.css':'text/css','.webp':'image/webp','.svg':'image/svg+xml'}[extname(file)]||'application/octet-stream'
      await route.fulfill({status:200,contentType:type,body:await readFile(file)})
    })
  }
  await page.goto(new URL('backups',base).href)
  await page.getByRole('heading',{name:'全量备份',exact:true}).waitFor()
  report.browser_list=true
  await page.goto(new URL('backups/tasks/'+task.task_id,base).href)
  await page.getByRole('heading',{name:'恢复业务',exact:true}).waitFor()
  // Task page will itself revalidate a historic reauth_required marker.
  await page.getByRole('button',{name:'刷新任务',exact:true}).waitFor({state:'visible'})
  await page.waitForFunction(()=>document.body.innerText.includes('恢复完成，业务已恢复'))
  await page.reload();await page.waitForFunction(()=>document.body.innerText.includes('恢复完成，业务已恢复'))
  report.historical_reauth_keeps_login=await page.getByRole('button',{name:'退出',exact:true}).isVisible()
  if(process.env.DBF_STATIC_OVERLAY==='1'){
    // Browser-local exact gateway response exercises final bundled toast CSS;
    // this does not put the real shared cluster into maintenance.
    for(const path of ['environment/list','runtime/overview'])await page.route('**/api/v1/'+path,route=>route.fulfill({status:503,contentType:'application/json',body:JSON.stringify({code:503,error_type:'MAINTENANCE_ACTIVE',msg:'business paused'})}))
    await page.evaluate(async()=>{const modules=performance.getEntriesByType('resource').filter(e=>e.name.includes('/assets/'));return modules.length})
    // Use the actual business navigation to trigger the shared API/store notice.
    await page.getByRole('link',{name:'环境管理',exact:true}).click()
    await page.locator('[data-sonner-toast]').filter({hasText:'业务已暂停'}).first().waitFor()
    report.toast_count=await page.locator('[data-sonner-toast]').count()
    report.toast_position=await page.locator('[data-sonner-toaster]').evaluate(e=>getComputedStyle(e).position)
    for(const width of [1280,1440])for(const theme of ['light','dark']){
      await page.setViewportSize({width,height:1000});await page.evaluate(theme=>document.documentElement.classList.toggle('dark',theme==='dark'),theme)
      await page.screenshot({path:join(output,`remote-client-toast-${theme}-${width}.png`),fullPage:true,animations:'disabled'})
    }
    report.maintenance_response='browser-local mocked environment/list and runtime/overview 503; remaining APIs real'
  }
  report.after_capabilities=await get('maintenance/capabilities')
  if(report.after_capabilities.maintenance.active)throw Error('Maintenance state changed concurrently; no rollback attempted')
}catch(error){report.failure=error.name==='TimeoutError'?'Browser operation timed out; inspect safe evidence':error.message;process.exitCode=1}
finally{
  if(loggedIn)try{const response=await context.request.post(new URL('api/v1/auth/logout',base).href,{headers:{Origin:base.origin,'X-CSRF-Token':csrf},data:{},timeout:15000});report.logged_out=response.status()===200}catch{report.logout_unconfirmed=true}
  // Save only safe DTO/projection fields, never raw auth responses or storage state.
  await writeFile(join(output,process.env.DBF_STATIC_OVERLAY==='1'?'remote-client-final.json':'remote-health.json'),JSON.stringify(report,null,2))
  await context.close();await browser.close();delete access.password;delete access.username
  process.stdout.write(JSON.stringify({failure:report.failure||null,business_mutations:0,logged_out:report.logged_out,static_mode:report.static_mode})+'\n')
}
