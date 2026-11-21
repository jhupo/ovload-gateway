const fs=require('node:fs'),assert=require('node:assert/strict');
const {request}=require('node:module').createRequire('/src/web/package.json')('@playwright/test');
(async()=>{
const baseURL='https://192.168.2.150:19443',ctx=await request.newContext({baseURL,ignoreHTTPSErrors:true});
const unauthorized=await ctx.post('/api/admin/accounts/connection-test/models',{data:{accountId:'missing'}});assert.ok([401,403].includes(unauthorized.status()));
const login=await ctx.post('/api/v1/auth/sessions',{headers:{Origin:baseURL},data:{login:'ovload_test_admin',password:fs.readFileSync('/verify/administrator.password','utf8').trim()}});assert.equal(login.status(),200);const session=await login.json(),headers={Origin:baseURL,'X-CSRF-Token':session.csrf_token};
try {
const directory=await ctx.get('/api/admin/accounts');assert.equal(directory.status(),200);const items=(await directory.json()).data.items;const api=items.find(a=>a.provider==='openai_api'&&a.authenticationKind==='api_key');assert.ok(api);
const unsupported=await ctx.post('/api/admin/accounts/connection-test',{headers,data:{accountId:api.id,modelId:'gpt-image-2'}});assert.ok([400,422].includes(unsupported.status()),await unsupported.text());
const invalidPrompt=await ctx.post('/api/admin/accounts/connection-test',{headers,data:{accountId:api.id,modelId:'gpt-test',prompt:'字'.repeat(2001)}});assert.ok([400,422].includes(invalidPrompt.status()));
const invalidModelRequest=await ctx.post('/api/admin/accounts/connection-test/models',{headers,data:{accountId:''}});assert.ok([400,422].includes(invalidModelRequest.status()));
fs.writeFileSync('/src/test-results/account-media/api.json',JSON.stringify({passed:true,unauthorized:unauthorized.status(),unsupported:unsupported.status(),invalidPrompt:invalidPrompt.status(),invalidModelRequest:invalidModelRequest.status()}));
}finally{await ctx.delete('/api/admin/v1/auth/session',{headers});await ctx.dispose()}
})().catch(e=>{console.error(e);process.exitCode=1});
