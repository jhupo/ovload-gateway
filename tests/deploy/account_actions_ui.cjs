const fs=require('node:fs'),path=require('node:path'),assert=require('node:assert/strict');
const {chromium,expect}=require('node:module').createRequire('/src/web/package.json')('@playwright/test');
const baseURL='https://192.168.2.150:19443',out='/src/test-results/account-actions',live=process.argv.includes('--live');
(async()=>{
 const browser=await chromium.launch({args:['--no-sandbox','--disable-dev-shm-usage']});
 const ctx=await browser.newContext({baseURL,ignoreHTTPSErrors:true,viewport:{width:1440,height:900}});
 await ctx.addInitScript(()=>localStorage.setItem('i18nextLng','zh'));
 let session;
 try{
 const r=await ctx.request.post('/api/v1/auth/sessions',{headers:{Origin:baseURL},data:{login:'ovload_test_admin',password:fs.readFileSync('/verify/administrator.password','utf8').trim()}});assert.equal(r.status(),200);session=await r.json();
 if(!live)await ctx.route('**/*',route=>{const u=new URL(route.request().url());if(u.origin!==baseURL||u.pathname.startsWith('/api/'))return route.continue();let f=path.join('/src/web/dist-account-actions',u.pathname);if(!fs.existsSync(f)||!fs.statSync(f).isFile())f='/src/web/dist-account-actions/index.html';return route.fulfill({path:f});});
 const page=await ctx.newPage(),errors=[];page.on('pageerror',e=>errors.push(e.message));await page.goto('/accounts');
 const table=page.locator('table:visible'),row=table.getByRole('row').nth(1),header=table.getByRole('columnheader',{name:'操作',exact:true}),scroll=table.locator('..');
 await expect(row.getByRole('button',{name:'更多',exact:true})).toBeVisible({timeout:30000});
 const checks=[];
 for(const width of [1920,1440,1280]){
 await page.setViewportSize({width,height:900});
 for(const end of [false,true]){
 await scroll.evaluate((el,end)=>el.scrollLeft=end?el.scrollWidth:0,end);
 const bounds=await scroll.boundingBox();assert.ok(bounds);
 for(const node of [header,table.getByRole('columnheader',{name:'账号',exact:true}),row.getByRole('cell').nth(1),...['编辑账号','删除账号','更多'].map(name=>row.getByRole('button',{name,exact:true}))]){
 const b=await node.boundingBox();assert.ok(b&&b.x>=bounds.x-1&&b.x+b.width<=bounds.x+bounds.width+1,`${width} action outside table`);
 }
 await row.getByRole('button',{name:'更多',exact:true}).click();await expect(page.getByRole('menu')).toBeVisible();await page.keyboard.press('Escape');
 const identity=await row.getByRole('cell').nth(1).boundingBox();assert.ok(Math.abs(identity.x-bounds.x-40)<3);assert.ok(identity.width<=194);checks.push({width,end,actionsVisible:true,identityPinned:true,identityWidth:identity.width});
 }
 await scroll.evaluate(el=>el.scrollLeft=0);await page.screenshot({path:`${out}/${live?'live-':''}table-${width}.png`});
 }
 const name=row.getByRole('cell').nth(1).locator('[title]').first();const original=await name.textContent();await name.evaluate(el=>el.textContent='Very long account name to verify ellipsis '.repeat(8));assert.ok(await name.evaluate(el=>el.scrollWidth>el.clientWidth&&getComputedStyle(el).textOverflow==='ellipsis'));await page.screenshot({path:`${out}/${live?'live-':''}long-name.png`});await name.evaluate((el,value)=>el.textContent=value,original);
 await row.getByRole('button',{name:'编辑账号',exact:true}).click();await expect(page.getByRole('dialog')).toBeVisible();await page.keyboard.press('Escape');
 await row.getByRole('button',{name:'删除账号',exact:true}).click();await expect(page.getByRole('alertdialog')).toBeVisible();await page.getByRole('alertdialog').getByRole('button',{name:'取消',exact:true}).click();
 await page.setViewportSize({width:390,height:844});for(const name of ['编辑账号','删除账号','更多'])await expect(page.getByRole('button',{name,exact:true}).first()).toBeVisible();assert.ok(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth+1));await page.screenshot({path:`${out}/${live?'live-':''}mobile.png`});
 assert.deepEqual(errors,[]);fs.writeFileSync(`${out}/${live?'live':'browser'}.json`,JSON.stringify({passed:true,checks,errors},null,2));
 }finally{if(session)await ctx.request.delete('/api/admin/v1/auth/session',{headers:{Origin:baseURL,'X-CSRF-Token':session.csrf_token}});await browser.close()}
})().catch(e=>{console.error(e.stack);process.exitCode=1});
