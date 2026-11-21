"""Read-only account visibility checks, excluding credentials and personal claims."""
import json
from pathlib import Path
import commerce_verify as api
api.BASE = 'https://192.168.2.150:19443'
client = api.Client()
client.login('ovload_test_admin', Path('/opt/webcodex/ovload-gateway-test-runtime-20261031/administrator.password').read_text().strip())
target = 'acct_01a1daf7af217688b3e6a31c4a0ea9e2'
try:
    for suffix in ['', '&status=normal', '&status=disabled']:
        data = client.call('/api/admin/accounts?page=1&pageSize=50' + suffix)['data']
        items = data['items']
        account = next((a for a in items if a['id'] == target), None)
        if not suffix:
            assert account is not None, 'Saved account must be returned without filters'
            assert items[0]['id'] == target, 'Newest account must appear first by default'
        print(json.dumps({'status': suffix or 'all', 'returned': len(items), 'present': account is not None, 'enabled': account.get('enabled') if account else None, 'position': next((i + 1 for i, a in enumerate(items) if a['id'] == target), None)}))
finally:
    client.call('/api/admin/v1/auth/session', method='DELETE', status=204)
