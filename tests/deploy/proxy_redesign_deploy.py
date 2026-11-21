"""Publish the server-built proxy UI; keep old assets and a recoverable snapshot."""
import json, shutil, ssl, subprocess, tarfile, urllib.request
from pathlib import Path

source = Path('/opt/webcodex/ovload-gateway-codex-test-20261031135140')
runtime = Path('/opt/webcodex/ovload-gateway-test-runtime-20261031')
assert subprocess.check_output(['docker', 'inspect', '-f', '{{.State.Status}} {{.State.ExitCode}}', 'ovload-proxy-redesign-build2'], text=True).strip() == 'exited 0'
backup = runtime/'proxy-redesign-backup-20261105'
backup.mkdir(exist_ok=True)
if not (backup/'web-dist.tar.gz').exists():
    with tarfile.open(backup/'web-dist.tar.gz', 'w:gz') as archive:
        archive.add(source/'web/dist', arcname='dist')
candidate, live = source/'web/dist-proxy-redesign-candidate', source/'web/dist'
for child in candidate.iterdir():
    if child.name == 'index.html':
        continue
    if child.is_dir():
        shutil.copytree(child, live/child.name, dirs_exist_ok=True)
    else:
        shutil.copy2(child, live/child.name)
shutil.copy2(candidate/'index.html', live/'index.html.next')
(live/'index.html.next').replace(live/'index.html')
context = ssl._create_unverified_context()
with urllib.request.urlopen('https://192.168.2.150:19443/', context=context) as response:
    assert response.read() == (candidate/'index.html').read_bytes()
with urllib.request.urlopen('https://192.168.2.150:19443/healthz', context=context) as response:
    assert response.status == 204
(source/'test-results/proxy-redesign/deployment.json').write_text(json.dumps({'passed': True, 'backup': str(backup), 'frontendOnly': True}))
print('PASS published frontend, exact served assets and gateway health')
