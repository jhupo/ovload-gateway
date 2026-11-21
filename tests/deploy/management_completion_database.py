"""Database integration checks; runs only against the disposable server clone."""
import importlib.util
from pathlib import Path
import json
spec=importlib.util.spec_from_file_location('setup',Path(__file__).with_name('management_completion_setup.py'))
m=importlib.util.module_from_spec(spec);spec.loader.exec_module(m)
assert m.DATABASE=='ovload_gateway_ui_verify'
sql=r"""
begin;
insert into model_requests (
 id,client_api_key_ref,operation,client_transport,requested_model_id,provider_kind,provider_account_ref,upstream_model_id,upstream_transport,attempt_count,upstream_send_state,downstream_committed_at,outcome,client_status_code,upstream_status_code,total_tokens,cost_source,cost_amount,cost_currency,started_at,recovery_lease_expires_at,completed_at,request_observation_json
) values ('management-usage-test','fixture-key','responses','http_sse','gpt-fixture','openai','fixture-account','gpt-fixture','http_sse',1,'sent',now(),'succeeded',200,200,10,'provider_reported',2.5,'USD',now()-interval '1 minute',now()+interval '5 minutes',now(),
jsonb_build_object('request',jsonb_build_object('configRevision',1,'protocol','openai','endpoint','/v1/responses','compact',false),'routing',jsonb_build_object('scope','groups','groupRefs',jsonb_build_array('grp_fixture_usage'),'groupNamesSnapshot',jsonb_build_array('Fixture'))));
do $$begin
if (select sum(amount_usd) from account_group_usage_totals where group_id='grp_fixture_usage')<>2.5 then raise exception 'initial usage mismatch';end if;
end$$;
update model_requests set cost_amount=3.5 where id='management-usage-test';
do $$begin
if (select sum(amount_usd) from account_group_usage_totals where group_id='grp_fixture_usage')<>3.5 then raise exception 'corrected usage double counted';end if;
end$$;
delete from model_requests where id='management-usage-test';
do $$begin
if (select sum(amount_usd) from account_group_usage_totals where group_id='grp_fixture_usage')<>3.5 then raise exception 'retention erased cumulative usage';end if;
end$$;
rollback;
"""
m.pg(sql,m.DATABASE)
result={'passed':True,'checks':['successful request attribution to original group','cost corrections replace prior amount','request retention preserves cumulative usage']}
(m.RESULTS/'database.json').write_text(json.dumps(result,indent=2))
print('PASS '+ '; '.join(result['checks']))
