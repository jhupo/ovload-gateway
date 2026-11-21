-- Subscription and wallet funding share the tenant wallet lock, but not balances.
alter table billing_reservations add column subscription_id uuid,
 add column subscription_generation bigint, add column subscription_periods jsonb;
alter table billing_reservations add constraint billing_subscription_owner_fk
 foreign key(subscription_id,tenant_id,user_id) references commerce_subscriptions(id,tenant_id,user_id);
alter table billing_reservations add constraint billing_subscription_facts_ck check (
 (subscription_id is null and subscription_generation is null and subscription_periods is null)
 or(subscription_id is not null and subscription_generation>0 and jsonb_typeof(subscription_periods)='object'));
create index billing_subscription_usage on billing_reservations(subscription_id,subscription_generation);
create table commerce_subscription_charges (
 operation_id text primary key references billing_reservations(operation_id),
 subscription_id uuid not null references commerce_subscriptions(id),
 tenant_id uuid not null references identity_tenants(id), amount_usd numeric(20,10) not null check(amount_usd>0),
 created_at timestamptz not null default now()
);
create trigger subscription_charges_immutable before update or delete on commerce_subscription_charges
 for each row execute function reject_customer_billing_evidence_mutation();

create function commerce_periods(s commerce_subscriptions, at_time timestamptz) returns jsonb language plpgsql stable as $$
declare local_now timestamp; local_start timestamp; daily timestamp; weekly timestamp; monthly timestamp; months integer; offset_time interval;
begin
 local_now:=at_time at time zone (s.plan->>'timezone');
 local_start:=s.starts_at at time zone (s.plan->>'timezone');
 offset_time:=(s.plan->>'resetTime')::time-time '00:00';
 daily:=date_trunc('day',local_now-offset_time)+offset_time;
 weekly:=local_start+floor(extract(epoch from (local_now-local_start))/604800)*interval '7 days';
 months:=(extract(year from local_now)::int-extract(year from local_start)::int)*12+extract(month from local_now)::int-extract(month from local_start)::int;
 monthly:=local_start+make_interval(months=>months);
 if monthly>local_now then monthly:=local_start+make_interval(months=>months-1); end if;
 return jsonb_build_object('daily',daily,'weekly',weekly,'monthly',monthly);
end $$;
create function commerce_subscription_used(subscription uuid, period text) returns numeric language sql stable as $$
 select coalesce(sum(r.settled_usd),0) from commerce_subscriptions s join billing_reservations r on r.subscription_id=s.id
 where s.id=subscription and r.subscription_generation=s.quota_generation
 and r.subscription_periods->>period=commerce_periods(s,now())->>period
$$;
create function commerce_subscription_available(s commerce_subscriptions, amount numeric) returns boolean language plpgsql stable as $$
declare period text; used numeric; held numeric;
begin
 foreach period in array array['daily','weekly','monthly'] loop
  if not (s.plan->'unlimited'->>period)::boolean then
   used:=commerce_subscription_used(s.id,period);
   -- Outstanding requests retain their reservation across resets and period boundaries.
   select coalesce(sum(held_usd),0) into held from billing_reservations where subscription_id=s.id;
   if used+held+amount>(s.plan->>(period||'Cents'))::numeric/100 then return false; end if;
  end if;
 end loop;
 return true;
end $$;
create function commerce_select_subscription(tenant uuid, customer uuid, amount numeric) returns uuid language plpgsql as $$
declare s commerce_subscriptions;
begin
 perform 1 from identity_tenant_wallets where tenant_id=tenant for update;
 for s in select * from commerce_subscriptions where tenant_id=tenant and user_id=customer and not revoked
   and starts_at<=now() and ends_at>now() order by ends_at,id for update loop
  if commerce_subscription_available(s,amount) then return s.id; end if;
 end loop;
 return null;
end $$;
create function guard_subscription_funding() returns trigger language plpgsql as $$
declare s commerce_subscriptions;
begin
 if tg_op='UPDATE' then
  if old.subscription_id is distinct from new.subscription_id
   or old.subscription_generation is distinct from new.subscription_generation
   or old.subscription_periods is distinct from new.subscription_periods then raise exception 'funding source is immutable'; end if;
 elsif new.subscription_id is not null then
  perform 1 from identity_tenant_wallets where tenant_id=new.tenant_id for update;
  select * into s from commerce_subscriptions where id=new.subscription_id for update;
  if not found or s.tenant_id<>new.tenant_id or s.user_id<>new.user_id or s.revoked
    or s.starts_at>now() or s.ends_at<=now() or not commerce_subscription_available(s,new.held_usd) then
    raise exception 'subscription cannot fund request';
  end if;
  new.subscription_generation:=s.quota_generation;
  new.subscription_periods:=commerce_periods(s,now());
 end if;
 return new;
