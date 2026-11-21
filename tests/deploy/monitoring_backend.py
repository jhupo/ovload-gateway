"""Activate the verified monitoring backend with a recoverable binary and DB snapshot."""
import gzip,json,os,shutil,ssl,subprocess,time,urllib.request
from pathlib import Path
S=Path('/opt/webcodex/ovload-gateway-codex-test-20261031135140')
R=Path('/opt/webcodex/ovload-gateway-test-runtime-20261031')
B=R/'monitoring-backup-20261111'
O=S/'test-results/monitoring-completion'
assert subprocess.check_output(['docker','inspect','-f','{{.State.Status}} {{.State.ExitCode}}','ovload-monitoring-build3'],text=True).strip()=='exited 0'
with gzip.open(B/'gateway.gz','rb') as f:
    while f.read(1024*1024): pass
if not (B/'database.sql.gz').exists():
    from urllib.parse import urlsplit
    database=urlsplit(json.loads((R/'deploy/config.yaml').read_text())['store']['database']['url']).path.lstrip('/')
    with gzip.open(B/'database.sql.gz','wb') as dest:
        proc=subprocess.Popen(['docker','exec','ovload-test-postgres','sh','-c','pg_dump -U "$POSTGRES_USER" "$1"','sh',database],stdout=subprocess.PIPE)
        shutil.copyfileobj(proc.stdout,dest); assert proc.wait()==0
candidate=O/'gateway-candidate'
candidate.unlink(missing_ok=True)
os.link(S/'target/debug/ovload-gateway',candidate)
def health():
    for _ in range(60):
        try:
            with urllib.request.urlopen('https://192.168.2.150:19443/healthz',context=ssl._create_unverified_context(),timeout=2) as response:
                if response.status==204:return
        except (OSError,TimeoutError): pass
        time.sleep(1)
    raise RuntimeError('Gateway did not become healthy')
try:
    subprocess.run(['docker','restart','ovload-test-gateway'],check=True,stdout=subprocess.DEVNULL)
    health()
    subprocess.run(['python3',str(S/'tests/deploy/monitoring_verify.py')],cwd=S,check=True)
    (O/'backend.json').write_text(json.dumps({'passed':True,'health':204,'backup':str(B)}))
except Exception:
    target=S/'target/debug/ovload-gateway'
    with gzip.open(B/'gateway.gz','rb') as source,target.with_suffix('.rollback').open('wb') as dest: shutil.copyfileobj(source,dest)
    target.with_suffix('.rollback').chmod(0o755);os.replace(target.with_suffix('.rollback'),target)
    subprocess.run(['docker','restart','ovload-test-gateway'],check=True,stdout=subprocess.DEVNULL)
    health()
    (O/'backend.json').write_text(json.dumps({'passed':False,'rolledBack':True}))
    raise
