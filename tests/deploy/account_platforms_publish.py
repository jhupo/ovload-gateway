"""Publish verified platform onboarding assets; preserve older hashed assets for open tabs."""
import json,shutil,ssl,subprocess,urllib.request
from pathlib import Path
root=Path('/opt/webcodex/ovload-gateway-codex-test-20261031135140')
out=root/'test-results/account-platforms'
assert (out/'backend-final.exit').read_text().strip()=='0'
assert (out/'web-final.exit').read_text().strip()=='0'
assert json.loads((out/'backend-api.json').read_text())['passed']
assert json.loads((out/'candidate.json').read_text())['passed']
design=json.loads((out/'design.json').read_text());assert design['errors']==design['warnings']==0
assert not (out/'typecheck.log').read_text().strip()
assert not (out/'lint.log').read_text().strip()
assert '1 passed; 0 failed' in (out/'provider-tests-final.log').read_text()
live=root/'web/dist';candidate=root/'web/dist-platforms'
for source in candidate.iterdir():
 if source.name=='index.html':continue
 if source.is_dir():shutil.copytree(source,live/source.name,dirs_exist_ok=True)
 else:shutil.copy2(source,live/source.name)
shutil.copy2(candidate/'index.html',live/'index.html.next')
(live/'index.html.next').replace(live/'index.html')
with urllib.request.urlopen('https://192.168.2.150:19443/accounts',context=ssl._create_unverified_context()) as response:
 assert response.read()==(candidate/'index.html').read_bytes()
 assert response.headers.get('Cache-Control')=='no-cache'
(out/'deployment.json').write_text(json.dumps({'passed':True,'backup':'/opt/webcodex/ovload-gateway-test-runtime-20261031/account-platforms-backup-20261111','assetsMatch':True}))
print('PASS verified platform onboarding frontend published')
