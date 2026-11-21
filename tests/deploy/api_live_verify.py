"""Opt-in real upstream smoke tests; credentials live outside the source checkout."""
import json
import ssl
import sys
import time
import secrets
import uuid
import subprocess
import http.cookiejar
from datetime import datetime, timedelta, timezone
from urllib.parse import urlencode
from decimal import Decimal
from concurrent.futures import ThreadPoolExecutor
import urllib.request
import urllib.error
from pathlib import Path

import commerce_verify as api

ROOT = Path('/opt/webcodex/ovload-gateway-test-runtime-20261031')
OUT = Path('/opt/webcodex/ovload-gateway-codex-test-20261031135140/test-results/api-live')
api.BASE = 'https://192.168.2.150:19443'
KEYS = json.loads((ROOT / 'api-live-private.json').read_text())

def request(url, headers, body=None, timeout=90):
    req = urllib.request.Request(url, headers=headers, data=None if body is None else json.dumps(body).encode())
    start = time.monotonic()
    try:
        response = urllib.request.urlopen(req, timeout=timeout, context=ssl._create_unverified_context() if url.startswith(api.BASE) else None)
    except urllib.error.HTTPError as exc:
        response = exc
    raw = response.read(4 * 1024 * 1024).decode('utf-8', 'replace')
    for secret in KEYS.values():
        raw = raw.replace(secret, '[redacted]')
    return {'status': response.status, 'type': response.headers.get('content-type'), 'request_id':response.headers.get('x-request-id'), 'seconds': round(time.monotonic()-start, 2), 'body': raw}

def save(name, value):
    OUT.mkdir(parents=True, exist_ok=True)
    (OUT / (name + '.json')).write_text(json.dumps(value, ensure_ascii=False, indent=2))

def bounded_request(url, headers, body):
    attempts = []
    for attempt in range(3):
        try:
            result = request(url, headers, body, timeout=150)
        except Exception as exc:
            result = {'status':0,'error':str(exc)}
        raw = result.get('body','')
        transient = result['status'] in [0, 502, 503, 504]
        if result['status'] == 200 and 'text/event-stream' in (result.get('type') or ''):
            for line in raw.splitlines():
                if line.startswith('data: ') and line[6:] != '[DONE]':
                    event = json.loads(line[6:])
                    if event.get('type') in ['error','response.failed'] or isinstance(event.get('error'),dict):
                        transient = any(code in line for code in ['timeout','upstream_unavailable','upstream request'])
        if not transient or attempt == 2:
            return {**result,'priorAttempts':attempts}
        attempts.append(result)
        time.sleep(2)

def admin():
    client = api.Client()
    cookie_path = ROOT / 'api-live-cookies.txt'
    csrf_path = ROOT / 'api-live-csrf.txt'
    jar = http.cookiejar.MozillaCookieJar(str(cookie_path))
    client.cookies = jar
    client.opener = urllib.request.build_opener(urllib.request.HTTPCookieProcessor(jar), urllib.request.HTTPSHandler(context=ssl._create_unverified_context()))
    if cookie_path.exists() and csrf_path.exists():
        jar.load(ignore_discard=True, ignore_expires=False)
        client.csrf = csrf_path.read_text()
        return client
    for attempt in range(6):
        try:
            client.login('ovload_test_admin', (ROOT / 'administrator.password').read_text().strip())
            break
        except AssertionError as exc:
            if '429' not in str(exc) or attempt == 5:
                raise
            time.sleep(20)
    cookie_path.touch(mode=0o600,exist_ok=True)
    jar.save(ignore_discard=True)
    csrf_path.touch(mode=0o600,exist_ok=True)
    csrf_path.write_text(client.csrf)
    return client

