"""Publish only the verified dashboard frontend; no service or database changes."""
from pathlib import Path
import json,shutil,subprocess,tarfile,urllib.request,ssl,hashlib
S=Path('/opt/webcodex/ovload-gateway-codex-test-20261031135140')
O=S/'test-results/dashboard-refresh'
R=Path('/opt/webcodex/ovload-gateway-test-runtime-20261031')
for name in ['ovload-dashboard-ui2','ovload-dashboard-layout2']:
 assert subprocess.check_output(['docker','inspect','-f','{{.State.Status}} {{.State.ExitCode}}',name],text=True).strip()=='exited 0'
assert json.loads((O/'layout-checks.json').read_text())['passed']
assert not any(x['severity']=='error' for x in json.loads((O/'design-check.json').read_text())['findings'])
live=S/'web/dist';candidate=S/'web/dist-dashboard-candidate';backup=R/'dashboard-backup-20261107'
backup.mkdir(exist_ok=True)
with tarfile.open(backup/'web-dist.tar.gz','w:gz') as tar:tar.add(live,arcname='dist')
try:
 for child in candidate.iterdir():
  if child.name=='index.html':continue
  if child.is_dir():shutil.copytree(child,live/child.name,dirs_exist_ok=True)
  else:shutil.copy2(child,live/child.name)
 shutil.copy2(candidate/'index.html',live/'index.html.next');(live/'index.html.next').replace(live/'index.html')
 with urllib.request.urlopen('https://192.168.2.150:19443/',context=ssl._create_unverified_context()) as response:assert response.read()==(candidate/'index.html').read_bytes()
 (O/'deployment.json').write_text(json.dumps({'passed':True,'url':'https://192.168.2.150:19443/','backup':str(backup),'frontendOnly':True},indent=2))
 print('PASS verified frontend deployed; existing backend and database unchanged')
except Exception:
 with tarfile.open(backup/'web-dist.tar.gz') as tar:tar.extractall(S/'web',filter='data')
 raise
