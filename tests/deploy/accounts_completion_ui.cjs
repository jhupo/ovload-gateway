const fs=require('node:fs'),path=require('node:path'),assert=require('node:assert/strict');
const {createRequire}=require('node:module');
const {chromium,expect}=createRequire('/src/web/package.json')('@playwright/test');
const live=process.argv.includes('live'),baseURL='https://192.168.2.150:19443',out='/src/test-results/accounts-completion';
async function main(){
 const browser=await chromium.launch({args:['--no-sandbox','--disable-dev-shm-usage']});
 const context=await browser.newContext({baseURL,ignoreHTTPSErrors:true,locale:'zh-CN',viewport:{width:1440,height:1000}});
 await context.addInitScript(()=>{localStorage.setItem('i18nextLng','zh');document.cookie='vite-ui-theme=dark; path=/'});
 const login=await context.request.post('/api/v1/auth/sessions',{headers:{Origin:baseURL},data:{login:'ovload_test_admin',password:fs.readFileSync('/verify/administrator.password','utf8').trim()}});
 assert.equal(login.status(),200);const auth=await login.json(),headers={Origin:baseURL,'X-CSRF-Token':auth.csrf_token};
 const ids=[],errors=[],groupRequests=[],prefix='账号补全验证-'+Date.now();let page;
 const detail=async(id)=>(await(await context.request.get('/api/admin/accounts/detail?accountId='+id)).json()).data;
 const create=async(i)=>{const response=await context.request.post('/api/admin/accounts/import',{headers,data:{provider:'openai_api',data:{schema_version:1,name:prefix+'-'+i,api_key:'sk-disabled-accounts-completion-fixture',base_url:'https://api.openai.com/v1'},settings:{notes:'verification',enabled:false,concurrencyLimit:i+3,weight:i+5,modelAccess:{mode:'all',models:[]},groupIds:[]}}});assert.equal(response.status(),201);const id=(await response.json()).data.accountIds[0];ids.push(id);return id};
 try {
  for(let i=0;i<2;i++)await create(i);
  if(!live)await context.route('**/*',route=>{const u=new URL(route.request().url());if(u.pathname.startsWith('/api/')||u.pathname==='/healthz')return route.continue();const file=path.join('/src/web/dist-accounts',u.pathname==='/accounts'||u.pathname==='/'?'index.html':u.pathname);return fs.existsSync(file)&&fs.statSync(file).isFile()?route.fulfill({path:file}):route.continue()});
  page=await context.newPage();page.on('request',r=>{if(r.url().includes('/account-groups?'))groupRequests.push(decodeURIComponent(r.url()))});page.on('pageerror',e=>errors.push(e.message));await page.goto('/accounts');
  const search=page.getByPlaceholder('搜索名称或邮箱');await expect(search).toBeVisible({timeout:30000});await search.fill(prefix);
  const row=page.getByRole('row').filter({hasText:prefix+'-0'});await expect(row).toHaveCount(1);
  await row.getByRole('button',{name:'操作',exact:true}).click();
  for(const label of ['个人信息','额度预测','额度重置','重置额度'])assert.equal(await page.getByRole('menuitem',{name:label,exact:true}).count(),0);
  await page.getByRole('menuitem',{name:'编辑账号',exact:true}).click();let dialog=page.getByRole('dialog');
  await dialog.getByLabel('账号',{exact:true}).fill(prefix+'-renamed');
  await dialog.getByRole('combobox',{name:'分组',exact:true}).click();
  assert.ok(groupRequests.some(url=>url.includes('platform=all,openai_api')));
  await page.keyboard.press('Escape');
  const groups=(await(await context.request.get('/api/admin/account-groups?platform=all,openai_api&pageSize=200')).json()).data.items;
  assert.ok(groups.every(g=>g.platform==null||g.platform==='openai_api'));
  await dialog.getByRole('switch',{name:'修改连接设置',exact:true}).click();await dialog.getByLabel('Base URL',{exact:true}).fill('https://api.openai.com/v1/');
  const save=page.waitForResponse(r=>r.url().endsWith('/accounts/update')&&r.request().method()==='POST');await dialog.getByRole('button',{name:'保存',exact:true}).click();assert.equal((await save).status(),200);await expect(dialog).not.toBeVisible();
  const renamed=await detail(ids[0]);assert.equal(renamed.account.name,prefix+'-renamed');assert.equal(renamed.credentialConfiguration.base_url,'https://api.openai.com/v1/');assert.equal(renamed.account.weight,5);
  await page.getByRole('checkbox',{name:'选择本页账号',exact:true}).check();await page.getByRole('button',{name:'批量修改（2）',exact:true}).click();dialog=page.getByRole('dialog');
  await dialog.getByRole('combobox',{name:'修改项目',exact:true}).click();await page.getByRole('option',{name:'并发上限',exact:true}).click();await dialog.getByLabel('并发上限',{exact:true}).fill('17');
  await page.screenshot({path:`${out}/${live?'live':'candidate'}-desktop.png`});
  const batch=page.waitForResponse(r=>r.url().endsWith('/accounts/batch-update'));await dialog.getByRole('button',{name:'保存',exact:true}).click();assert.equal((await batch).status(),200);await expect(dialog).not.toBeVisible();
  for(let i=0;i<ids.length;i++){const a=(await detail(ids[i])).account;assert.equal(a.concurrencyLimit,17);assert.equal(a.weight,i+5);assert.equal(a.enabled,false);assert.equal(a.notes,'verification')}
  const standalone=(await detail(ids[1])).account;
  const renameOnly=await context.request.post('/api/admin/accounts/update',{headers,data:{accountId:standalone.id,configRevision:standalone.configRevision,name:prefix+'-standalone',notes:standalone.notes,enabled:false,concurrencyLimit:standalone.concurrencyLimit,weight:standalone.weight,modelAccess:standalone.modelAccess,groupIds:[]}});assert.equal(renameOnly.status(),200);assert.equal((await detail(ids[1])).account.name,prefix+'-standalone');
  const current=(await detail(ids[0])).account;
  const invalid=await context.request.post('/api/admin/accounts/update',{headers,data:{accountId:current.id,configRevision:current.configRevision,name:' ',notes:current.notes,enabled:false,concurrencyLimit:17,weight:current.weight,modelAccess:current.modelAccess,groupIds:[]}});assert.equal(invalid.status(),400);assert.equal((await detail(ids[0])).account.name,prefix+'-renamed');
  let mode='success',tests=0;
  await context.route('**/api/admin/accounts/connection-test?*',async route=>{tests++;assert.equal(new URL(route.request().url()).searchParams.get('modelId'),'test-model');if(mode==='wait'){await new Promise(r=>setTimeout(r,1500));return route.abort().catch(()=>{})}return route.fulfill({status:200,contentType:'text/event-stream',body:mode==='success'?'data: {"type":"content","text":"fixture response"}\n\ndata: {"type":"test_complete","success":true}\n\n':'data: {"type":"error","error":"模拟连接失败"}\n\n'})});
  const openTest=async()=>{await page.getByRole('row').filter({hasText:prefix+'-renamed'}).getByRole('button',{name:'操作',exact:true}).click();await page.getByRole('menuitem',{name:'连接测试',exact:true}).click();return page.getByRole('dialog')};
  dialog=await openTest();await dialog.getByLabel('模型',{exact:true}).fill('test-model');await dialog.getByRole('button',{name:'连接测试',exact:true}).click();await expect(dialog).toContainText('fixture response');await expect(page.locator('[data-sonner-toast]').filter({hasText:'连接测试通过'})).toBeVisible();
  mode='error';await dialog.getByRole('button',{name:'连接测试',exact:true}).click();await expect(page.locator('[data-sonner-toast]').filter({hasText:'模拟连接失败'})).toBeVisible();await expect(dialog).not.toContainText('模拟连接失败');
  await page.setViewportSize({width:390,height:844});assert.ok(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth+1));await expect(dialog.getByRole('button',{name:'连接测试',exact:true})).toBeInViewport();await page.screenshot({path:`${out}/${live?'live':'candidate'}-mobile.png`});
  mode='wait';await dialog.getByRole('button',{name:'连接测试',exact:true}).click();await expect.poll(()=>tests).toBe(3);await dialog.getByRole('button',{name:'停止',exact:true}).click();await expect(dialog).not.toBeVisible();assert.equal(tests,3);assert.deepEqual(errors,[]);
  fs.writeFileSync(`${out}/${live?'live':'candidate'}.json`,JSON.stringify({passed:true,checks:['API account name + connection saved atomically','Invalid names rejected','Provider group filter','Only supported account menus','Batch concurrency preserves other settings','SSE success/error/cancellation with controlled responses','Desktop/mobile layout'],errors},null,2));console.log('PASS accounts UI and API persistence');
 }catch(error){if(page)await page.screenshot({path:`${out}/failure.png`,fullPage:true}).catch(()=>{});throw error}
 finally{for(const id of ids){const response=await context.request.post('/api/admin/accounts/delete',{headers,data:{provider:'openai_api',accountIds:[id]}});assert.equal(response.status(),200)}await context.request.delete('/api/admin/v1/auth/session',{headers});await browser.close()}
}
main().catch(e=>{console.error(e);process.exitCode=1});
