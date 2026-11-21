"""Idempotent, operator-requested fixtures on the existing test server only."""
import json,ssl,urllib.request,urllib.error,http.cookiejar,subprocess,secrets,uuid,gzip,shutil,os
from pathlib import Path
from datetime import datetime,timedelta,timezone
from urllib.parse import urlsplit
S=Path('/opt/webcodex/ovload-gateway-codex-test-20261031135140');R=Path('/opt/webcodex/ovload-gateway-test-runtime-20261031');O=S/'test-results/test-data';O.mkdir(exist_ok=True,parents=True)
BASE='https://192.168.2.150:19443';PREFIX='ui-test-20261105'
DB=urlsplit(json.loads((R/'deploy/config.yaml').read_text())['store']['database']['url']).path.lstrip('/')
assert DB and 'verify' not in DB
manifestPath=O/'manifest.json';manifest=json.loads(manifestPath.read_text()) if manifestPath.exists() else {'groups':[],'accounts':[],'proxies':[],'users':[],'announcements':[]}
def save():manifestPath.write_text(json.dumps(manifest,ensure_ascii=False,indent=2))
def pg(sql):
 r=subprocess.run(['docker','exec','-i','ovload-test-postgres','sh','-c','psql -X -q -At -v ON_ERROR_STOP=1 -U "$POSTGRES_USER" -d "$1"','sh',DB],input=sql,text=True,capture_output=True)
 if r.returncode:raise RuntimeError(r.stderr)
 return r.stdout.strip()
def q(v):return "'"+str(v).replace("'","''")+"'"
def j(v):return q(json.dumps(v,ensure_ascii=False))+'::jsonb'
def uid(name):return str(uuid.uuid5(uuid.NAMESPACE_URL,PREFIX+'/'+name))
now=datetime.now(timezone.utc)
def at(days=0,hours=0):return (now+timedelta(days=days,hours=hours)).isoformat()
jar=http.cookiejar.CookieJar();client=urllib.request.build_opener(urllib.request.HTTPSHandler(context=ssl._create_unverified_context()),urllib.request.HTTPCookieProcessor(jar));csrf=None
def api(path,data=None,method=None,extra=None):
 headers={'Content-Type':'application/json','Origin':BASE}
 if csrf:headers['X-CSRF-Token']=csrf
 headers.update(extra or {})
 req=urllib.request.Request(BASE+path,data=None if data is None else json.dumps(data).encode(),headers=headers,method=method or ('POST' if data is not None else 'GET'))
 try:
  with client.open(req,timeout=30) as r:
   body=r.read();value=json.loads(body) if body else None
 except urllib.error.HTTPError as e:raise RuntimeError(path+' '+str(e.code)+' '+e.read().decode())
 return value.get('data',value) if isinstance(value,dict) and 'code' in value else value
backup=R/'test-data-backup-20261105';backup.mkdir(exist_ok=True)
if not (backup/'database.sql.gz').exists():
 with gzip.open(backup/'database.sql.gz','wb') as f:
  p=subprocess.Popen(['docker','exec','ovload-test-postgres','sh','-c','pg_dump -U "$POSTGRES_USER" "$1"','sh',DB],stdout=subprocess.PIPE);shutil.copyfileobj(p.stdout,f);assert p.wait()==0
if not (backup/'gateway.gz').exists():
 with gzip.open(backup/'gateway.gz','wb',compresslevel=1) as f:
  p=subprocess.Popen(['docker','exec','ovload-test-gateway','cat','/proc/1/exe'],stdout=subprocess.PIPE);shutil.copyfileobj(p.stdout,f);assert p.wait()==0
if not (backup/'web-dist.tar.gz').exists():
 subprocess.run(['tar','-czf',str(backup/'web-dist.tar.gz'),'-C',str(S/'web'),'dist'],check=True)
session=api('/api/v1/auth/sessions',{'login':'ovload_test_admin','password':(R/'administrator.password').read_text().strip()});csrf=session['csrf_token']
if not (R/'test-users.password').exists():
 (R/'test-users.password').write_text(secrets.token_urlsafe(24));(R/'test-users.password').chmod(0o600)
for i in range(len(manifest['users']),5):
 user=api('/api/admin/v1/users',{'email':f'{PREFIX}-{i+1}@example.com','display_name':f'测试用户 {i+1:02}','max_concurrency':[5,10,20,30,50][i],'requests_per_minute':120,'notes':'测试数据：页面验收，不是真实客户','password':(R/'test-users.password').read_text()});manifest['users'].append(user);save()
