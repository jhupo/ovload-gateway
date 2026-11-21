"""Read-only customer-count comparison against the live test database."""
import json, sys
from datetime import datetime, timedelta, timezone
from urllib.parse import urlencode
sys.argv.append('--live')
import usage_seed as seed
api = seed.api
out = seed.SOURCE / 'test-results/dashboard-users'
admin = api.Client()
admin.login('ovload_test_admin', (seed.ROOT / 'administrator.password').read_text().strip())
try:
    now = datetime.now(timezone.utc)
    counts = []
    for days in [1, 7, 30]:
        start, end = (now - timedelta(days=days)).isoformat(), now.isoformat()
        query = urlencode({'startTime': start, 'endTime': end})
        value = admin.call('/api/admin/dashboard/summary?' + query)['data']['cards']['users']
        expected = json.loads(api.pg("select json_build_object('totalUsers',count(*),'newUsers',count(*) filter(where created_at >= " + seed.q(start) + " and created_at < " + seed.q(end) + ")) from identity_users"))
        assert value == expected, (days, value, expected)
        counts.append({'days':days, **value})
    directory = admin.call('/api/admin/v1/users?page=1&page_size=1')
    assert directory['total'] == counts[0]['totalUsers']
    (out/'api.json').write_text(json.dumps({'passed':True,'counts':counts,'directoryMatches':True},indent=2))
    print('PASS 1/7/30-day customer counts match database; total matches user directory')
finally:
    admin.call('/api/admin/v1/auth/session',method='DELETE',status=204)