def provision():
    client = admin()
    path = OUT / 'accounts.json'
    state = json.loads(path.read_text()) if path.exists() else {}
    def call(path, data=None, **kwargs):
        doc = client.call(path, data, **kwargs)
        return doc['data'] if isinstance(doc, dict) and 'code' in doc else doc
    if 'user' not in state:
        password = secrets.token_urlsafe(30) + 'Aa1!'
        state['user'] = call('/api/admin/v1/users', {'email':'api-live-20261112@example.com','display_name':'API 实测用户','password':password,'max_concurrency':4,'requests_per_minute':60,'notes':'真实 API 验收专用'},status=201)
        save('accounts', state)
    user = state['user']
    call('/api/admin/v1/billing/wallets/'+user['tenant_id']+'/credits', {'amount_usd':'10','reason':'API 实测专用测试余额'}, headers={'Idempotency-Key':'api-live-20261112-credit'})
    for provider, label, platform in [('openai_api','OpenAI','openai'),('xai_api','Grok','xai'),('claude','Claude','claude')]:
        item = state.setdefault(provider, {})
        if 'group' not in item:
            item['group'] = call('/api/admin/account-groups/create', {'name':'API 实测 · '+label,'description':'dash.ovload.com 真实 API 功能验收','color':'#0284C7FF','visibility':'private','retailMultiplierBps':10000,'modelRoutes':None,'platform':platform,'allowImageGeneration':False,'fastMode':'default','pricing':{'peak':None,'modelPrices':{}},'controls':{'allowLive':False,'requestsPerMinute':60,'userOverrides':{}}}, status=201)['record']['id']
            save('accounts', state)
        if 'account' not in item:
            item['account'] = call('/api/admin/accounts/import', {'provider':provider,'data':{'schema_version':1,'name':'API 实测 · '+label,'base_url':'https://dash.ovload.com/v1','api_key':KEYS[provider]},'settings':{'notes':'用户提供的真实测试 API；独立测试分组','enabled':True,'concurrencyLimit':2,'weight':1,'groupIds':[item['group']],'modelAccess':{'mode':'all','models':[]}}}, status=201)['accountIds'][0]
            save('accounts', state)
        owner = '?tenant_id='+user['tenant_id']+'&user_id='+user['id']
        call('/api/admin/v1/users/'+user['id']+'/group-grants?tenant_id='+user['tenant_id'], {'group_id':item['group'],'reason':'真实 API 验收'}, status=204)
        private_path = ROOT / 'api-live-downstream.json'
        private = json.loads(private_path.read_text()) if private_path.exists() else {}
        if provider not in private:
            issued = call('/api/admin/v1/api-keys'+owner, {'name':'API 实测 · '+label,'group_id':item['group'],'limits':{'max_concurrency':2,'requests_per_minute':60},'expires_at':'2026-11-14T00:00:00Z','reason':'真实 API 验收'}, status=201, headers={'Idempotency-Key':'api-live-20261112-key-'+provider})
            private[provider] = issued
            private_path.touch(mode=0o600, exist_ok=True)
            private_path.write_text(json.dumps(private))
            item['key_id'] = issued['key']['id']
            save('accounts', state)
        print('Configured', provider, 'account', item['account'], flush=True)
    client.call('/api/admin/v1/auth/session',method='DELETE',status=204)

def synchronize():
    client = admin()
    state = json.loads((OUT / 'accounts.json').read_text())
    results = {}
    for provider in KEYS:
        try:
            models = client.call('/api/admin/accounts/connection-test/models', {'accountId':state[provider]['account']})['data']
            results[provider] = models
        except Exception as exc:
            results[provider] = {'error':str(exc)}
        save('synchronized', results)
        print(provider, json.dumps(results[provider],ensure_ascii=False),flush=True)
    save('pricing-before', client.call('/api/admin/settings/pricing')['data'])

SELECTED = {'openai_api':'gpt-5.6-luna', 'xai_api':'grok-4.5', 'claude':'claude-haiku-4-5-20251001'}

def connections():
    client = admin()
    state = json.loads((OUT / 'accounts.json').read_text())
    results = {}
    for provider, model in SELECTED.items():
        req = urllib.request.Request(api.BASE+'/api/admin/accounts/connection-test',data=json.dumps({'accountId':state[provider]['account'],'modelId':model}).encode(),headers={'Origin':api.BASE,'X-CSRF-Token':client.csrf,'Content-Type':'application/json'})
        start = time.monotonic()
        try:
            with client.opener.open(req,timeout=150) as response:
                raw = response.read(1024*1024).decode()
                results[provider] = {'status':response.status,'seconds':round(time.monotonic()-start,2),'sse':raw}
        except Exception as exc:
            results[provider] = {'error':str(exc)}
        save('connections', results)
        print(provider,json.dumps(results[provider],ensure_ascii=False),flush=True)

