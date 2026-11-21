"""Temporary group fixtures and real API regression on the authorized test server."""
import base64,copy,hashlib,http.client,json,secrets,ssl,sys,uuid
from urllib.parse import urlencode
sys.argv.append('--live')
import usage_seed as seed
api=seed.api
OUT=seed.SOURCE/'test-results/groups-completion'
admin=api.Client();admin.login('ovload_test_admin',(seed.ROOT/'administrator.password').read_text().strip())
prefix='groups-verify-'+uuid.uuid4().hex[:10]
created=[];key_id=None;checks=[]
def passed(name): checks.append(name);print('PASS '+name,flush=True)
def fields(platform=None,visibility='public'):
 return dict(name=prefix+'-'+str(len(created)),description='Temporary group verification',color='#0284C7FF',platform=platform,visibility=visibility,fastMode='default',allowImageGeneration=True,retailMultiplierBps=15000,modelRoutes=None,pricing={'peak':None,'modelPrices':{}},controls={'requestsPerMinute':60,'allowLive':True,'userOverrides':{}})
def page(**query):return admin.call('/api/admin/account-groups?'+urlencode({'search':prefix,'pageSize':200,**query}))['data']
def update(gid,body,status=200,revision=None):
 return admin.call('/api/admin/account-groups/update',{**body,'id':gid,'configRevision':page()['configRevision'] if revision is None else revision},status=status)
