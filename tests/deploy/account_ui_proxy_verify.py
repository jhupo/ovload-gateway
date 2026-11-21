"""Use the user-authorized local proxy for verification, then restore the test account."""
import json
import subprocess
from pathlib import Path
import commerce_verify as api

api.BASE = 'https://192.168.2.150:19443'
root = Path('/opt/webcodex/ovload-gateway-codex-test-20261031135140')
out = root / 'test-results/account-ui-refinement'
account_id = 'acct_01a1cfdfcaa1729f82a32c60ae9fba38'
client = api.Client()
client.login('ovload_test_admin', Path('/opt/webcodex/ovload-gateway-test-runtime-20261031/administrator.password').read_text().strip())
original = client.call('/api/admin/accounts/detail?accountId=' + account_id)['data']['account']
proxy = next(p for p in client.call('/api/admin/proxies?page=1&pageSize=50')['data']['items'] if p['endpoint'] == 'socks5://192.168.2.85:12334' and p['enabled'])
def assign(proxy_id):
    current = client.call('/api/admin/accounts/detail?accountId=' + account_id)['data']['account']
    client.call('/api/admin/accounts/batch-update', {'accountIds': [account_id], 'configRevision': current['configRevision'], 'outboundProxyId': proxy_id or ''})
(out / 'temporary-proxy.json').write_text(json.dumps({'accountId': account_id, 'originalProxyId': original['outboundProxyId']}))
try:
    assign(proxy['id'])
    result = subprocess.run(['docker', 'exec', 'ovload-account-ui', 'node', '/src/tests/deploy/account_ui_refinement.cjs'], check=False)
    (out / 'proxy-ui.exit').write_text(str(result.returncode))
finally:
    assign(original['outboundProxyId'])
    client.call('/api/admin/v1/auth/session', method='DELETE', status=204)
    (out / 'proxy-restored.json').write_text(json.dumps({'restored': True, 'accountId': account_id}))
