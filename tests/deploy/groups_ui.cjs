const fs=require('node:fs'),path=require('node:path'),assert=require('node:assert/strict');
const {createRequire}=require('node:module');
const {chromium,expect}=createRequire('/src/web/package.json')('@playwright/test');
const live=process.argv.includes('live'),baseURL='https://192.168.2.150:19443',out='/src/test-results/groups-completion';
async function main(){
 const browser=await chromium.launch({args:['--no-sandbox','--disable-dev-shm-usage']});
 const context=await browser.newContext({baseURL,ignoreHTTPSErrors:true,locale:'zh-CN',viewport:{width:1920,height:1080}});
 await context.addInitScript(()=>{localStorage.setItem('i18nextLng','zh');document.cookie='vite-ui-theme=dark; path=/'});
 const authResponse=await context.request.post('/api/v1/auth/sessions',{headers:{Origin:baseURL},data:{login:'ovload_test_admin',password:fs.readFileSync('/verify/administrator.password','utf8').trim()}});
 assert.equal(authResponse.status(),200);const auth=await authResponse.json();
 const headers={Origin:baseURL,'X-CSRF-Token':auth.csrf_token};
 const name='验证分组-'+Date.now();let gid,page;
 const errors=[],failed=[];
 try{
  if(!live)await context.route('**/*',route=>{
   const u=new URL(route.request().url());if(u.pathname.startsWith('/api/')||u.pathname==='/healthz')return route.continue();
   const file=path.join('/src/web/dist-groups',u.pathname==='/groups'||u.pathname==='/'?'index.html':u.pathname);
   return fs.existsSync(file)&&fs.statSync(file).isFile()?route.fulfill({path:file}):route.continue();
  });
  page=await context.newPage();page.on('pageerror',e=>errors.push(e.message));page.on('response',r=>{if(r.url().includes('/api/')&&r.status()>=500)failed.push([r.status(),r.url()])});
  await page.goto('/groups');await expect(page.getByTestId('groups-directory').getByRole('table')).toBeVisible({timeout:30000});
  await page.getByRole('button',{name:'创建分组',exact:true}).click();let dialog=page.getByRole('dialog');
  await dialog.getByLabel('名称',{exact:true}).fill(name);
  await dialog.getByLabel('平台',{exact:true}).click();await page.getByRole('option',{name:'Claude',exact:true}).click();
  await dialog.getByLabel('每用户 RPM',{exact:true}).fill('42');
  await dialog.getByLabel('费率倍率',{exact:true}).fill('1.25');
  await dialog.getByRole('button',{name:'高低峰计费',exact:true}).click();
  await dialog.getByLabel('高峰开始',{exact:true}).fill('22:00');await dialog.getByLabel('高峰结束',{exact:true}).fill('06:00');
  await dialog.getByLabel('高峰倍率',{exact:true}).fill('1.2');
  await dialog.getByRole('button',{name:'添加模型计价',exact:true}).click();
  const prices=dialog.getByTestId('model-price');await prices.getByLabel('模型',{exact:true}).fill('check-model');await prices.getByLabel('输入',{exact:true}).fill('3');await prices.getByLabel('输出',{exact:true}).fill('9');
  await dialog.getByRole('button',{name:'添加映射',exact:true}).click();await dialog.getByLabel('请求模型',{exact:true}).fill('check-alias');await dialog.getByLabel('目标模型',{exact:true}).fill('check-model');
  await dialog.getByRole('switch',{name:'允许 Live 语音',exact:true}).click();
  const made=page.waitForResponse(r=>r.url().endsWith('/account-groups/create')&&r.request().method()==='POST');
  await dialog.getByRole('button',{name:'创建分组',exact:true}).click();const cr=await made;assert.equal(cr.status(),201);gid=(await cr.json()).data.id;await expect(dialog).not.toBeVisible();
  const search=page.getByPlaceholder('搜索分组名称…');await search.fill(name);const row=page.getByRole('row').filter({hasText:name});await expect(row).toHaveCount(1);
  await page.getByTestId('groups-directory').getByRole('button',{name:'平台',exact:true}).click();await page.getByRole('option',{name:'Gemini',exact:true}).click();await page.keyboard.press('Escape');
  await expect(row).toHaveCount(0);await page.getByRole('button',{name:'重置',exact:true}).click();await search.fill(name);await expect(row).toHaveCount(1);
  await row.getByRole('button',{name:'编辑 '+name,exact:true}).click();dialog=page.getByRole('dialog');
  await expect(dialog.getByLabel('每用户 RPM',{exact:true})).toHaveValue('42');await expect(dialog.getByRole('switch',{name:'允许 Live 语音',exact:true})).not.toBeChecked();
  await expect(dialog.getByLabel('高峰开始',{exact:true})).toHaveValue('22:00');
  await expect(dialog.getByTestId('model-price').getByLabel('输入',{exact:true})).toHaveValue('3');await expect(dialog.getByLabel('目标模型',{exact:true})).toHaveValue('check-model');
  await dialog.getByRole('button',{name:'移除模型计价 1',exact:true}).click();await dialog.getByRole('button',{name:'移除映射 1',exact:true}).click();
  await dialog.getByLabel('每用户 RPM',{exact:true}).fill('7');
  await dialog.getByRole('button',{name:'保存',exact:true}).click();await expect(dialog).not.toBeVisible();
  await row.getByRole('button',{name:name+' 的专属设置',exact:true}).click();dialog=page.getByRole('dialog');
  await dialog.getByRole('combobox').click();const users=page.getByRole('option');await expect(users.first()).toBeVisible();await users.first().click();
  await dialog.getByLabel('费率倍率',{exact:true}).fill('0.8');await dialog.getByLabel('每用户 RPM',{exact:true}).fill('0');
  await dialog.getByRole('button',{name:'保存',exact:true}).click();await expect(dialog).not.toBeVisible();
  await row.getByRole('button',{name:name+' 的专属设置',exact:true}).click();
  await expect(dialog.getByLabel('费率倍率',{exact:true})).toHaveValue('0.8');await expect(dialog.getByLabel('每用户 RPM',{exact:true})).toHaveValue('0');
  await expect(page.locator('[data-sonner-toast]')).toHaveCount(0,{timeout:15000});await page.screenshot({path:`${out}/${live?'live':'candidate'}-overrides.png`});
  await dialog.getByRole('button',{name:/^移除 .* 的专属设置$/}).click();await dialog.getByRole('button',{name:'保存',exact:true}).click();await expect(dialog).not.toBeVisible();
  await search.fill('');await expect(page.getByRole('row').filter({hasText:name})).toHaveCount(1);
  await expect(page.locator('[data-sonner-toast]')).toHaveCount(0,{timeout:15000});await page.screenshot({path:`${out}/${live?'live':'candidate'}-desktop.png`,fullPage:true});
  const viewport=page.getByTestId('groups-directory');assert.ok(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth+1));
  await row.getByRole('button',{name:'编辑 '+name,exact:true}).click();await page.setViewportSize({width:390,height:844});
  await expect(page.getByRole('dialog').getByRole('button',{name:'保存',exact:true})).toBeInViewport();
  assert.ok(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth+1));
  await expect(page.locator('[data-sonner-toast]')).toHaveCount(0,{timeout:15000});await page.screenshot({path:`${out}/${live?'live':'candidate'}-mobile.png`,fullPage:true});
  await page.keyboard.press('Escape');await expect(page.getByRole('dialog')).not.toBeVisible();
  assert.deepEqual(errors,[]);assert.deepEqual(failed,[]);
  fs.writeFileSync(`${out}/${live?'live':'candidate'}.json`,JSON.stringify({passed:true,checks:['Create/edit persisted RPM, Live and overnight pricing','Server platform filtering','Searchable user overrides add/edit/remove with zero RPM','Shared table desktop and responsive dialog'],errors,failed},null,2));
  console.log('PASS group browser interactions and responsive layout');
 }catch(error){
  if(page){await page.screenshot({path:`${out}/failure.png`,fullPage:true}).catch(()=>{});fs.writeFileSync(`${out}/failure.txt`,await page.locator('body').innerText().catch(()=>''));}
  throw error;
 }finally{
  if(gid){const r=await context.request.post('/api/admin/account-groups/delete',{headers,data:{id:gid}});assert.equal(r.status(),200)}
  await context.request.delete('/api/admin/v1/auth/session',{headers});await browser.close();
 }
}
main().catch(e=>{console.error(e);process.exitCode=1});
