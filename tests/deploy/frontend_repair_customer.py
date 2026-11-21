"""Exercise paginated customer ownership with disposable identities, never the live database."""
import json
import secrets
import time
import uuid
import usage_seed as seed


def main():
    assert not seed.LIVE
    # Paid, inert fixtures straddle Shanghai midnight; no checkout or provider request occurs.
    owner = seed.manifest['users'][0]
    for index, stamp in enumerate(['2026-11-09T15:59:59Z', '2026-11-09T16:00:00Z']):
        identifier = str(uuid.uuid5(uuid.NAMESPACE_URL, 'frontend-review/payment/' + str(index)))
        seed.api.pg(f"insert into payment_orders(id,tenant_id,user_id,idempotency_key,amount_cny,fee_cny,credit_usd,status,app_id,seller_id,settings_revision,provider_config,credentials,created_at,expires_at,paid_at) values('{identifier}','{owner['tenant_id']}','{owner['id']}','{identifier}',{10+index},0.5,1,'paid','disabled-review-fixture','disabled',1,'{{}}','{{}}','{stamp}','{stamp}','{stamp}') on conflict(id) do nothing")
    admin = seed.api.Client()
    admin.login('ovload_usage_verify', (seed.ROOT / 'administrator.password').read_text().strip())
    private = seed.ROOT / 'frontend-review-customers.json'
    if private.exists():
        fixture = json.loads(private.read_text())
    else:
        password = secrets.token_urlsafe(30) + 'Aa1!'
        suffix = str(time.time_ns())
        users = [admin.call('/api/admin/v1/users', {'email': f'review-{suffix}-{i}@example.com', 'display_name': f'隔离验证用户{i+1}', 'password': password, 'max_concurrency': 5, 'requests_per_minute': 60, 'notes': 'Disposable frontend regression'}, status=201) for i in range(2)]
        document = {'name': '分页验证套餐', 'description': '', 'notes': 'Private admin note', 'priceCents': 100, 'originalPriceCents': 0, 'dailyCents': 100, 'weeklyCents': 500, 'monthlyCents': 1000, 'unlimited': {'daily': False, 'weekly': False, 'monthly': False}, 'days': 30, 'sort': 1, 'currencyLabel': 'USD', 'features': '', 'resetTime': '00:00', 'timezone': 'Asia/Shanghai', 'published': True}
        plan = admin.command({'action': 'save_plan', 'document': document}, True)['id']
        fixture = {'users': users, 'password': password, 'plan': plan}
        private.write_text(json.dumps(fixture)); private.chmod(0o600)
    clients = []
    for user in fixture['users']:
        client = seed.api.Client(); client.login(user['email'], fixture['password']); clients.append(client)
        if not client.call('/api/v1/commerce/orders')['orders']:
            code_id = admin.command({'action': 'generate', 'kind': 'balance', 'value': 200, 'count': 1, 'max_uses': 1, 'per_user': 1, 'notes': 'Disposable regression'}, True)['ids'][0]
            code = next(c for c in admin.view(True)['codes'] if c['id'] == code_id)
            client.command({'action': 'redeem', 'code': code['code']})
            client.command({'action': 'purchase', 'plan_id': fixture['plan'], 'revision': 1})
    for scope in ['orders', 'records', 'redemptions']:
        seen = []
        for client in clients:
            page = client.call('/api/v1/commerce/' + scope + '?size=1')
            assert page['total'] == 1 and len(page[scope]) == 1, scope
            assert not page['users'] and not page['codes']
            assert page[scope][0].get('notes', '') == ''
            if scope == 'records': assert 'notes' not in page[scope][0]['plan']
            seen.append(page[scope][0]['id'])
            assert client.call('/api/v1/commerce/' + scope + '?size=1&page=2')[scope] == []
        assert seen[0] != seen[1], scope
    for client in clients:
        for scope in ['users', 'codes', 'subscriptions', 'subscribers', 'code-history']:
            client.call('/api/v1/commerce/' + scope, status=403)
        client.call('/api/v1/auth/session', method='DELETE', status=204)
    admin.call('/api/admin/v1/auth/session', method='DELETE', status=204)
    (seed.SOURCE / 'test-results/frontend-review/customer-api.json').write_text(json.dumps({'passed': True, 'checks': ['Two customers see only their own orders, subscriptions and redemptions; management collections and private notes remain inaccessible']}))
    print('PASS paginated customer ownership, private notes and forbidden management collections')


if __name__ == '__main__': main()