def gateway():
    private = json.loads((ROOT / 'api-live-downstream.json').read_text())
    results = []
    for provider, model in SELECTED.items():
        headers = {'Authorization':'Bearer '+private[provider]['secret'],'Content-Type':'application/json'}
        for name, path, body in [
            ('models','/v1/models',None),
            ('unpriced','/v1/responses',{'model':model,'input':'Reply OK only.','max_output_tokens':64,'stream':False}),
        ]:
            result = request(api.BASE+path,headers,body)
            results.append({'provider':provider,'test':name,**result});save('gateway',results)
            print(provider,name,result['status'],result['body'][:600],flush=True)

def functional():
    client = admin()
    private = json.loads((ROOT / 'api-live-downstream.json').read_text())
    before = client.call('/api/admin/settings/pricing')['data']
    save('functional-pricing-before',before)
    results = []
    save('functional-window', {'startedAt':datetime.now(timezone.utc).isoformat()})
    touched = []
    try:
        for provider, model in SELECTED.items():
            client.call('/api/admin/settings/pricing/update', {'provider':provider,'models':[model],'change':{'action':'replace','pricing':{'multiplierBps':10000,'bands':{'standard':{'input':'1','output':'2','cacheRead':'0.1','cacheWrite':'1.25'}}}}})
            touched.append((provider,model))
            headers = {'Authorization':'Bearer '+private[provider]['secret'],'Content-Type':'application/json'}
            cases = [
                ('responses_json','/v1/responses',{'model':model,'input':'Reply with the single word OK.','max_output_tokens':128,'stream':False}),
                ('responses_stream','/v1/responses',{'model':model,'input':'Reply with the single word OK.','max_output_tokens':128,'stream':True}),
                ('chat_json','/v1/chat/completions',{'model':model,'messages':[{'role':'user','content':'Reply with the single word OK.'}],'max_completion_tokens':128,'stream':False}),
                ('chat_stream','/v1/chat/completions',{'model':model,'messages':[{'role':'user','content':'Reply with the single word OK.'}],'max_completion_tokens':128,'stream':True}),
                ('chat_stream_usage','/v1/chat/completions',{'model':model,'messages':[{'role':'user','content':'Reply with the single word OK.'}],'max_completion_tokens':128,'stream':True,'stream_options':{'include_usage':True}}),
                ('tool_call','/v1/responses',{'model':model,'input':'Call echo with value hello.','max_output_tokens':256,'stream':False,'tools':[{'type':'function','name':'echo','description':'Echo text','parameters':{'type':'object','properties':{'value':{'type':'string'}},'required':['value'],'additionalProperties':False},'strict':True}],'tool_choice':{'type':'function','name':'echo'}}),
                ('unknown_model','/v1/responses',{'model':'nonexistent-api-live-test','input':'OK','stream':False}),
                ('invalid_input','/v1/responses',{'model':model,'input':123,'stream':False}),
            ]
            for name,path,body in cases:
                try:
                    result = bounded_request(api.BASE+path,headers,body)
                except Exception as exc:
                    result = {'status':0,'error':str(exc)}
                results.append({'provider':provider,'model':model,'test':name,**result})
                save('functional',results)
                print(provider,name,result.get('status'),result.get('body',result.get('error',''))[:300],flush=True)
                if name == 'tool_call' and result.get('status') == 200:
                    doc = json.loads(result['body'])
                    calls = [o for o in doc.get('output',[]) if o.get('type')=='function_call']
                    if calls:
                        call = calls[0]
                        followup = {'model':model,'input':[{'role':'user','content':'Call echo with value hello.'},{'type':'function_call','call_id':call['call_id'],'name':call['name'],'arguments':call['arguments']},{'type':'function_call_output','call_id':call['call_id'],'output':'hello'}],'max_output_tokens':128,'stream':False}
                        try:
                            continuation = bounded_request(api.BASE+'/v1/responses',headers,followup)
                        except Exception as exc:
                            continuation = {'status':0,'error':str(exc)}
                        results.append({'provider':provider,'model':model,'test':'tool_result',**continuation});save('functional',results)
                        print(provider,'tool_result',continuation.get('status'),flush=True)
    finally:
        for provider,model in touched:
            previous = before['overrides'].get(provider,{}).get(model)
            change = {'action':'replace','pricing':previous} if previous else {'action':'reset'}
            client.call('/api/admin/settings/pricing/update', {'provider':provider,'models':[model],'change':change})
        save('pricing-restored',client.call('/api/admin/settings/pricing')['data'])

