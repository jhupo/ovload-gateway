"""Read-only cross-module platform filters, plus temporary system-log fixtures."""
import sys,json,time,uuid
from pathlib import Path
from urllib.parse import urlencode
from datetime import datetime,timedelta,timezone
sys.argv.append('--live')
import usage_seed as seed
api=seed.api
out=Path('/opt/webcodex/ovload-gateway-codex-test-20261031135140/test-results/platform-consistency')
client=api.Client();client.login('ovload_test_admin',(seed.ROOT/'administrator.password').read_text().strip())
prefix='platform-filter-'+str(time.time_ns()); checks=[]
def get(path,params):
 r=client.call(path+'?'+urlencode(params));return r['data'] if isinstance(r,dict) and 'code' in r else r
def pages(path,params):
 rows=[];page=1
 while True:
  r=get(path,{**params,'currentPage':page,'pageSize':100});rows+=r['items']
  if len(rows)>=r['total']:return rows
  page+=1;assert page<30
try:
 end=datetime.now(timezone.utc).replace(microsecond=0);start=end-timedelta(days=7)
 window={'startTime':start.isoformat(),'endTime':end.isoformat()}
 allrows=pages('/api/admin/usage/records',window)
 assert any(r['provider']=='openai_api' for r in allrows),'API usage fixture missing'
 summaries=[]
 for platform,kinds in [('openai',['openai','openai_api']),('xai',['xai','xai_api']),('claude',['claude']),('gemini',['gemini'])]:
  params={**window,'provider':platform};rows=pages('/api/admin/usage/records',params)
  expected=[r for r in allrows if r['provider'] in kinds]
  assert {r['id'] for r in rows}=={r['id'] for r in expected},platform
  # A user filter exercises the raw path alongside the unfiltered analytics path.
  if expected and expected[0]['userEmail']:
   email=expected[0]['userEmail'];raw=pages('/api/admin/usage/records',{**params,'userEmail':email})
   assert {r['id'] for r in raw}=={r['id'] for r in expected if r['userEmail']==email}
  summary=get('/api/admin/usage/records/summary',params)
  assert summary['logicalRequests']['requestCount']>=len(expected)
  summaries.append(summary['logicalRequests']['requestCount'])
  if expected:
   model=expected[0]['model']
   if model:
    narrowed=pages('/api/admin/usage/records',{**params,'model':model})
    assert {r['id'] for r in narrowed}=={r['id'] for r in expected if r['model']==model}
  monitoring=get('/api/admin/v1/monitoring',{'from':start.isoformat(),'to':end.isoformat(),'provider':platform})
  condition="provider_kind in ("+','.join(seed.q(k) for k in kinds)+")"
  expected_requests=int(api.pg('select count(*) from model_requests where owns_client_admission and started_at>='+seed.q(start.isoformat())+' and started_at<'+seed.q(end.isoformat())+' and '+condition))
  assert sum(p['requests'] for p in monitoring['points'])==expected_requests,(platform,monitoring)
  ranking=get('/api/admin/v1/usage/ranking',params)
  assert sum(r['requests'] for r in ranking['items'])==expected_requests
  checks.append({'platform':platform,'usageRecords':len(rows),'executionRequests':expected_requests})
 assert sum(summaries)==get('/api/admin/usage/records/summary',window)['logicalRequests']['requestCount']
 # Legacy exact filters still work for clients using adapter IDs.
 for adapter in ['openai_api','xai_api']:
  assert all(r['provider']==adapter for r in pages('/api/admin/usage/records',{**window,'provider':adapter}))
 # Logs use six independent adapter values; no credentials or account changes.
 providers=['openai','openai_api','xai','xai_api','claude','gemini']
 logids=[str(uuid.uuid4()) for _ in providers]
 api.pg('insert into system_logs(id,occurred_at,level,component,message,provider,fields) values '+','.join('('+','.join([seed.q(i),"now()",seed.q('INFO'),seed.q('platform-regression'),seed.q(prefix),seed.q(p),"'{}'::jsonb"])+')' for i,p in zip(logids,providers)))
 logwindow={'from':start.isoformat(),'to':(end+timedelta(minutes=5)).isoformat(),'search':prefix}
 for platform,kinds in [('openai',['openai','openai_api']),('xai',['xai','xai_api']),('claude',['claude']),('gemini',['gemini']),('openai_api',['openai_api']),('xai_api',['xai_api'])]:
  r=get('/api/admin/v1/monitoring/logs',{**logwindow,'provider':platform})
  assert r['total']==len(kinds) and {i['provider'] for i in r['items']}==set(kinds),(platform,r)
 (out/'api.json').write_text(json.dumps({'passed':True,'platforms':checks,'checks':['Usage page matches unfiltered adapter union','User filter/raw query matches analytics list','Summary endpoint accepts all platforms','Monitoring and rankings agree with database execution facts','System logs include both access methods','Legacy exact adapter filters remain supported']}))
 print('PASS platform filters across usage, monitoring, ranking and logs')
finally:
 api.pg('delete from system_logs where component='+seed.q('platform-regression')+' and message='+seed.q(prefix))
 client.call('/api/admin/v1/auth/session',method='DELETE',status=204)

