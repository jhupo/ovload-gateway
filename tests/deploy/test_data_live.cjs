// Server-only verification of operator-requested fixtures; never calls upstreams.
const fs=require('node:fs'),assert=require('node:assert/strict');
const {createRequire}=require('node:module');
const {chromium,expect}=createRequire('/src/web/package.json')('@playwright/test');
const z=require('/src/web/src/i18n/locales/zh.json');
const base='https://192.168.2.150:19443',out='/src/test-results/test-data';
const manifest=JSON.parse(fs.readFileSync(out+'/manifest.json','utf8'));
(async()=>{
 const browser=await chromium.launch({headless:true,args:['--no-sandbox']});
 const ctx=await browser.newContext({baseURL:base,ignoreHTTPSErrors:true,viewport:{width:1440,height:900}});
 const checks=[],errors=[];let session,page;
 try{
  await ctx.addInitScript(()=>localStorage.setItem('i18nextLng','zh'));
  const login=await ctx.request.post('/api/v1/auth/sessions',{headers:{Origin:base},data:{login:'ovload_test_admin',password:fs.readFileSync('/test-runtime/administrator.password','utf8').trim()}});
  assert.equal(login.status(),200);session=await login.json();
  async function get(path){const r=await ctx.request.get(path);assert.equal(r.status(),200,path+' '+await r.text());const v=await r.json();return v.code!==undefined?v.data:v;}
  const data=await get('/api/admin/v1/engagement/management-test-data');
  for(const [key,count] of Object.entries({plans:3,records:5,users:5,codes:6,orders:10}))assert.equal(data[key].length,count,key);
  for(const account of manifest.accounts){
   const detail=(await get('/api/admin/accounts/detail?accountId='+account.id)).account;
   assert.equal(detail.enabled,false);assert.equal(detail.usage.requestCount,6);assert(detail.usage.inputTokens>0);assert(detail.usage.models.length>0);
  }
  checks.push('database dataset counts and all eight account usage histories');
  page=await ctx.newPage();page.on('pageerror',e=>errors.push(e.message));
  const flags=await get('/api/v1/workspace/visibility');
  const referral=await get('/api/admin/v1/engagement/referrals');assert(referral.invitations.length>=3);assert(referral.rebates.length>=3);
  const audit=await get('/api/admin/v1/engagement/audit');assert(audit.filter(x=>x.summary==='测试数据：安全审计展示样例').length===3);
  checks.push('referral and audit records persisted; existing disabled feature switches preserved');
  const routes=[['/accounts','测试 ·'],['/groups','测试 · 标准分组'],['/proxies','测试 · 东京出口'],['/users','测试用户'],['/announcements','测试 · 系统维护通知'],['/subscriptions','测试用户'],['/orders/plans','测试 · 基础套餐'],['/orders/records','TEST-20261105-'],['/orders/overview','测试用户'],['/redemption-codes','TEST-PREVIEW-NOT-REDEEMABLE-'],['/lottery','测试用户']];
  if(flags.referral)routes.push(['/referrals/invitations','测试用户'],['/referrals/rebates','测试用户']);
  if(flags.securityAudit)routes.push(['/security-audit','测试数据：安全审计展示样例']);
  for(const [route,text] of routes){
   await page.goto(route);await expect(page.locator('main')).toBeVisible();await expect(page.locator('main')).toContainText(text,{timeout:15000});await expect(page).toHaveURL(new RegExp(route.replaceAll('/','\\/')+'([?/#]|$)'));
   await expect(page.locator('[data-sonner-toast][data-type=error]')).toHaveCount(0);
   assert(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth+1),'horizontal overflow '+route);
   await page.screenshot({path:out+'/'+route.replaceAll('/','_')+'.png'});checks.push(route);
  }
  await page.goto('/accounts');
  await page.locator('#account-actions-'+manifest.accounts[0].id+':visible').click();
  await page.getByRole('menuitem',{name:z.accounts.usage,exact:true}).click();
  const detail=page.getByRole('dialog');await expect(detail).toContainText('gpt-4.1');await expect(detail).not.toContainText('原始 JSON');
  await page.screenshot({path:out+'/account-usage.png'});await page.keyboard.press('Escape');checks.push('account usage modal');
  await page.goto('/proxies');
  await expect(page.locator('main')).not.toContainText(/WebSocket/i);
  const views=page.getByRole('button',{name:/^(视图|View)$/});
  if(await views.count()){await views.click();await expect(page.getByRole('menu')).not.toContainText(/WebSocket/i);await page.keyboard.press('Escape');}
  await page.getByRole('button',{name:z.proxies.add,exact:true}).click();await expect(page.getByRole('dialog')).toBeVisible();await expect(page.getByRole('dialog')).not.toContainText(/WebSocket/i);await page.keyboard.press('Escape');
  await page.getByRole('button',{name:z.proxies.editFor.replace('{{name}}',manifest.proxies[0].name),exact:true}).click();await expect(page.getByRole('dialog')).toBeVisible();await expect(page.getByRole('dialog')).not.toContainText(/WebSocket/i);await page.keyboard.press('Escape');
  await page.setViewportSize({width:390,height:844});await expect(page.locator('main')).toContainText('测试 · 东京出口');await expect(page.locator('main')).not.toContainText(/WebSocket/i);
  assert(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth+1));await page.screenshot({path:out+'/proxies-mobile.png'});checks.push('proxy desktop, columns, create, edit and mobile: no WebSocket limit');
  const customer=await browser.newContext({baseURL:base,ignoreHTTPSErrors:true});
  const cl=await customer.request.post('/api/v1/auth/sessions',{headers:{Origin:base},data:{login:manifest.users[0].email,password:fs.readFileSync('/test-runtime/test-users.password','utf8').trim()}});assert.equal(cl.status(),200,await cl.text());const cs=await cl.json();
  const forbidden=await customer.request.get('/api/v1/engagement/management-test-data');assert.equal(forbidden.status(),403);
  await customer.request.delete('/api/v1/auth/session',{headers:{Origin:base,'X-CSRF-Token':cs.csrf_token}});await customer.close();checks.push('customer cannot read management fixture dataset');
  assert.deepEqual(errors,[]);fs.writeFileSync(out+'/browser.json',JSON.stringify({passed:true,checks,errors},null,2));console.log('PASS '+checks.join('; '));
 }catch(e){if(page){await page.screenshot({path:out+'/failure.png'}).catch(()=>{});fs.writeFileSync(out+'/failure.txt',await page.locator('body').innerText().catch(()=>''));}console.error(e);process.exitCode=1;}
 finally{if(session)await ctx.request.delete('/api/admin/v1/auth/session',{headers:{Origin:base,'X-CSRF-Token':session.csrf_token}});await browser.close();}
})();
