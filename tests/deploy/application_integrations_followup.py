"""Additional isolation, proxy, persistence and migration checks on the server."""
import hashlib
import http.cookiejar
import json
import secrets
import ssl
import subprocess
import urllib.error
import urllib.parse
import urllib.request
import uuid
from pathlib import Path

source = Path('/opt/webcodex/ovload-gateway-codex-test-20261031135140')
runtime = Path('/opt/webcodex/ovload-settings-verify-20261102')
private = json.loads((runtime / 'private.json').read_text())
report = json.loads((source / 'test-results/settings-completion/api-result.json').read_text())
base = 'https://192.168.2.150:19444'
checks = []


def client():
    return urllib.request.build_opener(urllib.request.HTTPSHandler(context=ssl._create_unverified_context()), urllib.request.HTTPCookieProcessor(http.cookiejar.CookieJar()))


def call(opener, path, data=None, method=None, headers=None, status=200):
    request = urllib.request.Request((base if path.startswith('/') else '') + path,
        data=json.dumps(data).encode() if data is not None else None,
        method=method, headers={'Origin': base, 'Content-Type': 'application/json', **(headers or {})})
    try:
        response = opener.open(request, timeout=30)
    except urllib.error.HTTPError as error:
        response = error
    with response:
        body = response.read()
        assert response.status == status, (path, response.status, body[:500])
        return json.loads(body or b'null')


def mark(name):
    checks.append(name)
    print('PASS', name)


admin = client()
session = call(admin, '/api/v1/auth/sessions', {'login': 'ovload_settings_verify', 'password': private['administratorPassword']})
headers = {'X-CSRF-Token': session['csrf_token']}
node_id = str(uuid.UUID(report['auditNodeId']))
created = call(admin, '/api/admin/proxies/create', [{'name': 'Disposable audit proxy', 'proxyUrl': 'http://172.24.0.1:19581', 'maxWebsocketConnections': 0, 'autoLocation': False}], headers=headers)['data'][0]
assert created['status'] == 'succeeded', created
proxy = created['data']['record']
features = call(admin, '/api/admin/v1/workspace/settings/features')
node = next(n for n in features['values']['audit']['shared']['endpoints'] if n['id'] == node_id)
node['proxyId'] = proxy['id']
features = call(admin, '/api/admin/v1/workspace/settings/features', {'values': features['values']}, 'PATCH', {**headers, 'If-Match': f'"{features["revision"]}"'})
assert call(admin, f'/api/admin/v1/settings/audit/{node_id}/test', {}, headers=headers)['ok']
captured = call(admin, 'http://172.24.0.1:19581/control/messages', {}, headers={'X-Fixture-Token': private['fixtureToken']})
assert captured['audit'][-1]['viaProxy'] and captured['audit'][-1]['authorized']
features['values']['audit']['shared']['endpoints'][0]['proxyId'] = 'direct'
call(admin, '/api/admin/v1/workspace/settings/features', {'values': features['values']}, 'PATCH', {**headers, 'If-Match': f'"{features["revision"]}"'})
call(admin, '/api/admin/proxies/delete', {'id': proxy['id'], 'revision': proxy['revision']}, headers=headers)
mark('Audit connection follows the selected outbound proxy and retains its encrypted bearer key')

policy = call(admin, '/api/admin/v1/auth/settings')
policy['verification_required'] = False
policy = call(admin, '/api/admin/v1/auth/settings', policy, 'PATCH', {**headers, 'If-Match': f'"{policy["revision"]}"'})
other = client()
email = 'isolation-' + secrets.token_hex(10) + '@example.com'
call(other, '/api/v1/auth/registrations', {'email': email, 'display_name': 'Isolation test', 'password': private['customerPassword']}, status=202)
other_session = call(other, '/api/v1/auth/sessions', {'login': email, 'password': private['customerPassword']})
other_headers = {'X-CSRF-Token': other_session['csrf_token']}
assert call(other, '/api/v1/payments/orders') == []
assert call(other, '/api/v1/payments/config')['userOffers'] == []
call(other, '/api/v1/payments', {'action': 'get', 'id': report['orderId']}, headers=other_headers, status=404)
call(other, '/api/admin/v1/settings/integrations/mail', status=401)
mark('Customers cannot read other customers orders, offers or management settings')

for purpose, pattern in [('Verify fixture', 'verification'), ('Reset fixture', 'reset')]:
    message = next(m for m in reversed(captured['messages']) if private['customerEmail'] in m['to'] and m['subject'] == purpose)
    import re
    token = re.search(r'<code>([^<]+)</code>', message['html'])[1] if pattern == 'verification' else urllib.parse.parse_qs(urllib.parse.urlsplit(re.search(r'href="([^"]+)"', message['html'])[1].replace('&amp;', '&')).fragment.split('&', 1)[1])['token'][0]
    path = '/api/v1/auth/registrations/verify' if pattern == 'verification' else '/api/v1/auth/password-reset/confirm'
    data = {'token': token} if pattern == 'verification' else {'token': token, 'new_password': private['customerPassword']}
    call(client(), path, data, status=401)
mark('Consumed registration and password reset tokens cannot be reused')

oid = str(uuid.UUID(report['orderId']))
sql = f"""select json_build_object(
 'ledgerCount',(select count(*) from wallet_ledger_entries where source_id='{oid}' and entry_kind='payment_credit'),
 'confirmedCount',(select count(*) from confirmed_recharges where id='{oid}'),
 'missingCredits',(select count(*) from payment_orders o where status='paid' and not exists(select 1 from wallet_ledger_entries l where l.source_id=o.id and l.entry_kind='payment_credit' and l.amount_usd=o.credit_usd)),
 'migrations',(select max(version) from _sqlx_migrations),
 'credentials',(select json_agg(credentials) from application_settings where credentials is not null),
 'registrationLifetime',(select max(extract(epoch from expires_at-created_at)) from identity_lifecycle_challenges where purpose='registration')
);"""
raw = subprocess.check_output(['docker', 'exec', '-i', 'ovload-test-postgres', 'sh', '-c', 'psql -q -t -A -v ON_ERROR_STOP=1 -U "$POSTGRES_USER" -d ovload_settings_verify'], input=sql.encode())
state = json.loads(raw)
assert state['ledgerCount'] == state['confirmedCount'] == 1
assert state['missingCredits'] == 0 and state['migrations'] == 56
assert state['registrationLifetime'] == 86400
encrypted = json.dumps(state.pop('credentials'))
for value in [private['smtpPassword'], private['auditKey'], private['merchantKey'], 'BEGIN PRIVATE KEY']:
    assert value not in encrypted
for line in (source / 'src/migrations/.frozen-sha256').read_text().splitlines()[-2:]:
    digest, name = line.split()
    assert hashlib.sha256((source / 'src/migrations' / name).read_bytes()).hexdigest() == digest
mark('Database stores encrypted credentials, one ledger entry per paid order and the configured verification lifetime; migration hashes match')
(source / 'test-results/settings-completion/followup-result.json').write_text(json.dumps({'checks': checks, 'database': state}, indent=2))
