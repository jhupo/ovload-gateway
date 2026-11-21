"""Publish the verified usage-record UI and backend to the existing test site."""
import gzip,hashlib,json,shutil,ssl,subprocess,tarfile,time,urllib.request
from pathlib import Path
S=Path('/opt/webcodex/ovload-gateway-codex-test-20261031135140')
R=Path('/opt/webcodex/ovload-gateway-test-runtime-20261031')
B=R/'filters-backup-20261109'
O=S/'test-results/usage-filters'
URL='https://192.168.2.150:19443'

def main():
 for name in ['ovload-filters-build1','ovload-filters-ui2','ovload-filters-browser1']:
  state=subprocess.check_output(['docker','inspect','-f','{{.State.Status}} {{.State.ExitCode}}',name],text=True).strip()
  assert state=='exited 0',(name,state)
 for file in ['api.json','candidate-checks.json']:
  assert json.loads((O/file).read_text())['passed']
 assert not any(f['severity']=='error' for f in json.loads((O/'design.json').read_text())['findings'])
 with gzip.open(B/'gateway.gz','rb') as backup:
  while backup.read(1024*1024):pass
 with tarfile.open(B/'web-dist.tar.gz') as backup:assert 'dist/index.html' in backup.getnames()
 password_digest=hashlib.sha256((R/'administrator.password').read_bytes()).hexdigest()
 candidate=S/'web/dist-filters-candidate';live=S/'web/dist'
 # Keep existing hashed assets available for already-open tabs.
 for child in candidate.iterdir():
  if child.name=='index.html':continue
  if child.is_dir():shutil.copytree(child,live/child.name,dirs_exist_ok=True)
  else:shutil.copy2(child,live/child.name)
 shutil.copy2(candidate/'index.html',live/'index.html.next');(live/'index.html.next').replace(live/'index.html')
 subprocess.run(['docker','restart','ovload-test-gateway'],check=True,stdout=subprocess.DEVNULL)
 context=ssl._create_unverified_context()
 for _ in range(40):
  try:
   with urllib.request.urlopen(URL+'/healthz',context=context,timeout=2) as response:
    if response.status==204:break
  except (OSError,TimeoutError):pass
  time.sleep(1)
 else:raise RuntimeError('Usage deployment health check failed')
 with urllib.request.urlopen(URL+'/',context=context,timeout=5) as response:
  assert response.read()==(candidate/'index.html').read_bytes()
 assert password_digest==hashlib.sha256((R/'administrator.password').read_bytes()).hexdigest()
 report={'passed':True,'url':URL,'health':204,'assetsMatch':True,'passwordPreserved':True,'backup':str(B),'binarySha256':hashlib.file_digest((S/'target/debug/ovload-gateway').open('rb'),'sha256').hexdigest()}
 (O/'deployment.json').write_text(json.dumps(report,indent=2))
 print('PASS usage deployment, health, assets and preserved administrator password')

if __name__=='__main__':main()
