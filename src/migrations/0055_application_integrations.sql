create table application_settings (
 kind text primary key check(kind in('mail','payment','audit')),
 revision bigint not null default 1 check(revision>0),
 values jsonb not null default '{}',
 credentials jsonb,
 updated_at timestamptz not null default clock_timestamp()
);
create table payment_orders (
 id uuid primary key,
 tenant_id uuid not null references identity_tenants(id),
 user_id uuid not null references identity_users(id),
 idempotency_key uuid not null,
 amount_cny numeric(20,2) not null check(amount_cny>0),
 fee_cny numeric(20,2) not null check(fee_cny>=0),
 credit_usd numeric(20,10) not null check(credit_usd>0),
 status text not null default 'pending' check(status in('pending','paid','cancelled','expired','failed')),
 app_id text not null,
 seller_id text not null,
 settings_revision bigint not null,
 provider_config jsonb not null,
 credentials jsonb not null,
 checkout jsonb,
 trade_no text unique,
 created_at timestamptz not null default clock_timestamp(),
 expires_at timestamptz not null,
 paid_at timestamptz,
 cancelled_at timestamptz,
 cancellation_requested_at timestamptz,
 notified_at timestamptz,
 unique(user_id,idempotency_key)
);
create index payment_orders_user_time on payment_orders(user_id,created_at desc);
create table integration_mail_outbox (
 id uuid primary key,
 email text not null,
 purpose text not null,
 variables jsonb not null,
 attempts integer not null default 0,
 lease uuid,
 next_attempt_at timestamptz not null default clock_timestamp(),
 delivered_at timestamptz
);
alter table backup_settings add column storage_enabled boolean not null default true;
update backup_settings set storage_enabled=(endpoint is not null and bucket is not null and secret_access_key is not null);
update backup_settings set schedule_enabled=false,next_run_at=null where not storage_enabled;
create function guard_backup_storage_enabled() returns trigger language plpgsql as $$
begin
 if tg_table_name='backup_records' then
   perform 1 from backup_settings where id=1 and storage_enabled for update;
   if not found then raise exception 'backup storage is disabled'; end if;
 elsif new.schedule_enabled and not new.storage_enabled then raise exception 'backup storage is disabled';
 end if;
 return new;
end $$;
create trigger backup_storage_enable_guard before insert on backup_records for each row execute function guard_backup_storage_enabled();
create trigger backup_schedule_enable_guard before update on backup_settings for each row execute function guard_backup_storage_enabled();
alter table confirmed_recharges drop constraint confirmed_recharges_id_fkey;
alter table wallet_ledger_entries drop constraint wallet_ledger_entries_kind_ck;
alter table wallet_ledger_entries add constraint wallet_ledger_entries_kind_ck check (
 (entry_kind in('operator_credit','registration_gift','referral_transfer','lottery_reward','payment_credit') and direction='credit' and source_id is not null and operation_id is null and related_entry_id is null)
 or(entry_kind='customer_usage' and direction='debit' and source_id is null and operation_id is not null and related_entry_id is null)
 or(entry_kind='migration_opening' and direction='credit' and source_id=tenant_id and operation_id is null and related_entry_id is null)
 or(entry_kind='correction_credit' and direction='credit' and related_entry_id is not null and operation_id is null)
 or(entry_kind='correction_debit' and direction='debit' and related_entry_id is not null and operation_id is null)
);
create function guard_payment_credit() returns trigger language plpgsql as $$
begin
 if new.entry_kind='payment_credit' and not exists(select 1 from payment_orders where id=new.source_id and tenant_id=new.tenant_id and credit_usd=new.amount_usd and status='paid') then raise exception 'invalid payment credit'; end if;
 return new;
end $$;
create trigger payment_credit_guard before insert on wallet_ledger_entries for each row execute function guard_payment_credit();

create or replace function settle_confirmed_referral() returns trigger language plpgsql as $$
declare paid numeric;
begin
 select paid_cny into paid from wallet_credit_commands where id=new.command_id;
 if paid is not null then insert into confirmed_recharges(id,tenant_id,amount_usd,paid_cny) values(new.command_id,new.tenant_id,new.amount_usd,paid); end if;
 return new;
end $$;
create function settle_recharge_referral() returns trigger language plpgsql as $$
declare settings jsonb; invitation referral_invitations%rowtype; rate numeric; cap numeric; earned numeric; amount numeric; override_row jsonb;
begin
 if not exists(select 1 from wallet_credit_commands where id=new.id and tenant_id=new.tenant_id)
 and not exists(select 1 from payment_orders where id=new.id and tenant_id=new.tenant_id and status='paid' and credit_usd=new.amount_usd and amount_cny=new.paid_cny) then raise exception 'invalid recharge evidence'; end if;
 select i.* into invitation from referral_invitations i join identity_users u on u.id=i.invitee_id where u.tenant_id=new.tenant_id;
 if not found then return new; end if;
 perform 1 from referral_accounts where user_id=invitation.inviter_id for update;
 select values->'referral' into settings from workspace_settings where kind='features';
 if not coalesce((settings->>'enabled')::boolean,false) then return new; end if;
 if (settings->>'eligibilityDays')::int>0 and clock_timestamp()>=invitation.created_at+make_interval(days=>(settings->>'eligibilityDays')::int) then return new; end if;
 select item into override_row from jsonb_array_elements(settings->'overrides') item where item->>'userId'=invitation.inviter_id::text;
 rate:=coalesce(nullif(override_row->>'rate',''),settings->>'rate')::numeric; cap:=(settings->>'cap')::numeric;
 select coalesce(sum(amount_usd),0) into earned from referral_rebates where inviter_id=invitation.inviter_id and invitee_id=invitation.invitee_id;
 amount:=trunc(new.amount_usd*rate/100,10);
 if cap>0 then amount:=least(amount,greatest(cap-earned,0)); end if;
 if amount>0 then insert into referral_rebates(recharge_id,inviter_id,invitee_id,amount_usd,rate,available_at) values(new.id,invitation.inviter_id,invitation.invitee_id,amount,rate,clock_timestamp()+make_interval(hours=>(settings->>'freezeHours')::int)); end if;
 return new;
end $$;
create trigger payment_referral_settlement after insert on confirmed_recharges for each row execute function settle_recharge_referral();
