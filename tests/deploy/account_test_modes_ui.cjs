const fs=require('node:fs'),path=require('node:path'),assert=require('node:assert/strict');
const {chromium,expect}=require('node:module').createRequire('/src/web/package.json')('@playwright/test');
const baseURL='https://192.168.2.150:19443',out='/src/test-results/account-test-modes',live=process.argv.includes('--live');
(async()=>{
 const browser=await chromium.launch({args:['--no-sandbox','--disable-dev-shm-usage']});
 const ctx=await browser.newContext({baseURL,ignoreHTTPSErrors:true,timezoneId:'Asia/Shanghai',viewport:{width:1920,height:1080}});
 await ctx.addInitScript(()=>localStorage.setItem('i18nextLng','zh'));
 const res=await ctx.request.post('/api/v1/auth/sessions',{headers:{Origin:baseURL},data:{login:'ovload_test_admin',password:fs.readFileSync('/verify/administrator.password','utf8').trim()}});if(res.status()!==200){await browser.close();throw Error('Login '+res.status())}
 const session=await res.json(),headers={Origin:baseURL,'X-CSRF-Token':session.csrf_token};
 if(!live)await ctx.route('**/*',r=>{const u=new URL(r.request().url());if(u.origin!==baseURL||u.pathname.startsWith('/api/'))return r.continue();let f=path.join('/src/web/dist-account-test-modes',u.pathname);if(!fs.existsSync(f)||!fs.statSync(f).isFile())f='/src/web/dist-account-test-modes/index.html';return r.fulfill({path:f});});
 const page=await ctx.newPage(),errors=[],checks=[],tests=[];page.on('pageerror',e=>errors.push(e.message));page.on('response',async r=>{if(r.url().endsWith('/api/admin/accounts/connection-test')){try{const events=(await r.text()).split('\n').filter(l=>l.startsWith('data:')).map(l=>JSON.parse(l.slice(5))).filter(e=>e.type==='error').map(e=>({error:e.error,status:e.upstreamStatus,code:e.providerErrorCode,type:e.providerErrorType,sendState:e.sendState}));if(events.length)console.log(JSON.stringify({upstreamErrors:events}));}catch{}}});
 const dialog=()=>page.getByRole('dialog'),oauth='acct_01a1daf7af217688b3e6a31c4a0ea9e2';
 const actions=id=>page.locator(`#account-actions-${id}:visible`);
 const row=id=>page.getByRole('row').filter({has:page.locator(`#account-actions-${id}`)});
 async function open(id,item){await actions(id).click();await page.getByRole('menuitem',{name:item,exact:true}).click();await expect(dialog()).toBeVisible();}
 async function close(){await page.keyboard.press('Escape');await expect(dialog()).toHaveCount(0);}
 async function shot(name){assert.ok(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth+1));await page.screenshot({path:`${out}/${live?'live-':''}${name}.png`});}
 try{
  const directory=(await(await ctx.request.get('/api/admin/accounts')).json()).data.items;
  await page.goto('/accounts');await expect(actions(oauth)).toBeVisible({timeout:30000});
  await expect(page.getByRole('columnheader',{name:'用量窗口',exact:true})).toBeVisible();
  await expect(page.getByRole('columnheader',{name:'操作',exact:true})).toBeVisible();
  await expect(row(oauth).getByRole('progressbar')).toHaveCount(2);
  await expect(row(oauth).getByText(/5.*小时.*额度/)).toBeVisible();await expect(row(oauth).getByText('周额度',{exact:true})).toBeVisible();
  for(const label of ['编辑账号','删除账号','更多'])await expect(row(oauth).getByRole('button',{name:label,exact:true})).toBeVisible();
  await row(oauth).getByRole('button',{name:'编辑账号',exact:true}).click();await expect(dialog()).toBeVisible();await close();
  await row(oauth).getByRole('button',{name:'删除账号',exact:true}).click();await expect(page.getByRole('alertdialog')).toBeVisible();await page.getByRole('alertdialog').getByRole('button',{name:'取消',exact:true}).click();
  await shot('table');checks.push('Usage windows restore OAuth 5-hour/week bars; edit/delete/more share an operations column; confirmation can be cancelled');
  await open(oauth,'额度预测');await expect(dialog().getByRole('status')).toContainText(/观测|用量|额度|窗口/,{timeout:30000});await shot('forecast');await close();
  checks.push('Forecast displays its actual missing-sample reason');
  for(const provider of (process.argv.includes('--layout')?[]:['openai_api','claude','xai_api'])){
   const a=directory.find(a=>a.enabled&&a.provider===provider&&a.authenticationKind==='api_key');assert.ok(a);
   await expect(row(a.id).getByRole('progressbar')).toHaveCount(0);
   const catalogResponsePromise=page.waitForResponse(r=>r.url().endsWith('/api/admin/accounts/connection-test/models'),{timeout:60000});
   await open(a.id,'连接测试');await expect(dialog().getByRole('heading',{name:'测试账号连接'})).toBeVisible();
   const catalogResponse=await catalogResponsePromise;
   if(live&&!catalogResponse.ok()){assert.ok([502,503,504].includes(catalogResponse.status()));await expect(dialog().getByRole('button',{name:'开始测试',exact:true})).toBeDisabled();checks.push(provider+' catalog unavailable '+catalogResponse.status()+'; test stays disabled');await shot(provider+'-catalog-error');await close();continue;}
   await expect(dialog().getByRole('button',{name:'开始测试',exact:true})).toBeEnabled({timeout:45000});
   const models=(await catalogResponse.json()).data.models;
   const chosen=models.find(m=>/gpt-5.6-luna|haiku|grok-4.5/.test(m.id))||models[0];
   await dialog().getByRole('combobox').first().click();await page.getByRole('option',{name:chosen.label||chosen.id,exact:true}).click();
   const size=await dialog().boundingBox();assert.ok(size.width<=520&&size.height<850);
   if(provider==='openai_api'){
    await dialog().getByRole('combobox').nth(1).click();await expect(page.getByRole('option',{name:'Compact 探测'})).toBeVisible();await shot('mode-menu');await page.getByRole('option',{name:'常规请求',exact:true}).click();
   }
   await shot(provider+'-ready');
   if(!live){await dialog().getByRole('button',{name:'开始测试',exact:true}).click();await expect(dialog().getByRole('status')).toHaveText(/连接测试通过|测试失败/,{timeout:180000});const status=await dialog().getByRole('status').innerText();tests.push({provider,model:chosen.id,status,output:await dialog().getByRole('log').innerText()});await shot(provider+'-result');console.log(JSON.stringify(tests[tests.length-1]));}
   if(provider==='openai_api'){
    await page.setViewportSize({width:390,height:844});await shot('connection-mobile');await page.setViewportSize({width:1920,height:1080});
    if(!live){await dialog().getByRole('combobox').nth(1).click();await page.getByRole('option',{name:'Compact 探测'}).click();await dialog().getByRole('button',{name:'开始测试',exact:true}).click();await expect(dialog().getByRole('status')).toHaveText(/连接测试通过|测试失败/,{timeout:90000});tests.push({provider,mode:'compact',status:await dialog().getByRole('status').innerText(),output:await dialog().getByRole('log').innerText()});await shot('compact-result');}
   }
   await close();
  }
  await page.setViewportSize({width:390,height:844});await expect(actions(oauth)).toBeVisible();await shot('table-mobile');
  assert.deepEqual(errors,[]);fs.writeFileSync(`${out}/${live?'live':process.argv.includes('--layout')?'layout':'browser'}.json`,JSON.stringify({passed:true,checks,tests,errors},null,2));
 }catch(e){fs.writeFileSync(out+'/partial-tests.json',JSON.stringify(tests,null,2));await page.screenshot({path:out+'/failure.png'});throw e}
 finally{await ctx.request.delete('/api/admin/v1/auth/session',{headers});await browser.close()}
})().catch(e=>{console.error(e.stack);process.exitCode=1});
