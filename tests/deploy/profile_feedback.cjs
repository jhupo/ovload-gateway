const fs=require('node:fs'),path=require('node:path'),assert=require('node:assert/strict');
const {createRequire}=require('node:module');const {chromium,expect}=createRequire('/src/web/package.json')('@playwright/test');
const z=require('/src/web/src/i18n/locales/zh.json'),c=require('/src/web/src/i18n/locales/zh-gateway-codex.json'),p=require('/src/web/src/i18n/locales/zh-gateway-profiles.json'),m=require('/src/web/src/i18n/locales/zh-gateway-models.json');
const base='https://192.168.2.150:19444',out='/src/test-results/profile-feedback',assets=out+'/web-dist';
(async()=>{fs.mkdirSync(out,{recursive:true});const browser=await chromium.launch({headless:true,args:['--no-sandbox']});const ctx=await browser.newContext({baseURL:base,ignoreHTTPSErrors:true,viewport:{width:1440,height:900}});const errors=[];let session;
try{
await ctx.addInitScript(()=>localStorage.setItem('i18nextLng','zh'));let r=await ctx.request.post('/api/v1/auth/sessions',{headers:{Origin:base},data:{login:'ovload_gateway_ui_verify',password:fs.readFileSync('/test-runtime/administrator.password','utf8').trim()}});assert.equal(r.status(),200);session=await r.json();
await ctx.route('**/*',async route=>{const req=route.request(),u=new URL(req.url());if(u.origin!==base||u.pathname.startsWith('/api/')||u.pathname.startsWith('/v1/'))return route.continue();const f=req.isNavigationRequest()?assets+'/index.html':path.resolve(assets,'.'+u.pathname);if(!f.startsWith(assets+'/')||!fs.existsSync(f))return route.continue();const types={'.js':'application/javascript','.css':'text/css','.html':'text/html'};return route.fulfill({path:f,contentType:types[path.extname(f)]||'application/octet-stream'})});

const page=await ctx.newPage();page.on('pageerror',e=>errors.push(e.message));
const checks=[];
for(const provider of ['openai','xai']) {
 const response=await ctx.request.get('/api/admin/settings/client-profiles/'+provider);
 assert.equal(response.status(),200); const payload=await response.json();assert(payload.data.globalConfiguration);checks.push(provider+' actual options endpoint 200');
}
await page.goto('/gateway-settings');await expect(page.locator('input[name=refreshMarginSeconds]')).toBeEnabled();
const tab=()=>page.getByRole('tab',{name:'xAI 设置',exact:true});await tab().click();
await expect(page.getByRole('combobox',{name:p.targetOs,exact:true})).toBeEnabled();
await page.route('**/api/admin/settings/client-profiles/xai',route=>route.abort('failed'));
await page.route('**/api/v1/site-settings',route=>route.abort('failed'));
await page.reload();await tab().click();
const notifications=page.locator('[data-sonner-toaster][data-x-position=right][data-y-position=bottom]');
await expect(notifications.getByText(p.loadFailed,{exact:true})).toBeVisible();
await expect(page.locator('main').getByText(p.loadFailed,{exact:true})).toHaveCount(0);
await expect(page.getByText('Failed to fetch',{exact:true})).toHaveCount(0);
await expect(page.getByRole('button',{name:z.siteIdentity.retry,exact:true})).toHaveCount(0);
await expect(page.locator('[data-slot=sidebar-header]').getByText(z.siteIdentity.unavailable,{exact:true})).toHaveCount(0);
checks.push('network failure appears only in bottom-right toast; sidebar retry and inline error removed');
await page.screenshot({path:out+'/xai-error.png'});
await page.unroute('**/api/admin/settings/client-profiles/xai');await page.unroute('**/api/v1/site-settings');
await page.reload();await tab().click();await expect(page.getByRole('combobox',{name:p.targetOs,exact:true})).toBeEnabled();
await page.route('**/api/admin/settings/client-profiles/xai/preview',route=>route.abort('failed'));
await page.getByRole('button',{name:p.preview,exact:true}).click();
await expect(notifications.getByText(p.previewFailed,{exact:true})).toBeVisible();
await expect(page.locator('main').getByText(p.previewFailed,{exact:true})).toHaveCount(0);checks.push('preview failure toast');
await page.unroute('**/api/admin/settings/client-profiles/xai/preview');
// Representative list, settings, and pricing requests fail without inserting page banners.
for(const [url,api] of [['/accounts','**/api/admin/accounts?**'],['/data-backup','**/api/admin/settings/backups'],['/gateway-settings','**/api/admin/settings/pricing']]) {
 const marker='request-failure-'+checks.length;
 await page.route(api,route=>route.fulfill({status:503,contentType:'application/json',body:JSON.stringify({code:503,message:marker})}));
 await page.goto(url);
 if(url==='/gateway-settings')await page.getByRole('tab',{name:z.gatewaySettings.modelPricing,exact:true}).click();
 await expect(notifications.getByText(marker,{exact:true})).toBeVisible({timeout:30000});
 await expect(page.locator('main').getByText(marker,{exact:true})).toHaveCount(0);
 checks.push(url+' error only in toast');await page.unroute(api);
 if(url==='/gateway-settings') {
   await notifications.getByRole('button',{name:z.identity.retry,exact:true}).click();
   await expect(page.getByRole('button',{name:z.modelPricing.add,exact:true})).toBeEnabled();
   await expect(notifications.getByText(marker,{exact:true})).toHaveCount(0);checks.push('toast retry restores pricing');
 }
}
await page.goto('/gateway-settings');await tab().click();
for(const width of [1440,390]) {await page.setViewportSize({width,height:900});assert(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth+1));await page.screenshot({path:out+'/xai-'+width+'.png'})}
assert.deepEqual(errors,[]);fs.writeFileSync(out+'/result.json',JSON.stringify({passed:true,checks,errors},null,2));console.log('PASS '+checks.join('; '));
}catch(e){console.error(e);process.exitCode=1;const pages=ctx.pages();if(pages.length)await pages.at(-1).screenshot({path:out+'/failure.png'}).catch(()=>{});}finally{if(session)await ctx.request.delete('/api/admin/v1/auth/session',{headers:{Origin:base,'X-CSRF-Token':session.csrf_token}});await browser.close()}})();