for i in range(len(manifest['groups']),3):
 name=['测试 · 标准分组','测试 · 高并发分组','测试 · 独立定价分组'][i]
 price={'peak':None,'modelPrices':{}}
 if i==2:price={'peak':{'timezone':'Asia/Shanghai','startMinute':540,'endMinute':1080,'peakMultiplierBps':15000,'offPeakMultiplierBps':8000},'modelPrices':{'gpt-5.5':{'input':'2','output':'8','cacheRead':'0.2','cacheWrite':'2'}}}
 group=api('/api/admin/account-groups/create',{'name':name,'description':'测试数据：用于查看分组布局','color':'#0284C7FF','visibility':'private','retailMultiplierBps':[10000,15000,8000][i],'modelRoutes':None,'allowImageGeneration':True,'fastMode':'default','pricing':price});manifest['groups'].append(group['record']);save()
for i in range(len(manifest['proxies']),3):
 result=api('/api/admin/proxies/create',[{'name':['测试 · 东京出口','测试 · 新加坡出口','测试 · 美国出口'][i],'proxyUrl':f'http://192.0.2.{i+1}:1080','maxWebsocketConnections':0,'autoLocation':False}])[0];assert result['status']=='succeeded',result
 proxy=result['data']['record'];proxy=api('/api/admin/proxies/update',{'id':proxy['id'],'revision':proxy['revision'],'name':proxy['name'],'enabled':False})['record'];manifest['proxies'].append(proxy);save()
providers=[('openai_api','OpenAI API','https://api.openai.com/v1'),('claude','Claude','https://api.anthropic.com/v1'),('gemini','Gemini','https://generativelanguage.googleapis.com/v1beta'),('openai','Codex','https://chatgpt.com/backend-api/codex')]
for i in range(len(manifest['accounts']),8):
 provider,label,base=providers[i%4];name=f'测试 · {label} {i//4+1:02}'
 if provider=='openai':data={'name':name,'email':f'{PREFIX}-codex-{i}@example.com','access_token':'fixture-disabled-not-a-real-token-'+str(i)}
 else:data={'schema_version':1,'name':name,'api_key':'fixture-disabled-not-a-real-key-'+str(i),'base_url':base}
 result=api('/api/admin/accounts/import',{'provider':provider,'data':data,'settings':{'notes':'测试数据：虚构凭据，保持停用','enabled':False,'concurrencyLimit':[5,10,15,20,8,12,16,24][i],'weight':1,'groupIds':[manifest['groups'][i%3]['id']],'modelAccess':{'mode':'all','models':[]}}})
 account=api('/api/admin/accounts/detail?accountId='+result['accountIds'][0])['account'];manifest['accounts'].append(account);save()
for i in range(len(manifest['announcements']),3):
 result=api('/api/admin/v1/engagement',{'op':'save_announcement','id':None,'revision':None,'document':{'title':['测试 · 系统维护通知','测试 · 模型价格调整','测试 · 新用户使用指南'][i],'content':'## 测试公告\n\n这是页面验收数据，用于查看排版、分组范围和发布时间。\n\n- 支持 Markdown\n- 仅用于测试环境','status':'draft','delivery':['silent','popup','silent'][i],'groupIds':[] if i==0 else [manifest['groups'][i%3]['id']],'startsAt':None,'endsAt':None}});manifest['announcements'].append(result['id']);save()
# Legitimate wallet credits for test tenants only; regular customers are never touched.
for i,u in enumerate(manifest['users']):
 api('/api/admin/v1/billing/wallets/'+u['tenant_id']+'/credits',{'amount_usd':str([50,100,200,30,10][i]),'paid_cny':str([350,700,1400,210,70][i]),'reason':'测试数据：演示充值记录'},extra={'Idempotency-Key':PREFIX+'-credit-'+str(i)})
