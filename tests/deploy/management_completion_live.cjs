const fs=require('node:fs'),assert=require('node:assert/strict');
const {createRequire}=require('node:module');
const {chromium,expect}=createRequire('/src/web/package.json')('@playwright/test');
(async()=>{
 const browser=await chromium.launch({headless:true,args:['--no-sandbox']});
 const base='https://192.168.2.150:19443';const context=await browser.newContext({baseURL:base,ignoreHTTPSErrors:true,viewport:{width:1440,height:900}});let session;
 try {
  await context.addInitScript(()=>localStorage.setItem('i18nextLng','zh'));
  const login=await context.request.post('/api/v1/auth/sessions',{headers:{Origin:base},data:{login:'ovload_test_admin',password:fs.readFileSync('/test-runtime/administrator.password','utf8').trim()}});
  assert.equal(login.status(),200);session=await login.json();
  for(const endpoint of ['/api/admin/v1/engagement/announcements','/api/admin/account-groups','/api/admin/accounts','/api/admin/proxies']){
   const r=await context.request.get(endpoint);assert.equal(r.status(),200,endpoint+' '+await r.text());
  }
  const page=await context.newPage(),errors=[];page.on('pageerror',e=>errors.push(e.message));
  for(const route of ['/announcements','/groups','/accounts','/proxies']){
   await page.goto(route);await expect(page.locator('main')).toBeVisible();await expect(page.locator('[data-sonner-toast][data-type=error]')).toHaveCount(0);
  }
  assert.deepEqual(errors,[]);
  fs.writeFileSync('/src/test-results/management-completion/live.json',JSON.stringify({passed:true,login:true,routes:['announcements','groups','accounts','proxies'],errors},null,2));
  console.log('PASS existing admin login, management APIs and four live pages');
 }catch(e){console.error(e);process.exitCode=1;}
 finally{if(session)await context.request.delete('/api/admin/v1/auth/session',{headers:{Origin:base,'X-CSRF-Token':session.csrf_token}});await browser.close();}
})();
