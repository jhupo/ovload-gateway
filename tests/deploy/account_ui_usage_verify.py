"""Read-only verification of account charges against the settled customer ledger."""
import json
from decimal import Decimal
from pathlib import Path
import commerce_verify as api

api.BASE = 'https://192.168.2.150:19443'
api.DB = 'ovload_test'
root = Path('/opt/webcodex/ovload-gateway-test-runtime-20261031')
out = Path('/opt/webcodex/ovload-gateway-codex-test-20261031135140/test-results/account-ui-refinement')
client = api.Client()
client.login('ovload_test_admin', (root / 'administrator.password').read_text().strip())
checks = []
try:
    accounts = client.call('/api/admin/accounts?page=1&pageSize=50')['data']['items']
    for account in accounts:
        if account['authenticationKind'] != 'api_key':
            continue
        # IDs are validated by the management API, additionally constrain SQL literal input here.
        identifier = account['id']
        assert all(c.isalnum() or c == '_' for c in identifier)
        expected = api.pg(f"""select coalesce(sum(s.settled_usd),0)::text
            from commerce_request_settlements s
            where s.state='settled' and exists (
                select 1 from model_requests mr join provider_accounts pa on pa.id=mr.provider_account_ref
                where mr.id=s.operation_id and mr.owns_client_admission
                and mr.user_id=s.user_id and mr.tenant_id=s.tenant_id and mr.client_api_key_ref=s.model_key_id
                and mr.provider_account_ref='{identifier}' and mr.started_at>=pa.created_at)""")
        detail = client.call('/api/admin/accounts/detail?accountId=' + identifier)['data']['account']
        for value in [account['usage'], detail['usage']]:
            assert Decimal(value['retailChargeUsd']) == Decimal(expected), identifier
        checks.append({'account': identifier, 'retailChargeUsd': expected, 'listAndDetailMatchLedger': True})
    assert len(checks) >= 3
    assert any(Decimal(item['retailChargeUsd']) > 0 for item in checks)
    (out / 'usage-api.json').write_text(json.dumps({'passed': True, 'checks': checks}, indent=2))
    print('PASS account list/detail match settled customer charges for', len(checks), 'API accounts')
finally:
    client.call('/api/admin/v1/auth/session', method='DELETE', status=204)
