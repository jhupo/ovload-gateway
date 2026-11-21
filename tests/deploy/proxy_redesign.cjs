const fs=require('node:fs'),assert=require('node:assert/strict');
const {createRequire}=require('node:module');const {chromium,expect}=createRequire('/src/web/package.json')('@playwright/test');
const base='https://192.168.2.150:19443',out='/src/test-results/proxy-redesign',before=process.argv.includes('--before');
(async()=>{
 const browser=await chromium.launch({headless:true,args:['--no-sandbox']});
 const ctx=await browser.newContext({baseURL:base,ignoreHTTPSErrors:true,viewport:{width:1600,height:1000},colorScheme:'dark'});
 const checks=[],errors=[],created=[],bound=[];let session,page;
 try{
  await ctx.addInitScript(()=>{localStorage.setItem('i18nextLng','zh');document.cookie='vite-ui-theme=dark; path=/'});
  const login=await ctx.request.post('/api/v1/auth/sessions',{headers:{Origin:base},data:{login:'ovload_test_admin',password:fs.readFileSync('/test-runtime/administrator.password','utf8').trim()}});assert.equal(login.status(),200);session=await login.json();
  const headers={Origin:base,'X-CSRF-Token':session.csrf_token};
  async function get(path){const r=await ctx.request.get('/api/admin'+path);assert.equal(r.status(),200,await r.text());return (await r.json()).data;}
  async function post(path,data){const r=await ctx.request.post('/api/admin'+path,{headers,data});assert(r.ok(),await r.text());return (await r.json()).data;}
  async function list(){return (await get('/proxies?page=1&pageSize=100')).items;}
  page=await ctx.newPage();page.on('pageerror',e=>errors.push(e.message));
  await page.goto('/proxies');await expect(page.getByRole('heading',{name:'代理管理'})).toBeVisible();await expect(page.locator('main')).toContainText('测试 · 东京出口');
  if(before){await page.screenshot({path:out+'/before-desktop.png'});await page.getByRole('button',{name:'添加代理',exact:true}).click();await expect(page.getByRole('dialog')).toBeVisible();await page.screenshot({path:out+'/before-editor.png'});console.log('PASS before screenshots');return;}
  await expect(page.locator('main')).not.toContainText(/WebSocket|暂不可用|到期|质量检测/);
  for(const col of ['代理名称','代理地址','出口 IP','地区','耗时','账号数','测试时间'])await expect(page.getByRole('columnheader',{name:col,exact:true})).toBeVisible();
  await page.screenshot({path:out+'/after-desktop.png'});
  const search=page.getByRole('textbox',{name:'搜索名称 / 地址',exact:true});await search.fill('东京');await expect(page.locator('tbody tr')).toHaveCount(1);await search.fill('');
  await page.getByRole('button',{name:'添加代理',exact:true}).click();let dialog=page.getByRole('dialog').last();
  await expect(dialog).not.toContainText(/WebSocket|暂不可用|到期/);await expect(dialog.locator('#proxy-country')).toHaveCount(0);await page.screenshot({path:out+'/after-editor.png'});
  const name='UI proxy verification '+Date.now(),url='socks5h://demo-user:demo-password@192.0.2.200:1080';
  await dialog.locator('#proxy-name').fill(name);await dialog.locator('#proxy-url').fill(url);
  let probes=0;
  await page.route('**/api/admin/proxies/probe',async route=>{const body=route.request().postDataJSON();assert.equal(body.proxyUrl,url);probes++;await route.fulfill({status:200,contentType:'application/json',body:JSON.stringify({code:200,data:{success:true,latencyMs:123,exitIp:'192.0.2.200',exitIpv4:'192.0.2.200',exitIpv6:null,message:'OK',location:{status:'detected',location:{country:'JP',region:'Tokyo',city:'Tokyo',timezone:'Asia/Tokyo'}}}})});});
  await dialog.getByRole('button',{name:'连接测试',exact:true}).click();await expect(page.locator('[data-sonner-toast]')).toContainText(['连接测试通过']);
  await dialog.getByRole('button',{name:'检测出口位置并填入'}).click();await expect(dialog.locator('#proxy-country')).toHaveValue('JP');await expect(dialog.locator('#proxy-timezone')).toHaveValue('Asia/Tokyo');assert.equal(probes,2);
  await page.screenshot({path:out+'/after-custom-location.png'});
  const saved=page.waitForResponse(r=>r.url().endsWith('/api/admin/proxies/create')&&r.request().method()==='POST');await dialog.getByRole('button',{name:'保存代理',exact:true}).click();const result=(await (await saved).json()).data;assert.equal(result[0].status,'succeeded');const id=result[0].data.record.id;created.push(id);await expect(page.getByRole('dialog')).toHaveCount(0);
  let record=(await list()).find(r=>r.id===id);assert(record.hasAuthentication);assert(!record.endpoint.includes('demo-password'));assert.equal(record.location.timezone,'Asia/Tokyo');assert.equal(record.maxWebsocketConnections,0);
  await page.unroute('**/api/admin/proxies/probe');checks.push('unsaved probe/detection UI contract (controlled response); real SOCKS5H create and custom location persistence');
  await page.getByRole('button',{name:'编辑 '+name,exact:true}).click();dialog=page.getByRole('dialog').last();await expect(dialog.locator('#proxy-url')).toHaveValue('');await expect(dialog.locator('#proxy-city')).toHaveValue('Tokyo');
  await dialog.locator('#proxy-name').fill(name+' edited');await dialog.getByRole('button',{name:'保存代理',exact:true}).click();await expect(page.getByRole('dialog')).toHaveCount(0);
  record=(await list()).find(r=>r.id===id);assert(record.hasAuthentication);assert.equal(record.name,name+' edited');checks.push('edit keeps encrypted authentication and location');
  // Account assignment is exercised with a disposable disabled account, never an existing user account.
  const imported=await post('/accounts/import',{provider:'openai_api',data:{schema_version:1,name:'Proxy UI assignment fixture',api_key:'disabled-fixture-only',base_url:'https://api.openai.com/v1'},settings:{notes:'temporary UI verification',enabled:false,concurrencyLimit:7,weight:1,groupIds:[],modelAccess:{mode:'all',models:[]}}});
  const accountId=imported.accountIds[0];bound.push(accountId);
  await page.getByRole('button',{name:'查看 '+record.name+' 的关联账号',exact:true}).click();dialog=page.getByRole('dialog').last();await dialog.getByRole('button',{name:'分配账号',exact:true}).click();dialog=page.getByRole('dialog').last();
  await dialog.getByRole('textbox',{name:'搜索账号名称或邮箱'}).fill('Proxy UI assignment fixture');await expect(dialog.locator('tbody tr')).toHaveCount(1);await dialog.getByRole('checkbox',{name:'选择 Proxy UI assignment fixture',exact:true}).check();
  await page.screenshot({path:out+'/after-assign.png'});await dialog.getByRole('button',{name:'分配所选账号（1）',exact:true}).click();await expect(page.getByRole('dialog')).toHaveCount(1);
  dialog=page.getByRole('dialog').last();await expect(dialog).toContainText('Proxy UI assignment fixture');await dialog.getByRole('textbox',{name:'搜索账号名称或邮箱'}).fill('fixture');await expect(dialog.locator('tbody tr')).toHaveCount(1);await page.screenshot({path:out+'/after-accounts.png'});
  let account=(await get('/accounts/detail?accountId='+accountId)).account;assert.equal(account.outboundProxyId,id);assert.equal(account.enabled,false);assert.equal(account.concurrencyLimit,7);
  await dialog.getByRole('button',{name:'解除 Proxy UI assignment fixture 的代理关联'}).click();await page.getByRole('alertdialog').getByRole('button',{name:'解除关联',exact:true}).click();await expect(page.getByRole('alertdialog')).toHaveCount(0);await expect(dialog.locator('tbody tr')).toHaveCount(0);
  account=(await get('/accounts/detail?accountId='+accountId)).account;assert.equal(account.outboundProxyId,null);checks.push('real account assignment, server search, detachment and preserved account settings');await page.keyboard.press('Escape');
  await page.getByRole('button',{name:'添加代理',exact:true}).click();dialog=page.getByRole('dialog').last();await dialog.getByRole('tab',{name:'批量',exact:true}).click();const batchUrls=['http://192.0.2.201:8080','socks5h://192.0.2.202:1080'];await dialog.locator('#proxy-batch').fill(batchUrls.join('\n'));
  const batchSaved=page.waitForResponse(r=>r.url().endsWith('/api/admin/proxies/create')&&r.request().method()==='POST');await dialog.getByRole('button',{name:'批量添加',exact:true}).click();const batch=(await (await batchSaved).json()).data;assert(batch.every(r=>r.status==='succeeded'));created.push(...batch.map(r=>r.data.record.id));await expect(page.getByRole('dialog')).toHaveCount(0);checks.push('real batch import');
  // A failed API request is reported by a toast, without inserting an error panel.
  await page.route('**/api/admin/proxies/probe',route=>route.fulfill({status:502,contentType:'application/json',body:JSON.stringify({code:502,message:'Controlled proxy probe failure'})}));
  await page.getByRole('button',{name:'添加代理',exact:true}).click();dialog=page.getByRole('dialog').last();await dialog.locator('#proxy-url').fill('http://192.0.2.203:8080');await dialog.getByRole('button',{name:'连接测试',exact:true}).click();await expect(page.locator('[data-sonner-toast][data-type=error]').last()).toContainText('Controlled proxy probe failure');await expect(dialog).not.toContainText('Controlled proxy probe failure');await page.unroute('**/api/admin/proxies/probe');
  await page.keyboard.press('Escape');await page.getByRole('alertdialog').getByRole('button',{name:'放弃修改',exact:true}).click();await expect(page.getByRole('dialog')).toHaveCount(0);checks.push('error toast and unsaved-change guard');
  for(const width of [390,320]){
   await page.setViewportSize({width,height:844});await expect(page.locator('main')).toContainText('测试 · 东京出口');assert(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth+1));await page.screenshot({path:out+'/after-mobile-'+width+'.png'});
   await page.getByRole('button',{name:'添加代理',exact:true}).click();dialog=page.getByRole('dialog').last();await dialog.locator('#proxy-custom-location').click();await expect(dialog.locator('#proxy-city')).toBeVisible();await dialog.getByRole('button',{name:'保存代理',exact:true}).scrollIntoViewIfNeeded();assert(await dialog.evaluate(el=>el.scrollWidth<=el.clientWidth+1));await page.screenshot({path:out+'/after-mobile-editor-'+width+'.png'});await page.keyboard.press('Escape');await page.getByRole('alertdialog').getByRole('button',{name:'放弃修改',exact:true}).click();
  }
  assert.deepEqual(errors,[]);checks.push('desktop and 390/320px mobile layouts; no page exceptions');fs.writeFileSync(out+'/browser.json',JSON.stringify({passed:true,checks,errors},null,2));console.log('PASS '+checks.join('; '));
 }catch(e){if(page){await page.screenshot({path:out+'/failure.png'}).catch(()=>{});fs.writeFileSync(out+'/failure.txt',await page.locator('body').innerText().catch(()=>''));}console.error(e);process.exitCode=1;}
 finally{
  if(session){const headers={Origin:base,'X-CSRF-Token':session.csrf_token};for(const id of bound)await ctx.request.post('/api/admin/accounts/delete',{headers,data:{provider:'openai_api',accountIds:[id]}});const r=await ctx.request.get('/api/admin/proxies?page=1&pageSize=100');if(r.ok()){const rows=(await r.json()).data.items;for(const id of created){const p=rows.find(x=>x.id===id);if(p)await ctx.request.post('/api/admin/proxies/delete',{headers,data:{id,revision:p.revision}});}}await ctx.request.delete('/api/admin/v1/auth/session',{headers});}
  await browser.close();
 }
})();
