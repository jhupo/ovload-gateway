"""Publish the verified account UI, retaining older hashed assets for existing tabs."""
import json
import shutil
import ssl
import urllib.request
from pathlib import Path

root = Path('/opt/webcodex/ovload-gateway-codex-test-20261031135140')
out = root / 'test-results/account-ui-refinement'
for name in ['build', 'api-final', 'layout-final']:
    assert (out / f'{name}.exit').read_text().strip() == '0', name
for name in ['candidate', 'usage-api']:
    assert json.loads((out / f'{name}.json').read_text())['passed'], name
design = json.loads((out / 'design-final.json').read_text())
assert design['errors'] == design['warnings'] == 0
live, candidate = root / 'web/dist', root / 'web/dist-account-ui'
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
(out / 'deployment.json').write_text(json.dumps({'passed': True, 'url': 'https://192.168.2.150:19443', 'indexMatches': True}))
print('PASS published verified account UI and consistent dollar formatting')
