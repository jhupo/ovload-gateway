"""Deploy verified commerce changes to the existing test service, preserving credentials."""
import gzip,hashlib,json,shutil,ssl,subprocess,tarfile,time,urllib.request
from urllib.parse import urlsplit
from pathlib import Path
S=Path('/opt/webcodex/ovload-gateway-codex-test-20261031135140')
R=Path('/opt/webcodex/ovload-gateway-test-runtime-20261031')
B=R/'commerce-backup-20261105'
O=S/'test-results/commerce-completion'
URL='https://192.168.2.150:19443'
def state(name):
 return subprocess.check_output(['docker','inspect','-f','{{.State.Status}} {{.State.ExitCode}}',name],text=True).strip()
def main():
 for name in ['ovload-commerce-build6','ovload-commerce-ui5','ovload-commerce-browser6']:
  assert state(name)=='exited 0',(name,state(name))
 assert len(json.loads((O/'api-checks.json').read_text())) >= 11
 assert len(json.loads((O/'extra-api-checks.json').read_text())) == 3
 ui=json.loads((O/'ui-checks.json').read_text());assert len(ui['checks']) >= 5 and not ui['errors']
 assert not any(x['severity']=='error' for x in json.loads((O/'design-check.json').read_text())['findings'])
 for file in ['gateway.gz']:
  with gzip.open(B/file,'rb') as f:
   while f.read(1024*1024):pass
 with tarfile.open(B/'web-dist.tar.gz') as f:assert 'dist/index.html' in f.getnames()
 password_digest=hashlib.sha256((R/'administrator.password').read_bytes()).hexdigest()
 # Refresh the backup immediately before applying additive migrations.
 with gzip.open(B/'database-before-deploy.sql.gz','wb') as f:
  database=urlsplit(json.loads((R/'deploy/config.yaml').read_text())['store']['database']['url']).path.lstrip('/')
  dump=subprocess.Popen(['docker','exec','ovload-test-postgres','sh','-c','pg_dump -U \"$POSTGRES_USER\" \"$1\"','sh',database],stdout=subprocess.PIPE)
  shutil.copyfileobj(dump.stdout,f)
  assert dump.wait()==0
 candidate=S/'web/dist-commerce-candidate';live=S/'web/dist'
 context=ssl._create_unverified_context()
 try:
  # Publish hashed assets first; retain previous hashes for already-open browser tabs.
  for child in candidate.iterdir():
   if child.name=='index.html':continue
   if child.is_dir():shutil.copytree(child,live/child.name,dirs_exist_ok=True)
   else:shutil.copy2(child,live/child.name)
  shutil.copy2(candidate/'index.html',live/'index.html.next');(live/'index.html.next').replace(live/'index.html')
  subprocess.run(['docker','restart','ovload-test-gateway'],check=True,stdout=subprocess.DEVNULL)
  for _ in range(45):
   try:
    with urllib.request.urlopen(URL+'/healthz',context=context,timeout=3) as r:
     if r.status==204:break
   except (OSError,TimeoutError):pass
   time.sleep(1)
  else:raise RuntimeError('Candidate failed health check')
  with urllib.request.urlopen(URL+'/',context=context,timeout=5) as r:served=r.read()
  assert served==candidate.joinpath('index.html').read_bytes()
  assert hashlib.sha256((R/'administrator.password').read_bytes()).hexdigest()==password_digest
  report={'passed':True,'url':URL,'health':204,'assetsMatch':True,'passwordPreserved':True,'backup':str(B),'liveProviderBillingVerified':False,'binarySha256':hashlib.file_digest((S/'target/debug/ovload-gateway').open('rb'),'sha256').hexdigest()}
  (O/'deployment.json').write_text(json.dumps(report,indent=2))
  print('PASS test-site deployment, health, assets and preserved administrator password')
 except Exception:
  # Preserve the failing deployment and its diagnostics. Restoring an earlier
  # binary alone would conflict with applied SQLx migrations. Database rollback
  # also needs the verified dump and explicit handling of any newer writes.
  (O/'deployment-failed.txt').write_text('Deployment verification failed; inspect service and backup before recovery.')
  raise
if __name__=='__main__':main()
