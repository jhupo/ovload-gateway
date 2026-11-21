"""Publish the verified frontend-review fixes to the existing test site."""
import gzip,hashlib,json,shutil,ssl,subprocess,tarfile,time,urllib.request
from pathlib import Path
S=Path('/opt/webcodex/ovload-gateway-codex-test-20261031135140')
R=Path('/opt/webcodex/ovload-gateway-test-runtime-20261031')
B=R/'review-backup-20261110'
O=S/'test-results/frontend-review'
URL='https://192.168.2.150:19443'

def main():
 for name in ['ovload-review-fix-build5','ovload-review-fix-ui6','ovload-review-fix-browser3']:
  state=subprocess.check_output(['docker','inspect','-f','{{.State.Status}} {{.State.ExitCode}}',name],text=True).strip()
  assert state=='exited 0',(name,state)
 for file in ['api.json','candidate-ui.json','customer-api.json','design-final.json']:
  assert json.loads((O/file).read_text())['passed']
 assert not any(r['errorCount'] or r['warningCount'] for r in json.loads((O/'final-eslint.json').read_text()))
 with gzip.open(B/'gateway.gz','rb') as backup:
  while backup.read(1024*1024):pass
 with tarfile.open(B/'web-dist.tar.gz') as backup:assert 'dist/index.html' in backup.getnames()
 password_digest=hashlib.sha256((R/'administrator.password').read_bytes()).hexdigest()
 candidate=S/'web/dist-review-candidate';live=S/'web/dist'
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
 else:raise RuntimeError('Frontend repair deployment health check failed')
 with urllib.request.urlopen(URL+'/',context=context,timeout=5) as response:
  assert response.read()==(candidate/'index.html').read_bytes()
 assert password_digest==hashlib.sha256((R/'administrator.password').read_bytes()).hexdigest()
 report={'passed':True,'url':URL,'health':204,'assetsMatch':True,'passwordPreserved':True,'backup':str(B),'binarySha256':hashlib.file_digest((S/'target/debug/ovload-gateway').open('rb'),'sha256').hexdigest()}
 (O/'deployment.json').write_text(json.dumps(report,indent=2))
 print('PASS frontend repair deployment, health, assets and preserved administrator password')

if __name__=='__main__':main()
