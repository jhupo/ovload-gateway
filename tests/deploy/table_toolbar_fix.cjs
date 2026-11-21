const fs=require('node:fs'),path=require('node:path'),assert=require('node:assert/strict')
const {createRequire}=require('node:module')
const {chromium,expect}=createRequire('/src/web/package.json')('@playwright/test')
const baseURL='https://192.168.2.150:19443',out='/src/test-results/table-toolbar-fix'
const mode=process.argv[2]||'candidate',candidate='/src/web/dist-toolbar-candidate'
async function main(){
 const browser=await chromium.launch({args:['--no-sandbox','--disable-dev-shm-usage']})
 const context=await browser.newContext({baseURL,ignoreHTTPSErrors:true,viewport:{width:1440,height:1000},locale:'zh-CN'})
 await context.addInitScript(()=>{localStorage.setItem('i18nextLng','zh');document.cookie='vite-ui-theme=dark; path=/'})
 const login=await context.request.post('/api/v1/auth/sessions',{headers:{Origin:baseURL},data:{login:'ovload_test_admin',password:fs.readFileSync('/verify/administrator.password','utf8').trim()}})
 assert.equal(login.status(),200);const csrf=(await login.json()).csrf_token
 if(mode==='candidate')await context.route('**/*',async route=>{
  const req=route.request(),url=new URL(req.url())
  if(url.origin!==baseURL||url.pathname.startsWith('/api/')||url.pathname==='/healthz')return route.continue()
  const file=req.resourceType()==='document'?path.join(candidate,'index.html'):path.join(candidate,url.pathname)
  if(fs.existsSync(file)&&fs.statSync(file).isFile())return route.fulfill({path:file})
  return route.continue()
 })
 const page=await context.newPage(),errors=[],checks=[]
 page.on('pageerror',e=>errors.push(e.message))
 try{
 for(const [url,name] of [['/usage','usage'],['/orders/plans','plans'],['/subscriptions','subscriptions']]){
  await page.goto(url);await page.waitForLoadState('networkidle');await page.screenshot({path:`${out}/${mode}-${name}-desktop.png`,fullPage:true})
  if(name==='usage'){
   if(mode!=='before'){
    const request=await context.request.get('/api/admin/usage/records?period=7d&pageSize=50&currentPage=1');assert.equal(request.status(),200)
    const body=await request.json();assert.ok(body.data.total>0)
    await expect(page.locator('tbody tr').first()).toContainText('测试')
    const search=await page.getByPlaceholder('搜索 API 密钥名称').boundingBox()
    const tabs=await page.getByRole('tablist').boundingBox()
    const table=await page.locator('table:visible').boundingBox()
    const view=await page.getByRole('button',{name:'视图',exact:true}).boundingBox()
    assert.ok(search.y>tabs.y+tabs.height && search.y+search.height<table.y)
    assert.ok(view.x>search.x && Math.abs(view.y-search.y)<2)
    await expect(page.getByText(/上游成本覆盖情况/)).toHaveCount(0)
    checks.push('Usage toolbar sits directly above table; coverage text removed')
   }
  }else{
   const table=page.locator('table:visible'),bounds=await table.boundingBox()
   const panel=await table.evaluate(el=>{const p=el.parentElement.parentElement.parentElement;return {height:p.clientHeight,scrollHeight:p.scrollHeight}})
   const rows=await page.locator('tbody tr:visible').evaluateAll(rows=>rows.map(r=>r.getBoundingClientRect().height))
   console.log(name,JSON.stringify({table:bounds.height,panel,rows}))
   if(mode!=='before'){
    assert.ok(panel.height<=bounds.height+2,'Empty space in '+name)
    assert.ok(rows.every(h=>h<=(name==='plans'?110:145)),'Oversized rows in '+name)
    const pagination=await page.getByRole('combobox',{name:'每页行数',exact:true}).boundingBox()
    const main=await page.locator('main').boundingBox()
    assert.ok(main.y+main.height-pagination.y-pagination.height<45,'Pagination not at bottom')
    checks.push(name+' compact rows with pagination anchored at bottom')
   }
  }
  await page.setViewportSize({width:390,height:844});await page.screenshot({path:`${out}/${mode}-${name}-mobile.png`,fullPage:true})
  assert.ok(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth+1),'Mobile overflow '+name)
  await page.setViewportSize({width:1440,height:1000})
 }
 assert.deepEqual(errors,[])
 fs.writeFileSync(`${out}/${mode}-checks.json`,JSON.stringify({passed:true,checks,errors},null,2))
 }finally{await context.request.delete('/api/admin/v1/auth/session',{headers:{Origin:baseURL,'X-CSRF-Token':csrf}});await browser.close()}
}
main().catch(e=>{console.error(e);process.exit(1)})
