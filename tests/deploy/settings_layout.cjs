const fs=require('node:fs'),path=require('node:path'),assert=require('node:assert/strict');
const {createRequire}=require('node:module');const {chromium,expect}=createRequire('/src/web/package.json')('@playwright/test');
const z=require('/src/web/src/i18n/locales/zh.json'),c=require('/src/web/src/i18n/locales/zh-gateway-codex.json'),p=require('/src/web/src/i18n/locales/zh-gateway-profiles.json'),m=require('/src/web/src/i18n/locales/zh-gateway-models.json');
const base='https://192.168.2.150:19444',out='/src/test-results/settings-layout',assets=out+'/web-dist';
(async()=>{fs.mkdirSync(out,{recursive:true});const browser=await chromium.launch({headless:true,args:['--no-sandbox']});const ctx=await browser.newContext({baseURL:base,ignoreHTTPSErrors:true,viewport:{width:1440,height:900}});const errors=[];let session;
try{
await ctx.addInitScript(()=>localStorage.setItem('i18nextLng','zh'));let r=await ctx.request.post('/api/v1/auth/sessions',{headers:{Origin:base},data:{login:'ovload_gateway_ui_verify',password:fs.readFileSync('/test-runtime/administrator.password','utf8').trim()}});assert.equal(r.status(),200);session=await r.json();
await ctx.route('**/*',async route=>{const req=route.request(),u=new URL(req.url());if(u.origin!==base||u.pathname.startsWith('/api/')||u.pathname.startsWith('/v1/'))return route.continue();const f=req.isNavigationRequest()?assets+'/index.html':path.resolve(assets,'.'+u.pathname);if(!f.startsWith(assets+'/')||!fs.existsSync(f))return route.continue();const types={'.js':'application/javascript','.css':'text/css','.html':'text/html'};return route.fulfill({path:f,contentType:types[path.extname(f)]||'application/octet-stream'})});

const page=await ctx.newPage();page.on('pageerror',e=>errors.push(e.message));const checks=[];
await page.goto('/gateway-settings');await expect(page.locator('#scheduling-rotation')).toBeEnabled();
await expect(page.getByRole('tab',{name:z.realGatewaySettings.scheduling,exact:true})).toHaveCount(0);
await expect(page.locator('input[name=maxAccountRotations]')).toBeVisible();checks.push('account scheduling is in basic settings');
await page.getByRole('tab',{name:z.gatewaySettings.modelPricing,exact:true}).click();const model='gpt-5.4';
await page.getByRole('textbox',{name:z.modelPricing.search,exact:true}).fill(model);
await page.getByRole('button',{name:z.modelPricing.editEntry+' '+model,exact:true}).click();
const dialog=page.getByRole('dialog'),band=dialog.getByRole('combobox',{name:z.modelPricing.band,exact:true});
await expect(dialog.getByRole('combobox',{name:z.modelPricing.addBand,exact:true})).toHaveCount(0);
await expect(dialog.getByPlaceholder(z.modelPricing.unconfigured,{exact:true})).toHaveCount(0);
await band.click();await page.getByRole('option',{name:z.modelPricing.bands.standard,exact:true}).click();
const standard=await dialog.getByRole('textbox',{name:z.modelPricing.input,exact:true}).inputValue();
for(const width of [1440,390]) {
 await page.setViewportSize({width,height:900});const a=await band.boundingBox(),b=await dialog.getByRole('button',{name:z.modelPricing.removeBand,exact:true}).boundingBox();
 assert(a&&b);assert(Math.abs(a.y-b.y)<1&&Math.abs(a.height-b.height)<1,JSON.stringify({a,b}));assert(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth+1));
 await page.screenshot({path:out+'/price-editor-'+width+'.png'});
}
checks.push('price selector and remove button aligned at 1440px and 390px');
const catalog=(await(await ctx.request.get('/api/admin/settings/pricing')).json()).data;
const configured={...catalog.defaults.openai[model].bands,...catalog.synced.openai?.[model]?.bands,...catalog.overrides.openai?.[model]?.bands};
const next=['image','long_ultrafast','ultrafast','long_flex','long_fast','flex','fast'].find(key=>!configured[key]);assert(next);
async function select(key){await band.click();await page.getByRole('option',{name:z.modelPricing.bands[key],exact:true}).click()}
await select(next);await expect(dialog.getByRole('textbox',{name:z.modelPricing.input,exact:true})).toHaveValue('');
const prices={input:'1.23',output:'4.56',cacheRead:'0.12',cacheWrite:'0.34'};
for(const [key,value] of Object.entries(prices))await dialog.getByRole('textbox',{name:z.modelPricing[key],exact:true}).fill(value);
await select('standard');await expect(dialog.getByRole('textbox',{name:z.modelPricing.input,exact:true})).toHaveValue(standard);
await select(next);await expect(dialog.getByRole('textbox',{name:z.modelPricing.input,exact:true})).toHaveValue(prices.input);
await dialog.getByRole('button',{name:z.modelPricing.removeBand,exact:true}).click();await select(next);
await expect(dialog.getByRole('textbox',{name:z.modelPricing.input,exact:true})).toHaveValue('');
for(const [key,value] of Object.entries(prices))await dialog.getByRole('textbox',{name:z.modelPricing[key],exact:true}).fill(value);
const saved=page.waitForResponse(r=>r.url().endsWith('/settings/pricing/update'));await dialog.getByRole('button',{name:m.save,exact:true}).click();assert.equal((await saved).status(),200);await expect(dialog).toHaveCount(0);
const actual=(await(await ctx.request.get('/api/admin/settings/pricing')).json()).data.overrides.openai[model].bands;assert.deepEqual(actual[next],prices);assert.equal(actual.standard.input,standard);
checks.push('single selector adds, switches and removes bands without losing edits; saved to backend');
await page.setViewportSize({width:1440,height:900});await page.goto('/data-backup');await page.getByRole('tab',{name:z.dataBackup.scheduleTab,exact:true}).click();
await expect(page.getByRole('columnheader',{name:z.dataBackup.expiresAt,exact:true})).toBeAttached();
await expect(page.locator('main').getByText(/Asia\/Shanghai/)).toHaveCount(0);checks.push('backup headers omit timezone suffixes');
await page.goto('/security-authentication');await page.getByRole('tab',{name:'快捷登录',exact:true}).click();
await expect(page.getByText('待配置',{exact:true})).toHaveCount(0);await expect(page.getByText('密钥已配置',{exact:true})).toHaveCount(0);checks.push('OAuth setup badges removed');
assert.deepEqual(errors,[]);fs.writeFileSync(out+'/result.json',JSON.stringify({passed:true,checks,errors},null,2));console.log('PASS '+checks.join('; '));
}catch(e){console.error(e);process.exitCode=1;const pages=ctx.pages();if(pages.length)await pages.at(-1).screenshot({path:out+'/failure.png'}).catch(()=>{});}finally{if(session)await ctx.request.delete('/api/admin/v1/auth/session',{headers:{Origin:base,'X-CSRF-Token':session.csrf_token}});await browser.close()}})();
