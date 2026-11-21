"""Activate this task's verified backend; no schema changes are required."""
import gzip,json,shutil,ssl,subprocess,time,urllib.request
from pathlib import Path
S=Path('/opt/webcodex/ovload-gateway-codex-test-20261031135140')
R=Path('/opt/webcodex/ovload-gateway-test-runtime-20261031')
O=S/'test-results/accounts-completion';B=R/'accounts-completion-backup-20261111'
assert (O/'verified-build.exit').read_text().strip()=='0'
assert '3 passed; 0 failed' in (O/'quota-tests.log').read_text()
assert '1 passed; 0 failed' in (O/'transaction-test.log').read_text()
def healthy():
 for _ in range(40):
  try:
   with urllib.request.urlopen('https://192.168.2.150:19443/healthz',context=ssl._create_unverified_context(),timeout=2) as r:
    if r.status==204:return
  except OSError:pass
  time.sleep(1)
 raise RuntimeError('Gateway health check failed')
try:
 subprocess.run(['docker','restart','ovload-test-gateway'],check=True,stdout=subprocess.DEVNULL);healthy()
 (O/'backend.json').write_text(json.dumps({'passed':True,'health':204,'backup':str(B)}));print('PASS backend activated and healthy')
except Exception:
 with gzip.open(B/'gateway.gz','rb') as source,open(S/'target/debug/ovload-gateway.rollback','wb') as dest:shutil.copyfileobj(source,dest)
 rollback=S/'target/debug/ovload-gateway.rollback';rollback.chmod(0o755);rollback.replace(S/'target/debug/ovload-gateway')
 subprocess.run(['docker','restart','ovload-test-gateway'],check=True,stdout=subprocess.DEVNULL);healthy();raise
