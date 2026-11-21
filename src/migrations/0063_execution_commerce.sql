-- The execution budget port carries the exact, frozen group-priced USD charge.
-- Persist that evidence independently of deletable key budget counters. A charge
-- that races with another request and exceeds the wallet remains payable; it
-- blocks further admission and is retried when funds are added. Never invent
-- token counts or make a wallet negative to hide an unpaid request.
create table commerce_execution_charges (
 id uuid primary key default gen_random_uuid(), request_id text not null unique,
 key_id text not null, tenant_id uuid not null references identity_tenants(id),
 user_id uuid not null, amount_usd numeric(20,10) not null check(amount_usd>0),
 completed_at timestamptz not null, state text not null default 'pending' check(state in('pending','subscription','wallet')),
 subscription_id uuid references commerce_subscriptions(id), subscription_generation bigint, subscription_periods jsonb,
 foreign key(tenant_id,user_id) references identity_users(tenant_id,id),
 check((state='subscription')=(subscription_id is not null)),
 check((subscription_id is null and subscription_generation is null and subscription_periods is null)
  or(subscription_id is not null and subscription_generation>0 and jsonb_typeof(subscription_periods)='object'))
);
create index commerce_execution_owner on commerce_execution_charges(tenant_id,state,completed_at);
create index commerce_execution_subscription on commerce_execution_charges(subscription_id,subscription_generation);

create function guard_execution_charge() returns trigger language plpgsql as $$
begin
 if tg_op='DELETE' then raise exception 'execution charge evidence is immutable'; end if;
 if old.state<>'pending' or new.state='pending' or old.id<>new.id or old.request_id<>new.request_id
  or old.key_id<>new.key_id or old.tenant_id<>new.tenant_id or old.user_id<>new.user_id
  or old.amount_usd<>new.amount_usd or old.completed_at<>new.completed_at then
  raise exception 'execution charge evidence is immutable';
 end if;
 return new;
end $$;
create trigger execution_charge_immutable before update or delete on commerce_execution_charges
 for each row execute function guard_execution_charge();

create or replace function commerce_subscription_used(subscription uuid, period text) returns numeric language sql stable as $$
 select coalesce((select sum(r.settled_usd) from billing_reservations r
  where r.subscription_id=s.id and r.subscription_generation=s.quota_generation
  and r.subscription_periods->>period=commerce_periods(s,now())->>period),0)
 +coalesce((select sum(c.amount_usd) from commerce_execution_charges c
  where c.subscription_id=s.id and c.subscription_generation=s.quota_generation
  and c.subscription_periods->>period=commerce_periods(s,now())->>period),0)
 from commerce_subscriptions s where s.id=subscription
$$;

alter table wallet_ledger_entries drop constraint wallet_ledger_entries_kind_ck;
alter table wallet_ledger_entries add constraint wallet_ledger_entries_kind_ck check (
 (entry_kind in('operator_credit','registration_gift','referral_transfer','lottery_reward','payment_credit','redemption_credit') and direction='credit' and source_id is not null and operation_id is null and related_entry_id is null)
 or(entry_kind in('subscription_purchase','execution_usage') and direction='debit' and source_id is not null and operation_id is null and related_entry_id is null)
 or(entry_kind='customer_usage' and direction='debit' and source_id is null and operation_id is not null and related_entry_id is null)
 or(entry_kind='migration_opening' and direction='credit' and source_id=tenant_id and operation_id is null and related_entry_id is null)
 or(entry_kind='correction_credit' and direction='credit' and related_entry_id is not null and operation_id is null)
 or(entry_kind='correction_debit' and direction='debit' and related_entry_id is not null and operation_id is null)
);
create function guard_execution_ledger() returns trigger language plpgsql as $$
begin
 if new.entry_kind='execution_usage' and not exists(select 1 from commerce_execution_charges
  where id=new.source_id and tenant_id=new.tenant_id and amount_usd=new.amount_usd and state='wallet') then
  raise exception 'execution debit requires matching charge evidence';
 end if;
 return new;
