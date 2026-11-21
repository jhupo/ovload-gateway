-- Versioned customer policy, immutable terms and consent evidence.
alter table identity_registration_policy
 add column enabled_providers text[] not null default '{}',
 add column agreement jsonb not null default '{"enabled":false,"mode":"modal","updated":"","documents":[]}',
 add column gift_usd numeric(20,10) not null default 0 check (gift_usd >= 0);
create table identity_agreement_versions (
 revision bigint primary key check(revision>0),
 document jsonb not null,
 created_at timestamptz not null default clock_timestamp()
);
insert into identity_agreement_versions(revision,document) select revision,agreement from identity_registration_policy;
create table identity_agreement_acceptances (
 id uuid primary key default gen_random_uuid(),
 user_id uuid not null references identity_users(id),
 revision bigint not null references identity_agreement_versions(revision),
 event text not null check(event in ('registration','login','oauth')),
 accepted_at timestamptz not null default clock_timestamp()
);
create function reject_identity_consent_mutation() returns trigger language plpgsql as $$
begin raise exception 'agreement versions and consent evidence are append only'; end $$;
create trigger identity_agreement_versions_immutable before update or delete on identity_agreement_versions for each row execute function reject_identity_consent_mutation();
create trigger identity_agreement_acceptances_immutable before update or delete on identity_agreement_acceptances for each row execute function reject_identity_consent_mutation();
alter table wallet_ledger_entries drop constraint wallet_ledger_entries_kind_ck;
alter table wallet_ledger_entries add constraint wallet_ledger_entries_kind_ck check (
    (entry_kind = 'registration_gift' and direction = 'credit' and source_id is not null and operation_id is null and related_entry_id is null)
    or (entry_kind = 'operator_credit' and direction = 'credit' and source_id is not null and operation_id is null and related_entry_id is null)
    or (entry_kind = 'customer_usage' and direction = 'debit' and source_id is null and operation_id is not null and related_entry_id is null)
    or (entry_kind = 'migration_opening' and direction = 'credit' and source_id = tenant_id and operation_id is null and related_entry_id is null)
    or (entry_kind = 'correction_credit' and direction = 'credit' and related_entry_id is not null and operation_id is null)
    or (entry_kind = 'correction_debit' and direction = 'debit' and related_entry_id is not null and operation_id is null)
  );
create function guard_registration_gift() returns trigger language plpgsql as $$
begin
 if new.entry_kind='registration_gift' then
  if new.idempotency_key <> 'registration-gift' or not exists(
   select 1 from identity_users u cross join identity_registration_policy p
   where u.id=new.source_id and u.tenant_id=new.tenant_id and p.singleton
     and p.gift_usd=new.amount_usd and u.created_at >= transaction_timestamp()
  ) then raise exception 'registration gift must match the new customer and policy'; end if;
 end if;
 return new;
end $$;
create trigger wallet_registration_gift_guard before insert on wallet_ledger_entries for each row execute function guard_registration_gift();

alter table identity_notification_outbox add column attempts integer not null default 0 check(attempts between 0 and 5),
 add column lease_id uuid, add column lease_until timestamptz, add column delivered_at timestamptz,
 add column next_attempt_at timestamptz not null default clock_timestamp();
create or replace function guard_identity_notification_outbox()
returns trigger language plpgsql as $$
begin
  if tg_op='DELETE' then raise exception 'notification intents retain their immutable evidence'; end if;
  if tg_op='INSERT' then
    if new.id<>new.challenge_id or new.state<>'pending' or not exists (
      select 1 from identity_lifecycle_challenges c where c.id=new.challenge_id
        and c.consumed_at is null and c.expires_at=new.expires_at
    ) then raise exception 'notification intent must match its live challenge'; end if;
  elsif old.id is distinct from new.id or old.challenge_id is distinct from new.challenge_id
    or old.encrypted_payload is distinct from new.encrypted_payload
    or old.created_at is distinct from new.created_at or old.expires_at is distinct from new.expires_at
    or old.state<>'pending' or new.state not in ('pending','cancelled','expired')
    or (old.delivered_at is not null and new.delivered_at is distinct from old.delivered_at)
    or new.attempts < old.attempts then
    raise exception 'notification intents may only leave pending once';
  end if;
  return new;
end;
$$;

create table identity_oauth_attempts(state_digest bytea primary key check(octet_length(state_digest)=32),browser_digest bytea not null check(octet_length(browser_digest)=32),encrypted bytea not null check(octet_length(encrypted) between 29 and 8192),expires_at timestamptz not null default clock_timestamp()+interval '10 minutes');
create table identity_external_identities(provider text not null check(provider in ('github','google','linuxdo')),subject text not null check(octet_length(subject) between 1 and 256),user_id uuid not null references identity_users(id),primary key(provider,subject),unique(provider,user_id));
