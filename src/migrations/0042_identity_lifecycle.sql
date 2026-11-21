-- Independent customer registration, profile security and encrypted challenge intents.
alter table identity_users add column authority_generation bigint;
update identity_users set authority_generation=revision;
alter table identity_users alter column authority_generation set not null;
alter table identity_users alter column authority_generation set default 1;
alter table identity_users add constraint identity_users_authority_generation_ck
  check (authority_generation > 0);
alter table identity_users add column email_verified_at timestamptz;

create table identity_registration_policy (
  singleton boolean primary key default true check (singleton),
  revision bigint not null default 1 check (revision > 0),
  registration_enabled boolean not null default false,
  verification_required boolean not null default false,
  recovery_enabled boolean not null default false,
  allowed_domains text[] not null default '{}',
  default_user_concurrency bigint not null default 20 check (default_user_concurrency between 1 and 100000),
  default_user_rpm bigint not null default 1200 check (default_user_rpm between 1 and 10000000),
  default_customer_concurrency bigint not null default 100 check (default_customer_concurrency between 1 and 100000),
  default_customer_rpm bigint not null default 6000 check (default_customer_rpm between 1 and 10000000),
  updated_at timestamptz not null default clock_timestamp(),
  constraint identity_registration_policy_domains_ck check (
    cardinality(allowed_domains) <= 100 and array_position(allowed_domains,null) is null
  )
);
insert into identity_registration_policy default values;

create table identity_lifecycle_challenges (
  id uuid primary key,
  purpose text not null check (purpose in ('registration','password_reset')),
  token_digest bytea not null unique check (octet_length(token_digest)=32),
  email_digest bytea not null check (octet_length(email_digest)=32),
  tenant_id uuid,
  user_id uuid,
  authority_generation bigint,
  encrypted_payload bytea not null check (octet_length(encrypted_payload) between 29 and 8192),
  created_at timestamptz not null default clock_timestamp(),
  expires_at timestamptz not null,
  consumed_at timestamptz,
  constraint identity_lifecycle_challenge_owner_fk foreign key (tenant_id,user_id)
    references identity_users(tenant_id,id) on delete restrict,
  constraint identity_lifecycle_challenge_owner_ck check (
    (purpose='registration' and tenant_id is null and user_id is null and authority_generation is null)
    or (purpose='password_reset' and tenant_id is not null and user_id is not null
      and authority_generation is not null and authority_generation > 0)
  ),
  constraint identity_lifecycle_challenge_expiry_ck check (
    expires_at > created_at and expires_at <= created_at+interval '20 minutes'
    and (consumed_at is null or consumed_at >= created_at)
  )
);
create unique index identity_lifecycle_challenge_active_email_uq
  on identity_lifecycle_challenges (purpose,email_digest) where consumed_at is null;
create index identity_lifecycle_challenge_expiry_idx
  on identity_lifecycle_challenges (expires_at,id) where consumed_at is null;

create table identity_notification_outbox (
  id uuid primary key,
  challenge_id uuid not null unique references identity_lifecycle_challenges(id) on delete restrict,
  encrypted_payload bytea not null check (octet_length(encrypted_payload) between 29 and 8192),
  state text not null default 'pending' check (state in ('pending','cancelled','expired')),
  created_at timestamptz not null default clock_timestamp(),
  expires_at timestamptz not null,
  constraint identity_notification_outbox_expiry_ck check (expires_at > created_at)
);
create index identity_notification_outbox_pending_idx
  on identity_notification_outbox (created_at,id) where state='pending';

