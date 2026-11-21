"""Publish only the verified table alignment; keep the running backend and original assets."""
import json
import shutil
import ssl
import subprocess
import tarfile
import urllib.request
from pathlib import Path

SOURCE = Path('/opt/webcodex/ovload-gateway-codex-test-20261031135140')
OUT = SOURCE / 'test-results/table-alignment'


def main():
    for container in ['ovload-table-align-ui1', 'ovload-table-align-browser3']:
        state = subprocess.check_output(['docker', 'inspect', '-f', '{{.State.Status}} {{.State.ExitCode}}', container], text=True).strip()
        assert state == 'exited 0', (container, state)
    assert not any(r['errorCount'] or r['warningCount'] for r in json.loads((OUT / 'lint.json').read_text()))
    for result in ['candidate.json', 'design.json']:
        assert json.loads((OUT / result).read_text())['passed']
    backup = Path('/opt/webcodex/ovload-gateway-test-runtime-20261031/table-alignment-backup-20261110')
    backup.mkdir(exist_ok=True)
    live = SOURCE / 'web/dist'
    if not (backup / 'web-dist.tar.gz').exists():
        with tarfile.open(backup / 'web-dist.tar.gz', 'w:gz') as archive:
            archive.add(live, arcname='dist')
    with tarfile.open(backup / 'web-dist.tar.gz') as archive:
        assert 'dist/index.html' in archive.getnames()
    candidate = SOURCE / 'web/dist-table-align'
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
    print('PASS verified table alignment deployed; entry matches candidate and requires cache revalidation')


if __name__ == '__main__': main()
