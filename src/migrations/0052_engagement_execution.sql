-- Durable invitation settlement, promotional draws and content audit evidence.
create table referral_accounts (
 user_id uuid primary key references identity_users(id),
 code text not null unique check(code ~ '^[A-Z0-9_-]{4,32}$')
);
insert into referral_accounts select id,upper(substr(replace(id::text,'-',''),1,24)) from identity_users;
create function create_referral_account() returns trigger language plpgsql as $$
begin insert into referral_accounts values(new.id,upper(substr(replace(new.id::text,'-',''),1,24))); return new; end $$;
create trigger identity_referral_account after insert on identity_users for each row execute function create_referral_account();
create table referral_invitations (
 invitee_id uuid primary key references identity_users(id),
 inviter_id uuid not null references referral_accounts(user_id),
 code text not null,
 created_at timestamptz not null default clock_timestamp(),
 check(invitee_id<>inviter_id)
);
create index referral_invitations_inviter on referral_invitations(inviter_id,created_at desc);
alter table wallet_credit_commands add column paid_cny numeric(20,2) check(paid_cny>0);
create table confirmed_recharges (
 id uuid primary key references wallet_credit_commands(id),
 tenant_id uuid not null references identity_tenants(id),
 amount_usd numeric(20,10) not null check(amount_usd>0),
 paid_cny numeric(20,2) not null check(paid_cny>0),
 created_at timestamptz not null default clock_timestamp()
);
create table referral_rebates (
 id uuid primary key default gen_random_uuid(),
 recharge_id uuid not null unique references confirmed_recharges(id),
 inviter_id uuid not null references referral_accounts(user_id),
 invitee_id uuid not null references identity_users(id),
 amount_usd numeric(20,10) not null check(amount_usd>0),
 rate numeric(5,2) not null check(rate>0 and rate<=100),
 available_at timestamptz not null,
 created_at timestamptz not null default clock_timestamp()
);
create index referral_rebates_inviter on referral_rebates(inviter_id,available_at);
create table referral_transfers (
 id uuid primary key default gen_random_uuid(),
 user_id uuid not null references identity_users(id),
 tenant_id uuid not null references identity_tenants(id),
 idempotency_key text not null check(length(idempotency_key) between 1 and 128),
 amount_usd numeric(20,10) not null check(amount_usd>0),
 wallet_balance_after_usd numeric(20,10) not null,
 frozen_usd numeric(20,10) not null,
 total_usd numeric(20,10) not null,
 created_at timestamptz not null default clock_timestamp(),
 unique(user_id,idempotency_key)
);
create function settle_confirmed_referral() returns trigger language plpgsql as $$
declare paid numeric; settings jsonb; invitation referral_invitations%rowtype; rate numeric; cap numeric; earned numeric; amount numeric; override_row jsonb;
begin
 select paid_cny into paid from wallet_credit_commands where id=new.command_id;
 if paid is null then return new; end if;
 insert into confirmed_recharges(id,tenant_id,amount_usd,paid_cny) values(new.command_id,new.tenant_id,new.amount_usd,paid);
 select i.* into invitation from referral_invitations i join identity_users u on u.id=i.invitee_id where u.tenant_id=new.tenant_id;
 if not found then return new; end if;
 -- Serialize all purchases attributed to an inviter, including cap calculations.
 perform 1 from referral_accounts where user_id=invitation.inviter_id for update;
 select values->'referral' into settings from workspace_settings where kind='features';
 if not coalesce((settings->>'enabled')::boolean,false) then return new; end if;
 if (settings->>'eligibilityDays')::int>0 and clock_timestamp()>=invitation.created_at+make_interval(days=>(settings->>'eligibilityDays')::int) then return new; end if;
 select item into override_row from jsonb_array_elements(settings->'overrides') item where item->>'userId'=invitation.inviter_id::text;
 rate:=coalesce(nullif(override_row->>'rate',''),settings->>'rate')::numeric;
 cap:=(settings->>'cap')::numeric;
 select coalesce(sum(amount_usd),0) into earned from referral_rebates where inviter_id=invitation.inviter_id and invitee_id=invitation.invitee_id;
 amount:=trunc(new.amount_usd*rate/100,10);
 if cap>0 then amount:=least(amount,greatest(cap-earned,0)); end if;
 if amount>0 then
 insert into referral_rebates(recharge_id,inviter_id,invitee_id,amount_usd,rate,available_at)
 values(new.command_id,invitation.inviter_id,invitation.invitee_id,amount,rate,clock_timestamp()+make_interval(hours=>(settings->>'freezeHours')::int));
 end if;
 return new;
end $$;
create trigger confirmed_referral_settlement after insert on wallet_credit_grants for each row execute function settle_confirmed_referral();