create function guard_identity_lifecycle_challenge()
returns trigger language plpgsql as $$
begin
  if tg_op='DELETE' then
    raise exception 'identity challenges retain their immutable evidence';
  end if;
  if old.id is distinct from new.id or old.purpose is distinct from new.purpose
    or old.token_digest is distinct from new.token_digest or old.email_digest is distinct from new.email_digest
    or old.tenant_id is distinct from new.tenant_id or old.user_id is distinct from new.user_id
    or old.authority_generation is distinct from new.authority_generation
    or old.encrypted_payload is distinct from new.encrypted_payload
    or old.created_at is distinct from new.created_at or old.expires_at is distinct from new.expires_at
    or old.consumed_at is not null or new.consumed_at is null then
    raise exception 'identity challenges may only be consumed once';
  end if;
  return new;
end;
$$;
create trigger identity_lifecycle_challenge_immutable
before update or delete on identity_lifecycle_challenges
for each row execute function guard_identity_lifecycle_challenge();

create function guard_identity_user_generation()
returns trigger language plpgsql as $$
declare security_changed boolean;
begin
  security_changed := old.password_hash is distinct from new.password_hash
    or old.status is distinct from new.status
    or old.max_concurrency is distinct from new.max_concurrency
    or old.requests_per_minute is distinct from new.requests_per_minute;
  if old.id is distinct from new.id or old.tenant_id is distinct from new.tenant_id
    or old.email is distinct from new.email or old.created_at is distinct from new.created_at
    or new.revision <> old.revision+1
    or (security_changed and new.authority_generation <> old.authority_generation+1)
    or (not security_changed and new.authority_generation not in (old.authority_generation,old.authority_generation+1)) then
    raise exception 'identity user revisions and credential authority must advance consistently';
  end if;
  return new;
end;
$$;
create trigger identity_user_generation before update on identity_users
for each row execute function guard_identity_user_generation();

create function guard_identity_registration_policy()
returns trigger language plpgsql as $$
begin
  if tg_op='DELETE' then raise exception 'identity policy cannot be deleted'; end if;
  if old.singleton is distinct from new.singleton or new.revision <> old.revision+1 then
    raise exception 'identity policy requires an advancing revision';
  end if;
  return new;
end;
$$;
create trigger identity_registration_policy_revision
before update or delete on identity_registration_policy
for each row execute function guard_identity_registration_policy();

create function guard_identity_lifecycle_challenge_insert()
returns trigger language plpgsql as $$
begin
  perform 1 from identity_registration_policy where singleton for update;
  if new.consumed_at is not null
    or (select count(*) from identity_lifecycle_challenges where consumed_at is null)>=1000 then
    raise exception 'identity challenge capacity exhausted or invalid initial state';
  end if;
  return new;
end;
$$;
create trigger identity_lifecycle_challenge_insert before insert on identity_lifecycle_challenges
for each row execute function guard_identity_lifecycle_challenge_insert();

create function guard_identity_notification_outbox()
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
    or old.state<>'pending' or new.state not in ('cancelled','expired') then
    raise exception 'notification intents may only leave pending once';
  end if;
  return new;
end;
$$;
create trigger identity_notification_outbox_guard before insert or update or delete on identity_notification_outbox
for each row execute function guard_identity_notification_outbox();

create function check_identity_challenge_notification()
returns trigger language plpgsql as $$
declare challenge uuid;
begin
  if tg_table_name='identity_lifecycle_challenges' then challenge:=new.id;
  else challenge:=new.challenge_id; end if;
  if not exists (
    select 1 from identity_lifecycle_challenges c join identity_notification_outbox o on o.challenge_id=c.id
    where c.id=challenge and c.expires_at=o.expires_at
      and ((c.consumed_at is null and o.state='pending') or (c.consumed_at is not null and o.state in ('cancelled','expired')))
  ) then raise exception 'identity challenge and encrypted notification must remain consistent'; end if;
  return null;
end;
$$;
create constraint trigger identity_challenge_notification_check
after insert or update on identity_lifecycle_challenges deferrable initially deferred
for each row execute function check_identity_challenge_notification();
create constraint trigger identity_notification_challenge_check
after insert or update on identity_notification_outbox deferrable initially deferred
for each row execute function check_identity_challenge_notification();