try:
 api.Client().call('/api/admin/account-groups',status=401)
 for platform,visibility in [(None,'public'),('claude','private'),('gemini','public')]:
  body=fields(platform,visibility);r=admin.call('/api/admin/account-groups/create',body,status=201)['data'];created.append((r['id'],body));assert r['record']['controls']==body['controls']
 assert page()['page']['total']==3
 assert page(platform='claude')['page']['total']==1
 assert page(platform='all')['page']['total']==1
 assert page(platform='claude,gemini')['page']['total']==2
 assert page(visibility='private')['page']['total']==1
 assert page(platform='claude,gemini',visibility='public')['items'][0]['platform']=='gemini'
 assert page(pageSize=1,page=2)['page']['total']==3
 for query in ['platform=bogus','visibility=bad']:
  admin.call('/api/admin/account-groups?'+query,status=400)
 passed('Platform/type/status filtering and pagination use real server totals')
 gid,body=created[0]
 user=json.loads(api.pg("select json_build_object('id',u.id,'tenant_id',u.tenant_id) from identity_users u join identity_tenants t on t.id=u.tenant_id join identity_tenant_wallets w on w.tenant_id=t.id where u.status='active' and t.status='active' limit 1"))
 owner=user['tenant_id']+'/'+user['id']
 body['pricing']={'peak':{'timezone':'Asia/Shanghai','startMinute':1320,'endMinute':360,'peakMultiplierBps':15000,'offPeakMultiplierBps':8000},'modelPrices':{'check-model':{'input':'3','output':'9','cacheRead':'0.5','cacheWrite':'2'}}}
 body['modelRoutes']={'check-alias':'check-model'}
 body['controls']['userOverrides']={owner:{'multiplierBps':5000,'requestsPerMinute':5}}
 before=page()['configRevision'];update(gid,body,revision=before)
 row=next(r for r in page()['items'] if r['id']==gid)
 assert row['controls']==body['controls'] and row['pricing']==body['pricing'] and row['modelRoutes']==body['modelRoutes']
 update(gid,body,status=409,revision=before)
 admin.call('/api/admin/account-groups/update',{**body,'id':gid,'configRevision':page()['configRevision']},headers={'X-CSRF-Token':''},status=403)
 for mutate in [lambda b:b['controls'].update(requestsPerMinute=1000001),lambda b:b['controls'].update(userOverrides={'bad':{'multiplierBps':5000,'requestsPerMinute':None}}),lambda b:b['controls'].update(userOverrides={str(uuid.uuid4())+'/'+str(uuid.uuid4()):{'multiplierBps':5000,'requestsPerMinute':None}}),lambda b:b['controls'].update(userOverrides={owner:{'multiplierBps':1000000,'requestsPerMinute':None}})]:
  bad=copy.deepcopy(body);mutate(bad);update(gid,bad,status=400)
 passed('RPM, per-user overrides, overnight peak pricing, model prices and aliases persist; invalid writes, stale revision and CSRF rejected')
 # Temporary key owned by an existing test identity; never exposed in output or saved.
 key_id='key_'+uuid.uuid4().hex;secret='sk_'+secrets.token_urlsafe(32)
 api.pg("insert into client_api_keys(id,name,key_digest,key_prefix,enabled,tenant_id,user_id,account_group_id,wallet_tenant_id,max_concurrency,requests_per_minute,created_at,updated_at) values("+','.join([seed.q(key_id),seed.q(prefix),"decode("+seed.q(hashlib.sha256(secret.encode()).hexdigest())+",'hex')",seed.q('sk_verify'),'true',seed.q(user['tenant_id']),seed.q(user['id']),seed.q(gid),seed.q(user['tenant_id']),'2','60','now()','now()'])+");")
 body['controls']['allowLive']=False;update(gid,body)
 bearer={'Authorization':'Bearer '+secret}
 for path in ['/v1/live','/v1/realtime','/v1/realtime/calls']:
  result=admin.call(path,{},headers=bearer,status=403);assert result['error']['code']=='live_disabled'
 for path in ['/v1/live/call_verify','/v1/realtime/calls/call_verify','/v1/realtime?call_id=call_verify']:
  headers={**bearer,'Connection':'Upgrade','Upgrade':'websocket','Sec-WebSocket-Version':'13','Sec-WebSocket-Key':base64.b64encode(secrets.token_bytes(16)).decode()}
  connection=http.client.HTTPSConnection('192.168.2.150',19443,context=ssl._create_unverified_context(),timeout=15)
  connection.request('GET',path,headers=headers);response=connection.getresponse();raw=response.read();connection.close()
  assert response.status==403,(path,response.status,raw.decode());assert json.loads(raw)['error']['code']=='live_disabled'
 body['controls']['allowLive']=True;update(gid,body)
 # The empty test group has no upstream accounts; reopening reaches routing without any external call.
 result=admin.call('/v1/live',{},headers=bearer,status=503);assert result['error']['code']=='no_available_provider'
 passed('Live and Realtime HTTP/WS entry points enforce the saved group switch before dialing')
 body['controls']['userOverrides']={};body['controls']['requestsPerMinute']=0;body['pricing']={'peak':None,'modelPrices':{}};body['modelRoutes']=None
 update(gid,body)
 row=next(r for r in page()['items'] if r['id']==gid)
 assert row['controls']['userOverrides']=={} and row['pricing']==body['pricing']
 admin.call('/api/admin/account-groups/disable',{'id':gid})
 assert page(enabled='false')['page']['total']==1
 admin.call('/api/admin/account-groups/enable',{'id':gid})
 assert page(enabled='true')['page']['total']==3
 passed('Removing overrides/prices restores inheritance; enable/disable remains operational')
 (OUT/'api.json').write_text(json.dumps({'passed':True,'checks':checks},ensure_ascii=False,indent=2))
finally:
 if key_id:
  # This script owns exactly this synthetic key. No real credential/history is removed.
  api.pg('begin; lock table client_api_keys in exclusive mode; delete from model_requests where client_api_key_ref='+seed.q(key_id)+'; alter table client_api_keys disable trigger model_key_bindings; delete from client_api_keys where id='+seed.q(key_id)+' and name='+seed.q(prefix)+'; alter table client_api_keys enable trigger model_key_bindings; commit;')
 for gid,_ in reversed(created):admin.call('/api/admin/account-groups/delete',{'id':gid})
 admin.call('/api/admin/v1/auth/session',method='DELETE',status=204)