manifest['apiComplete']=True;save()
print('PASS API fixtures: '+json.dumps({k:len(v) for k,v in manifest.items() if isinstance(v,list)}))
# Supplemental historical rows are written in one transaction, using deterministic IDs.
statements=['begin;']
for i,a in enumerate(manifest['accounts']):
 statements.append(f"update provider_accounts set email={q(f'{PREFIX}-account-{i+1}@example.com')},plan_type={q(['Plus','Pro','Team','Free'][i%4])},created_at=least(created_at,clock_timestamp()-interval '10 days'),next_refresh_at=null where id={q(a['id'])} and enabled=false;")
 if a['provider']=='openai':
  quota={'plan_type':'pro','rate_limit':{'allowed':True,'limit_reached':False,'primary_window':{'used_percent':35+i,'reset_at':int(now.timestamp())+3600,'limit_window_seconds':18000},'secondary_window':{'used_percent':62+i,'reset_at':int(now.timestamp())+86400,'limit_window_seconds':604800}}}
  statements.append(f"update provider_accounts set provider_quota_json={j(quota)},quota_observed_at=clock_timestamp(),updated_at=clock_timestamp(),access_token_expires_at=clock_timestamp()+interval '30 days' where id={q(a['id'])} and enabled=false;")
 for k in range(6):
  u=manifest['users'][(i+k)%5];g=manifest['groups'][i%3];rid=f'{PREFIX}-request-{i}-{k}';provider=a['provider'];model={'openai':'gpt-5.5','openai_api':'gpt-4.1','claude':'claude-sonnet-4-5','gemini':'gemini-2.5-pro'}[provider];start=at(days=-(k//2),hours=-(k%2+1));cost=round((i+1)*(k+1)*0.037,4)
  obs={'request':{'configRevision':1,'protocol':'openai','endpoint':'/v1/responses','compact':False,'clientApiKeyNameSnapshot':'测试 Key'},'routing':{'scope':'groups','groupRefs':[g['id']],'groupNamesSnapshot':[g['name']]},'timings':{'local':{'latencyMs':600+83*k,'firstTokenMs':120+16*k}}}
  statements.append(f"""insert into model_requests(id,client_api_key_ref,operation,client_transport,requested_model_id,provider_kind,provider_account_ref,upstream_model_id,upstream_transport,attempt_count,upstream_send_state,downstream_committed_at,outcome,client_status_code,upstream_status_code,input_tokens,output_tokens,cached_input_tokens,total_tokens,cost_source,cost_amount,cost_currency,started_at,recovery_lease_expires_at,completed_at,request_observation_json,tenant_id,user_id,key_generation,user_generation,tenant_generation) values ({q(rid)},'key_ui_test_20261105','responses','http_sse',{q(model)},{q(provider)},{q(a['id'])},{q(model)},'http_sse',1,'sent',{q(start)}::timestamptz+interval '1 second','succeeded',200,200,{10000*(k+1)},{750*(k+1)},{5000*(k+1)},{10750*(k+1)},'provider_reported',{cost},'USD',{q(start)},{q(start)}::timestamptz+interval '5 minutes',{q(start)}::timestamptz+interval '1 second',{j(obs)},{q(u['tenant_id'])},{q(u['id'])},1,1,1) on conflict(id) do nothing;""")
# Add released/frozen referral examples tied to actual test credit receipts.
inviter=manifest['users'][0]
for i,u in enumerate(manifest['users'][1:4]):
 statements.append(f"insert into referral_invitations(invitee_id,inviter_id,code,created_at) select {q(u['id'])},user_id,code,clock_timestamp()-interval '3 days' from referral_accounts where user_id={q(inviter['id'])} on conflict do nothing;")
 statements.append(f"insert into referral_rebates(id,recharge_id,inviter_id,invitee_id,amount_usd,rate,available_at) select {q(uid('rebate'+str(i)))},c.id,{q(inviter['id'])},{q(u['id'])},trunc(c.amount_usd*0.1,10),10,clock_timestamp()+interval '{24 if i==0 else -24} hours' from confirmed_recharges c join wallet_credit_commands w on w.id=c.id where c.tenant_id={q(u['tenant_id'])} and w.idempotency_key like '{PREFIX}-credit-%' on conflict do nothing;")
# Completed draws only; no live round or outbound notifications are started.
statements.append(f"insert into lottery_rounds(status,reward_cents,winner_count,participant_target,minimum_recharge_cents,human_verification,created_by,idempotency_key,created_at,drawn_at) select 'drawn',500,2,5,0,false,id,{q(PREFIX+'-draw')},clock_timestamp()-interval '2 days',clock_timestamp()-interval '1 day' from identity_management_principals where username='ovload_test_admin' on conflict(idempotency_key) do nothing;")
for i,u in enumerate(manifest['users']):
 statements.append(f"insert into lottery_participants(round_id,user_id,tenant_id) select id,{q(u['id'])},{q(u['tenant_id'])} from lottery_rounds where idempotency_key={q(PREFIX+'-draw')} on conflict do nothing;")
 if i<2:
  win=uid('winner'+str(i));statements.append(f"insert into lottery_winners(id,round_id,user_id,tenant_id,reward_usd) select {q(win)},id,{q(u['id'])},{q(u['tenant_id'])},5 from lottery_rounds where idempotency_key={q(PREFIX+'-draw')} on conflict do nothing;")
  statements.append(f"insert into wallet_ledger_entries(id,tenant_id,direction,entry_kind,amount_usd,source_id,idempotency_key) values({q(uid('lottery-ledger'+str(i)))},{q(u['tenant_id'])},'credit','lottery_reward',5,{q(win)},{q(PREFIX+'-lottery-'+str(i))}) on conflict do nothing;")
for i,u in enumerate(manifest['users'][:3]):
 aid=uid('audit'+str(i));record={'id':aid,'at':at(hours=-i),'stage':'input','groupId':manifest['groups'][i]['id'],'user':u['display_name'],'email':u['email'],'keyId':'key_ui_test_20261105','keyName':'测试 Key','endpoint':'/v1/responses','model':'gpt-5.5','result':['pass','flagged','blocked'][i],'action':['recorded','recorded','blocked'][i],'latencyMs':35+i*10,'summary':'测试数据：安全审计展示样例','risks':[] if i==0 else [{'category':'keyword','score':0.95,'threshold':0.8}]}
 statements.append(f"insert into content_audit_records(id,request_id,user_id,stage,hit,record,expires_at) values({q(aid)},{q(PREFIX+'-audit-'+str(i))},{q(u['id'])},'input',{str(i>0).lower()},{j(record)},clock_timestamp()+interval '90 days') on conflict do nothing;")
# Pages without a commerce implementation read an explicitly labelled, non-executable fixture dataset.
plans=[];records=[];orders=[];codes=[]
for i in range(3):
 plan={'id':PREFIX+'-plan-'+str(i),'name':['测试 · 基础套餐','测试 · 专业套餐','测试 · 团队套餐'][i],'originalPriceCents':3000*(i+1),'weeklyCents':5000*(i+1),'unlimited':{'daily':False,'weekly':False,'monthly':False},'sort':i,'currencyLabel':'USD','features':'测试套餐展示\n示例额度','priceCents':2000*(i+1),'days':30,'dailyCents':1000*(i+1),'monthlyCents':15000*(i+1),'resetTime':'00:00','timezone':'Asia/Shanghai','description':'测试展示数据，不授予实际订阅权益','notes':'测试数据','published':False};plans.append(plan)
for i,u in enumerate(manifest['users']):
 records.append({'id':PREFIX+'-subscription-'+str(i),'userId':u['id'],'plan':plans[i%3],'start':at(days=-35 if i==3 else (-3 if i!=4 else 2)),'end':at(days=-5 if i==3 else 27),'dailyUsed':125*(i+1),'monthlyUsed':1450*(i+1),'revoked':i==2,'notes':'测试展示数据，不授予真实订阅权益'})
 for k in range(2):
  orders.append({'id':PREFIX+f'-order-{i}-{k}','number':f'TEST-20261105-{i+1:02}{k+1:02}','user':u['display_name'],'email':u['email'],'type':'balance' if k==0 else 'plan','plan':plans[i%3]['name'] if k else '', 'credited':(i+1)*1000,'paid':(i+1)*7000,'method':'alipay' if i%2 else 'wechat','status':['paid','pending','cancelled','refunded','paid'][(i+k)%5],'created':at(days=-i),'settled':at(days=-i) if (i+k)%5 in [0,4] else None})
for i in range(6):codes.append({'id':PREFIX+'-code-'+str(i),'code':'TEST-PREVIEW-NOT-REDEEMABLE-'+str(i+1),'type':['balance','concurrency','subscription','invitation'][i%4],'value':1000 if i%4==0 else 5,'planName':plans[i%3]['name'],'maxUses':5,'perUser':1,'disabled':True,'expiresAt':at(days=30 if i<4 else -1),'createdAt':at(days=-2),'notes':'测试展示记录，不是可兑换凭证','history':[] if i<3 else [{'id':uid('redemption'+str(i)),'user':manifest['users'][i%5]['display_name'],'email':manifest['users'][i%5]['email'],'at':at(days=-1)}]})
dataset={'plans':plans,'records':records,'users':[{'id':u['id'],'username':u['display_name'],'email':u['email'],'status':'active'} for u in manifest['users']],'orders':orders,'codes':codes}
statements.append(f"insert into management_test_datasets(id,document) values('ui-preview',{j(dataset)}) on conflict(id) do update set document=excluded.document;")
statements.append('commit;');pg('\n'.join(statements))
manifest['databaseComplete']=True;manifest['counts']={'accounts':8,'groups':3,'proxies':3,'users':5,'announcements':3,'usage':48,'referralRebates':3,'lotteryRounds':1,'lotteryWinners':2,'audit':3,'plans':3,'subscriptions':5,'orders':10,'redemptionCodes':6};save()
api('/api/admin/v1/auth/session',method='DELETE')
print('PASS database fixtures '+json.dumps(manifest['counts']))
