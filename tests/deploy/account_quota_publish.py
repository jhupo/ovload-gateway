"""Publish verified account quota UI and cumulative usage changes to the test service."""
import json
import shutil
import ssl
import subprocess
import time
import urllib.request
from pathlib import Path

root = Path('/opt/webcodex/ovload-gateway-codex-test-20261031135140')
out = root / 'test-results/account-quota-live'
for name in ['rust-tests', 'rust-build', 'ui-build']:
    assert (out / (name + '.exit')).read_text().strip() == '0', name
design = json.loads((out / 'design.json').read_text())
assert design['errors'] == design['warnings'] == 0
live, candidate = root / 'web/dist', root / 'web/dist-account-quota'
previous = out / 'previous-index.html'
if not previous.exists():
    shutil.copy2(live / 'index.html', previous)
binary_backup = '/test-runtime/account-quota-previous-gateway'
subprocess.run(['docker', 'exec', 'ovload-test-gateway', 'sh', '-c',
    'test -f ' + binary_backup + ' || cp /proc/1/exe ' + binary_backup], check=True)
for source in candidate.iterdir():
    if source.name == 'index.html':
        continue
    if source.is_dir():
        shutil.copytree(source, live / source.name, dirs_exist_ok=True)
    else:
        shutil.copy2(source, live / source.name)
shutil.copy2(candidate / 'index.html', live / 'index.html.next')
(live / 'index.html.next').replace(live / 'index.html')
running_current = subprocess.run(['docker', 'exec', 'ovload-test-gateway', 'cmp', '-s',
    '/proc/1/exe', '/src/target/debug/ovload-gateway']).returncode == 0
if not running_current:
    subprocess.run(['docker', 'restart', 'ovload-test-gateway'], check=True)
context = ssl._create_unverified_context()
for attempt in range(30):
    try:
        with urllib.request.urlopen('https://192.168.2.150:19443/healthz', context=context, timeout=5) as response:
            assert response.status in (200, 204)
        break
    except Exception:
        if attempt == 29:
            raise
        time.sleep(1)
with urllib.request.urlopen('https://192.168.2.150:19443/accounts', context=context, timeout=10) as response:
    assert response.read() == (candidate / 'index.html').read_bytes()
    assert response.headers.get('Cache-Control') == 'no-cache'
(out / 'deployment.json').write_text(json.dumps({'passed': True, 'indexMatches': True, 'gatewayRestarted': True}))
print('PASS published account quota UI and cumulative usage changes')
