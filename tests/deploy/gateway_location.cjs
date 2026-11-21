const fs=require('node:fs'),path=require('node:path'),assert=require('node:assert/strict');
const {createRequire}=require('node:module');const {chromium,expect}=createRequire('/src/web/package.json')('@playwright/test');
const z=require('/src/web/src/i18n/locales/zh.json'),c=require('/src/web/src/i18n/locales/zh-gateway-codex.json'),p=require('/src/web/src/i18n/locales/zh-gateway-profiles.json'),m=require('/src/web/src/i18n/locales/zh-gateway-models.json');
const base='https://192.168.2.150:19444',out='/src/test-results/gateway-location',assets=out+'/web-dist';
(async()=>{fs.mkdirSync(out,{recursive:true});const browser=await chromium.launch({headless:true,args:['--no-sandbox']});const ctx=await browser.newContext({baseURL:base,ignoreHTTPSErrors:true,viewport:{width:1440,height:900}});const errors=[];let session;
try{
await ctx.addInitScript(()=>localStorage.setItem('i18nextLng','zh'));let r=await ctx.request.post('/api/v1/auth/sessions',{headers:{Origin:base},data:{login:'ovload_gateway_ui_verify',password:fs.readFileSync('/test-runtime/administrator.password','utf8').trim()}});assert.equal(r.status(),200);session=await r.json();
await ctx.route('**/*',async route=>{const req=route.request(),u=new URL(req.url());if(u.origin!==base||u.pathname.startsWith('/api/')||u.pathname.startsWith('/v1/'))return route.continue();const f=req.isNavigationRequest()?assets+'/index.html':path.resolve(assets,'.'+u.pathname);if(!f.startsWith(assets+'/')||!fs.existsSync(f))return route.continue();const types={'.js':'application/javascript','.css':'text/css','.html':'text/html'};return route.fulfill({path:f,contentType:types[path.extname(f)]||'application/octet-stream'})});
const page=await ctx.newPage();page.on('pageerror',e=>errors.push(e.message));await page.goto('/gateway-settings');await expect(page.locator('input[name=refreshMarginSeconds]')).toBeEnabled();
const tab=name=>page.getByRole('tab',{name,exact:true});
const observed=page.waitForResponse(r=>r.url().endsWith('/api/admin/settings/location'),{timeout:40000});
await tab(z.gatewaySettings.codex).click();
for(const name of ['accountWarmupModel','minCodexDesktopVersion','minCodexCliVersion','profile-openai-codexVersion']) await expect(page.locator('input[name="'+name+'"]')).toHaveCount(0);
await expect(page.getByRole('combobox',{name:p.mode,exact:true})).toHaveCount(0);
await expect(page.getByRole('combobox',{name:p.versionMode,exact:true})).toHaveCount(0);
const locationResponse=await observed;assert.equal(locationResponse.status(),200);const location=(await locationResponse.json()).data;
for(const key of ['country','region','city','timezone']) {
 const input=page.locator('input[name="requestLocation.'+key+'"]');
 await expect(input).toHaveAttribute('readonly','');
 await expect(input).toHaveValue(location.status==='detected'?location.location[key]:'');
}
await expect(page.getByRole('combobox',{name:p.versionLag,exact:true})).toBeEnabled();
await page.getByRole('combobox',{name:p.client,exact:true}).click();
await page.getByRole('option',{name:p.cli,exact:true}).click();
await page.getByRole('button',{name:p.preview,exact:true}).click();await expect(page.getByRole('dialog')).toBeVisible();await expect(page.getByTestId('profile-openai-preview')).toBeVisible();await page.keyboard.press('Escape');
const override=page.getByRole('switch',{name:c.requestLocationEnabled,exact:true});const wasEnabled=await override.isChecked();await override.click();
const response=page.waitForResponse(r=>r.url().endsWith('/settings/update'));
await page.getByRole('button',{name:z.gatewaySettings.save,exact:true}).click();
const saved=await response;assert.equal(saved.status(),200);const settings=(await saved.json()).data;
assert.equal(settings.requestLocationEnabled,!wasEnabled);assert.equal(settings.accountWarmupEnabled,false);assert.equal(settings.providerRequestProfiles.openai.client,'cli');assert.equal(settings.providerRequestProfiles.openai.versionMode,'latest');assert.equal(settings.providerRequestProfiles.openai.codexVersion,null);assert.equal(settings.providerRequestProfiles.openai.mode,undefined);
for(const width of [1440,390,320]){await page.setViewportSize({width,height:900});assert(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth+1&&document.documentElement.scrollHeight<=innerHeight+1));await page.screenshot({path:out+'/codex-'+width+'.png'})}
await page.reload();await tab(z.gatewaySettings.codex).click();await expect(page.getByRole('combobox',{name:p.client,exact:true})).toContainText(p.cli);
const fixture={country:'JP',region:'Tokyo',city:'Tokyo',timezone:'Asia/Tokyo'};
await page.route('**/api/admin/settings/location',route=>route.fulfill({json:{code:200,message:'ok',data:{status:'detected',location:fixture}}}));
await page.reload();await tab(z.gatewaySettings.codex).click();
for(const [key,value] of Object.entries(fixture)) await expect(page.locator('input[name="requestLocation.'+key+'"]')).toHaveValue(value);
assert.deepEqual(errors,[]);fs.writeFileSync(out+'/result.json',JSON.stringify({passed:true,locationStatus:location.status,checks:['automatic server egress lookup','four read-only location fields','removed warmup and version strategy','preset identity preview dialog','save/reload latest preset','warmup disabled on save','three responsive layouts'],errors},null,2));console.log('PASS Codex location and identity workflows; local location: '+location.status);
}catch(e){console.error(e);process.exitCode=1;const pages=ctx.pages();if(pages.length)await pages.at(-1).screenshot({path:out+'/failure.png'}).catch(()=>{});}finally{if(session)await ctx.request.delete('/api/admin/v1/auth/session',{headers:{Origin:base,'X-CSRF-Token':session.csrf_token}});await browser.close()}})();
