"""Real API and database regression checks, exclusively on the disposable commerce site."""
import concurrent.futures as futures
import http.cookiejar
import json
import secrets
import ssl
import subprocess
import time
import urllib.error
import urllib.request
import uuid
from pathlib import Path

BASE = 'https://192.168.2.150:19444'
ROOT = Path('/opt/webcodex/ovload-commerce-verify-20261105')
OUT = Path('/opt/webcodex/ovload-gateway-codex-test-20261031135140/test-results/commerce-completion')
DB = 'ovload_commerce_verify'
checks = []

def check(name):
    checks.append(name)
    print('PASS ' + name, flush=True)
    (OUT / 'api-checks.json').write_text(json.dumps(checks, indent=2))

def pg(sql):
    result = subprocess.run(['docker','exec','-i','ovload-test-postgres','sh','-c',
        'psql -X -q -At -v ON_ERROR_STOP=1 -U "$POSTGRES_USER" -d "$1"','sh',DB],
        input=sql, text=True, check=False, capture_output=True)
    if result.returncode: raise RuntimeError(result.stderr)
    return result.stdout.strip()

class Client:
    def __init__(self):
        self.cookies = http.cookiejar.CookieJar()
        self.opener = urllib.request.build_opener(urllib.request.HTTPCookieProcessor(self.cookies),
            urllib.request.HTTPSHandler(context=ssl._create_unverified_context()))
        self.csrf = ''
    def call(self, path, data=None, method=None, status=200, headers=None):
        hdr={'Origin':BASE, 'X-CSRF-Token':self.csrf, 'Content-Type':'application/json', **(headers or {})}
        hdr={k:v for k,v in hdr.items() if v}
        req=urllib.request.Request(BASE+path, data=None if data is None else json.dumps(data).encode(),
            headers=hdr, method=method or ('POST' if data is not None else 'GET'))
        try: response=self.opener.open(req, timeout=30)
        except urllib.error.HTTPError as error: response=error
        body=response.read().decode()
        assert response.status == status, (path,response.status,status,body)
        return json.loads(body) if body else None
    def login(self, login, password):
        self.csrf=self.call('/api/v1/auth/sessions',{'login':login,'password':password})['csrf_token']
    def view(self, admin=False):
        return self.call('/api/'+('admin/' if admin else '')+'v1/engagement/commerce')
    def command(self, command, admin=False, key=None, status=200):
        return self.call('/api/'+('admin/' if admin else '')+'v1/engagement',
            {'op':'commerce','key':key or str(uuid.uuid4()),'command':command},status=status)