def audit():
    client = admin()
    state = json.loads((OUT / 'accounts.json').read_text())
    now = datetime.now(timezone.utc)
    window = {'startTime':(now-timedelta(hours=2)).isoformat(),'endTime':(now+timedelta(minutes=2)).isoformat(),'userId':state['user']['id'],'status':'all','pageSize':100,'currentPage':1}
    records = client.call('/api/admin/usage/records?'+urlencode(window))['data']
    while len(records['items']) < records['total']:
        window['currentPage'] += 1
        page = client.call('/api/admin/usage/records?'+urlencode(window))['data']
        assert page['items'], 'Usage pagination ended before the reported total'
        records['items'].extend(page['items'])
    save('usage',records)
    wallet = client.call('/api/admin/v1/billing/wallets/'+state['user']['tenant_id'])
    save('wallet',wallet)
    results = json.loads((OUT/'functional.json').read_text())
    checks = []
    for row in results:
        ok = False
        error = None
        try:
            raw = row.get('body','')
            if row['test'] in ['unknown_model','invalid_input']:
                ok = row['status'] == 400
            elif row['status'] == 200:
                if row['test'] == 'responses_stream':
                    events = [json.loads(line[6:]) for line in raw.splitlines() if line.startswith('data: ') and line[6:] != '[DONE]']
                    ok = any(e.get('type')=='response.completed' for e in events) and any(e.get('type')=='response.output_text.delta' and e.get('delta') for e in events) and not any(e.get('type') in ['error','response.failed'] for e in events)
                elif row['test'] in ['chat_stream','chat_stream_usage']:
                    events = [json.loads(line[6:]) for line in raw.splitlines() if line.startswith('data: ') and line[6:] != '[DONE]']
                    text = ''.join(e.get('choices',[{}])[0].get('delta',{}).get('content','') for e in events if e.get('choices'))
                    ok = 'data: [DONE]' in raw and any(e.get('choices') and e['choices'][0].get('finish_reason')=='stop' for e in events) and bool(text) and not any('error' in e for e in events)
                    if row['test']=='chat_stream_usage':
                        ok = ok and any(e.get('usage',{}).get('total_tokens',0)>0 for e in events if e.get('usage'))
                else:
                    doc = json.loads(raw)
                    if row['test'] == 'chat_json':
                        ok = bool(doc['choices'][0]['message']['content']) and doc['choices'][0]['finish_reason']=='stop' and doc['usage']['total_tokens']>0
                    elif row['test']=='tool_call':
                        calls = [o for o in doc.get('output',[]) if o.get('type')=='function_call']
                        ok = bool(calls) and calls[0]['name']=='echo' and json.loads(calls[0]['arguments'])=={'value':'hello'}
                    else:
                        ok = doc.get('status')=='completed' and bool(doc.get('output')) and doc['usage']['total_tokens']>0
        except Exception as exc:
            error = str(exc)
        checks.append({'provider':row['provider'],'test':row['test'],'passed':ok,'error':error,'status':row['status']})
    save('checks',checks)
    print(json.dumps(checks,ensure_ascii=False,indent=2))
    print('Usage records',records.get('total'))
    for row in records.get('items',[]):
        print(json.dumps({k:row.get(k) for k in ['id','provider','requestedModel','status','inputTokens','outputTokens','retailChargeUsd','retailState','fundingSource','costUsd']},ensure_ascii=False))
    print('Wallet',json.dumps(wallet))
    start = datetime.fromisoformat(json.loads((OUT/'functional-window.json').read_text())['startedAt']) if (OUT/'functional-window.json').exists() else now
    recent = [r for r in records.get('items',[]) if datetime.fromisoformat(r['createdAt'].replace('Z','+00:00'))>=start and r['logicalOutcome']=='succeeded']
    billing_checks = []
    for row in recent:
        tokens = row['tokenDetails']
        values = [tokens.get(k) for k in ['inputTokens','outputTokens','cachedInputTokens','cacheWriteInputTokens']]
        if any(v is None for v in values):
            billing_checks.append({'id':row['id'],'provider':row['provider'],'passed':False,'reason':'Missing token dimension'})
            continue
        inp,out,cache,written = map(Decimal,values)
        expected = ((inp-cache-written)+out*2+cache*Decimal('0.1')+written*Decimal('1.25'))/1000000
        amount = row.get('retailChargeUsd')
        billing_checks.append({'id':row['id'],'provider':row['provider'],'expected':str(expected),'actual':amount,'passed':amount is not None and Decimal(amount)==expected and row['retailState']=='settled' and row['fundingSource']=='wallet'})
    charged = sum((Decimal(r['retailChargeUsd']) for r in records.get('items',[]) if r.get('retailChargeUsd') is not None),Decimal(0))
    save('billing-checks',{'requests':billing_checks,'walletMatchesLedger':Decimal(10)-Decimal(wallet['settled_usd'])==charged,'totalTestDebitUsd':str(charged),'heldUsd':wallet['held_usd']})

