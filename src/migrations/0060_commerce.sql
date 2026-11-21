-- Durable catalog, purchased plan snapshots and append-only redemption evidence.
create table commerce_plans (
 id uuid primary key, revision bigint not null default 1 check(revision>0),
 document jsonb not null check(jsonb_typeof(document)='object'),
 deleted boolean not null default false, created_at timestamptz not null default now()
);
create table commerce_subscriptions (
 id uuid primary key, tenant_id uuid not null references identity_tenants(id),
 user_id uuid not null references identity_users(id), plan_id uuid not null references commerce_plans(id),
 plan jsonb not null, starts_at timestamptz not null default now(), ends_at timestamptz not null,
 revoked boolean not null default false, notes text not null default '',
 revision bigint not null default 1, quota_generation bigint not null default 1,
 check(ends_at>starts_at), unique(id,tenant_id,user_id)
);
create index commerce_subscriptions_owner on commerce_subscriptions(tenant_id,user_id,ends_at);
create table commerce_codes (
 id uuid primary key, code text not null unique, kind text not null check(kind in('balance','concurrency','subscription','invitation')),
 value bigint not null check(value>=0), plan_id uuid references commerce_plans(id), plan_snapshot jsonb,
 max_uses integer not null check(max_uses>=0), per_user integer not null check(per_user>0),
 disabled boolean not null default false, deleted boolean not null default false,
 expires_at timestamptz, created_at timestamptz not null default now(), notes text not null default '',
 revision bigint not null default 1,
 check((kind='subscription')=(plan_id is not null)), check((kind='subscription')=(plan_snapshot is not null)), check(length(code)>=24)
);
create table commerce_redemptions (
 id uuid primary key, code_id uuid not null references commerce_codes(id),
 tenant_id uuid not null references identity_tenants(id), user_id uuid not null references identity_users(id),
 created_at timestamptz not null default now(), subscription_id uuid references commerce_subscriptions(id)
);
create index commerce_redemptions_code on commerce_redemptions(code_id,user_id);
create table commerce_purchases (
 id uuid primary key, tenant_id uuid not null references identity_tenants(id), user_id uuid not null references identity_users(id),
 subscription_id uuid not null unique references commerce_subscriptions(id), amount_usd numeric(20,10) not null check(amount_usd>0),
 created_at timestamptz not null default now()
);
create table commerce_commands (
 actor_id uuid not null, idempotency_key text not null, request jsonb not null,
 result jsonb not null, created_at timestamptz not null default now(), primary key(actor_id,idempotency_key)
);
create trigger commerce_redemptions_immutable before update or delete on commerce_redemptions for each row execute function reject_customer_billing_evidence_mutation();
create trigger commerce_purchases_immutable before update or delete on commerce_purchases for each row execute function reject_customer_billing_evidence_mutation();
create trigger commerce_commands_immutable before update or delete on commerce_commands for each row execute function reject_customer_billing_evidence_mutation();
alter table wallet_ledger_entries drop constraint wallet_ledger_entries_kind_ck;
alter table wallet_ledger_entries add constraint wallet_ledger_entries_kind_ck check (
 (entry_kind in('operator_credit','registration_gift','referral_transfer','lottery_reward','payment_credit','redemption_credit') and direction='credit' and source_id is not null and operation_id is null and related_entry_id is null)
 or(entry_kind='subscription_purchase' and direction='debit' and source_id is not null and operation_id is null and related_entry_id is null)
 or(entry_kind='customer_usage' and direction='debit' and source_id is null and operation_id is not null and related_entry_id is null)
 or(entry_kind='migration_opening' and direction='credit' and source_id=tenant_id and operation_id is null and related_entry_id is null)
 or(entry_kind='correction_credit' and direction='credit' and related_entry_id is not null and operation_id is null)
 or(entry_kind='correction_debit' and direction='debit' and related_entry_id is not null and operation_id is null)
);
create function guard_commerce_ledger() returns trigger language plpgsql as $$
begin
 if new.entry_kind='redemption_credit' and not exists(
   select 1 from commerce_redemptions r join commerce_codes c on c.id=r.code_id
   where r.id=new.source_id and r.tenant_id=new.tenant_id and c.kind='balance' and c.value::numeric/100=new.amount_usd
 ) then raise exception 'invalid redemption evidence'; end if;
 if new.entry_kind='subscription_purchase' and not exists(
   select 1 from commerce_purchases where id=new.source_id and tenant_id=new.tenant_id and amount_usd=new.amount_usd
 ) then raise exception 'invalid subscription purchase evidence'; end if;
 return new;
end $$;
create trigger commerce_ledger_guard before insert on wallet_ledger_entries for each row execute function guard_commerce_ledger();

