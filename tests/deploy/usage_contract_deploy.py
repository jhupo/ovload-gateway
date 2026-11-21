"""Publish only the verified usage UI; keep the running backend and original assets."""
import json
import shutil
import ssl
import subprocess
import tarfile
import urllib.request
from pathlib import Path

SOURCE = Path('/opt/webcodex/ovload-gateway-codex-test-20261031135140')
OUT = SOURCE / 'test-results/usage-contract'


def main():
    for container in ['ovload-usage-contract-ui5', 'ovload-usage-contract-browser2']:
        state = subprocess.check_output(['docker', 'inspect', '-f', '{{.State.Status}} {{.State.ExitCode}}', container], text=True).strip()
        assert state == 'exited 0', (container, state)
    for result in ['candidate.json', 'design.json']:
        assert json.loads((OUT / result).read_text())['passed']
    backup = Path('/opt/webcodex/ovload-gateway-test-runtime-20261031/usage-contract-backup-20261110')
    backup.mkdir(exist_ok=True)
    live = SOURCE / 'web/dist'
    if not (backup / 'web-dist.tar.gz').exists():
        with tarfile.open(backup / 'web-dist.tar.gz', 'w:gz') as archive:
            archive.add(live, arcname='dist')
    with tarfile.open(backup / 'web-dist.tar.gz') as archive:
        assert 'dist/index.html' in archive.getnames()
    candidate = SOURCE / 'web/dist-usage-contract'
    for child in candidate.iterdir():
        if child.name == 'index.html': continue
        if child.is_dir(): shutil.copytree(child, live / child.name, dirs_exist_ok=True)
        else: shutil.copy2(child, live / child.name)
    shutil.copy2(candidate / 'index.html', live / 'index.html.next')
    (live / 'index.html.next').replace(live / 'index.html')
    with urllib.request.urlopen('https://192.168.2.150:19443/usage', context=ssl._create_unverified_context()) as response:
        assert response.read() == (candidate / 'index.html').read_bytes()
        assert response.headers.get('Cache-Control') == 'no-cache'
    (OUT / 'deployment.json').write_text(json.dumps({'passed': True, 'backup': str(backup), 'assetsMatch': True, 'entryRequiresRevalidation': True}, indent=2))
    print('PASS verified usage UI deployed; entry matches candidate and requires cache revalidation')


if __name__ == '__main__': main()
