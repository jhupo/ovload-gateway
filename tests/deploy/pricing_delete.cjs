const fs=require('node:fs'),path=require('node:path'),assert=require('node:assert/strict');
const {createRequire}=require('node:module');const {chromium,expect}=createRequire('/src/web/package.json')('@playwright/test');
const z=require('/src/web/src/i18n/locales/zh.json'),c=require('/src/web/src/i18n/locales/zh-gateway-codex.json'),p=require('/src/web/src/i18n/locales/zh-gateway-profiles.json'),m=require('/src/web/src/i18n/locales/zh-gateway-models.json');
const base='https://192.168.2.150:19444',out='/src/test-results/pricing-delete',assets=out+'/web-dist';
(async()=>{fs.mkdirSync(out,{recursive:true});const browser=await chromium.launch({headless:true,args:['--no-sandbox']});const ctx=await browser.newContext({baseURL:base,ignoreHTTPSErrors:true,viewport:{width:1440,height:900}});const errors=[];let session;
try{
await ctx.addInitScript(()=>localStorage.setItem('i18nextLng','zh'));let r=await ctx.request.post('/api/v1/auth/sessions',{headers:{Origin:base},data:{login:'ovload_gateway_ui_verify',password:fs.readFileSync('/test-runtime/administrator.password','utf8').trim()}});assert.equal(r.status(),200);session=await r.json();
await ctx.route('**/*',async route=>{const req=route.request(),u=new URL(req.url());if(u.origin!==base||u.pathname.startsWith('/api/')||u.pathname.startsWith('/v1/'))return route.continue();const f=req.isNavigationRequest()?assets+'/index.html':path.resolve(assets,'.'+u.pathname);if(!f.startsWith(assets+'/')||!fs.existsSync(f))return route.continue();const types={'.js':'application/javascript','.css':'text/css','.html':'text/html'};return route.fulfill({path:f,contentType:types[path.extname(f)]||'application/octet-stream'})});
const page=await ctx.newPage();page.on('pageerror',e=>errors.push(e.message));await page.goto('/gateway-settings');await expect(page.locator('input[name=refreshMarginSeconds]')).toBeEnabled();
const tab=name=>page.getByRole('tab',{name,exact:true});await tab(z.gatewaySettings.modelPricing).click();
const model='gpt-5.4';const search=page.getByRole('textbox',{name:z.modelPricing.search,exact:true});await search.fill(model);
const name=m.deleteNamed.replace('{{model}}',model);await expect(page.getByRole('button',{name,exact:true})).toBeEnabled();
await expect(page.getByText(z.modelPricing.bands.standard+' / '+z.modelPricing.unit,{exact:true})).toHaveCount(0);
await page.getByRole('button',{name,exact:true}).click();await expect(page.getByRole('alertdialog')).toBeVisible();
const deletedResponse=page.waitForResponse(r=>r.url().endsWith('/settings/pricing/update'));await page.getByRole('alertdialog').getByRole('button',{name:m.delete,exact:true}).click();assert.equal((await deletedResponse).status(),200);await expect(page.getByRole('alertdialog')).toHaveCount(0);await expect(page.getByRole('button',{name,exact:true})).toHaveCount(0);
let catalog=(await(await ctx.request.get('/api/admin/settings/pricing')).json()).data;assert.equal(catalog.overrides.openai[model].deleted,true);assert.deepEqual(catalog.overrides.openai[model].bands,{});
const headers={Origin:base,'X-CSRF-Token':session.csrf_token};
const reset=await ctx.request.post('/api/admin/settings/pricing/update',{headers,data:{provider:'openai',models:[model],change:{action:'reset'}}});assert.equal(reset.status(),400);
await page.reload();await tab(z.gatewaySettings.modelPricing).click();await page.getByRole('textbox',{name:z.modelPricing.search,exact:true}).fill(model);await expect(page.getByRole('button',{name,exact:true})).toHaveCount(0);
await page.getByRole('button',{name:z.modelPricing.add,exact:true}).click();const dialog=page.getByRole('dialog');
await expect(dialog.getByText(z.modelPricing.unit,{exact:true})).toHaveCount(0);
await dialog.getByRole('combobox',{name:z.modelPricing.provider,exact:true}).click();await page.getByRole('option',{name:z.procurementPricing.providers.openai,exact:true}).click();
await dialog.getByRole('textbox',{name:z.modelPricing.model,exact:true}).fill(model);
for(const [key,value] of Object.entries({input:'2.5',output:'15',cacheRead:'0.25',cacheWrite:'0'}))await dialog.getByRole('textbox',{name:z.modelPricing[key],exact:true}).fill(value);
const restoredResponse=page.waitForResponse(r=>r.url().endsWith('/settings/pricing/update'));await dialog.getByRole('button',{name:m.save,exact:true}).click();assert.equal((await restoredResponse).status(),200);await expect(dialog).toHaveCount(0);await expect(page.getByRole('button',{name,exact:true})).toBeEnabled();
catalog=(await(await ctx.request.get('/api/admin/settings/pricing')).json()).data;assert.notEqual(catalog.overrides.openai[model].deleted,true);assert.equal(catalog.overrides.openai[model].bands.standard.input,'2.5');
// Leave one deletion in the isolated DB to verify persistence across a restart.
assert.equal((await ctx.request.post('/api/admin/settings/pricing/update',{headers,data:{provider:'openai',models:[model],change:{action:'delete'}}})).status(),200);
for(const width of [1440,390,320]){await page.setViewportSize({width,height:900});assert(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth+1&&document.documentElement.scrollHeight<=innerHeight+1));await page.screenshot({path:out+'/pricing-'+width+'.png'})}
assert.deepEqual(errors,[]);fs.writeFileSync(out+'/result.json',JSON.stringify({passed:true,deletedModel:model,checks:['delete built-in price','persistent marker with empty rates','reset cannot revive deleted price','reload hides deleted price','re-add price through editor','no unit explanations','three responsive layouts'],errors},null,2));console.log('PASS built-in pricing delete, reload and reprice');
}catch(e){console.error(e);process.exitCode=1;const pages=ctx.pages();if(pages.length)await pages.at(-1).screenshot({path:out+'/failure.png'}).catch(()=>{});}finally{if(session)await ctx.request.delete('/api/admin/v1/auth/session',{headers:{Origin:base,'X-CSRF-Token':session.csrf_token}});await browser.close()}})();
