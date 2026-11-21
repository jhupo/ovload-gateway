"""Activate verified customer counts on the authorized test server, with binary rollback."""
import gzip, json, os, shutil, ssl, subprocess, time, urllib.request
from pathlib import Path
S=Path('/opt/webcodex/ovload-gateway-codex-test-20261031135140')
R=Path('/opt/webcodex/ovload-gateway-test-runtime-20261031')
O=S/'test-results/dashboard-users'
B=R/'dashboard-users-backup-20261110'
assert subprocess.check_output(['docker','inspect','-f','{{.State.Status}} {{.State.ExitCode}}','ovload-dashboard-users-build1'],text=True).strip()=='exited 0'
with gzip.open(B/'gateway.gz','rb') as backup:
    while backup.read(1024*1024): pass

def health():
    for _ in range(30):
        try:
            with urllib.request.urlopen('https://192.168.2.150:19443/healthz',context=ssl._create_unverified_context(),timeout=2) as r:
                if r.status==204:return
        except (OSError,TimeoutError):pass
        time.sleep(1)
    raise RuntimeError('Test gateway health check failed')

try:
    subprocess.run(['docker','restart','ovload-test-gateway'],check=True,stdout=subprocess.DEVNULL)
    health()
    subprocess.run(['python3',str(S/'tests/deploy/dashboard_users_verify.py')],check=True,cwd=S)
    (O/'backend.json').write_text(json.dumps({'passed':True,'health':204,'backup':str(B)}))
except Exception:
    target=S/'target/debug/ovload-gateway'
    with gzip.open(B/'gateway.gz','rb') as source,target.with_suffix('.rollback').open('wb') as dest:
        shutil.copyfileobj(source,dest)
    target.with_suffix('.rollback').chmod(0o755)
    os.replace(target.with_suffix('.rollback'),target)
    subprocess.run(['docker','restart','ovload-test-gateway'],check=True,stdout=subprocess.DEVNULL)
    health()
    raise