create table lottery_rounds (
 id bigserial primary key,
 status text not null default 'active' check(status in('active','drawn','cancelled')),
 reward_cents bigint not null check(reward_cents between 1 and 1000000),
 winner_count int not null check(winner_count between 1 and 1000),
 participant_target int not null check(participant_target between winner_count and 100000),
 minimum_recharge_cents bigint not null check(minimum_recharge_cents between 0 and 100000000),
 human_verification boolean not null,
 created_by uuid not null references identity_management_principals(id),
 idempotency_key text not null unique,
 created_at timestamptz not null default clock_timestamp(),
 drawn_at timestamptz,
 check((status='active')=(drawn_at is null))
);
create unique index lottery_one_active on lottery_rounds((status)) where status='active';
create table lottery_participants (
 round_id bigint not null references lottery_rounds(id),
 user_id uuid not null references identity_users(id),
 tenant_id uuid not null references identity_tenants(id),
 joined_at timestamptz not null default clock_timestamp(),
 primary key(round_id,user_id)
);
create table lottery_winners (
 id uuid primary key default gen_random_uuid(),
 round_id bigint not null,
 user_id uuid not null,
 tenant_id uuid not null references identity_tenants(id),
 reward_usd numeric(20,10) not null check(reward_usd>0),
 foreign key(round_id,user_id) references lottery_participants(round_id,user_id),
 unique(round_id,user_id)
);
create table lottery_challenges (
 id uuid primary key default gen_random_uuid(),
 round_id bigint not null references lottery_rounds(id),
 user_id uuid not null references identity_users(id),
 answer_digest bytea not null,
 expires_at timestamptz not null default clock_timestamp()+interval '3 minutes'
);
create table lottery_challenge_limits (
 user_id uuid primary key references identity_users(id),
 window_start timestamptz not null default clock_timestamp(),
 attempts integer not null
);

alter table wallet_ledger_entries drop constraint wallet_ledger_entries_kind_ck;
alter table wallet_ledger_entries add constraint wallet_ledger_entries_kind_ck check (
 (entry_kind in('operator_credit','registration_gift','referral_transfer','lottery_reward') and direction='credit' and source_id is not null and operation_id is null and related_entry_id is null)
 or(entry_kind='customer_usage' and direction='debit' and source_id is null and operation_id is not null and related_entry_id is null)
 or(entry_kind='migration_opening' and direction='credit' and source_id=tenant_id and operation_id is null and related_entry_id is null)
 or(entry_kind='correction_credit' and direction='credit' and related_entry_id is not null and operation_id is null)
 or(entry_kind='correction_debit' and direction='debit' and related_entry_id is not null and operation_id is null)
);
create function guard_engagement_credit() returns trigger language plpgsql as $$
begin
 if new.entry_kind='referral_transfer' and not exists(select 1 from referral_transfers where id=new.source_id and tenant_id=new.tenant_id and amount_usd=new.amount_usd) then raise exception 'invalid referral transfer'; end if;
 if new.entry_kind='lottery_reward' and not exists(select 1 from lottery_winners w join lottery_rounds r on r.id=w.round_id where w.id=new.source_id and w.tenant_id=new.tenant_id and w.reward_usd=new.amount_usd and r.status='drawn' and w.reward_usd=r.reward_cents::numeric/100) then raise exception 'invalid lottery reward'; end if;
 return new;
end $$;
create trigger engagement_credit_guard before insert on wallet_ledger_entries for each row execute function guard_engagement_credit();
create function immutable_engagement_money() returns trigger language plpgsql as $$
begin raise exception 'engagement money evidence is append only'; end $$;
create trigger confirmed_recharges_immutable before update or delete on confirmed_recharges for each row execute function immutable_engagement_money();
create trigger referral_rebates_immutable before update or delete on referral_rebates for each row execute function immutable_engagement_money();
create trigger referral_transfers_immutable before update or delete on referral_transfers for each row execute function immutable_engagement_money();
create trigger referral_invitations_immutable before update or delete on referral_invitations for each row execute function immutable_engagement_money();
create trigger lottery_winners_immutable before update or delete on lottery_winners for each row execute function immutable_engagement_money();

create table content_audit_records (
 id uuid primary key default gen_random_uuid(),
 request_id text not null,
 user_id uuid not null references identity_users(id),
 stage text not null check(stage in('input','output')),
 hit boolean not null,
 record jsonb not null,
 expires_at timestamptz not null,
 created_at timestamptz not null default clock_timestamp(),
 unique(request_id,stage)
);
create index content_audit_recent on content_audit_records(created_at desc);
create index content_audit_hits on content_audit_records(user_id,created_at) where hit;
create table content_audit_violations (
 request_id text not null, stage text not null,
 user_id uuid not null references identity_users(id),
 created_at timestamptz not null default clock_timestamp(),
 primary key(request_id,stage)
);
create index content_audit_violation_window on content_audit_violations(user_id,created_at);
create table content_audit_notifications (
 id uuid primary key default gen_random_uuid(),
 record_id uuid not null unique references content_audit_records(id) on delete cascade,
 attempts int not null default 0,
 next_attempt_at timestamptz not null default clock_timestamp(),
 delivered_at timestamptz
);
