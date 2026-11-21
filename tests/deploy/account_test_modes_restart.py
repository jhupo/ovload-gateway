import gzip, shutil, ssl, subprocess, time, urllib.request
from pathlib import Path
root=Path('/opt/webcodex/ovload-gateway-codex-test-20261031135140')
runtime=Path('/opt/webcodex/ovload-gateway-test-runtime-20261031')
assert (root/'test-results/account-test-modes/rust-restored.exit').read_text().strip()=='0'
def restart():
    subprocess.run(['docker','restart','ovload-test-gateway'],check=True,stdout=subprocess.DEVNULL)
    for _ in range(40):
        try:
            with urllib.request.urlopen('https://192.168.2.150:19443/healthz',context=ssl._create_unverified_context(),timeout=2) as r:
                if 200 <= r.status < 300:return True
        except Exception:pass
        time.sleep(1)
    return False
if not restart():
    target=root/'target/debug/ovload-gateway'
    replacement=target.with_suffix('.rollback')
    with gzip.open(runtime/'account-test-modes-previous.gz','rb') as source, replacement.open('wb') as dest:shutil.copyfileobj(source,dest)
    replacement.chmod(0o755)
    replacement.replace(target)
    restored=restart()
    raise SystemExit('Candidate unhealthy; previous binary restored: '+str(restored))
print('PASS restarted candidate backend; healthz success')
