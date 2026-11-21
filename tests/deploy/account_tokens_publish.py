"""Publish the account token formatting and cost coverage only after this run's checks pass."""
import json
import shutil
import ssl
import urllib.request
from pathlib import Path

root = Path('/opt/webcodex/ovload-gateway-codex-test-20261031135140')
out = root / 'test-results/account-tokens'
for check in ['build', 'browser']:
    assert (out / f'{check}.exit').read_text().strip() == '0', check
assert json.loads((out / 'browser.json').read_text())['passed']
design = json.loads((out / 'design.json').read_text())
assert design['errors'] == design['warnings'] == 0
live, candidate = root / 'web/dist', root / 'web/dist-account-tokens'
shutil.copy2(live / 'index.html', out / 'previous-index.html')
for source in candidate.iterdir():
    if source.name == 'index.html':
        continue
    if source.is_dir():
        shutil.copytree(source, live / source.name, dirs_exist_ok=True)
    else:
        shutil.copy2(source, live / source.name)
shutil.copy2(candidate / 'index.html', live / 'index.html.next')
(live / 'index.html.next').replace(live / 'index.html')
with urllib.request.urlopen('https://192.168.2.150:19443/accounts', context=ssl._create_unverified_context()) as response:
    assert response.read() == (candidate / 'index.html').read_bytes()
    assert response.headers.get('Cache-Control') == 'no-cache'
(out / 'deployment.json').write_text(json.dumps({'passed': True, 'indexMatches': True}))
print('PASS published account token formatting and cost coverage')

