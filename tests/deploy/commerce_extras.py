from commerce_verify import *
from urllib.parse import quote

def check(name):
 checks.append(name)
 print("PASS "+name,flush=True)
 (OUT/"extra-api-checks.json").write_text(json.dumps(checks,indent=2))

def main():
 admin=Client();admin.login('ovload_commerce_verify',(ROOT/'administrator.password').read_text().strip())
 suffix=str(time.time_ns());state=json.loads((ROOT/'commerce-private.json').read_text())
 group={'name':'平台验证'+suffix,'description':'API platform persistence','color':'#0284C7FF','visibility':'private',
  'retailMultiplierBps':10000,'modelRoutes':None,'pricing':{'peak':None,'modelPrices':{}},'platform':'openai_api','allowImageGeneration':True,'fastMode':'default'}
 created=admin.call('/api/admin/account-groups/create',group,status=201)['data'];gid=created['id']
 assert created['record']['platform']=='openai_api'
 imported=admin.call('/api/admin/accounts/import',{'provider':'openai_api','data':{'schema_version':1,'name':'Commerce account '+suffix,'api_key':'disabled-verification-only','base_url':'https://api.openai.com/v1'},
  'settings':{'notes':'Disposable disabled verification account','enabled':False,'concurrencyLimit':7,'weight':1,'groupIds':[gid],'modelAccess':{'mode':'all','models':[]}}},status=201)['data']
 groups=admin.call('/api/admin/account-groups')['data'];row=next(g for g in groups['items'] if g['id']==gid)
 assert row['platform']=='openai_api' and row['capacity']['totalSlots']==7
 admin.call('/api/admin/account-groups/update',{**group,'id':gid,'platform':'claude','configRevision':groups['configRevision']},status=409)
 group['pricing']['peak']={'timezone':'Asia/Shanghai','startMinute':540,'endMinute':1080,'peakMultiplierBps':15000,'offPeakMultiplierBps':8000}
 groups=admin.call('/api/admin/account-groups')['data']
 admin.call('/api/admin/account-groups/update',{**group,'id':gid,'configRevision':groups['configRevision']})
 groups=admin.call('/api/admin/account-groups')['data'];row=next(g for g in groups['items'] if g['id']==gid)
 assert row['pricing']['peak']['peakMultiplierBps']==15000
 check('Group platform persists, rejects incompatible existing accounts, reports actual capacity and saves peak pricing')
 proxies=admin.call('/api/admin/proxies?page=1&pageSize=100')['data']
 for protocol in ['http','https','socks5','socks5h']:
  page=admin.call('/api/admin/proxies?page=1&pageSize=1&protocols='+protocol)['data']
  expected=[p for p in proxies['items'] if p['endpoint'].startswith(protocol+':')]
  assert page['page']['total']==len(expected)
  assert all(p['endpoint'].startswith(protocol+':') for p in page['items'])
 for enabled in [True,False]:
  page=admin.call('/api/admin/proxies?page=1&pageSize=1&enabled='+str(enabled).lower())['data']
  assert page['page']['total']==len([p for p in proxies['items'] if p['enabled']==enabled])
  assert all(p['enabled']==enabled for p in page['items'])
 admin.call('/api/admin/proxies?protocols=invalid',status=400)
 check('Proxy protocol/status filters use server-side totals and pagination; invalid protocols rejected')
 invitation=admin.command({'action':'generate','kind':'invitation','value':0,'count':1,'max_uses':1,'per_user':1,'notes':'Disposable registration check'},True)['ids'][0]
 code=next(c for c in admin.view(True)['codes'] if c['id']==invitation)['code']
 pg("update identity_registration_policy set registration_enabled=false,verification_required=false,allowed_domains='{}',gift_usd=0,agreement=jsonb_set(agreement,'{enabled}','false'),revision=revision+1 where singleton;")
 guest=Client();email='invitation-'+suffix+'@example.com'
 guest.call('/api/v1/auth/registrations',{'email':email,'display_name':'邀请注册验证','password':state['customerPassword'],'invitation_code':code},status=202)
 guest.login(email,state['customerPassword'])
 assert pg(f"select count(*) from commerce_redemptions where code_id='{invitation}'")=='1'
 Client().call('/api/v1/auth/registrations',{'email':'second-'+email,'display_name':'超限邀请验证','password':state['customerPassword'],'invitation_code':code},status=403)
 check('Invitation codes register with public registration closed; a one-use invitation cannot register a second user')
 (OUT/'extra-api-checks.json').write_text(json.dumps(checks,indent=2))

if __name__=='__main__':main()