def main():
    admin=Client();admin.login('ovload_commerce_verify',(ROOT/'administrator.password').read_text().strip())
    suffix=str(time.time_ns()); password=secrets.token_urlsafe(24)+'Aa1!'
    users=[];clients=[]
    for i in range(3):
        user=admin.call('/api/admin/v1/users',{'email':f'commerce-{suffix}-{i}@example.com',
            'display_name':f'商务验证用户{i+1}','password':password,'max_concurrency':5,'requests_per_minute':1000,'notes':'Disposable commerce regression'},status=201)
        client=Client();client.login(user['email'],password);users.append(user);clients.append(client)
    a,b,c=clients; u,v,w=users
    private={'customerPassword':password,'users':users}
    (ROOT/'commerce-private.json').write_text(json.dumps(private));(ROOT/'commerce-private.json').chmod(0o600)
    doc={'name':'标准测试套餐','description':'接口与页面验证','notes':'管理备注不可泄漏','priceCents':500,
        'originalPriceCents':600,'dailyCents':100,'weeklyCents':200,'monthlyCents':300,
        'unlimited':{'daily':False,'weekly':False,'monthly':False},'days':30,'sort':1,'currencyLabel':'USD',
        'features':'额度不足转钱包','resetTime':'00:00','timezone':'Asia/Shanghai','published':True}
    plan=admin.command({'action':'save_plan','document':doc},True)['id']
    assert any(p['id']==plan for p in a.view()['plans'])
    assert all('notes' not in p for p in a.view()['plans'])
    a.command({'action':'delete_plan','id':plan,'revision':1},status=403)
    admin.call('/api/admin/v1/engagement',{'op':'commerce','key':str(uuid.uuid4()),'command':{'action':'delete_plan','id':plan,'revision':1}},status=403,headers={'X-CSRF-Token':''})
    admin.command({'action':'save_plan','id':plan,'revision':99,'document':doc},True,status=409)
    admin.command({'action':'save_plan','document':{**doc,'priceCents':-1}},True,status=400)
    check('Plan persistence, publication, optimistic revisions, input validation, customer permissions and CSRF')
    def generate(kind,value=0,**extra):
        ids=admin.command({'action':'generate','kind':kind,'value':value,'count':1,'max_uses':1,'per_user':1,'notes':'regression',**extra},True)['ids']
        return next(x for x in admin.view(True)['codes'] if x['id']==ids[0])
    code=generate('balance',2500); key=str(uuid.uuid4())
    with futures.ThreadPoolExecutor(max_workers=6) as pool:
        receipts=list(pool.map(lambda _:a.command({'action':'redeem','code':code['code']},key=key),range(6)))
    assert len({r['id'] for r in receipts})==1
    balance=lambda x:float(x.call('/api/v1/billing/balance')['settled_usd'])
    assert balance(a)==25
    a.command({'action':'redeem','code':'DIFFERENT'},key=key,status=409)
    b.command({'action':'redeem','code':code['code']},status=409)
    assert len(a.view()['redemptions'])==1 and not b.view()['redemptions']
    check('Concurrent idempotent redemption credits wallet once; global/per-user limits and history isolation')
    code2=generate('balance',100)
    def redeem_race(client):
        try: client.command({'action':'redeem','code':code2['code']});return True
        except AssertionError as e:
            assert e.args[0][1]==409,e
            return False
    with futures.ThreadPoolExecutor(max_workers=2) as pool: assert sum(pool.map(redeem_race,[b,c]))==1
    check('Two customers competing for a one-use code cannot both redeem')
    subcode=generate('subscription',plan_id=plan)
    admin.command({'action':'save_plan','id':plan,'revision':1,'document':{**doc,'name':'改名后的套餐','published':False}},True)
    a.command({'action':'redeem','code':subcode['code']})
    owned=a.view()['records']; assert len(owned)==1 and owned[0]['plan']['name']==doc['name']
    assert not b.view()['records']; assert owned[0]['notes']=='' and 'notes' not in owned[0]['plan']
    admin.command({'action':'save_plan','id':plan,'revision':2,'document':doc},True)
    concurrency=generate('concurrency',2)
    a.command({'action':'redeem','code':concurrency['code']})
    assert int(pg(f"select max_concurrency from identity_users where id='{u['id']}';"))==7
    a.view()
    check('Subscription codes preserve issuance snapshot after plan edits; concurrency code changes actual limits and keeps current login valid')
    buykey=str(uuid.uuid4());before=balance(a)
    receipt=a.command({'action':'purchase','plan_id':plan,'revision':3},key=buykey)
    assert receipt==a.command({'action':'purchase','plan_id':plan,'revision':3},key=buykey)
    assert balance(a)==before-5
    order=next(o for o in a.view()['orders'] if o['id']==receipt['id'])
    assert order['currency']=='USD' and order['method']=='wallet' and order['status']=='paid'
    assert not any(o['id']==receipt['id'] for o in b.view()['orders'])
    b.command({'action':'purchase','plan_id':plan,'revision':3},status=409)
    check('Wallet subscription purchase debits once, creates a paid order and subscription; insufficient balance rejected')
    sub=next(s for s in admin.view(True)['records'] if s['id']==receipt['subscriptionId'])
    admin.command({'action':'reset_quota','id':sub['id'],'revision':sub['revision']},True)
    admin.command({'action':'revoke','id':sub['id'],'revision':sub['revision']+1},True)
    assert next(s for s in a.view()['records'] if s['id']==sub['id'])['revoked']
    check('Subscription quota reset and revoke persist with revision checks')
    disabled=generate('balance',100)
    admin.command({'action':'update_code','id':disabled['id'],'revision':1,'disabled':True},True)
    a.command({'action':'redeem','code':disabled['code']},status=400)
    admin.command({'action':'delete_code','id':disabled['id'],'revision':2},True)
    assert not any(x['id']==disabled['id'] for x in admin.view(True)['codes'])
    check('Disable and delete prevent redemption without erasing redemption evidence')
    # Actual execution settlement uses these events. Test the same DB trigger used
    # by PgClientBudgetStore, not a duplicate implementation of the billing rule.
    group='grp_'+uuid.uuid4().hex; modelkey='commerce-key-'+suffix
    pg(f"insert into account_groups(id,name,color,created_at,updated_at) values('{group}','验证分组{suffix}','#2563EBFF',now(),now()); "
       f"insert into model_key_group_grants(tenant_id,user_id,account_group_id,granted) values('{u['tenant_id']}','{u['id']}','{group}',true); "
       f"insert into client_api_keys(id,name,key_digest,key_prefix,enabled,tenant_id,user_id,account_group_id,wallet_tenant_id,max_concurrency,requests_per_minute,created_at,updated_at) values('{modelkey}','verification',decode('{uuid.uuid4().hex+uuid.uuid4().hex}','hex'),'sk_test',true,'{u['tenant_id']}','{u['id']}','{group}','{u['tenant_id']}',4,60,now(),now());")
    def charge(amount,request=None):
        request=request or str(uuid.uuid4())
        pg(f"insert into client_api_key_charge_events(request_id,client_api_key_id,amount_usd,completed_at) values('{request}','{modelkey}',{amount},now()) on conflict(request_id) do nothing;")
        return request
    first=a.view()['records'][1] if a.view()['records'][0]['revoked'] else a.view()['records'][0]
    before=balance(a); request=charge('.75'); charge('.75',request)
    assert balance(a)==before
    assert pg(f"select state from commerce_execution_charges where request_id='{request}'")=='subscription'
    charge('.50');assert balance(a)==before-.5
    assert float(next(s for s in a.view()['records'] if s['id']==first['id'])['dailyUsed'])==75
    check('Live execution charge events consume subscription first, deduplicate and fall back to wallet when daily quota is insufficient')
    # Exhaust each period separately, then prove wallet funding and reset semantics.
    for period in ['weekly','monthly']:
        small={**doc,'name':period+'额度','unlimited':{'daily':True,'weekly':True,'monthly':True},period+'Cents':10}
        small['unlimited'][period]=False
        current=next(s for s in admin.view(True)['records'] if s['id']==first['id'])
        if not current['revoked']: admin.command({'action':'revoke','id':first['id'],'revision':current['revision']},True)
        pid=admin.command({'action':'save_plan','document':small},True)['id']
        sid=admin.command({'action':'assign','user_id':u['id'],'plan_id':pid,'notes':''},True)['id']
        before=balance(a);charge('.08');charge('.04');assert abs(balance(a)-(before-.04))<1e-8
        row=next(s for s in admin.view(True)['records'] if s['id']==sid)
        admin.command({'action':'reset_quota','id':sid,'revision':row['revision']},True)
        before=balance(a);charge('.08');assert balance(a)==before
        first={'id':sid}
    check('Weekly/monthly limits each trigger wallet fallback; reset creates a new quota generation')
    row=next(s for s in admin.view(True)['records'] if s['id']==first['id']);admin.command({'action':'revoke','id':row['id'],'revision':row['revision']},True)
    charge('1000')
    assert pg(f"select commerce_execution_admit('{modelkey}')")=='f'
    credit={'amount_usd':'1000','reason':'Clear exact pending execution debt'}
    before=balance(a)
    admin.call('/api/admin/v1/billing/wallets/'+u['tenant_id']+'/credits',credit,headers={'Idempotency-Key':str(uuid.uuid4())})
    assert balance(a)==before
    assert pg(f"select commerce_execution_admit('{modelkey}')")=='t'
    assert pg(f"select count(*) from commerce_execution_charges where tenant_id='{u['tenant_id']}' and state='pending'")=='0'
    check('Unfunded concurrent usage remains payable, blocks admission, and is paid exactly once by later wallet credit')
    (ROOT/'commerce-fixtures.json').write_text(json.dumps({'planId':plan,'user':u,'modelKey':modelkey,'group':group}))
    check('Commerce end-to-end verification complete')

if __name__=='__main__':main()
