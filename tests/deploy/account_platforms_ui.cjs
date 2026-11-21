const fs=require('node:fs'),path=require('node:path'),assert=require('node:assert/strict');
const {createRequire}=require('node:module');
const {chromium,expect}=createRequire('/src/web/package.json')('@playwright/test');
const live=process.argv.includes('live'),baseURL='https://192.168.2.150:19443',out='/src/test-results/account-platforms';
async function main(){
 const browser=await chromium.launch({args:['--no-sandbox','--disable-dev-shm-usage']});
 const context=await browser.newContext({baseURL,ignoreHTTPSErrors:true,locale:'zh-CN',viewport:{width:1440,height:1000}});
 await context.addInitScript(()=>{localStorage.setItem('i18nextLng','zh');document.cookie='vite-ui-theme=dark; path=/'});
 const login=await context.request.post('/api/v1/auth/sessions',{headers:{Origin:baseURL},data:{login:'ovload_test_admin',password:fs.readFileSync('/verify/administrator.password','utf8').trim()}});assert.equal(login.status(),200);
 const session=await login.json(),headers={Origin:baseURL,'X-CSRF-Token':session.csrf_token};
 const ids=[],errors=[],prefix=`platform-ui-${Date.now()}`;let page,previewCalls=0;
 const detail=async id=>(await(await context.request.get(`/api/admin/accounts/detail?accountId=${id}`)).json()).data;
 try{
  if(!live)await context.route('**/*',route=>{const u=new URL(route.request().url());if(u.pathname.startsWith('/api/')||u.pathname==='/healthz')return route.continue();const file=path.join('/src/web/dist-platforms',u.pathname==='/accounts'||u.pathname==='/'?'index.html':u.pathname);return fs.existsSync(file)&&fs.statSync(file).isFile()?route.fulfill({path:file}):route.continue()});
  let expectedProvider,expectedBase;
  await context.route('**/api/admin/accounts/models/preview',async route=>{
   previewCalls++;const body=route.request().postDataJSON();assert.equal(body.provider,expectedProvider);assert.equal(body.data.base_url,expectedBase);assert.equal(body.data.api_key,'fixture-preview-key');assert.equal(route.request().method(),'POST');assert.equal(new URL(route.request().url()).search,'');
   return route.fulfill({status:200,contentType:'application/json',body:JSON.stringify({code:200,data:{models:[{id:'fixture-alpha',label:'fixture-alpha'},{id:'fixture-beta',label:'fixture-beta'}]}})});
  });
  page=await context.newPage();page.on('pageerror',e=>errors.push(e.message));await page.goto('/accounts');await expect(page.locator('#account-add')).toBeVisible({timeout:30000});
  for(const [label,provider,url] of [['OpenAI','openai_api','https://api.openai.com/v1'],['Claude','claude','https://api.anthropic.com/v1'],['Gemini','gemini','https://generativelanguage.googleapis.com/v1beta'],['Grok','xai_api','https://api.x.ai/v1']]){
   await page.locator('#account-add').click();const dialog=page.getByRole('dialog');
   await dialog.locator('#account-provider').click();assert.deepEqual(await page.getByRole('option').allTextContents(),['OpenAI','Claude','Gemini','Grok']);await page.getByRole('option',{name:label,exact:true}).click();
   await expect(dialog.getByRole('tab',{name:'OAuth',exact:true})).toHaveAttribute('data-state','active');await expect(dialog.getByRole('button',{name:'同步支持模型',exact:true})).toBeDisabled();
   await dialog.getByRole('tab',{name:'API Key',exact:true}).click();await expect(dialog.getByLabel('Base URL',{exact:true})).toHaveValue(url);
   await dialog.getByLabel('账号',{exact:true}).fill(prefix+'-'+provider);await dialog.getByLabel('API Key',{exact:true}).fill('fixture-preview-key');
   expectedProvider=provider;expectedBase=url;
   await dialog.getByRole('button',{name:'同步支持模型',exact:true}).click();await expect(dialog.getByRole('checkbox',{name:'fixture-beta',exact:true})).toBeChecked();
   if(provider==='openai_api'){
    await dialog.getByLabel('Base URL',{exact:true}).fill(url+'/custom');await expect(dialog.getByRole('checkbox',{name:'fixture-beta',exact:true})).toHaveCount(0);
    expectedBase=url+'/custom';await dialog.getByRole('button',{name:'同步支持模型',exact:true}).click();await expect(dialog.getByRole('checkbox',{name:'fixture-beta',exact:true})).toBeChecked();
    await dialog.getByLabel('Base URL',{exact:true}).fill(url);expectedBase=url;await dialog.getByRole('button',{name:'同步支持模型',exact:true}).click();await expect(dialog.getByRole('checkbox',{name:'fixture-beta',exact:true})).toBeChecked();
   }
   await dialog.getByRole('checkbox',{name:'fixture-beta',exact:true}).uncheck();
   if(provider==='xai_api'){
    await page.screenshot({path:`${out}/${live?'live':'candidate'}-desktop.png`});await page.setViewportSize({width:390,height:844});
    assert.ok(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth+1));await expect(dialog.getByRole('button',{name:'创建账号',exact:true})).toBeInViewport();await page.screenshot({path:`${out}/${live?'live':'candidate'}-mobile.png`});await dialog.locator('#account-models').scrollIntoViewIfNeeded();await page.screenshot({path:`${out}/${live?'live':'candidate'}-mobile-models.png`});
   }
   const saved=page.waitForResponse(r=>r.url().endsWith('/accounts/import')&&r.request().method()==='POST');await dialog.getByRole('button',{name:'创建账号',exact:true}).click();const response=await saved;assert.equal(response.status(),201);const result=(await response.json()).data;ids.push([provider,result.accountIds[0]]);await expect(dialog).not.toBeVisible();
   const account=(await detail(result.accountIds[0])).account;assert.equal(account.provider,provider);assert.equal(account.authenticationKind,'api_key');assert.deepEqual(account.modelAccess,{mode:'allowlist',models:['fixture-alpha']});
   await page.setViewportSize({width:1440,height:1000});
   await page.getByPlaceholder('搜索名称或邮箱').fill(prefix+'-'+provider);await expect(page.getByRole('row').filter({hasText:prefix+'-'+provider})).toContainText(label);
  }
  // Reloading all platform filters must retain the selected platform and include its API accounts.
  for(const [platform,provider] of [['openai','openai_api'],['claude','claude'],['gemini','gemini'],['xai','xai_api']]){
   await page.goto(`/accounts?provider=${platform}&query=${prefix}`);const row=page.getByRole('row').filter({hasText:prefix+'-'+provider});await expect(row).toHaveCount(1);assert.ok(page.url().includes(`provider=${platform}`));
  }
  // Real handler validation, CSRF, and preview must not create persistent records.
  const invalid=await context.request.post('/api/admin/accounts/models/preview',{headers,data:{provider:'xai_api',data:{schema_version:1,name:'preview',base_url:'https://127.0.0.1/v1',api_key:'fixture-key'}}});assert.equal(invalid.status(),400);
  const noCsrf=await context.request.post('/api/admin/accounts/models/preview',{headers:{Origin:baseURL},data:{provider:'xai_api',data:{}}});assert.equal(noCsrf.status(),403);
  assert.equal(previewCalls,6);assert.deepEqual(errors,[]);
  fs.writeFileSync(`${out}/${live?'live':'candidate'}.json`,JSON.stringify({passed:true,previewCalls,checks:['Four platforms with OAuth/API Key','API model preview uses selected upstream and credentials','Changing upstream clears stale models','Selected models persist on all four API adapters','Provider filters survive reload','API previews validate private URLs and require CSRF','Desktop/mobile dialog fit'],errors},null,2));console.log('PASS platform onboarding, model synchronization and API persistence');
 }catch(error){if(page)await page.screenshot({path:`${out}/failure.png`,fullPage:true}).catch(()=>{});throw error}
 finally{for(const [provider,id] of ids){const r=await context.request.post('/api/admin/accounts/delete',{headers,data:{provider,accountIds:[id]}});assert.equal(r.status(),200)}await context.request.delete('/api/admin/v1/auth/session',{headers});await browser.close()}
}
main().catch(e=>{console.error(e);process.exitCode=1});
