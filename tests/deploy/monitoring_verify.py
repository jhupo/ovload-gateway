"""Authenticated monitoring regression checks on the authorized test server."""
import json, sys, time, uuid
from datetime import datetime, timedelta, timezone
from urllib.parse import urlencode
sys.argv.append('--live')
import usage_seed as seed
api=seed.api
out=seed.SOURCE/'test-results/monitoring-completion'
admin=api.Client()
admin.login('ovload_test_admin',(seed.ROOT/'administrator.password').read_text().strip())
prefix='monitoring-check-'+str(uuid.uuid4())
cfg=None
checks=[]
def passed(text):
    checks.append(text); print('PASS '+text,flush=True)
def get_logs(**kwargs):
    now=datetime.now(timezone.utc)
    query={'from':(now-timedelta(days=60)).isoformat(),'to':now.isoformat(),**kwargs}
    return admin.call('/api/admin/v1/monitoring/logs?'+urlencode(query))
try:
    api.Client().call('/api/admin/v1/monitoring/resources',status=401)
    api.Client().call('/api/admin/v1/monitoring/logs/config',status=401)
    admin.call('/api/admin/v1/monitoring/logs/cleanup',{'before':datetime.now(timezone.utc).isoformat()},headers={'X-CSRF-Token':''},status=403)
    cfg=admin.call('/api/admin/v1/monitoring/logs/config')
    saved=admin.call('/api/admin/v1/monitoring/logs/config',{**cfg,'retentionDays':90},method='PUT',headers={'If-Match':f'"{cfg["revision"]}"'})
    assert saved['retentionDays']==90 and saved['revision']==cfg['revision']+1
    admin.call('/api/admin/v1/monitoring/logs/config',cfg,method='PUT',headers={'If-Match':f'"{cfg["revision"]}"'},status=409)
    admin.call('/api/admin/v1/monitoring/logs/config',{**saved,'retentionDays':0},method='PUT',headers={'If-Match':f'"{saved["revision"]}"'},status=400)
    passed('Management authentication, CSRF, config persistence, validation and revision conflicts')
    fact=json.loads(api.pg("select json_build_object('id',id,'provider',provider_kind,'group',request_observation_json #>> '{routing,groupRefs,0}') from model_requests where owns_client_admission and provider_kind is not null and request_observation_json #>> '{routing,groupRefs,0}' is not null limit 1"))
    rows=[]
    for i in range(5):
        level='WARN' if i==0 else 'INFO'
        rows.append(f"({seed.q(prefix+'-'+str(i))},now()-interval '{i+1} minutes',{seed.q(level)},'ovload_test.monitoring',{seed.q(prefix+' event '+str(i))},{seed.q(fact['id'])},{seed.q(fact['provider'])},'monitoring-test-account','{{}}')")
    api.pg('insert into system_logs(id,occurred_at,level,component,message,request_id,provider,account_id,fields) values '+','.join(rows))
    first=get_logs(search=prefix,pageSize=2)
    second=get_logs(search=prefix,pageSize=2,page=2)
    assert first['total']==5 and len(first['items'])==2 and len(second['items'])==2
    assert not set(x['id'] for x in first['items']) & set(x['id'] for x in second['items'])
    assert get_logs(search=prefix,level='WARN')['total']==1
    assert get_logs(search=prefix,component='ovload_test.monitoring',accountId='monitoring-test-account',requestId=fact['id'],provider=fact['provider'],groupId=fact['group'])['total']==5
    assert get_logs(search=prefix,groupId='missing-group')['total']==0
    now=datetime.now(timezone.utc)
    admin.call('/api/admin/v1/monitoring/logs?'+urlencode({'from':now.isoformat(),'to':(now-timedelta(hours=1)).isoformat()}),status=400)
    passed('Log keyword, level, component, request, provider, group and account filters; stable pagination')
    api.pg(f"insert into system_logs(id,occurred_at,level,component,message) values({seed.q(prefix+'-old')},now()-interval '40 days','INFO','ovload_test.monitoring','retention fixture')")
    result=admin.call('/api/admin/v1/monitoring/logs/cleanup',{'before':(now-timedelta(days=30)).isoformat()})
    assert result['deleted']>=1 and api.pg(f"select count(*) from system_logs where id={seed.q(prefix+'-old')}")=='0'
    assert get_logs(search=prefix)['total']==5
    assert int(api.pg("select count(*) from system_log_changes where action in ('cleanup','configure')"))>=2
    passed('Cleanup cutoff preserves recent logs and records a management audit')
    resource=admin.call('/api/admin/v1/monitoring/resources')
    time.sleep(.3)
    resource=admin.call('/api/admin/v1/monitoring/resources')
    assert 0 <= resource['process']['cpuPercent'] <= 100
    mem=resource['process']['memory']; assert 0 < mem['used'] <= mem['total']
    db=resource['database']; assert 0 <= db['idle'] <= db['size'] <= db['max']
    assert resource['redis']['connected']>0 and resource['process']['jobs']['total']>0
    assert len(resource['process']['jobs']['items'])==resource['process']['jobs']['total']
    passed('CPU, memory, PostgreSQL pool, Redis clients and worker state are live measurements')
    for provider in ['claude','gemini',fact['provider']]:
        query={'from':(now-timedelta(days=30)).isoformat(),'to':now.isoformat(),'provider':provider,'group_id':fact['group'],'active_page':1,'active_page_size':1}
        value=admin.call('/api/admin/v1/monitoring?'+urlencode(query))
        assert len(value['active'])<=1 and set(value['activeSummary'])=={'total','users','threads','page'}
        summary=admin.call('/api/admin/usage/records/summary?'+urlencode({'startTime':query['from'],'endTime':query['to'],'provider':provider,'groupId':fact['group']}))['data']
        assert summary['logicalRequests']['requestCount']==sum(x['requests'] for x in value['points'])
        for key in ['callerErrorCount','cancelledCount']: assert isinstance(summary['logicalRequests'][key],int)
        for key in ['attemptCount','failureCount','rateLimitedCount']: assert isinstance(summary['attempts'][key],int)
    passed('Claude/Gemini/group filtering shares exact request totals and complete error/attempt metrics')
    live=get_logs(pageSize=100)
    assert any((x['component'].startswith('ovload_') or x['component'] in ['request_trace','gateway_startup']) and x['component']!='ovload_test.monitoring' for x in live['items'])
    passed('Structured application logs collected from the actual running process')
    (out/'api.json').write_text(json.dumps({'passed':True,'checks':checks,'resources':resource},indent=2))
finally:
    api.pg(f'delete from system_logs where id like {seed.q(prefix+"%")};')
    if cfg is not None:
        current=admin.call('/api/admin/v1/monitoring/logs/config')
        if {k:current[k] for k in ['enabled','level','retentionDays']} != {k:cfg[k] for k in ['enabled','level','retentionDays']}:
            admin.call('/api/admin/v1/monitoring/logs/config',{**cfg,'revision':current['revision']},method='PUT',headers={'If-Match':f'"{current["revision"]}"'})
    admin.call('/api/admin/v1/auth/session',method='DELETE',status=204)