end $$;
create trigger aa_subscription_funding before insert or update on billing_reservations for each row execute function guard_subscription_funding();
create function guard_subscription_charge() returns trigger language plpgsql as $$
begin
 if not exists(select 1 from billing_reservations r join billing_usage_receipts u using(operation_id,tenant_id)
  where r.operation_id=new.operation_id and r.tenant_id=new.tenant_id and r.subscription_id=new.subscription_id
  and r.state='settled' and r.settled_usd=new.amount_usd and u.customer_charge_usd=new.amount_usd)
 then raise exception 'subscription charge requires matching settlement'; end if;
 return new;
end $$;
create trigger subscription_charge_evidence before insert on commerce_subscription_charges for each row execute function guard_subscription_charge();


create or replace function check_wallet_reservation_funds()
returns trigger language plpgsql as $$
declare
  wallet_balance numeric(20,10);
  wallet_held numeric(20,10);
begin
  if tg_op = 'INSERT' then
    if new.state <> 'held' or new.reserved_usd <> new.initial_hold_usd
      or new.held_usd <> new.initial_hold_usd or new.settled_usd <> 0 or new.released_usd <> 0 then
      raise exception 'a wallet reservation must begin with its complete initial hold';
    end if;
    if new.subscription_id is not null then return new; end if;
    select balance_usd, held_usd into wallet_balance, wallet_held
      from identity_tenant_wallets where tenant_id = new.wallet_tenant_id for update;
    if not found or wallet_balance - wallet_held < new.initial_hold_usd then
      raise exception 'wallet has insufficient available funds';
    end if;
  elsif new.reserved_usd > old.reserved_usd then
    if new.subscription_id is not null then return new; end if;
    select balance_usd, held_usd into wallet_balance, wallet_held
      from identity_tenant_wallets where tenant_id = new.wallet_tenant_id for update;
    if not found or wallet_balance - wallet_held < new.reserved_usd - old.reserved_usd then
      raise exception 'wallet has insufficient available funds for the reservation extension';
    end if;
  end if;
  return new;
end
$$;

create or replace function project_wallet_held_balance()
returns trigger language plpgsql as $$
declare
  held_delta numeric(20,10);
begin
  if new.subscription_id is not null then return new; end if;
  if tg_op = 'INSERT' then
    held_delta := new.held_usd;
  else
    held_delta := new.held_usd - old.held_usd;
  end if;
  if held_delta <> 0 then
    update identity_tenant_wallets
       set held_usd = held_usd + held_delta,
           revision = revision + 1,
           updated_at = clock_timestamp()
     where tenant_id = new.wallet_tenant_id;
    if not found then
      raise exception 'tenant wallet is unavailable';
    end if;
  end if;
  return new;
end
$$;

create or replace function enforce_billing_reservation_final_evidence()
returns trigger language plpgsql as $$
declare
  receipt billing_usage_receipts%rowtype;
  has_unresolved_attempt boolean;
  has_non_not_sent_attempt boolean;
  usage_debit_amount numeric(20,10);
