"""Deploy verified management changes to the existing test service, preserving credentials."""
import gzip,hashlib,json,shutil,ssl,subprocess,tarfile,time,urllib.request
from urllib.parse import urlsplit
from pathlib import Path
S=Path('/opt/webcodex/ovload-gateway-codex-test-20261031135140')
R=Path('/opt/webcodex/ovload-gateway-test-runtime-20261031')
B=R/'management-backup-20261104'
O=S/'test-results/management-completion'
URL='https://192.168.2.150:19443'
def state(name):
 return subprocess.check_output(['docker','inspect','-f','{{.State.Status}} {{.State.ExitCode}}',name],text=True).strip()
def main():
 for name in ['ovload-management-checks2','ovload-management-lease-tests','ovload-management-ui-build4','ovload-management-browser']:
  assert state(name)=='exited 0',(name,state(name))
 for file in ['browser.json','database.json']:assert json.loads((O/file).read_text())['passed']
 for file in ['gateway.gz','database.sql.gz']:
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
 candidate=S/'web/dist-management-candidate';live=S/'web/dist'
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
  report={'passed':True,'url':URL,'health':204,'assetsMatch':True,'passwordPreserved':True,'backup':str(B),'liveUpstreamModelSyncVerified':False,'binarySha256':hashlib.file_digest((S/'target/debug/ovload-gateway').open('rb'),'sha256').hexdigest()}
  (O/'deployment.json').write_text(json.dumps(report,indent=2))
  print('PASS test-site deployment, health, assets and preserved administrator password')
 except Exception:
  subprocess.run(['docker','stop','-t','15','ovload-test-gateway'],check=True,stdout=subprocess.DEVNULL)
  temporary=S/'target/debug/ovload-gateway.rollback'
  with gzip.open(B/'gateway.gz','rb') as src,temporary.open('wb') as dst:shutil.copyfileobj(src,dst)
  temporary.chmod(0o755);temporary.replace(S/'target/debug/ovload-gateway')
  with tarfile.open(B/'web-dist.tar.gz') as f:f.extractall(S/'web',filter='data')
  subprocess.run(['docker','start','ovload-test-gateway'],check=True,stdout=subprocess.DEVNULL)
  raise
if __name__=='__main__':main()
