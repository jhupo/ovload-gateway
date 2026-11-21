"""Verify usage projections against real stored settlement evidence."""
import json
from datetime import datetime,timedelta,timezone
from decimal import Decimal
from urllib.parse import urlencode
import usage_seed as seed
api=seed.api

def main():
    manifest=json.loads(seed.manifest_path.read_text())
    admin=api.Client();admin.login('ovload_test_admin' if seed.LIVE else 'ovload_usage_verify',(seed.ROOT/'administrator.password').read_text().strip())
    checks=[]
    rows=[]
    now=datetime.now(timezone.utc)
    window={'startTime':(now-timedelta(days=8)).isoformat(),'endTime':(now+timedelta(minutes=1)).isoformat()}
    def read(path,params):return admin.call(path+'?'+urlencode(params))['data']
    for user in manifest['users']:
        params={**window,'userId':user['id'],'status':'all','pageSize':10,'currentPage':1}
        first=read('/api/admin/usage/records',params)
        assert first['total']==28,first['total']
        owned=first['items']
        for page in [2,3]:owned+=read('/api/admin/usage/records',{**params,'currentPage':page})['items']
        assert len(owned)==len({r['id'] for r in owned})==28
        assert all(r['userId']==user['id'] and r['userName']==user['display_name'] and r['userEmail']==user['email'] for r in owned)
        assert all(r['routingGroupRefs']==[manifest['group']['id']] and r['routingGroupNamesSnapshot']==[manifest['group']['name']] for r in owned)
        assert all(r['accountName'].startswith('测试 · 用量') for r in owned)
        rows+=owned
    checks.append('Users, groups and account snapshots are correct across server-side pagination')
    facts=json.loads(api.pg("select coalesce(json_agg(json_build_object('id',request_id,'state',state,'amount',amount_usd::text,'subscription',subscription_id)), '[]') from commerce_execution_charges where request_id like 'usage-demo-20261108-request-%'"))
    facts={f['id']:f for f in facts}
    kinds=set()
    for row in rows:
        fact=facts.get(row['id'])
        if fact is None:
            assert row['retailChargeUsd'] is None and row['retailState'] is None and row['fundingSource'] is None
            continue
        kinds.add(fact['state'])
        if fact['state']=='pending':
            assert row['retailChargeUsd'] is None and row['fundingSource'] is None
            assert row['retailState']=='reconciliation_required' and Decimal(row['pendingChargeUsd'])==Decimal(fact['amount'])
        else:
            assert row['retailState']=='settled' and row['fundingSource']==fact['state']
            assert Decimal(row['retailChargeUsd'])==Decimal(fact['amount']) and row['pendingChargeUsd'] is None
            assert row['subscriptionId']==fact['subscription']
    assert kinds=={'wallet','subscription','pending'},kinds
    checks.append('Wallet/subscription charges match exact ledger evidence; pending and unknown never appear as settled charges')
    for source in ['wallet','subscription',None]:
        row=next(r for r in rows if r['fundingSource']==source)
        detail=read('/api/admin/usage/records/detail',{'id':row['id']})
        for key in ['userId','userName','userEmail','retailChargeUsd','retailState','fundingSource','subscriptionId','pendingChargeUsd','routingGroupRefs','routingGroupNamesSnapshot']:
            assert detail[key]==row[key],(key,detail[key],row[key])
        assert detail['attemptCount']==1 and detail['requestedModel']==row['requestedModel']
    checks.append('Request detail agrees with list identity, group, funding and settlement fields')
    for provider in [None,'claude','gemini','openai_api']:
        params={**window,**({'provider':provider} if provider else {})}
        summary=read('/api/admin/usage/records/summary',params)
        sql="select coalesce(sum(b.settled_usd),0)::text from model_requests m join commerce_request_settlements b on b.operation_id=m.id and b.tenant_id=m.tenant_id and b.user_id=m.user_id and b.model_key_id=m.client_api_key_ref where m.owns_client_admission and b.state='settled' and m.started_at >= "+seed.q(window['startTime'])+" and m.started_at < "+seed.q(window['endTime'])
        if provider:sql+=' and m.provider_kind='+seed.q(provider)
        assert Decimal(summary['retailChargeUsd'])==Decimal(api.pg(sql))
    checks.append('Global/provider totals match settled database amounts and exclude unpaid usage')
    api.Client().call('/api/admin/usage/records',status=401)
    admin.call('/api/admin/v1/auth/session',method='DELETE',status=204)
    (seed.OUT/('live-api-checks.json' if seed.LIVE else 'api-checks.json')).write_text(json.dumps({'passed':True,'checks':checks,'requests':len(rows)},indent=2))
    print('\n'.join('PASS '+c for c in checks))

if __name__=='__main__':main()
