"""Create a server-only, disposable gateway settings verification environment."""
import json
import secrets
import shutil
import socket
import ssl
import subprocess
import time
import urllib.request
from pathlib import Path
from urllib.parse import urlsplit, urlunsplit

SOURCE = Path('/opt/webcodex/ovload-gateway-codex-test-20261031135140')
REGULAR = Path('/opt/webcodex/ovload-gateway-test-runtime-20261031')
RUNTIME = Path('/opt/webcodex/ovload-usage-verify-20261108')
DATABASE = 'ovload_usage_verify'
OPERATOR = 'ovload_usage_verify'
GATEWAY = 'ovload-usage-verify'
HTTPS = 'ovload-usage-https'
REDIS = 'ovload-usage-redis'
ORIGIN = 'https://192.168.2.150:19444'
RESULTS = SOURCE / 'test-results/usage-records'


def command(*args, **kwargs):
    return subprocess.run(args, check=True, text=True, **kwargs)


def pg(sql, database='postgres'):
    return command('docker', 'exec', '-i', 'ovload-test-postgres', 'sh', '-c',
                   'psql -X -q -At -v ON_ERROR_STOP=1 -U "$POSTGRES_USER" -d "$1"',
                   'sh', database, input=sql, capture_output=True).stdout.strip()


