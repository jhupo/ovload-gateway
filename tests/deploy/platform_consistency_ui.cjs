const fs=require('node:fs'),path=require('node:path'),assert=require('node:assert/strict');
const {createRequire}=require('node:module');
const {chromium,expect}=createRequire('/src/web/package.json')('@playwright/test');
const baseURL='https://192.168.2.150:19443',out='/src/test-results/platform-consistency',live=process.argv.includes('live');
const labels=['OpenAI','Claude','Gemini','Grok'];
async function main(){
 const browser=await chromium.launch({args:['--no-sandbox','--disable-dev-shm-usage']});
 const context=await browser.newContext({baseURL,ignoreHTTPSErrors:true,locale:'zh-CN',viewport:{width:1440,height:1000}});
 await context.addInitScript(()=>{localStorage.setItem('i18nextLng','zh');document.cookie='vite-ui-theme=dark; path=/'});
 const login=await context.request.post('/api/v1/auth/sessions',{headers:{Origin:baseURL},data:{login:'ovload_test_admin',password:fs.readFileSync('/verify/administrator.password','utf8').trim()}});assert.equal(login.status(),200);
 const session=await login.json(),headers={Origin:baseURL,'X-CSRF-Token':session.csrf_token};
 const page=await context.newPage(),errors=[];page.on('pageerror',e=>errors.push(e.message));
 if(!live)await context.route('**/*',route=>{
  const url=new URL(route.request().url());if(url.origin!==baseURL||url.pathname.startsWith('/api/')||url.pathname==='/healthz')return route.continue();
  const candidate=path.join('/src/web/dist-platform-consistency',url.pathname);
  const file=fs.existsSync(candidate)&&fs.statSync(candidate).isFile()?candidate:'/src/web/dist-platform-consistency/index.html';return route.fulfill({path:file});
 });
 // Read-only response fixtures ensure both adapter prices exist, without changing saved pricing.
 await context.route('**/api/admin/settings/pricing',async route=>{
  const response=await route.fetch(),payload=await response.json();
  for(const provider of ['openai','openai_api']){
   payload.data.overrides[provider]??={};payload.data.overrides[provider]['platform-filter-fixture']={multiplierBps:10000,bands:{standard:{input:'1',output:'2',cacheRead:'0.1',cacheWrite:'0.2'}}};
  }
  await route.fulfill({response,json:payload});
 });
 async function selectOptions(trigger,expected){await trigger.click();assert.deepEqual(await page.getByRole('option').allTextContents(),expected);await page.keyboard.press('Escape')}
 async function snap(name){await page.screenshot({path:`${out}/${live?'live':'candidate'}-${name}.png`})}
 try{
  await page.goto('/accounts');await expect(page.locator('#account-add')).toBeVisible({timeout:30000});await page.locator('#account-add').click();
  await selectOptions(page.locator('#account-provider'),labels);
  const dialog=page.getByRole('dialog');await dialog.getByRole('tab',{name:'API Key',exact:true}).click();await expect(dialog.getByLabel('Base URL',{exact:true})).toHaveValue('https://api.openai.com/v1');
  await page.setViewportSize({width:390,height:844});assert.ok(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth+1));await snap('account-mobile');
  await page.setViewportSize({width:1440,height:1000});await page.goto('/groups');
  await page.getByRole('button',{name:'创建分组',exact:true}).click();await selectOptions(page.locator('#group-platform'),['不限平台',...labels]);await snap('group');
  await page.goto('/usage');await page.getByRole('button',{name:'厂商',exact:true}).click();
  const usageOptions=await page.getByRole('option').allTextContents();for(const label of labels)assert.ok(usageOptions.some(x=>x===label),usageOptions);assert.ok(!usageOptions.some(x=>/Codex|OpenAI API|Grok Build/.test(x)));await snap('usage-filter');await page.keyboard.press('Escape');
  const usageResponse=page.waitForResponse(r=>r.url().includes('/api/admin/usage/records?')&&new URL(r.url()).searchParams.get('provider')==='openai');
  await page.getByRole('button',{name:'厂商',exact:true}).click();await page.getByRole('option',{name:'OpenAI',exact:true}).click();assert.equal((await usageResponse).status(),200);
  await page.goto('/monitoring');await selectOptions(page.getByRole('combobox',{name:'供应商',exact:true}),['全部供应商',...labels]);
  await page.getByRole('combobox',{name:'供应商',exact:true}).click();await page.getByRole('option',{name:'Grok',exact:true}).click();await snap('monitoring');
  await page.goto('/gateway-settings');await page.getByRole('tab',{name:'模型定价',exact:true}).click();await page.getByRole('button',{name:'添加模型定价',exact:true}).click();
  const price=page.getByRole('dialog');await selectOptions(price.getByRole('combobox',{name:'厂商',exact:true}),labels);
  await expect(price.getByRole('combobox',{name:'接入方式',exact:true})).toHaveText('API Key');
  await selectOptions(price.getByRole('combobox',{name:'接入方式',exact:true}),['OAuth','API Key']);
  await price.getByRole('combobox',{name:'厂商',exact:true}).click();await page.getByRole('option',{name:'Claude',exact:true}).click();await expect(price.getByRole('combobox',{name:'接入方式',exact:true})).toHaveCount(0);
  await price.getByRole('combobox',{name:'厂商',exact:true}).click();await page.getByRole('option',{name:'Grok',exact:true}).click();await expect(price.getByRole('combobox',{name:'接入方式',exact:true})).toHaveText('OAuth');
  await price.getByRole('combobox',{name:'接入方式',exact:true}).click();await page.getByRole('option',{name:'API Key',exact:true}).click();await snap('price');
  await page.setViewportSize({width:390,height:844});assert.ok(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth+1));await snap('price-mobile');
  await price.getByRole('button',{name:'取消',exact:true}).click();await page.setViewportSize({width:1440,height:1000});
  await page.getByPlaceholder('搜索模型名称',{exact:true}).fill('platform-filter-fixture');
  await page.getByRole('button',{name:'厂商',exact:true}).click();const priceOptions=await page.getByRole('option').allTextContents();assert.equal(priceOptions.filter(x=>x.startsWith('OpenAI')).length,1);await page.getByRole('option',{name:/^OpenAI/}).click();await page.keyboard.press('Escape');
  await expect(page.getByRole('cell',{name:'OpenAI · OAuth',exact:true}).first()).toBeVisible();await expect(page.getByRole('cell',{name:'OpenAI · API Key',exact:true}).first()).toBeVisible();await snap('price-filter');
  assert.deepEqual(errors,[]);fs.writeFileSync(`${out}/${live?'live':'candidate'}.json`,JSON.stringify({passed:true,checks:['Four platform options shared across account/group/usage/monitoring/pricing','API defaults preserved','Platform filters reach real API','Price editor preserves access method and native shared pricing','OpenAI price filter includes both adapters','Desktop and mobile layout'],errors},null,2));console.log('PASS shared platform UI across account, group, usage, monitoring and pricing');
 }catch(error){await page.screenshot({path:out+'/failure.png',fullPage:true}).catch(()=>{});throw error}
 finally{await context.request.delete('/api/admin/v1/auth/session',{headers});await browser.close()}
}
main().catch(e=>{console.error(e);process.exitCode=1});
