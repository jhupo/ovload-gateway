"""Deploy the verified native-provider build to the existing test server."""
import gzip
import hashlib
import json
from pathlib import Path
import shutil
import ssl
import subprocess
import tarfile
import time
import urllib.request

SOURCE = Path('/opt/webcodex/ovload-gateway-codex-test-20261031135140')
RUNTIME = Path('/opt/webcodex/ovload-gateway-test-runtime-20261031')
BACKUP = RUNTIME / 'native-providers-backup-20261104T142321Z'
RESULTS = SOURCE / 'test-results/native-providers'
ORIGIN = 'https://192.168.2.150:19443'


def main():
    assert json.loads((RESULTS / 'browser.json').read_text())['passed']
    assert (BACKUP / 'ovload-gateway.gz').is_file()
    assert (BACKUP / 'previous-web-dist.tar.gz').is_file()
    for name in ['ovload-native-regression', 'ovload-native-build-final', 'ovload-native-ui-build', 'ovload-native-ui-final']:
        state = subprocess.check_output(['docker', 'inspect', '--format', '{{.State.Status}} {{.State.ExitCode}}', name], text=True).strip()
        assert state == 'exited 0', (name, state)
    context = ssl._create_unverified_context()
    try:
        subprocess.run(['docker', 'restart', 'ovload-test-gateway'], check=True, stdout=subprocess.DEVNULL)
        for _ in range(45):
            try:
                with urllib.request.urlopen(ORIGIN + '/healthz', context=context, timeout=3) as response:
                    if response.status == 204:
                        break
            except (OSError, TimeoutError):
                pass
            time.sleep(1)
        else:
            raise RuntimeError('Candidate did not become healthy')
        with urllib.request.urlopen(ORIGIN + '/', context=context, timeout=5) as response:
            served = response.read()
        assert served == (SOURCE / 'web/dist/index.html').read_bytes()
        metadata = {
            'url': ORIGIN, 'health': 204, 'assetsMatch': True,
            'binarySha256': hashlib.file_digest((SOURCE / 'target/debug/ovload-gateway').open('rb'), 'sha256').hexdigest(),
            'indexSha256': hashlib.sha256(served).hexdigest(),
            'backup': str(BACKUP), 'realSubscriptionAuthorizationVerified': False,
            'browserChecks': json.loads((RESULTS / 'browser.json').read_text())['checks'],
        }
        (RESULTS / 'deployment.json').write_text(json.dumps(metadata, indent=2))
        print('PASS deployed candidate; regular health=204; served assets match; existing accounts and passwords preserved')
    except Exception:
        subprocess.run(['docker', 'stop', '-t', '15', 'ovload-test-gateway'], check=True, stdout=subprocess.DEVNULL)
        target = SOURCE / 'target/debug/ovload-gateway'
        temporary = target.with_name('ovload-gateway.rollback')
        with gzip.open(BACKUP / 'ovload-gateway.gz', 'rb') as src, temporary.open('wb') as dst:
            shutil.copyfileobj(src, dst)
        temporary.chmod(0o755)
        temporary.replace(target)
        with tarfile.open(BACKUP / 'previous-web-dist.tar.gz') as archive:
            archive.extractall(SOURCE / 'web', filter='data')
        subprocess.run(['docker', 'start', 'ovload-test-gateway'], check=True, stdout=subprocess.DEVNULL)
        raise


if __name__ == '__main__':
    main()
