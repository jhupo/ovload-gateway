const fs=require('node:fs'),path=require('node:path'),assert=require('node:assert/strict');
const {chromium,expect}=require('node:module').createRequire('/src/web/package.json')('@playwright/test');
const baseURL='https://192.168.2.150:19443',out='/src/test-results/account-dialogs',live=process.argv.includes('live');
(async()=>{
const browser=await chromium.launch({args:['--no-sandbox','--disable-dev-shm-usage']});
const ctx=await browser.newContext({baseURL,ignoreHTTPSErrors:true,viewport:{width:1440,height:1000}});
await ctx.addInitScript(()=>{localStorage.setItem('i18nextLng','zh');document.cookie='vite-ui-theme=dark; path=/'});
const res=await ctx.request.post('/api/v1/auth/sessions',{headers:{Origin:baseURL},data:{login:'ovload_test_admin',password:fs.readFileSync('/verify/administrator.password','utf8').trim()}});assert.equal(res.status(),200);
const session=await res.json();const page=await ctx.newPage();let syncs=0,tests=0,fail=false;const errors=[];page.on('pageerror',e=>errors.push(e.message));
if(!live)await ctx.route('**/*',r=>{const u=new URL(r.request().url());if(u.origin!==baseURL||u.pathname.startsWith('/api/'))return r.continue();let f=path.join('/src/web/dist-account-dialogs',u.pathname);if(!fs.existsSync(f)||!fs.statSync(f).isFile())f='/src/web/dist-account-dialogs/index.html';return r.fulfill({path:f})});
await ctx.route('**/api/admin/accounts/models/refresh',async r=>{syncs++;await r.fulfill({status:fail?502:200,json:fail?{code:502,message:'Model synchronization failed'}:{code:200,data:{models:[{id:'latest-test-model',label:'latest-test-model'}]}}})});
await ctx.route('**/api/admin/accounts/connection-test?*',async r=>{tests++;assert.equal(new URL(r.request().url()).searchParams.get('modelId'),'latest-test-model');await r.fulfill({contentType:'text/event-stream',body:'data: {"type":"content","text":"Hello from selected model"}\n\ndata: {"type":"test_complete","success":true}\n\n'})});
try {
await page.goto('/accounts');const actions=page.locator('button[id^="account-actions-"]:visible');await expect(actions.first()).toBeVisible({timeout:30000});
assert.equal(await page.locator('td button').filter({has:page.locator('[data-testid="account-identity"]')}).count(),0);
await actions.first().click();await expect(page.getByRole('menuitem',{name:'个人信息',exact:true})).toHaveCount(0);await expect(page.getByRole('menuitem',{name:'额度重置',exact:true})).toHaveCount(0);
await page.getByRole('menuitem',{name:'用量详情',exact:true}).click();await expect(page.getByRole('dialog')).toBeVisible();await expect(page.getByRole('dialog').getByRole('tablist')).toHaveCount(0);await page.screenshot({path:out+'/usage.png'});await page.keyboard.press('Escape');
await actions.first().click();await page.getByRole('menuitem',{name:'连接测试',exact:true}).click();const d=page.getByRole('dialog');await expect(d.getByRole('combobox')).toHaveText('latest-test-model');assert.equal(await d.locator('input').count(),0);await d.getByRole('button',{name:'连接测试',exact:true}).click();await expect(d.getByRole('status')).toContainText('Hello from selected model');assert.equal(tests,1);assert.equal(syncs,1);await page.screenshot({path:out+'/connection.png'});
await page.setViewportSize({width:390,height:844});assert.ok(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth+1));await page.screenshot({path:out+'/mobile.png'});await page.keyboard.press('Escape');
await page.setViewportSize({width:1440,height:1000});
for(const provider of ['openai','claude','gemini','xai']){
 await ctx.route('**/api/admin/accounts?*',async r=>{const response=await r.fetch(),payload=await response.json();payload.data.items[0].authenticationKind='oauth';payload.data.items[0].provider=provider;Object.assign(payload.data.items[0].capabilities,{profile:true,subscription:true,resetCredits:true});await r.fulfill({response,json:payload})});
 await page.reload();await expect(actions.first()).toBeVisible();await actions.first().click();await expect(page.getByRole('menuitem',{name:'个人信息',exact:true})).toBeVisible();await expect(page.getByRole('menuitem',{name:'额度重置',exact:true})).toBeVisible();await page.keyboard.press('Escape');await ctx.unroute('**/api/admin/accounts?*');
}
await page.reload();await expect(actions.first()).toBeVisible();
fail=true;await page.setViewportSize({width:1440,height:1000});await actions.first().click();await page.getByRole('menuitem',{name:'连接测试',exact:true}).click();await expect(page.getByText('Model synchronization failed',{exact:true})).toBeVisible();await expect(d.getByRole('button',{name:'连接测试',exact:true})).toBeDisabled();assert.equal(syncs,2);assert.deepEqual(errors,[]);
fs.writeFileSync(out+'/'+(live?'live':'candidate')+'.json',JSON.stringify({passed:true,syncs,tests,errors}));
}finally{await ctx.request.delete('/api/admin/v1/auth/session',{headers:{Origin:baseURL,'X-CSRF-Token':session.csrf_token}});await browser.close()}
})().catch(e=>{console.error(e);process.exitCode=1});
