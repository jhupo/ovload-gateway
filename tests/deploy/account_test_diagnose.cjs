const fs=require('node:fs');
const {request}=require('node:module').createRequire('/src/web/package.json')('@playwright/test');
(async()=>{
 const baseURL='https://192.168.2.150:19443', ctx=await request.newContext({baseURL,ignoreHTTPSErrors:true,timeout:180000});
 const login=await ctx.post('/api/v1/auth/sessions',{headers:{Origin:baseURL},data:{login:'ovload_test_admin',password:fs.readFileSync('/verify/administrator.password','utf8').trim()}});
 if(login.status()!==200)throw Error('Login '+login.status());
 const session=await login.json(),headers={Origin:baseURL,'X-CSRF-Token':session.csrf_token};
 const output=[];
 try{
 const data=(await (await ctx.get('/api/admin/accounts')).json()).data;
 for(const a of data.items){
   const row={id:a.id,name:a.name,provider:a.provider,authentication:a.authenticationKind,enabled:a.enabled,capabilities:a.capabilities};
   if(process.argv.includes('--directory')){console.log(JSON.stringify({name:a.name,provider:a.provider,proxyId:a.outboundProxyId,errorReason:a.errorReason,errorMessage:a.errorMessage}));continue;}
   if(a.enabled){
     const detail=(await(await ctx.get('/api/admin/accounts/detail?accountId='+a.id)).json()).data;row.connection=detail?.credentialConfiguration;row.proxyId=detail?.account.outboundProxyId;

     const res=await ctx.post('/api/admin/accounts/connection-test/models',{headers,data:{accountId:a.id}});
     const catalog=await res.json(); row.catalogStatus=res.status();row.models=catalog.data?.models;row.catalogError=catalog.message;
     if(false&&a.authenticationKind==='api_key'&&row.models?.length){
       const models=row.models.filter(m=>m.kind==='text');
       const chosen=models.find(m=>/haiku|grok-4-fast|gemini-.*flash|gpt-6-luna/.test(m.id))||models[0];
       if(chosen){const test=await ctx.post('/api/admin/accounts/connection-test',{headers,data:{accountId:a.id,modelId:chosen.id}});
       row.testStatus=test.status();row.testModel=chosen.id;
       row.events=(await test.text()).split('\n').filter(l=>l.startsWith('data:')).map(l=>JSON.parse(l.slice(5))).map(e=>({type:e.type,error:e.error,status:e.upstreamStatus,code:e.providerErrorCode,body:e.upstreamBody?.slice(0,1800),success:e.success}));}
     }
     if(a.authenticationKind==='oauth'&&a.capabilities.quota){row.forecast=(await(await ctx.get('/api/admin/accounts/quota-forecast?accountId='+a.id)).json()).data;}
   }
   output.push(row);console.log(JSON.stringify(row));
 }
 fs.writeFileSync('/src/test-results/account-test-modes/diagnosis.json',JSON.stringify(output,null,2));
 }finally{await ctx.delete('/api/admin/v1/auth/session',{headers});await ctx.dispose()}
})().catch(e=>{console.error(e.message);process.exitCode=1});