def boundaries():
    state = json.loads((OUT/'accounts.json').read_text())
    private = json.loads((ROOT/'api-live-downstream.json').read_text())
    results = []
    for name,headers,path,body,expected in [
        ('missing_key',{},'/v1/models',None,401),
        ('invalid_key',{'Authorization':'Bearer invalid-api-live-test'},'/v1/models',None,401),
        ('cross_group_model',{'Authorization':'Bearer '+private['openai_api']['secret']},'/v1/responses',{'model':SELECTED['claude'],'input':'OK','stream':False},503),
    ]:
        result = request(api.BASE+path,{'Content-Type':'application/json',**headers},body)
        results.append({'test':name,'passed':result['status']==expected,**result})
    client = admin()
    body = {'accountId':state['openai_api']['account'],'modelId':'gpt-image-2','prompt':'A dot'}
    try:
        result = client.call('/api/admin/accounts/connection-test',body,status=400)
        results.append({'test':'api_image_not_advertised_as_supported','passed':True,'response':result})
    except Exception as exc:
        results.append({'test':'api_image_not_advertised_as_supported','passed':False,'error':str(exc)})
    save('boundaries',results)
    print(json.dumps(results,ensure_ascii=False,indent=2))

def management():
    client = admin()
    state = json.loads((OUT/'accounts.json').read_text())
    private = json.loads((ROOT/'api-live-downstream.json').read_text())
    checks = []
    for provider,model in SELECTED.items():
        account_id = state[provider]['account']
        detail = client.call('/api/admin/accounts/detail?accountId='+account_id)['data']
        assert all(secret not in json.dumps(detail) for secret in KEYS.values())
        account = detail['account']
        assert account['authenticationKind']=='api_key'
        assert detail['credentialConfiguration']['base_url']=='https://dash.ovload.com/v1'
        settings = {k:account[k] for k in ['enabled','concurrencyLimit','weight','modelAccess']}
        settings.update({'notes':account['notes'] or '', 'groupIds':[g['id'] for g in account['groups']], 'outboundProxyId':account['outboundProxyId'] or ''})
        def update(changes):
            current = client.call('/api/admin/accounts/detail?accountId='+account_id)['data']['account']
            return client.call('/api/admin/accounts/update',{'accountId':account_id,'configRevision':current['configRevision'],**settings,**changes})
        headers = {'Authorization':'Bearer '+private[provider]['secret']}
        try:
            update({'modelAccess':{'mode':'allowlist','models':[model]},'concurrencyLimit':3})
            updated = client.call('/api/admin/accounts/detail?accountId='+account_id)['data']['account']
            assert updated['concurrencyLimit']==3 and updated['modelAccess']['models']==[model]
            listing = request(api.BASE+'/v1/models',headers)
            assert [m['id'] for m in json.loads(listing['body'])['data']]==[model]
            update({'enabled':False})
            disabled = client.call('/api/admin/accounts/detail?accountId='+account_id)['data']['account']
            assert disabled['enabled'] is False
            blocked = request(api.BASE+'/v1/responses',{'Content-Type':'application/json',**headers},{'model':model,'input':'OK','stream':False})
            assert blocked['status']==503
            checks.append({'provider':provider,'passed':True,'checks':['credential not exposed by detail','API configuration','concurrency editing','model allowlist in downstream catalog','disabled state persists and requests are rejected']})
        finally:
            update({})
        save('management',checks)

