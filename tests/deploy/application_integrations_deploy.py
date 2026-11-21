"""Deploy the verified test build with a fresh binary/assets/database snapshot."""
import gzip
import hashlib
import json
import os
import shutil
import ssl
import subprocess
import tarfile
import time
import urllib.error
import urllib.request
from datetime import datetime, timezone
from pathlib import Path

source = Path('/opt/webcodex/ovload-gateway-codex-test-20261031135140')
runtime = Path('/opt/webcodex/ovload-gateway-test-runtime-20261031')
results = source / 'test-results/settings-completion'
for name in ['api-result.json', 'ui-result.json', 'followup-result.json']:
    assert (results / name).is_file(), name
for name in ['build-fix.exit', 'web.exit', 'ui.exit', 'api-e2e.exit']:
    assert (results / name).read_text().strip() == '0', name
stamp = datetime.now(timezone.utc).strftime('%Y%m%dT%H%M%SZ')
backup = runtime / ('settings-backup-' + stamp)
backup.mkdir(mode=0o700)
with gzip.open(backup / 'gateway.gz', 'wb', compresslevel=1) as output:
    process = subprocess.Popen(['docker', 'exec', 'ovload-test-gateway', 'cat', '/proc/1/exe'], stdout=subprocess.PIPE)
    shutil.copyfileobj(process.stdout, output)
    assert process.wait() == 0
with tarfile.open(backup / 'web-dist.tgz', 'w:gz') as archive:
    archive.add(source / 'web/dist', arcname='dist')
with (backup / 'database.dump').open('wb') as output:
    subprocess.run(['docker', 'exec', 'ovload-test-postgres', 'sh', '-c', 'pg_dump -Fc --no-owner --no-privileges -U "$POSTGRES_USER" ovload_test'], stdout=output, check=True)
version = subprocess.check_output(['docker', 'exec', 'ovload-test-postgres', 'sh', '-c', 'psql -q -t -A -U "$POSTGRES_USER" -d ovload_test -c "select max(version) from _sqlx_migrations"']).decode().strip()
metadata = {'backup': str(backup), 'previousMigration': int(version), 'binarySha256': hashlib.file_digest((source / 'target/debug/ovload-gateway').open('rb'), 'sha256').hexdigest()}
(backup / 'metadata.json').write_text(json.dumps(metadata, indent=2))
staged, live = results / 'web-dist', source / 'web/dist'
for item in staged.iterdir():
    if item.name == 'index.html':
        continue
    if item.is_dir():
        shutil.copytree(item, live / item.name, dirs_exist_ok=True)
    else:
        shutil.copy2(item, live / item.name)
shutil.copy2(staged / 'index.html', live / '.settings-index.tmp')
os.replace(live / '.settings-index.tmp', live / 'index.html')
subprocess.run(['docker', 'restart', 'ovload-test-gateway'], check=True, stdout=subprocess.DEVNULL)
base = 'https://192.168.2.150:19443'
context = ssl._create_unverified_context()
for _ in range(30):
    try:
        with urllib.request.urlopen(base + '/healthz', context=context, timeout=3) as response:
            if response.status == 204:
                break
    except (urllib.error.URLError, TimeoutError):
        time.sleep(1)
else:
    raise RuntimeError('Gateway health did not become ready; rollback snapshot: ' + str(backup))
with urllib.request.urlopen(base + '/', context=context) as response:
    assert response.read() == (staged / 'index.html').read_bytes()
with urllib.request.urlopen(base + '/api/v1/auth/registration-policy', context=context) as response:
    assert response.status == 200
metadata['migration'] = int(subprocess.check_output(['docker', 'exec', 'ovload-test-postgres', 'sh', '-c', 'psql -q -t -A -U "$POSTGRES_USER" -d ovload_test -c "select max(version) from _sqlx_migrations"']).decode().strip())
assert metadata['migration'] == 56
metadata['url'] = base
(results / 'deployment.json').write_text(json.dumps(metadata, indent=2))
print('PASS deployed frontend/backend; health=204, index matches verified build, migration=56')
print('Rollback snapshot:', backup)
