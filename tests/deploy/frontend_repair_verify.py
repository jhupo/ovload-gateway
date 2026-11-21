"""Read-only assertions against the isolated server's seeded records."""
import json
from datetime import datetime
from decimal import Decimal
from urllib.parse import urlencode
from zoneinfo import ZoneInfo
import usage_seed as seed


def main():
    client = seed.api.Client()
    client.login('ovload_test_admin' if seed.LIVE else 'ovload_usage_verify', (seed.ROOT / 'administrator.password').read_text().strip())
    checks = []
    def read(path, **params):
        value = client.call(path + ('?' + urlencode(params) if params else ''))
        return value['data'] if isinstance(value, dict) and 'code' in value else value
    try:
        metadata = read('/api/v1/site-settings')
        zone = ZoneInfo(metadata['timezone'])
        for scope in ['plans', 'records', 'users', 'codes', 'orders', 'redemptions']:
            data = read('/api/admin/v1/engagement/commerce-' + scope)
            assert all(not v for k, v in data.items() if k != scope), scope
        checks.append('Commerce scopes do not return unrelated users, orders, subscriptions or redemption codes')
        for scope, key in [('plans', 'plans'), ('subscriptions', 'records'), ('orders', 'orders'), ('codes', 'codes'), ('users', 'users')]:
            expected = read('/api/admin/v1/engagement/commerce-' + scope)[key]
            ids = []
            for page in range(1, (len(expected) + 1) // 2 + 1):
                result = read('/api/admin/v1/commerce/' + scope, page=page, size=2)
                assert result['total'] == len(expected), (scope, result['total'], len(expected))
                assert len(result[key]) <= 2
                ids.extend(r['id'] for r in result[key])
                if scope == 'codes':
                    assert all(not r['history'] for r in result[key])
                    assert all(r['used'] == len(next(x for x in expected if x['id'] == r['id'])['history']) for r in result[key])
            assert len(ids) == len(set(ids)) == len(expected), scope
            assert set(ids) == {r['id'] for r in expected}, scope
            assert read('/api/admin/v1/commerce/' + scope, search='nonexistent-3bb9a13b', size=2)['total'] == 0
        codes = read('/api/admin/v1/engagement/commerce-codes')['codes']
        for code in codes:
            history = read('/api/admin/v1/commerce/code-history', plan=code['id'], size=1)
            assert history['total'] == len(code['history'])
            assert len(history.get('history', [])) <= 1
        orders = read('/api/admin/v1/engagement/commerce-orders')['orders']
        filtered = read('/api/admin/v1/commerce/orders', status='paid,pending', size=200)
        assert filtered['total'] == len([r for r in orders if r['status'] in ['paid', 'pending']])
        ascending = read('/api/admin/v1/commerce/orders', sort='paid', desc='false', size=200)['orders']
        assert [r['paid'] for r in ascending] == sorted(r['paid'] for r in ascending)
        for sort in ['paidAmount', 'total']:
            items = read('/api/admin/v1/commerce/orders', sort=sort, desc='false', size=200)['orders']
            assert [r['paid'] for r in items] == sorted(r['paid'] for r in items)
        records = read('/api/admin/v1/commerce/subscriptions', sort='priceCents', desc='false', size=200)['records']
        assert [r['plan']['priceCents'] for r in records] == sorted(r['plan']['priceCents'] for r in records)
        client.call('/api/admin/v1/commerce/orders?page=0', status=400)
        client.call('/api/admin/v1/commerce/orders?size=201', status=400)
        checks.append('Commerce pagination matches full stored sets without duplicate IDs; filters/sorting/counts are global, code history is loaded separately')
        plans = read('/api/admin/v1/engagement/commerce-plans')['plans']
        if plans:
            scoped = read('/api/admin/v1/engagement/commerce-subscriptions:' + plans[0]['id'])
            assert all(r['plan']['id'] == plans[0]['id'] for r in scoped['records'])
            assert plans[0]['subscriberCount'] >= 0
        orders = read('/api/admin/v1/engagement/commerce-orders')['orders']
        summary = read('/api/admin/v1/commerce/payment-summary', **{'from': '2026-11-01', 'to': '2026-11-10'})
        paid = [o for o in orders if o['status'] == 'paid' and o['method'] != 'wallet' and o['settled'] and '2026-11-01' <= datetime.fromisoformat(o['settled'].replace('Z', '+00:00')).astimezone(zone).date().isoformat() <= '2026-11-10']
        assert summary['total'] == sum(o['paid'] for o in paid)
        assert summary['count'] == len(paid)
        assert sum(d['revenue'] for d in summary['days']) == summary['total']
        assert sum(d['count'] for d in summary['days']) == summary['count']
        if not seed.LIVE:
            assert summary['count'] >= 2
            for day, amount in [('2026-11-09', 1050), ('2026-11-10', 1150)]:
                result = read('/api/admin/v1/commerce/payment-summary', **{'from': day, 'to': day})
                assert result['total'] == amount, (day, result)
        client.call('/api/admin/v1/commerce/payment-summary?from=2026-11-10&to=2026-11-01', status=400)
        checks.append('Server payment aggregates match actual CNY orders and local calendar dates; reversed dates rejected')
        manifest = json.loads(seed.manifest_path.read_text())
        for extra in [{}, {'billingMode': 'wallet'}, {'billingMode': 'subscription'}, {'groupId': manifest['group']['id']}, {'userEmail': manifest['users'][0]['email']}]:
            filters = {'period': '30d', 'userEmail': seed.PREFIX, **extra}
            rows = read('/api/admin/usage/records', status='all', pageSize=100, **filters)['items']
            totals = read('/api/admin/usage/records/summary', **filters)
            expected = sum((Decimal(r['retailChargeUsd']) for r in rows if r['retailChargeUsd'] is not None), Decimal(0))
            assert Decimal(totals['retailChargeUsd']) == expected, (filters, totals['retailChargeUsd'], str(expected))
            assert 'averageFirstTokenMsValue' in totals
            if rows and any(r['firstTokenLatencyMs'] is not None for r in rows):
                assert totals['averageFirstTokenMsValue'] is not None
        rows = read('/api/admin/usage/records', period='30d', userEmail=seed.PREFIX, status='all', pageSize=100)['items']
        errors = read('/api/admin/usage/records', period='30d', userEmail=seed.PREFIX, status='error', pageSize=100)
        assert errors['total'] == len([r for r in rows if r['logicalOutcome'] in ['failed', 'incomplete', 'cancelled']])
        assert all(r['logicalOutcome'] != 'running' for r in errors['items'])
        client.call('/api/admin/usage/records/summary?billingMode=invalid', status=400)
        checks.append('Summary and detail filters agree, first-token latency is populated, non-success includes cancelled but excludes running')
        out = seed.SOURCE / 'test-results/frontend-review' / ('live-api.json' if seed.LIVE else 'api.json')
        out.write_text(json.dumps({'passed': True, 'checks': checks}, indent=2))
        print('\n'.join('PASS ' + c for c in checks))
    finally:
        client.call('/api/admin/v1/auth/session', method='DELETE', status=204)


if __name__ == '__main__':
    main()