def queries():
    private = json.loads((ROOT/'api-live-downstream.json').read_text())
    checks = []
    for provider, model in SELECTED.items():
        headers = {'Authorization':'Bearer '+private[provider]['secret']}
        for name,path,expected in [('models','/v1/models',200),('model_detail','/v1/models/'+model,200),('usage','/v1/usage',200),('usage_scope_override','/v1/usage?user_id=someone-else',400)]:
            result = request(api.BASE+path,headers)
            passed = result['status']==expected
            doc = json.loads(result['body'])
            if name=='model_detail': passed = passed and doc.get('id')==model
            if name=='models': passed = passed and model in [m['id'] for m in doc.get('data',[])]
            if name=='usage': passed = passed and doc.get('unit')=='USD' and 'daily' in doc and 'weekly' in doc
            checks.append({'provider':provider,'test':name,'passed':passed,**result})
    save('queries',checks)
    print([(r['provider'],r['test'],r['passed']) for r in checks])

def catalog_tests():
    catalogs = json.loads((OUT/'synchronized.json').read_text())
    state = json.loads((OUT/'accounts.json').read_text())
    def run(provider):
        client = admin()
        results = []
        for model in catalogs[provider]['models']:
            if model['id'] == SELECTED[provider]:
                continue
            req = urllib.request.Request(api.BASE+'/api/admin/accounts/connection-test',data=json.dumps({'accountId':state[provider]['account'],'modelId':model['id']}).encode(),headers={'Origin':api.BASE,'X-CSRF-Token':client.csrf,'Content-Type':'application/json'})
            start = time.monotonic()
            try:
                with client.opener.open(req,timeout=120) as response:
                    raw = response.read(1024*1024).decode()
                    events = [json.loads(line[6:]) for line in raw.splitlines() if line.startswith('data: ')]
                    success = any(e.get('type')=='test_complete' and e.get('success') for e in events)
                    result = {'model':model['id'],'passed':success,'seconds':round(time.monotonic()-start,2),'errors':[e for e in events if e.get('type')=='error']}
            except Exception as exc:
                result = {'model':model['id'],'passed':False,'error':str(exc)}
            results.append(result)
            save('catalog-'+provider,results)
            print(provider,json.dumps(result,ensure_ascii=False),flush=True)
        return results
    with ThreadPoolExecutor(max_workers=3) as pool:
        list(pool.map(run,KEYS))

def discover():
    results = {}
    for provider, secret in KEYS.items():
        headers = {'Authorization': 'Bearer ' + secret, 'Accept': 'application/json', 'User-Agent': 'ovload-gateway-verification/1.0'}
        if provider == 'claude':
            headers.update({'x-api-key': secret, 'anthropic-version': '2023-06-01'})
        try:
            result = request('https://dash.ovload.com/v1/models', headers)
            doc = json.loads(result['body'])
            result['models'] = [r['id'] for r in doc.get('data', [])]
            if result['status'] == 200:
                del result['body']
            results[provider] = result
        except Exception as exc:
            results[provider] = {'error': str(exc)}
        print(provider, json.dumps(results[provider], ensure_ascii=False), flush=True)
    save('discovery', results)

