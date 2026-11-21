"""Compare saved-key upstream failures without logging credentials."""
import concurrent.futures, json, subprocess
from pathlib import Path
keys=json.loads(Path('/opt/webcodex/ovload-gateway-test-runtime-20261031/account-test-private.json').read_text(encoding='utf-8-sig'))
def check(pair):
 provider,key=pair
 headers={'Authorization':'Bearer '+key, 'Accept':'application/json'}
 if provider=='claude': headers.update({'x-api-key':key,'anthropic-version':'2023-06-01'})
 try:
  config=['url = "https://dash.ovload.com/v1/models"']+["header = "+json.dumps(k+': '+v) for k,v in headers.items()]
  res=subprocess.run(['curl','-sS','--max-time','25','--config','-','-w','\nHTTP %{http_code}'],input='\n'.join(config),text=True,capture_output=True)
  body=res.stdout
  for secret in keys.values(): body=body.replace(secret,'[redacted]')
  return {'provider':provider,'exit':res.returncode,'body':body[:2200],'error':res.stderr[:100]}
 except Exception as e:return {'provider':provider,'error':str(e)}
result=list(concurrent.futures.ThreadPoolExecutor(2).map(check,keys.items()))
Path('/opt/webcodex/ovload-gateway-codex-test-20261031135140/test-results/account-test-modes/direct.json').write_text(json.dumps(result))
print(json.dumps(result))
