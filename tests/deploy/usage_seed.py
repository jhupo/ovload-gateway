"""Requested synthetic usage in isolated test identities. Run on the test server only."""
import gzip, hashlib, json, secrets, shutil, subprocess, sys, uuid
from datetime import datetime, timedelta, timezone
from pathlib import Path
from urllib.parse import urlsplit
import commerce_verify as api

LIVE = '--live' in sys.argv
SOURCE = Path('/opt/webcodex/ovload-gateway-codex-test-20261031135140')
ROOT = Path('/opt/webcodex/ovload-gateway-test-runtime-20261031' if LIVE else '/opt/webcodex/ovload-usage-verify-20261108')
api.BASE = 'https://192.168.2.150:' + ('19443' if LIVE else '19444')
api.DB = urlsplit(json.loads((ROOT/'deploy/config.yaml').read_text())['store']['database']['url']).path.lstrip('/')
PREFIX = 'usage-demo-20261108'
OUT = SOURCE/'test-results/usage-records'
manifest_path = OUT/('live-fixtures.json' if LIVE else 'verify-fixtures.json')
manifest = json.loads(manifest_path.read_text()) if manifest_path.exists() else {'users': [], 'accounts': []}
q = lambda x: "'" + str(x).replace("'", "''") + "'"
j = lambda x: q(json.dumps(x, ensure_ascii=False)) + '::jsonb'
uid = lambda x: str(uuid.uuid5(uuid.NAMESPACE_URL, PREFIX + '/' + x))
def save(): manifest_path.write_text(json.dumps(manifest, ensure_ascii=False, indent=2))