end $$;
create trigger execution_ledger_guard before insert on wallet_ledger_entries for each row execute function guard_execution_ledger();
create function execution_charge_final_evidence() returns trigger language plpgsql as $$
begin
 if new.state='wallet' and not exists(select 1 from wallet_ledger_entries where source_id=new.id
  and entry_kind='execution_usage' and tenant_id=new.tenant_id and amount_usd=new.amount_usd) then
  raise exception 'execution charge requires a matching wallet debit';
 end if;
 return new;
end $$;
create constraint trigger execution_charge_final_evidence after update on commerce_execution_charges
 deferrable initially deferred for each row execute function execution_charge_final_evidence();

create function commerce_settle_execution(tenant uuid) returns void language plpgsql as $$
declare c commerce_execution_charges; available numeric;
begin
 perform 1 from identity_tenant_wallets where tenant_id=tenant for update;
 for c in select * from commerce_execution_charges where tenant_id=tenant and state='pending'
  order by completed_at,id for update loop
  select balance_usd-held_usd into available from identity_tenant_wallets where tenant_id=tenant;
  if available<c.amount_usd then return; end if;
  update commerce_execution_charges set state='wallet' where id=c.id;
  insert into wallet_ledger_entries(id,tenant_id,direction,entry_kind,amount_usd,source_id,idempotency_key)
   values(gen_random_uuid(),tenant,'debit','execution_usage',c.amount_usd,c.id,'execution:'||c.request_id);
 end loop;
end $$;

create function commerce_record_execution() returns trigger language plpgsql as $$
declare k client_api_keys; s commerce_subscriptions; charge_id uuid;
begin
 if new.amount_usd=0 then return new; end if;
 select * into k from client_api_keys where id=new.client_api_key_id;
 if k.user_id is null then return new; end if;
 perform 1 from identity_tenant_wallets where tenant_id=k.tenant_id for update;
 insert into commerce_execution_charges(request_id,key_id,tenant_id,user_id,amount_usd,completed_at)
 values(new.request_id,k.id,k.tenant_id,k.user_id,new.amount_usd,new.completed_at)
 on conflict(request_id) do nothing returning id into charge_id;
 if charge_id is null then return new; end if;
 for s in select * from commerce_subscriptions where tenant_id=k.tenant_id and user_id=k.user_id
  and not revoked and starts_at<=new.completed_at and ends_at>now() order by ends_at,id for update loop
  -- A delayed receipt cannot consume a different day's/week's/month's allowance.
  if commerce_periods(s,new.completed_at)=commerce_periods(s,now()) and commerce_subscription_available(s,new.amount_usd) then
   update commerce_execution_charges set state='subscription',subscription_id=s.id,
    subscription_generation=s.quota_generation,subscription_periods=commerce_periods(s,new.completed_at) where id=charge_id;
   exit;
  end if;
 end loop;
 perform commerce_settle_execution(k.tenant_id);
 return new;
end $$;
create trigger client_budget_commerce after insert on client_api_key_charge_events
 for each row execute function commerce_record_execution();

create function commerce_execution_admit(model_key text) returns boolean language plpgsql as $$
declare k client_api_keys; available numeric; subscription uuid;
begin
 select * into k from client_api_keys where id=model_key;
 if k.user_id is null then return true; end if;
 perform commerce_settle_execution(k.tenant_id);
 if exists(select 1 from commerce_execution_charges where tenant_id=k.tenant_id and state='pending') then return false; end if;
 subscription:=commerce_select_subscription(k.tenant_id,k.user_id,0.0000000001);
 if subscription is not null then return true; end if;
 select balance_usd-held_usd into available from identity_tenant_wallets where tenant_id=k.tenant_id;
 return coalesce(available>0,false);
end $$;

-- Incoming credit first clears payable usage; it cannot be spent twice on a plan.
create function commerce_credit_settlement() returns trigger language plpgsql as $$
begin
 if new.direction='credit' then perform commerce_settle_execution(new.tenant_id); end if;
 return new;
end $$;
create trigger zz_commerce_credit_settlement after insert on wallet_ledger_entries
 for each row execute function commerce_credit_settlement();