def main():
    assert RUNTIME.parent == Path('/opt/webcodex')
    assert not RUNTIME.exists(), 'Verification runtime is already owned by another run'
    for name in [GATEWAY, HTTPS, REDIS]:
        result = subprocess.run(['docker', 'inspect', name], capture_output=True)
        assert result.returncode != 0, 'Verification container already exists: ' + name
    assert not pg("SELECT datname FROM pg_database WHERE datname='" + DATABASE + "'"), 'Verification database already exists'
    with socket.socket() as probe:
        probe.bind(('0.0.0.0', 19444))

    config = json.loads((REGULAR / 'deploy/config.yaml').read_text())
    database_url = urlsplit(config['store']['database']['url'])
    original_database = database_url.path.lstrip('/')
    assert original_database and original_database != DATABASE
    config['store']['database']['url'] = urlunsplit(database_url._replace(path='/' + DATABASE))
    config['host']['runtime_data_dir'] = '/test-runtime/data'
    config['host']['logging']['file']['enabled'] = False
    config['api']['identity_public_origin'] = ORIGIN
    config['api']['cors_allowed_origins'] = [ORIGIN]
    # Browser tests can swap staged/live static assets without restarting the API.
    config['api']['asset_directory'] = '/src/web/dist-usage-candidate'
    redis_password = secrets.token_urlsafe(32)
    config['store']['redis']['url'] = 'redis://' + REDIS + ':6379/'
    config['store']['redis']['password'] = redis_password

    RUNTIME.mkdir(mode=0o700)
    (RUNTIME / 'deploy').mkdir(mode=0o700)
    (RUNTIME / 'deploy/config.yaml').write_text(json.dumps(config))
    (RUNTIME / 'deploy/config.yaml').chmod(0o600)
    (RUNTIME / 'administrator.password').write_text(secrets.token_urlsafe(30))
    (RUNTIME / 'administrator.password').chmod(0o600)
    (RUNTIME / 'owner.json').write_text(json.dumps({'task': 'usage-records', 'database': DATABASE, 'containers': [GATEWAY, HTTPS, REDIS]}))
    for name in ['notification.key', 'provider-credentials.key']:
        shutil.copy2(REGULAR / name, RUNTIME / name)
    (RUNTIME / 'redis.conf').write_text('bind 0.0.0.0\nprotected-mode yes\nport 6379\nsave ""\nappendonly no\nrequirepass ' + json.dumps(redis_password) + '\n')
    (RUNTIME / 'redis.conf').chmod(0o600)
    redis_image = subprocess.check_output(['docker', 'inspect', 'ovload-test-redis', '--format', '{{.Config.Image}}'], text=True).strip()
    command('docker', 'run', '-d', '--name', REDIS, '--network', 'ovload-codex-test', '--memory', '192m', '--user', '0',
            '-v', str(RUNTIME / 'redis.conf') + ':/verify/redis.conf:ro', '--entrypoint', 'redis-server', redis_image,
            '/verify/redis.conf', stdout=subprocess.DEVNULL)

    command('docker', 'exec', 'ovload-test-postgres', 'sh', '-c',
            'createdb -U "$POSTGRES_USER" -O "$1" "$2"', 'sh', database_url.username, DATABASE)
    dump = subprocess.Popen(['docker', 'exec', 'ovload-test-postgres', 'sh', '-c',
                             'pg_dump -U "$POSTGRES_USER" --no-owner --no-privileges "$1"', 'sh', original_database], stdout=subprocess.PIPE)
    try:
        command('docker', 'exec', '-i', 'ovload-test-postgres', 'sh', '-c',
                'psql -X -q -v ON_ERROR_STOP=1 -U "$POSTGRES_USER" -d "$1"', 'sh', DATABASE,
                stdin=dump.stdout, stdout=subprocess.DEVNULL)
    finally:
        dump.stdout.close()
    assert dump.wait() == 0, 'Database clone failed'
    # Verification changes policies, but never invokes real upstream accounts.
    pg('UPDATE provider_accounts SET enabled = FALSE;', DATABASE)
    pg("UPDATE backup_settings SET storage_enabled=FALSE,schedule_enabled=FALSE,next_run_at=NULL; "
       "UPDATE identity_notification_outbox SET state='cancelled' WHERE state='pending'; "
       "DELETE FROM integration_mail_outbox;", DATABASE)
    common = ['docker', 'run', '--rm', '--network', 'ovload-codex-test', '-v', str(SOURCE) + ':/src:ro',
              '-v', str(RUNTIME) + ':/test-runtime', '-w', '/test-runtime', 'rust:1.99.1-bookworm']
    command(*common, '/src/target/debug/ovload-gateway', 'identity', 'provision-operator', OPERATOR,
            '--password-file', '/test-runtime/administrator.password', stdout=subprocess.DEVNULL)
    command('docker', 'run', '-d', '--name', GATEWAY, '--network', 'ovload-codex-test', '--memory', '1800m', '--ulimit', 'core=0',
            '-v', str(SOURCE) + ':/src:ro', '-v', str(RUNTIME) + ':/test-runtime', '-w', '/test-runtime',
            'rust:1.99.1-bookworm', '/src/target/debug/ovload-gateway', 'serve', stdout=subprocess.DEVNULL)

    caddy = json.loads((REGULAR / 'caddy.json').read_text())
    server = caddy['apps']['http']['servers']['test']
    server['listen'] = [':19444']
    changed = 0

    def replace_upstream(value):
        nonlocal changed
        if isinstance(value, dict):
            if value.get('dial') == 'ovload-test-gateway:8080':
                value['dial'] = GATEWAY + ':8080'
                changed += 1
            for child in value.values():
                replace_upstream(child)
        elif isinstance(value, list):
            for child in value:
                replace_upstream(child)

    replace_upstream(server)
    assert changed, 'Regular Caddy upstream was not identified'
    (RUNTIME / 'caddy.json').write_text(json.dumps(caddy))
    shutil.copytree(REGULAR / 'caddy-data', RUNTIME / 'caddy-data')
    command('docker', 'run', '-d', '--name', HTTPS, '--network', 'ovload-codex-test', '-p', '19444:19444',
            '-v', str(RUNTIME / 'caddy-data') + ':/data', '-v', str(RUNTIME / 'caddy.json') + ':/etc/caddy/test.json:ro',
            'caddy:2-alpine', 'caddy', 'run', '--config', '/etc/caddy/test.json', stdout=subprocess.DEVNULL)

    context = ssl._create_unverified_context()
    for attempt in range(30):
        try:
            with urllib.request.urlopen(ORIGIN + '/healthz', context=context, timeout=2) as response:
                if response.status == 204:
                    break
        except (OSError, TimeoutError):
            pass
        time.sleep(0.5)
    else:
        raise RuntimeError('Isolated gateway did not become healthy')
    RESULTS.mkdir(exist_ok=True, parents=True)
    metadata = {'origin': ORIGIN, 'runtime': str(RUNTIME), 'database': DATABASE, 'operator': OPERATOR,
                'containers': [GATEWAY, HTTPS, REDIS], 'upstreamAccountsDisabled': True,
                'redisIsolated': True, 'healthStatus': 204}
    (RESULTS / 'setup.json').write_text(json.dumps(metadata, indent=2))
    print('PASS isolated database, operator, Redis, gateway and HTTPS ready; health=204; no regular settings changed')


if __name__ == '__main__':
    main()