def main():
    if manifest.get('complete'):
        print('Fixtures already present; no duplicate credits or requests inserted')
        return
    if LIVE:
        backup = ROOT/'usage-backup-20261108/database-before-fixtures.sql.gz'
        assert not backup.exists(), 'Keep the original backup; inspect partial fixture run before retrying'
        with gzip.open(backup, 'wb') as target:
            dump = subprocess.Popen(['docker','exec','ovload-test-postgres','sh','-c','pg_dump -U "$POSTGRES_USER" "$1"','sh',api.DB],stdout=subprocess.PIPE)
            shutil.copyfileobj(dump.stdout,target); assert dump.wait()==0
    admin=api.Client();admin.login('ovload_test_admin' if LIVE else 'ovload_usage_verify',(ROOT/'administrator.password').read_text().strip())
    def call(path, data=None, status=200, **kwargs):
        value=admin.call(path,data,status=status,**kwargs)
        return value['data'] if isinstance(value,dict) and 'code' in value else value
    password=secrets.token_urlsafe(30)+'Aa1!'
    for i in range(len(manifest['users']),3):
        user=call('/api/admin/v1/users',{'email':f'{PREFIX}-{i}@example.com','display_name':['测试 · 钱包用量','测试 · 订阅用量','测试 · 待补扣用量'][i],'password':password,'max_concurrency':5,'requests_per_minute':60,'notes':'虚构使用统计；仅用于界面验收'},status=201)
        manifest['users'].append(user);save()
    if 'group' not in manifest:
        result=call('/api/admin/account-groups/create',{'name':'测试 · 使用统计','description':PREFIX+' 虚构使用统计','color':'#0284C7FF','visibility':'private','retailMultiplierBps':15000,'modelRoutes':None,'platform':None,'allowImageGeneration':True,'fastMode':'default','pricing':{'peak':None,'modelPrices':{}}},status=201)
        manifest['group']=result['record'];save()
    group=manifest['group']['id']
    providers=[('openai_api','OpenAI API','https://api.openai.com/v1','gpt-4.1'),('claude','Claude','https://api.anthropic.com/v1','claude-sonnet-4-5'),('gemini','Gemini','https://generativelanguage.googleapis.com/v1beta','gemini-2.5-pro')]
    for i in range(len(manifest['accounts']),3):
        provider,label,base,_=providers[i]
        imported=call('/api/admin/accounts/import',{'provider':provider,'data':{'schema_version':1,'name':'测试 · 用量 '+label,'api_key':'disabled-fixture-not-a-real-key','base_url':base},'settings':{'notes':PREFIX+' 虚构凭据，保持停用','enabled':False,'concurrencyLimit':10,'weight':1,'groupIds':[group],'modelAccess':{'mode':'all','models':[]}}},status=201)
        account=call('/api/admin/accounts/detail?accountId='+imported['accountIds'][0])['account'];manifest['accounts'].append(account);save()
    for i,user in enumerate(manifest['users'][:2]):
        call('/api/admin/v1/billing/wallets/'+user['tenant_id']+'/credits',{'amount_usd':'100','reason':'测试用量演示余额'},headers={'Idempotency-Key':PREFIX+'-credit-'+str(i)})
    if 'subscription' not in manifest:
        plan=admin.command({'action':'save_plan','document':{'name':'测试 · 用量演示套餐','description':'仅用于虚构使用统计','notes':PREFIX,'priceCents':500,'originalPriceCents':0,'dailyCents':1000,'weeklyCents':5000,'monthlyCents':10000,'unlimited':{'daily':False,'weekly':False,'monthly':False},'days':30,'sort':99,'currencyLabel':'USD','features':'统计验收','resetTime':'00:00','timezone':'Asia/Shanghai','published':True}},True,key=PREFIX+'-plan-v2')['id']
        manifest['plan']=plan
        manifest['subscription']=admin.command({'action':'assign','user_id':manifest['users'][1]['id'],'plan_id':plan,'notes':PREFIX},True,key=PREFIX+'-assign')['id'];save()
    sql=['begin;', f"update commerce_plans set document=jsonb_set(document,'{{published}}','false'),revision=revision+1 where id={q(manifest['plan'])} and document->>'notes'={q(PREFIX)};", f"update commerce_subscriptions set starts_at=clock_timestamp()-interval '8 days' where id={q(manifest['subscription'])} and notes={q(PREFIX)};"]
    for i,user in enumerate(manifest['users']):
        key=PREFIX+'-key-'+str(i)
        sql.append(f"insert into model_key_group_grants(tenant_id,user_id,account_group_id,granted) values({q(user['tenant_id'])},{q(user['id'])},{q(group)},true) on conflict do nothing;")
        sql.append(f"insert into client_api_keys(id,name,key_digest,key_prefix,enabled,tenant_id,user_id,account_group_id,wallet_tenant_id,max_concurrency,requests_per_minute,created_at,updated_at) values({q(key)},{q('测试用量 Key '+str(i+1))},decode({q(hashlib.sha256(secrets.token_bytes(32)).hexdigest())},'hex'),'sk_demo',false,{q(user['tenant_id'])},{q(user['id'])},{q(group)},{q(user['tenant_id'])},5,60,now(),now()) on conflict(id) do nothing;")
    now=datetime.now(timezone.utc)
    expected=[]
    for n in range(84):
        i=n%3;user=manifest['users'][i];account=manifest['accounts'][i];provider,_,_,model=providers[i]
        request=PREFIX+'-request-'+str(n);key=PREFIX+'-key-'+str(i)
        start=now-timedelta(days=n//12,minutes=(n%12)*15+5);finish=start+timedelta(milliseconds=1200+31*n)
        outcome='failed' if n%11==0 else 'cancelled' if n%13==0 else 'succeeded'
        success=outcome=='succeeded';input_tokens=1000+n*137;output_tokens=100+n*17;cache=input_tokens//3
        cost=f'{(input_tokens*2+output_tokens*8)/1000000:.8f}';charge=f'{float(cost)*1.5:.8f}'
        obs={'account':{'name':account['name'],'email':PREFIX+'-'+str(i)+'@example.com','authenticationKind':'api_key'},'request':{'configRevision':1,'protocol':'openai','endpoint':'/v1/chat/completions','compact':False,'clientApiKeyNameSnapshot':'测试用量 Key '+str(i+1),'clientIp':f'192.0.2.{i+1}','userAgent':'Ovload-Usage-Demo/1.0','reasoningEffort':'medium'},'routing':{'scope':'groups','groupRefs':[group],'groupNamesSnapshot':[manifest['group']['name']]},'timings':{'local':{'latencyMs':1200+31*n,'firstTokenMs':150+7*n}}}
        if not success: obs['error']={'message':'Synthetic upstream failure' if outcome=='failed' else 'Synthetic client cancellation','providerErrorCode':'demo_failure' if outcome=='failed' else 'demo_cancelled'}
        code=200 if success else 502 if outcome=='failed' else 499
        sql.append(f"insert into model_requests(id,client_api_key_ref,operation,client_transport,requested_model_id,provider_kind,provider_account_ref,upstream_model_id,upstream_transport,attempt_count,upstream_send_state,downstream_committed_at,outcome,client_status_code,upstream_status_code,input_tokens,output_tokens,cached_input_tokens,total_tokens,cost_source,cost_amount,cost_currency,started_at,recovery_lease_expires_at,completed_at,request_observation_json,tenant_id,user_id,key_generation,user_generation,tenant_generation) values({q(request)},{q(key)},'chat_completions','http_sse',{q(model)},{q(provider)},{q(account['id'])},{q(model)},'http_sse',1,'sent',{q(start.isoformat())}::timestamptz+interval '1 second',{q(outcome)},{code},{code},{input_tokens if success else 'null'},{output_tokens if success else 'null'},{cache if success else 'null'},{input_tokens+output_tokens if success else 'null'},{q('provider_reported' if success else 'unavailable')},{cost if success else 'null'},{q('USD') if success else 'null'},{q(start.isoformat())},{q((finish+timedelta(minutes=5)).isoformat())},{q(finish.isoformat())},{j(obs)},{q(user['tenant_id'])},{q(user['id'])},1,1,1) on conflict(id) do nothing;")
        if success:
            sql.append(f"insert into client_api_key_charge_events(request_id,client_api_key_id,amount_usd,completed_at) values({q(request)},{q(key)},{charge},{q(finish.isoformat())}) on conflict(request_id) do nothing;")
        expected.append({'id':request,'userId':user['id'],'userEmail':user['email'],'outcome':outcome,'amount':charge if success else None})
    sql.append('commit;');api.pg('\n'.join(sql))
    manifest.update({'complete':True,'requests':expected,'prefix':PREFIX,'synthetic':True});save()
    admin.call('/api/admin/v1/auth/session',method='DELETE',status=204)
    print('PASS 84 synthetic requests across 7 days; 3 isolated users and disabled accounts, wallet/subscription/payable cases')

if __name__=='__main__':main()
