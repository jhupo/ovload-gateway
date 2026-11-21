alter table account_groups add column pricing_json jsonb not null default '{"peak":null,"modelPrices":{}}';

-- Durable minute buckets retain cumulative usage after request-log retention.
-- Routing snapshots attribute requests to their original groups, not current membership.
create table account_group_usage_totals (
  group_id text not null,
  minute timestamptz not null,
  amount_usd numeric(30,10) not null,
  primary key(group_id,minute)
);
create function project_group_usage() returns trigger language plpgsql as $$
declare r record; old_document jsonb := '{}'; old_amount numeric := 0; old_time timestamptz;
begin
  if tg_op='UPDATE' then
    if old.outcome='succeeded' and old.downstream_committed_at is not null and old.cost_currency='USD'
      and (old.provider_kind is distinct from 'openai' or old.request_kind is distinct from 'prewarm')
      and ((old.client_transport='websocket' and old.client_status_code is null) or old.client_status_code between 200 and 399) then
      old_document:=old.request_observation_json; old_amount:=coalesce(old.cost_amount,0); old_time:=old.started_at;
    end if;
  end if;
  for r in select distinct value as id from jsonb_array_elements_text(coalesce(old_document#>'{routing,groupRefs}','[]')) loop
    insert into account_group_usage_totals values(r.id,date_trunc('minute',old_time),-old_amount)
    on conflict(group_id,minute) do update set amount_usd=account_group_usage_totals.amount_usd+excluded.amount_usd;
  end loop;
  if new.outcome='succeeded' and new.downstream_committed_at is not null and new.cost_currency='USD'
    and (new.provider_kind is distinct from 'openai' or new.request_kind is distinct from 'prewarm')
    and ((new.client_transport='websocket' and new.client_status_code is null) or new.client_status_code between 200 and 399) then
    for r in select distinct value as id from jsonb_array_elements_text(coalesce(new.request_observation_json#>'{routing,groupRefs}','[]')) loop
      insert into account_group_usage_totals values(r.id,date_trunc('minute',new.started_at),coalesce(new.cost_amount,0))
      on conflict(group_id,minute) do update set amount_usd=account_group_usage_totals.amount_usd+excluded.amount_usd;
    end loop;
  end if;
  return new;
end; $$;
insert into account_group_usage_totals
select g.id,date_trunc('minute',m.started_at),sum(m.cost_amount)
from model_requests m cross join lateral (select distinct value as id from jsonb_array_elements_text(coalesce(m.request_observation_json#>'{routing,groupRefs}','[]'))) g
where m.outcome='succeeded' and m.downstream_committed_at is not null and m.cost_currency='USD' and m.cost_amount is not null
  and (m.provider_kind is distinct from 'openai' or m.request_kind is distinct from 'prewarm')
  and ((m.client_transport='websocket' and m.client_status_code is null) or m.client_status_code between 200 and 399)
group by g.id,date_trunc('minute',m.started_at);
create trigger model_requests_group_usage after insert or update of cost_amount,cost_currency,outcome,downstream_committed_at,client_status_code,request_observation_json on model_requests for each row execute function project_group_usage();
