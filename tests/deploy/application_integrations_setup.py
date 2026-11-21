"""Create an isolated clone without changing regular accounts or settings."""
import json
import os
import secrets
import shutil
import subprocess
import sys
from pathlib import Path

source = Path('/opt/webcodex/ovload-gateway-codex-test-20261031135140')
regular = Path('/opt/webcodex/ovload-gateway-test-runtime-20261031')
runtime = Path('/opt/webcodex/ovload-settings-verify-20261102')
runtime.mkdir(mode=0o700,exist_ok=True)
(runtime / 'deploy').mkdir(exist_ok=True)
config = json.loads((regular / 'deploy/config.yaml').read_text())
config['store']['database']['url'] = config['store']['database']['url'].rsplit('/', 1)[0] + '/ovload_settings_verify'
config['host']['runtime_data_dir'] = '/test-runtime/data'
config['api']['identity_public_origin'] = 'https://192.168.2.150:19444'
config['api']['cors_allowed_origins'] = ['https://192.168.2.150:19444']
config['api']['asset_directory'] = '/src/test-results/settings-completion/web-dist'
(runtime / 'deploy/config.yaml').write_text(json.dumps(config))
for name in ['notification.key', 'provider-credentials.key']:
    shutil.copy2(regular / name, runtime / name)
shutil.copytree(regular / 'security-pg18', runtime / 'security-pg18',symlinks=True,dirs_exist_ok=True)
private = {'administratorPassword': secrets.token_urlsafe(30), 'customerPassword': secrets.token_urlsafe(25), 'fixtureToken': secrets.token_urlsafe(32), 'smtpPassword': secrets.token_urlsafe(24), 'auditKey': secrets.token_urlsafe(24)}
(runtime / 'administrator.password').write_text(private['administratorPassword'])
for name in ['merchant', 'alipay']:
    subprocess.run(['openssl', 'genpkey', '-algorithm', 'RSA', '-pkeyopt', 'rsa_keygen_bits:2048', '-out', str(runtime / (name + '.key'))], check=True, capture_output=True)
    subprocess.run(['openssl', 'pkey', '-in', str(runtime / (name + '.key')), '-pubout', '-out', str(runtime / (name + '.pub'))], check=True, capture_output=True)
private['merchantKey'] = (runtime / 'merchant.key').read_text()
private['alipayPublicKey'] = (runtime / 'alipay.pub').read_text()
(runtime / 'private.json').write_text(json.dumps(private))
for file in runtime.glob('*'):
    if file.is_file():
        file.chmod(0o600)
subprocess.run(['docker', 'exec', 'ovload-test-postgres', 'sh', '-c', 'createdb -U "$POSTGRES_USER" -O ovload_test ovload_settings_verify'], check=True)
dump = subprocess.Popen(['docker', 'exec', 'ovload-test-postgres', 'sh', '-c', 'pg_dump -U "$POSTGRES_USER" --no-owner --no-privileges ovload_test'], stdout=subprocess.PIPE)
subprocess.run(['docker', 'exec', '-i', 'ovload-test-postgres', 'sh', '-c', 'psql -q -v ON_ERROR_STOP=1 -U "$POSTGRES_USER" -d ovload_settings_verify'], stdin=dump.stdout, stdout=subprocess.DEVNULL, check=True)
assert dump.wait() == 0
common = ['docker', 'run', '--rm', '--network', 'ovload-codex-test', '-v', str(source) + ':/src:ro', '-v', str(runtime) + ':/test-runtime', '-w', '/test-runtime', 'rust:1.99.1-bookworm']
subprocess.run(common + ['/src/target/debug/ovload-gateway', 'identity', 'provision-operator', 'ovload_settings_verify', '--password-file', '/test-runtime/administrator.password'], check=True)
args = ['docker', 'run', '-d', '--name', 'ovload-settings-verify', '--network', 'ovload-codex-test', '--memory', '1800m', '--ulimit', 'core=0', '-e', 'OVLOAD_ALIPAY_GATEWAY=http://172.24.0.1:19581/gateway.do', '-e', 'PATH=/test-runtime/security-pg18:/usr/local/cargo/bin:/usr/local/bin:/usr/bin:/bin', '-v', str(source) + ':/src:ro', '-v', str(runtime) + ':/test-runtime', '-w', '/test-runtime', 'rust:1.99.1-bookworm', '/src/target/debug/ovload-gateway', 'serve']
subprocess.run(args, check=True, stdout=subprocess.DEVNULL)
caddy = json.loads((regular / 'caddy.json').read_text())
server = caddy['apps']['http']['servers']['test']
server['listen'] = [':19444']
server['routes'][0]['handle'][0]['upstreams'][0]['dial'] = 'ovload-settings-verify:8080'
server['routes'].insert(0, {'match': [{'path': ['/s3/*']}], 'handle': [
    {'handler': 'rewrite', 'strip_path_prefix': '/s3'},
    {'handler': 'reverse_proxy', 'upstreams': [{'dial': '172.24.0.1:19583'}]},
]})
(runtime / 'caddy.json').write_text(json.dumps(caddy))
shutil.copytree(regular / 'caddy-data', runtime / 'caddy-data')
subprocess.run(['docker','run','-d','--name','ovload-settings-https','--network','ovload-codex-test','-p','19444:19444','-v',str(runtime / 'caddy-data')+':/data','-v',str(runtime / 'caddy.json')+':/etc/caddy/test.json:ro','caddy:2-alpine','caddy','run','--config','/etc/caddy/test.json'], check=True, stdout=subprocess.DEVNULL)
subprocess.run(['docker', 'cp', str(runtime / 'caddy-data/caddy/pki/authorities/local/root.crt'), 'ovload-settings-verify:/usr/local/share/ca-certificates/ovload-fixture.crt'], check=True)
subprocess.run(['docker', 'exec', 'ovload-settings-verify', '/usr/sbin/update-ca-certificates'], check=True, capture_output=True)
subprocess.run(['docker', 'restart', 'ovload-settings-verify'], check=True, stdout=subprocess.DEVNULL)
env = dict(os.environ, OVLOAD_SETTINGS_RUNTIME=str(runtime))
log = (runtime / 'fixture.log').open('wb')
fixture = subprocess.Popen([sys.executable, str(source / 'tests/deploy/application_integrations_fixture.py')], env=env, stdout=log, stderr=log, start_new_session=True)
(runtime / 'fixture.pid').write_text(str(fixture.pid))
print('Isolated database, gateway, HTTPS and SMTP/Alipay/audit/S3 fixtures created.')
