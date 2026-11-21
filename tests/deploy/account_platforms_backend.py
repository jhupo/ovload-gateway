"""Platform membership and API adapter checks on the existing test deployment."""
import json,sys,time
from pathlib import Path
sys.argv.append('--live')
import usage_seed as seed
api=seed.api
root=Path('/opt/webcodex/ovload-gateway-test-runtime-20261031')
out=Path('/opt/webcodex/ovload-gateway-codex-test-20261031135140/test-results/account-platforms')
client=api.Client();client.login('ovload_test_admin',(root/'administrator.password').read_text().strip())
prefix='platform-check-'+str(time.time_ns())
groups=[];accounts=[]
def call(path,data=None,status=200):
 value=client.call('/api/admin/'+path,data,status=status)
 return value['data'] if isinstance(value,dict) and 'code' in value else value
try:
 for platform,provider,url in [('openai','openai_api','https://api.openai.com/v1'),('xai','xai_api','https://api.x.ai/v1')]:
  group=call('account-groups/create',{'name':prefix+'-'+platform,'description':'Temporary platform regression','color':'#0284C7FF','visibility':'private','retailMultiplierBps':10000,'modelRoutes':None,'platform':platform,'allowImageGeneration':False,'fastMode':'default','pricing':{'peak':None,'modelPrices':{}}},201)['record'];groups.append(group['id'])
  settings={'notes':'Temporary platform regression','enabled':False,'concurrencyLimit':2,'weight':1,'modelAccess':{'mode':'all','models':[]},'groupIds':[group['id']]}
  doc={'provider':provider,'data':{'schema_version':1,'name':prefix+'-'+provider,'api_key':'fixture-not-a-real-key','base_url':url},'settings':settings}
  created=call('accounts/import',doc,201);account=created['accountIds'][0];accounts.append((provider,account))
  listing=call('accounts?provider='+platform+'&search='+prefix)
  assert any(a['id']==account for a in listing['items'])
  assert listing['page']['total']==1
  assert call('account-groups?platform='+platform+'&search='+prefix)['items'][0]['memberCount']==1
  # Legacy adapter identity and OAuth identity share the platform guard.
  assert api.pg("begin; update provider_accounts set provider_kind="+seed.q(platform)+" where id="+seed.q(account)+"; select account_platform(provider_kind) from provider_accounts where id="+seed.q(account)+"; rollback;").splitlines()[-1]==platform
  detail=call('accounts/detail?accountId='+account)
  assert detail['credentialConfiguration']['base_url']==url
  assert 'fixture-not-a-real-key' not in json.dumps(detail)
 # Cross-platform group membership must still be rejected atomically.
 before=int(api.pg('select count(*) from provider_accounts'))
 call('accounts/import',{'provider':'xai_api','data':{'schema_version':1,'name':prefix+'-wrong','api_key':'fixture-not-a-real-key','base_url':'https://api.x.ai/v1'},'settings':{**settings,'groupIds':[groups[0]]}},400)
 assert int(api.pg('select count(*) from provider_accounts'))==before
 for provider in ['openai_api','xai_api','claude','gemini']:
  call('accounts/models/preview',{'provider':provider,'data':{'schema_version':1,'name':'Preview','api_key':'fixture-key','base_url':'https://127.0.0.1/v1'}},400)
 assert int(api.pg('select count(*) from provider_accounts'))==before
 assert api.pg("select count(*) from account_groups where platform='openai_api'")=='0'
 (out/'backend-api.json').write_text(json.dumps({'passed':True,'checks':['OpenAI/Grok groups accept API adapters','OAuth/API platform identity is shared by membership guards','Platform list and pagination include API accounts','Cross-platform membership rejected without partial account creation','Credentials are redacted','Invalid model previews do not persist accounts','Legacy OpenAI API groups migrated']}))
 print('PASS platform groups, account filters, preview validation and credential redaction')
finally:
 for provider,account in accounts:call('accounts/delete',{'provider':provider,'accountIds':[account]})
 for group in groups:call('account-groups/delete',{'id':group})
 client.call('/api/admin/v1/auth/session',method='DELETE',status=204)
