const fs=require('node:fs'),path=require('node:path'),assert=require('node:assert/strict');
const {createRequire}=require('node:module');
const {chromium,expect}=createRequire('/src/web/package.json')('@playwright/test');
const live=process.argv.includes('live'),baseURL='https://192.168.2.150:19443',out='/src/test-results/account-onboarding';
async function main(){
 const browser=await chromium.launch({args:['--no-sandbox','--disable-dev-shm-usage']});
 const context=await browser.newContext({baseURL,ignoreHTTPSErrors:true,locale:'zh-CN',viewport:{width:1440,height:1000}});
 await context.addInitScript(()=>{localStorage.setItem('i18nextLng','zh');document.cookie='vite-ui-theme=dark; path=/'});
 const authResponse=await context.request.post('/api/v1/auth/sessions',{headers:{Origin:baseURL},data:{login:'ovload_test_admin',password:fs.readFileSync('/verify/administrator.password','utf8').trim()}});
 assert.equal(authResponse.status(),200);const auth=await authResponse.json();
 const headers={Origin:baseURL,'X-CSRF-Token':auth.csrf_token};
 const fixtures=[],errors=[],failed=[];let page;
 try{
  if(!live)await context.route('**/*',route=>{
   const u=new URL(route.request().url());if(u.pathname.startsWith('/api/')||u.pathname==='/healthz')return route.continue();
   const file=path.join('/src/web/dist-onboarding',u.pathname==='/accounts'||u.pathname==='/'?'index.html':u.pathname);
   return fs.existsSync(file)&&fs.statSync(file).isFile()?route.fulfill({path:file}):route.continue();
  });
  page=await context.newPage();page.on('pageerror',e=>errors.push(e.message));page.on('response',r=>{if(r.url().includes('/api/')&&r.status()>=500)failed.push([r.status(),r.url()])});
  const newAccount=async()=>{await page.getByRole('button',{name:'添加账号',exact:true}).click();const d=page.getByRole('dialog');await expect(d).toBeVisible();assert.equal(await d.locator('input[type=file]').count(),0);await expect(d).not.toContainText('JSON');return d};
  const pick=async(d,label)=>{await d.getByLabel('提供商',{exact:true}).click();await page.getByRole('option',{name:label,exact:true}).click()};
  const screenshot=async(name)=>{await expect(page.locator('[data-sonner-toast]')).toHaveCount(0,{timeout:15000});await page.screenshot({path:`${out}/${live?'live':'candidate'}-${name}.png`,fullPage:true})};
  await page.goto('/accounts');await expect(page.getByRole('button',{name:'添加账号',exact:true})).toBeEnabled({timeout:30000});
  let d=await newAccount();await expect(d.getByRole('button',{name:'开始授权',exact:true})).toBeVisible();
  await pick(d,'Grok Build');await expect(d.getByRole('button',{name:'开始授权',exact:true})).toBeVisible();
  await pick(d,'Claude');await expect(d.getByRole('tab',{name:'OAuth',exact:true})).toHaveAttribute('data-state','active');
  await d.getByRole('tab',{name:'API Key',exact:true}).click();await expect(d.getByLabel('Base URL',{exact:true})).toHaveValue('https://api.anthropic.com/v1');
  await d.getByLabel('API Key',{exact:true}).fill('sk-visible-reset-fixture');
  await d.getByRole('tab',{name:'OAuth',exact:true}).click();await d.getByRole('tab',{name:'API Key',exact:true}).click();await expect(d.getByLabel('API Key',{exact:true})).toHaveValue('');
  await d.getByRole('button',{name:'取消',exact:true}).click();await expect(d).not.toBeVisible();
  for(const [label,provider,url] of [['OpenAI API','openai_api','https://api.openai.com/v1'],['Claude','claude','https://api.anthropic.com/v1'],['Gemini','gemini','https://generativelanguage.googleapis.com/v1beta']]){
   d=await newAccount();await pick(d,label);if(provider!=='openai_api')await d.getByRole('tab',{name:'API Key',exact:true}).click();
   await expect(d.getByLabel('Base URL',{exact:true})).toHaveValue(url);
   const name=`账号接入验证-${provider}-${Date.now()}`;
   await d.getByLabel('账号',{exact:true}).fill(name);
   await d.getByRole('button',{name:'创建账号',exact:true}).click();await expect(d.getByLabel('API Key',{exact:true})).toHaveAttribute('aria-invalid','true');
   await d.getByLabel('API Key',{exact:true}).fill('sk-onboarding-disabled-fixture');
   await d.getByLabel('Base URL',{exact:true}).fill('https://example.com/v1?key=invalid');
   await d.getByRole('button',{name:'创建账号',exact:true}).click();await expect(d.getByLabel('Base URL',{exact:true})).toHaveAttribute('aria-invalid','true');
   await d.getByLabel('Base URL',{exact:true}).fill(url);await expect(d.getByLabel('Base URL',{exact:true})).toHaveAttribute('aria-invalid','false');
   await expect(d.getByRole('switch',{name:'启用',exact:true})).not.toBeChecked();
   if(provider==='gemini'){
    await screenshot('desktop');await page.setViewportSize({width:390,height:844});
    assert.ok(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth+1));await expect(d.getByRole('button',{name:'创建账号',exact:true})).toBeInViewport();
    await screenshot('mobile');await page.setViewportSize({width:1440,height:1000});
   }
   const created=page.waitForResponse(r=>r.url().endsWith('/accounts/import')&&r.request().method()==='POST');
   await d.getByRole('button',{name:'创建账号',exact:true}).click();const response=await created;assert.equal(response.status(),201);const result=(await response.json()).data;
   assert.equal(result.importedCount,1);const id=result.accountIds[0];fixtures.push({id,provider});await expect(d).not.toBeVisible();
   const detailResponse=await context.request.get('/api/admin/accounts/detail?accountId='+id);assert.equal(detailResponse.status(),200);const detail=(await detailResponse.json()).data;
   assert.equal(detail.account.authenticationKind,'api_key');assert.equal(detail.account.enabled,false);assert.equal(detail.credentialConfiguration.base_url,url);
   assert.ok(!JSON.stringify(detail).includes('sk-onboarding-disabled-fixture'));
   const search=page.getByPlaceholder('搜索名称或邮箱');await search.fill(name);const row=page.getByRole('row').filter({hasText:name});await expect(row).toHaveCount(1);
   await row.getByRole('button',{name:'操作',exact:true}).click();await page.getByRole('menuitem',{name:'编辑账号',exact:true}).click();d=page.getByRole('dialog');
   await expect(d.getByRole('switch',{name:'修改连接设置',exact:true})).toBeEnabled();await d.getByRole('switch',{name:'修改连接设置',exact:true}).click();
   await expect(d.getByLabel('Base URL',{exact:true})).toHaveValue(url);await expect(d.getByLabel('替换 API Key（可选）',{exact:true})).toHaveValue('');
   await d.getByLabel('Base URL',{exact:true}).fill(url+'/');
   const updated=page.waitForResponse(r=>r.url().endsWith('/accounts/update')&&r.request().method()==='POST');await d.getByRole('button',{name:'保存',exact:true}).click();assert.equal((await updated).status(),200);await expect(d).not.toBeVisible();
   const saved=(await (await context.request.get('/api/admin/accounts/detail?accountId='+id)).json()).data;assert.equal(saved.credentialConfiguration.base_url,url+'/');assert.equal(saved.account.authenticationKind,'api_key');
   await search.fill('');
  }
  assert.deepEqual(errors,[]);assert.deepEqual(failed,[]);
  fs.writeFileSync(`${out}/${live?'live':'candidate'}.json`,JSON.stringify({passed:true,checks:['No native JSON/file entry','Codex/Grok OAuth, Claude/Gemini OAuth and API Key options','Provider-specific URL defaults and secret reset','Required key and invalid URL validation','Real create/edit persistence for three API providers; no credential readback','Shared connection form and mobile layout'],errors,failed},null,2));
  console.log('PASS account onboarding UI and real API persistence');
 }catch(error){
  if(page){await page.screenshot({path:`${out}/failure.png`,fullPage:true}).catch(()=>{});fs.writeFileSync(`${out}/failure.txt`,await page.locator('body').innerText().catch(()=>''));}
  throw error;
 }finally{
  for(const {id,provider}of fixtures){const r=await context.request.post('/api/admin/accounts/delete',{headers,data:{provider,accountIds:[id]}});assert.equal(r.status(),200)}
  await context.request.delete('/api/admin/v1/auth/session',{headers});await browser.close();
 }
}
main().catch(e=>{console.error(e);process.exitCode=1});
