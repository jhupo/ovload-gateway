"""Verify server-side usage filters against synthetic settlement records."""
import json
from urllib.parse import urlencode
import usage_seed as seed

def main():
 api=seed.api; manifest=json.loads(seed.manifest_path.read_text())
 client=api.Client();client.login('ovload_test_admin' if seed.LIVE else 'ovload_usage_verify',(seed.ROOT/'administrator.password').read_text().strip())
 def read(**filters):
  return client.call('/api/admin/usage/records?'+urlencode({'period':'30d','status':'all','pageSize':100,**filters}))['data']
 try:
  all_rows=read(userEmail=seed.PREFIX)['items'];assert len(all_rows)==84
  for user in manifest['users']:
   rows=read(userEmail=user['email']);assert rows['total']==28
   assert all(r['userEmail']==user['email'] for r in rows['items'])
  assert read(userEmail='%')['total']==0
  assert read(userEmail=seed.PREFIX,groupId='no-such-group')['total']==0
  assert read(userEmail=seed.PREFIX,groupId=manifest['group']['id'])['total']==84
  checks=['Email search escapes wildcard characters; group filter and counts match database fixtures']
  for mode in ['wallet','subscription']:
   expected={r['id'] for r in all_rows if r['fundingSource']==mode or (mode=='wallet' and r['pendingChargeUsd'] is not None)}
   first=read(userEmail=seed.PREFIX,billingMode=mode,pageSize=10)
   assert first['total']==len(expected)
   rows=first['items']
   for page in range(2,(len(expected)+9)//10+1):rows+=read(userEmail=seed.PREFIX,billingMode=mode,pageSize=10,currentPage=page)['items']
   assert {r['id'] for r in rows}==expected
   for provider in ['openai_api','claude','gemini']:
    subset=read(userEmail=seed.PREFIX,groupId=manifest['group']['id'],billingMode=mode,provider=provider)
    assert {r['id'] for r in subset['items']}=={r['id'] for r in rows if r['provider']==provider}
   assert read(userEmail=seed.PREFIX,billingMode=mode,status='error')['total']==0
  assert read(userEmail=seed.PREFIX,status='error')['total']==len([r for r in all_rows if r['logicalOutcome'] in ('failed','incomplete')])
  client.call('/api/admin/usage/records?billingMode=invalid',status=400)
  checks.append('Wallet/subscription filters combine with group and provider across pagination; non-success tab retains outcome scope')
  (seed.SOURCE/'test-results/usage-filters'/('live-api.json' if seed.LIVE else 'api.json')).write_text(json.dumps({'passed':True,'checks':checks},indent=2))
  print('\n'.join('PASS '+c for c in checks))
 finally:client.call('/api/admin/v1/auth/session',method='DELETE',status=204)

if __name__=='__main__':main()