def discover_curl():
    results = {}
    for provider, secret in KEYS.items():
        config = ['url = "https://dash.ovload.com/v1/models"', 'header = '+json.dumps('Authorization: Bearer '+secret)]
        if provider == 'claude':
            config += ['header = '+json.dumps('x-api-key: '+secret), 'header = "anthropic-version: 2023-06-01"']
        args = ['curl','-4','-sS','--max-time','30','--connect-timeout','10','--retry','1','--config','-']
        if '--proxy' in sys.argv:
            args += ['--proxy','http://192.168.2.85:12334']
        result = subprocess.run(args,input='\n'.join(config),text=True,capture_output=True)
        try:
            doc = json.loads(result.stdout)
            results[provider] = {'models':[m['id'] for m in doc.get('data',[])], 'error':doc.get('error')}
        except Exception:
            results[provider] = {'error': result.stderr[:200] or 'Invalid JSON'}
        save('discovery-curl',results)
        print(provider, json.dumps(results[provider],ensure_ascii=False),flush=True)

def direct_failure():
    body = {'model':'grok-build-0.1','input':'Reply with exactly OK.','stream':True,'max_output_tokens':64,'store':False}
    config = ['url = "https://dash.ovload.com/v1/responses"','header = '+json.dumps('Authorization: Bearer '+KEYS['xai_api']),'header = "Content-Type: application/json"','data = '+json.dumps(json.dumps(body))]
    result = subprocess.run(['curl','-sS','--max-time','90','--proxy','http://192.168.2.85:12334','--config','-'],input='\n'.join(config),text=True,capture_output=True)
    raw = result.stdout
    for key in KEYS.values():
        raw = raw.replace(key,'[redacted]')
    save('grok-build-direct',{'exit':result.returncode,'body':raw,'error':result.stderr})
    print('direct grok-build exit',result.returncode,'bytes',len(raw),flush=True)

def cleanup():
    client = admin()
    state = json.loads((OUT/'accounts.json').read_text())
    private = json.loads((ROOT/'api-live-downstream.json').read_text())
    owner = '?' + urlencode({'tenant_id':state['user']['tenant_id'],'user_id':state['user']['id']})
    checks = []
    for provider, issued in private.items():
        path = '/api/admin/v1/api-keys/' + issued['key']['id']
        key = client.call(path+owner)
        if not key['revoked_at']:
            client.call(path+'/revoke'+owner, {'reason':'API 实测完成，撤销临时测试密钥'}, headers={'If-Match':'"'+str(key['revision'])+'"'})
        result = request(api.BASE+'/v1/models', {'Authorization':'Bearer '+issued['secret']})
        assert result['status'] == 401
        checks.append({'provider':provider,'keyId':key['id'],'revoked':True,'requestStatus':result['status']})
    assert client.call('/api/admin/settings/pricing')['data'] == json.loads((OUT/'functional-pricing-before.json').read_text())
    secrets_to_check = list(KEYS.values()) + [v['secret'] for v in private.values()]
    leaks = []
    for path in OUT.rglob('*'):
        if path.is_file() and path.suffix in ['.json','.log','.md']:
            if any(secret in path.read_text(errors='replace') for secret in secrets_to_check):
                leaks.append(path.name)
    assert not leaks, leaks
    client.call('/api/admin/v1/auth/session',method='DELETE',status=204)
    for name in ['api-live-private.json','api-live-downstream.json','api-live-cookies.txt','api-live-csrf.txt']:
        (ROOT/name).unlink(missing_ok=True)
    save('cleanup',{'keys':checks,'pricingRestored':True,'adminSessionClosed':True,'temporarySecretsRemoved':True,'reportSecretScanPassed':True})
    print('Temporary keys revoked, prices restored, session closed, private files removed.')

if __name__ == '__main__':
    globals()[sys.argv[1]]()