begin
  if new.state not in ('settled', 'released') then
    return new;
  end if;
  select exists (
    select 1 from billing_dispatch_intents intent
     where intent.operation_id = new.operation_id
       and coalesce((select evidence.outcome from billing_dispatch_evidence evidence
                      where evidence.operation_id = intent.operation_id
                        and evidence.attempt_number = intent.attempt_number
                      order by evidence.evidence_sequence desc limit 1), 'ambiguous') = 'ambiguous'
  ) into has_unresolved_attempt;
  if has_unresolved_attempt then
    raise exception 'billing operation cannot close with an unresolved dispatch attempt';
  end if;
  if new.state = 'released' then
    select exists (
      select 1 from billing_dispatch_intents intent
       where intent.operation_id = new.operation_id
         and coalesce((select evidence.outcome from billing_dispatch_evidence evidence
                        where evidence.operation_id = intent.operation_id
                          and evidence.attempt_number = intent.attempt_number
                        order by evidence.evidence_sequence desc limit 1), '') <> 'not_sent'
    ) into has_non_not_sent_attempt;
    if has_non_not_sent_attempt then
      raise exception 'billing reservation may be released only when every attempt is proven not sent';
    end if;
    if exists (select 1 from billing_usage_receipts where operation_id = new.operation_id)
      or exists (select 1 from wallet_ledger_entries where operation_id = new.operation_id and entry_kind = 'customer_usage') then
      raise exception 'a billed operation cannot be released';
    end if;
    if exists(select 1 from commerce_subscription_charges where operation_id=new.operation_id) then raise exception 'billed subscription cannot be released'; end if;
    return new;
  end if;

  select * into receipt from billing_usage_receipts
   where operation_id = new.operation_id and tenant_id = new.tenant_id;
  if not found
    or receipt.customer_charge_usd <> new.settled_usd
    or receipt.price_revision_id <> new.price_revision_id
    or receipt.dispatch_certainty <> 'sent' then
    raise exception 'settled reservation requires a matching usage receipt';
  end if;
  if new.subscription_id is not null then
    if exists(select 1 from wallet_ledger_entries where operation_id=new.operation_id and entry_kind='customer_usage') then raise exception 'subscription cannot debit wallet'; end if;
    if new.settled_usd>0 and not exists(select 1 from commerce_subscription_charges where operation_id=new.operation_id and subscription_id=new.subscription_id and tenant_id=new.tenant_id and amount_usd=new.settled_usd) then raise exception 'missing subscription charge'; end if;
    if new.settled_usd=0 and exists(select 1 from commerce_subscription_charges where operation_id=new.operation_id) then raise exception 'zero subscription charge'; end if;
    return new;
  end if;
  if new.settled_usd = 0 then
    if exists (select 1 from wallet_ledger_entries where operation_id = new.operation_id and entry_kind = 'customer_usage') then
      raise exception 'zero customer charge cannot create a wallet debit';
    end if;
  else
    select amount_usd into usage_debit_amount from wallet_ledger_entries
     where operation_id = new.operation_id and tenant_id = new.tenant_id and entry_kind = 'customer_usage';
    if not found or usage_debit_amount <> new.settled_usd then
      raise exception 'wallet debit must match the settled customer usage receipt';
    end if;
  end if;
  return new;
end
$$;

create or replace function enforce_wallet_ledger_entry()
returns trigger language plpgsql as $$
declare
  current_balance numeric(20,10);
  receipt billing_usage_receipts%rowtype;
  reservation billing_reservations%rowtype;
begin
  if new.entry_kind = 'operator_credit' then
    if not exists (
      select 1 from wallet_credit_commands credit_command
       where credit_command.id = new.source_id and credit_command.tenant_id = new.tenant_id
    ) then
      raise exception 'operator wallet credit must reference an idempotent credit command';
    end if;
  elsif new.entry_kind = 'migration_opening' then
    raise exception 'opening ledger balances may only be written by migration 0037';
  elsif new.entry_kind = 'customer_usage' then
    select * into receipt from billing_usage_receipts
     where operation_id = new.operation_id and tenant_id = new.tenant_id;
    if not found then
      raise exception 'customer wallet debit must match a usage receipt';
    end if;
    select * into reservation from billing_reservations
     where operation_id = new.operation_id and tenant_id = new.tenant_id;
    if reservation.subscription_id is not null then raise exception 'subscription usage is not a wallet debit'; end if;
    if not found or receipt.customer_charge_usd <> new.amount_usd
      or reservation.state <> 'settled' or reservation.settled_usd <> new.amount_usd then
      raise exception 'customer wallet debit must match its settled usage receipt';
    end if;
  end if;
  select balance_usd into current_balance from identity_tenant_wallets
   where tenant_id = new.tenant_id for update;
  if not found then
    raise exception 'tenant wallet is unavailable';
  end if;
  if new.direction = 'debit' and current_balance < new.amount_usd then
    raise exception 'wallet ledger debit exceeds settled balance';
  end if;
  update identity_tenant_wallets
     set balance_usd = case new.direction
       when 'credit' then balance_usd + new.amount_usd
       else balance_usd - new.amount_usd
     end,
     revision = revision + 1,
     updated_at = clock_timestamp()
   where tenant_id = new.tenant_id;
  return new;
end
$$;
