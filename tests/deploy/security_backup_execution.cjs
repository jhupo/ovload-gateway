const assert=require('node:assert/strict'),fs=require('node:fs'),path=require('node:path'),{createRequire}=require('node:module'),{createHash}=require('node:crypto')
const {chromium,expect}=createRequire('/src/web/package.json')('@playwright/test')
const base='https://192.168.2.150:19444',priv=JSON.parse(fs.readFileSync('/test-runtime/private.json','utf8')),out='/src/test-results/security-backup'
fs.mkdirSync(out,{recursive:true});let browser,admin,csrf;const checks=[]
const mark=s=>{checks.push(s);console.log('PASS '+s)}
async function result(r,status=200){assert.equal(r.status(),status,`${r.url()} ${await r.text()}`);return status===204?null:r.json()}
async function get(p){return result(await admin.request.get('/api/admin/v1'+p))}
async function post(p,data,status=200){return result(await admin.request.post('/api/admin/v1'+p,{headers:{Origin:base,'X-CSRF-Token':csrf},data}),status)}
async function update(values,secrets={},status=200,revision){const old=await get('/security-settings');return result(await admin.request.patch('/api/admin/v1/security-settings',{headers:{Origin:base,'X-CSRF-Token':csrf,'If-Match':`"${revision??old.revision}"`},data:{values,secrets}}),status)}
async function platform(p,data){const r=await admin.request.fetch('/api/admin/settings/backups'+p,{method:data===undefined?'GET':'POST',headers:{Origin:base,'X-CSRF-Token':csrf},data});assert.ok([200,202].includes(r.status()),await r.text());return (await r.json()).data}
async function main(){
 browser=await chromium.launch({headless:true,args:['--no-sandbox','--disable-features=BackForwardCache','--disk-cache-size=33554432']})
 admin=await browser.newContext({baseURL:base,ignoreHTTPSErrors:true,locale:'zh-CN',viewport:{width:1440,height:1000}});await admin.addInitScript(()=>localStorage.setItem('i18nextLng','zh'))
 const login=await result(await admin.request.post('/api/v1/auth/sessions',{headers:{Origin:base},data:{login:'ovload_security_verify',password:priv.administratorPassword}}));csrf=login.csrf_token
 let doc=await get('/security-settings'),v=doc.values
 await update({...v,authRateLimit:0},{},400)
 await update({...v,authRateLimit:1000,invalidAuthThreshold:2},{},200)
 await update(v,{},409,doc.revision)
 v=(await get('/security-settings')).values
 await update(v,Object.fromEntries(['captcha','github','google','linuxdo'].map(name=>[name,'x'.repeat(2048)])),400)
 await result(await admin.request.patch('/api/admin/v1/security-settings',{headers:{Origin:base,'If-Match':`"${doc.revision}"`},data:{values:v,secrets:{}}}),403)
 const anonymous=await browser.newContext({baseURL:base,ignoreHTTPSErrors:true});await result(await anonymous.request.get('/api/admin/v1/security-settings'),401)
 mark('Settings validate inputs, require permission/CSRF, reject stale revisions, and persist across reads')
 const secret='fixture-secret-not-a-real-provider-key'
 doc=await update({...v,providers:{...v.providers,github:{clientId:'fixture-client',callbackUrl:base+'/api/v1/auth/oauth/github/callback'}}},{github:secret})
 assert.equal(doc.hasSecrets.github,true);assert.ok(!JSON.stringify(doc).includes(secret));await update(doc.values);assert.equal((await get('/security-settings')).hasSecrets.github,true)
 const publicPolicy=await result(await anonymous.request.get('/api/v1/auth/registration-policy'));assert.ok(publicPolicy.oauth_available.includes('github'))
 mark('OAuth credentials are encrypted, never echoed, preserved when blank, and used by provider discovery')
 await update({...doc.values,stepUpVerification:true})
 await post('/security-settings/admin-key',{},403)
 await post('/auth/step-up',{password:'incorrect-password'},403)
 await post('/auth/step-up',{password:priv.administratorPassword})
 let key=(await post('/security-settings/admin-key',{})).key
 const tokenClient=await browser.newContext({baseURL:base,ignoreHTTPSErrors:true})
 await result(await tokenClient.request.get('/api/admin/settings/backups',{headers:{Authorization:'Bearer '+key}}))
 const oldKey=key;key=(await post('/security-settings/admin-key',{})).key
 await result(await tokenClient.request.get('/api/admin/settings/backups',{headers:{Authorization:'Bearer '+oldKey}}),401)
 await result(await tokenClient.request.get('/api/admin/settings/backups',{headers:{Authorization:'Bearer '+key}}))
 mark('Sensitive writes require a verified password; regenerated automation keys revoke the preceding key')
 // Exercise the actual UI password confirmation rather than only the API.
 const page=await admin.newPage();await page.goto('/security-authentication');await expect(page.locator('#access-token-minutes')).toBeEnabled();await page.locator('#access-token-minutes').fill('45')
 // Fixture expires only this disposable principal's step-up stamp.
 await result(await admin.request.post('http://172.24.0.1:19093/expire-step-up',{headers:{'X-Fixture-Token':priv.fixtureToken},data:{}}))
 await page.getByRole('button',{name:'保存',exact:true}).first().click();await expect(page.getByRole('dialog')).toBeVisible();await page.getByLabel('登录密码',{exact:true}).fill(priv.administratorPassword);await page.getByRole('button',{name:'验证并继续'}).click();await expect(page.getByRole('dialog')).toHaveCount(0);await expect(page.locator('#access-token-minutes')).toHaveValue('45');assert.equal((await get('/security-settings')).values.accessTokenMinutes,45)
 await page.screenshot({path:path.join(out,'security-basic.png'),fullPage:true});await page.getByRole('tab',{name:'登录防护',exact:true}).click();await expect(page.locator('#auth-rate-limit')).toBeEnabled();await page.screenshot({path:path.join(out,'security-protection.png'),fullPage:true});await page.getByRole('tab',{name:'快捷登录',exact:true}).click();await expect(page.locator('#github-secret')).toBeEnabled();await page.setViewportSize({width:390,height:844});await page.screenshot({path:path.join(out,'security-mobile.png'),fullPage:true});assert.ok(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth+1));await page.close()
 mark('Security page saves live values, completes password confirmation, exposes editable credentials and fits mobile')
 // A real pg_dump archive is generated by the worker and uploaded through the S3 adapter.
 for(const failed of (await platform('/records?page=1&pageSize=20&status=failed')).items)await platform('/delete',{backupId:failed.id})
 await expect.poll(async()=>(await platform('/records?page=1&pageSize=20')).items.length,{timeout:100000,intervals:[1000,2000,5000]}).toBe(0)
 await platform('/storage/update',{endpoint:base+'/s3',region:'auto',bucket:'verification',accessKeyId:'verification-access',secretAccessKey:'verification-secret',prefix:'security-backup',forcePathStyle:true})
 const probe=await platform('/storage/test',{});assert.equal(probe.ok,true,JSON.stringify(probe))
 await platform('/schedule/update',{scheduleEnabled:true,cronExpression:'* * * * *',retentionDays:7,retentionCount:3});assert.equal((await platform('')).scheduleEnabled,true)
 const scheduledSince=Date.now()
 await result(await admin.request.post('http://172.24.0.1:19093/due-backup',{headers:{'X-Fixture-Token':priv.fixtureToken},data:{}}))
 let scheduled
 await expect.poll(async()=>{const records=await platform('/records?page=1&pageSize=20&trigger=scheduled');scheduled=records.items.find(r=>Date.parse(r.createdAt)>=scheduledSince-1000);if(scheduled?.status==='failed')throw Error(JSON.stringify(scheduled));return scheduled?.status},{timeout:100000,intervals:[1000,2000,5000]}).toBe('completed')
 await platform('/schedule/update',{scheduleEnabled:false,cronExpression:'0 0 * * *',retentionDays:7,retentionCount:3})
 await platform('/delete',{backupId:scheduled.id});await expect.poll(async()=>!(await platform('/records?page=1&pageSize=20')).items.some(r=>r.id===scheduled.id),{timeout:60000,intervals:[1000,2000,5000]}).toBe(true)
 let record=await platform('/create',{expiresInDays:1});const id=record.id
 await expect.poll(async()=>{const records=await platform('/records?page=1&pageSize=20');record=records.items.find(r=>r.id===id);if(record?.status==='failed')throw Error(JSON.stringify(record));return record?.status},{timeout:100000,intervals:[1000,2000,5000]}).toBe('completed')
 const download=await platform('/download-url',{backupId:id});const response=await admin.request.get(download.url);assert.equal(response.status(),200);const bytes=await response.body();assert.equal(bytes.length,record.sizeBytes);assert.equal(createHash('sha256').update(bytes).digest('hex'),record.sha256);fs.writeFileSync(path.join(out,'archive.dump.gz'),bytes);assert.equal(require('node:zlib').gunzipSync(bytes).includes(Buffer.from('authentication_security')),true)
 const backupPage=await admin.newPage();await backupPage.goto('/data-backup');await expect(backupPage.locator('main')).toContainText('数据备份');await backupPage.getByRole('tab',{name:'定时备份',exact:true}).click();await backupPage.screenshot({path:path.join(out,'backup-records.png'),fullPage:true});await backupPage.close()
 await platform('/delete',{backupId:id});await expect.poll(async()=>{const records=await platform('/records?page=1&pageSize=20');return records.items.some(r=>r.id===id)},{timeout:60000,intervals:[1000,2000,5000]}).toBe(false)
 mark('Backup storage probe, schedule, real database export, upload, download hash, records and deletion complete')
 // Enabling CAPTCHA protects every public write; missing tokens are rejected before account lookup.
 v=(await get('/security-settings')).values;await update({...v,humanVerification:true,captchaSiteKey:'fixture-site'},{captcha:'fixture-secret'})
 for(const [p,data] of [['/auth/sessions',{login:'missing',password:'missing'}],['/auth/registrations',{email:'a@example.com',password:'password',display_name:'a'}],['/auth/password-reset',{email:'a@example.com'}],['/auth/oauth/github/start',{}]])await result(await anonymous.request.post('/api/v1'+p,{headers:{Origin:base},data}),403)
 await update(v)
 mark('Turnstile is enforced on login, registration, recovery and OAuth entry points')
 for(const endpoint of ['/expire-idle','/expire-lifetime']){
  await result(await admin.request.post('http://172.24.0.1:19093'+endpoint,{headers:{'X-Fixture-Token':priv.fixtureToken},data:{}}))
  await result(await admin.request.get('/api/admin/v1/session'),401)
  await result(await tokenClient.request.get('/api/admin/settings/backups',{headers:{Authorization:'Bearer '+key}}))
  const fresh=await result(await admin.request.post('/api/v1/auth/sessions',{headers:{Origin:base},data:{login:'ovload_security_verify',password:priv.administratorPassword}}));csrf=fresh.csrf_token
 }
 await anonymous.close();await tokenClient.close()
 mark('Idle and absolute session expiry invalidate browser access while automation keys retain their independent lifetime')
 await result(await admin.request.delete('/api/admin/v1/auth/session',{headers:{Origin:base,'X-CSRF-Token':csrf}}),204)
 const relogin=await result(await admin.request.post('/api/v1/auth/sessions',{headers:{Origin:base},data:{login:'ovload_security_verify',password:priv.administratorPassword}}));csrf=relogin.csrf_token
 mark('Sign-out remains available without an active password confirmation')
 // Invalid credential blocking is tested last because all test requests share one proxy connection.
 for(let i=0;i<2;i++)await result(await admin.request.post('/api/v1/auth/sessions',{headers:{Origin:base},data:{login:'missing',password:'missing'}}),401)
 await result(await admin.request.post('/api/v1/auth/sessions',{headers:{Origin:base},data:{login:'ovload_security_verify',password:priv.administratorPassword}}),429)
 mark('Repeated invalid credentials trigger the configured durable access block')
 fs.writeFileSync(path.join(out,'result.json'),JSON.stringify({checks,errors:[],archiveSha256:record.sha256},null,2))
}
main().catch(e=>{console.error(e);process.exitCode=1}).finally(async()=>{if(admin&&csrf)await admin.request.delete('/api/admin/v1/auth/session',{headers:{Origin:base,'X-CSRF-Token':csrf}}).catch(()=>{});if(browser)await browser.close()})
