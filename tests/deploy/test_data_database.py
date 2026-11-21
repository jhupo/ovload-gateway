"""Read-only checks for the requested management preview fixtures on the test host."""
import json, subprocess
from pathlib import Path
from urllib.parse import urlsplit

SOURCE = Path('/opt/webcodex/ovload-gateway-codex-test-20261031135140')
RUNTIME = Path('/opt/webcodex/ovload-gateway-test-runtime-20261031')
manifest = json.loads((SOURCE/'test-results/test-data/manifest.json').read_text())
database = urlsplit(json.loads((RUNTIME/'deploy/config.yaml').read_text())['store']['database']['url']).path.lstrip('/')

def query(sql):
    result = subprocess.run(['docker','exec','-i','ovload-test-postgres','sh','-c',
        'psql -X -q -At -v ON_ERROR_STOP=1 -U "$POSTGRES_USER" -d "$1"','sh',database],
        input=sql,text=True,capture_output=True,check=True)
    return result.stdout.strip()

def ids(key):
    return ','.join("'"+row['id'].replace("'","''")+"'" for row in manifest[key])

checks = {
    'accounts': int(query(f"select count(*) from provider_accounts where id in ({ids('accounts')}) and not enabled")),
    'usage': int(query("select count(*) from model_requests where id like 'ui-test-20261105-request-%'")),
    'credits': int(query("select count(*) from wallet_credit_commands where idempotency_key like 'ui-test-20261105-credit-%'")),
    'lotteryRounds': int(query("select count(*) from lottery_rounds where idempotency_key='ui-test-20261105-draw' and status='drawn'")),
    'lotteryWinners': int(query("select count(*) from lottery_winners where round_id in (select id from lottery_rounds where idempotency_key='ui-test-20261105-draw')")),
    'referralRebates': int(query(f"select count(*) from referral_rebates where inviter_id='{manifest['users'][0]['id']}'")),
    'audit': int(query("select count(*) from content_audit_records where request_id like 'ui-test-20261105-audit-%'")),
}
assert checks == {'accounts':8,'usage':48,'credits':5,'lotteryRounds':1,'lotteryWinners':2,'referralRebates':3,'audit':3}, checks
dataset=json.loads(query("select document from management_test_datasets where id='ui-preview'"))
assert all(code['disabled'] and code['code'].startswith('TEST-PREVIEW-NOT-REDEEMABLE-') for code in dataset['codes'])
assert all(not plan['published'] for plan in dataset['plans'])
assert not query(f"select id from provider_accounts where id in ({ids('accounts')}) and (enabled or next_refresh_at is not null)")
result={'passed':True,'counts':checks,'repeatedSeedDidNotDuplicateCredits':True,'disabledTestAccounts':True,'displayOnlyCommerceFixtures':True}
(SOURCE/'test-results/test-data/database.json').write_text(json.dumps(result,indent=2))
print('PASS database fixture counts, repeatability and disabled account safeguards')
