const fs=require('node:fs'),path=require('node:path'),assert=require('node:assert/strict');
const {createRequire}=require('node:module');const {chromium,expect}=createRequire('/src/web/package.json')('@playwright/test');
(async()=>{
const browser=await chromium.launch({headless:true,args:['--no-sandbox']});const baseURL='https://192.168.2.150:19443',out='/src/test-results/dashboard-refresh';
const context=await browser.newContext({baseURL,ignoreHTTPSErrors:true,viewport:{width:1440,height:1000}});
await context.addInitScript(()=>{localStorage.setItem('i18nextLng','zh');document.cookie='vite-ui-theme=dark; path=/' });
const login=await context.request.post('/api/v1/auth/sessions',{headers:{Origin:baseURL},data:{login:'ovload_test_admin',password:fs.readFileSync('/runtime/administrator.password','utf8').trim()}});assert.equal(login.status(),200);const grant=await login.json();
let release;let held=new Promise(r=>release=r);let fail=false;
await context.route('**/*',async route=>{const url=new URL(route.request().url());if(url.origin!==baseURL)return route.continue();
 if(url.pathname.includes('/dashboard/summary') || url.pathname.includes('/dashboard/trend') || url.pathname.includes('/usage/records/summary')){await held;if(fail)return route.fulfill({status:503,contentType:'application/json',body:JSON.stringify({error:{code:'test.unavailable',message:'Request unavailable'}})});return route.continue()}
 const candidate='/src/web/dist-dashboard-candidate';if(route.request().resourceType()==='document')return route.fulfill({path:candidate+'/index.html',contentType:'text/html'});
 if(url.pathname.startsWith('/assets/')){const file=path.join(candidate,url.pathname);if(fs.existsSync(file))return route.fulfill({path:file,contentType:file.endsWith('.css')?'text/css':'application/javascript'})}
 return route.continue();});
const page=await context.newPage(),checks=[],errors=[];page.on('pageerror',e=>errors.push(e.message));
async function boxes(){return page.locator('[data-testid="overview-accounts"],[data-testid="metric-tokens"],[data-testid="analytics-card"]').evaluateAll(nodes=>nodes.map(n=>{const r=n.getBoundingClientRect();return {id:n.dataset.testid,x:r.x,y:r.y,width:r.width,height:r.height}}))}
for(const [name,width,height] of [['desktop',1440,1000],['mobile',390,844]]){
 await page.setViewportSize({width,height});held=new Promise(r=>release=r);await page.goto('/dashboard');await expect(page.getByTestId('overview-metrics')).toBeVisible();await page.evaluate(()=>document.fonts.ready);
 const before=await boxes();await page.screenshot({path:out+'/'+name+'-loading.png',fullPage:true});release();await expect(page.getByTestId('overview-metrics')).toHaveAttribute('aria-busy','false');await page.waitForLoadState('networkidle');
 const after=await boxes();for(let i=0;i<before.length;i++)for(const key of ['x','y','width','height'])assert.ok(Math.abs(before[i][key]-after[i][key])<=1,JSON.stringify({name,before,after,key}));
 assert.ok(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth+1));await page.screenshot({path:out+'/'+name+'-loaded.png',fullPage:true});checks.push(name+' loading and loaded positions match');
}
await page.setViewportSize({width:1440,height:1000});await page.reload();await page.waitForLoadState('networkidle');const previous=await page.getByTestId('overview-accounts').innerText();held=new Promise(r=>release=r);await page.getByRole('button',{name:'刷新',exact:true}).click();assert.equal(await page.getByTestId('overview-accounts').innerText(),previous);await expect(page.getByTestId('overview-metrics')).toHaveAttribute('aria-busy','false');release();await page.waitForLoadState('networkidle');checks.push('Refresh preserves existing cards while new data loads');
fail=true;await page.reload();await expect(page.getByTestId('overview-metrics')).toBeVisible();await page.waitForLoadState('networkidle');assert.equal(await page.getByTestId('analytics-card').count(),1);assert.equal(await page.locator('main h1').count(),1);checks.push('Failed requests preserve one dashboard layout');assert.deepEqual(errors,[]);
fs.writeFileSync(out+'/layout-checks.json',JSON.stringify({passed:true,checks,errors},null,2));console.log(checks.join('\n'));
await context.request.delete('/api/admin/v1/auth/session',{headers:{Origin:baseURL,'X-CSRF-Token':grant.csrf_token}});await browser.close();
})().catch(e=>{console.error(e);process.exit(1)})
