"""Read-only smoke checks on the regular test website after deployment."""
import hashlib,json
from pathlib import Path
import commerce_verify as v
v.BASE='https://192.168.2.150:19443'
root=Path('/opt/webcodex/ovload-gateway-test-runtime-20261031')
client=v.Client()
client.login('ovload_test_admin',(root/'administrator.password').read_text().strip())
checks=[]
for route in ['/api/admin/v1/engagement/commerce','/api/admin/account-groups','/api/admin/proxies?page=1&pageSize=50']:
 data=client.call(route)
 assert isinstance(data,dict)
 checks.append(route)
# Close only this smoke-check session; leave all user browser sessions untouched.
client.call('/api/admin/v1/auth/session',method='DELETE',status=204)
(v.OUT/'live-checks.json').write_text(json.dumps({'passed':True,'reads':checks,'smokeSessionClosed':True},indent=2))
print('PASS regular test-site login, commerce/groups/proxy reads; smoke session closed')
