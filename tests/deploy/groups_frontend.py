"""Publish the verified groups assets while preserving the previous entry."""
import json,shutil,ssl,subprocess,tarfile,urllib.request
from pathlib import Path
S=Path('/opt/webcodex/ovload-gateway-codex-test-20261031135140')
O=S/'test-results/groups-completion'
B=Path('/opt/webcodex/ovload-gateway-test-runtime-20261031/groups-backup-20261111')
for file in ['backend.json','api.json','candidate.json']:
    assert json.loads((O/file).read_text())['passed'],file
design=json.loads((O/'design.json').read_text());assert design['errors']==design['warnings']==0
for file in ['typecheck.log','lint.log']:assert not (O/file).read_text().strip(),file
assert subprocess.check_output(['docker','inspect','-f','{{.State.Status}} {{.State.ExitCode}}','ovload-groups-ui3'],text=True).strip()=='exited 0'
live=S/'web/dist'; candidate=S/'web/dist-groups'
if not (B/'web-dist.tar.gz').exists():
    with tarfile.open(B/'web-dist.tar.gz','w:gz') as archive:archive.add(live,arcname='dist')
for child in candidate.iterdir():
    if child.name=='index.html':continue
    if child.is_dir():shutil.copytree(child,live/child.name,dirs_exist_ok=True)
    else:shutil.copy2(child,live/child.name)
shutil.copy2(candidate/'index.html',live/'index.html.next')
(live/'index.html.next').replace(live/'index.html')
with urllib.request.urlopen('https://192.168.2.150:19443/groups',context=ssl._create_unverified_context()) as response:
    assert response.read()==(candidate/'index.html').read_bytes()
    assert response.headers.get('Cache-Control')=='no-cache'
(O/'deployment.json').write_text(json.dumps({'passed':True,'backup':str(B),'assetsMatch':True}))
print('PASS verified groups frontend published')
