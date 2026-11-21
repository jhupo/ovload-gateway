-- One credential catalog owns execution, budgets, and retained historical IDs.
do $$
begin
  if exists (select 1 from identity_model_keys) then
    raise exception 'identity_model_keys is not empty; export and explicitly reconcile these unused records before migration 0036';
  end if;
end
$$;
drop table identity_model_keys;

alter table client_api_keys
  add column key_digest bytea,
  add column key_prefix text,
  add column tenant_id uuid references identity_tenants(id) on delete restrict,
  add column user_id uuid,
  add column account_group_id text references account_groups(id) on delete restrict,
  add column wallet_tenant_id uuid references identity_tenant_wallets(tenant_id) on delete restrict,
  add column authority_generation bigint not null default 1,
  add column revision bigint not null default 1,
  add column expires_at timestamptz,
  add column revoked_at timestamptz,
  add column supersedes_key_id text references client_api_keys(id) on delete restrict,
  add column quarantined_at timestamptz,
  add column former_enabled boolean,
  add column former_group_ids text[];

-- Imported keys have no customer owner. Preserve every ID and financial fact,
-- retain the former routing choices as evidence, and require an audited assignment.
update client_api_keys k set
  key_digest=client_api_key_sha256(k.key),
  key_prefix=case when octet_length(k.key) > 16 then left(k.key,10) else '***' end,
  former_enabled=k.enabled,
  former_group_ids=coalesce((select array_agg(g.account_group_id order by g.account_group_id)
    from client_api_key_groups g where g.client_api_key_id=k.id), '{}'::text[]),
  enabled=false,
  quarantined_at=clock_timestamp();

create table model_key_migration_events (
  key_id text primary key references client_api_keys(id) on delete restrict,
  event text not null check (event='quarantined_unassigned'),
  former_name text not null,
  former_enabled boolean not null,
  former_group_ids text[] not null,
  created_at timestamptz not null default now()
);
insert into model_key_migration_events(key_id,event,former_name,former_enabled,former_group_ids)
  select id,'quarantined_unassigned',name,former_enabled,former_group_ids from client_api_keys;

drop table client_api_key_groups;
drop index client_api_keys_key_sha256_idx;
alter table client_api_keys drop column key;
drop function client_api_key_sha256(text);
alter table client_api_keys
  alter column key_digest set not null,
  alter column key_prefix set not null,
  add constraint client_api_keys_digest_uq unique(key_digest),
  add constraint client_api_keys_digest_ck check(octet_length(key_digest)=32),
  add constraint client_api_keys_prefix_ck check(octet_length(key_prefix) between 3 and 16),
  add constraint client_api_keys_owner_fk foreign key(tenant_id,user_id)
    references identity_users(tenant_id,id) on delete restrict,
  add constraint client_api_keys_authority_ck check(authority_generation>0 and revision>0),
  add constraint client_api_keys_owner_ck check (
    (tenant_id is null and user_id is null and account_group_id is null
      and wallet_tenant_id is null and quarantined_at is not null and not enabled)
    or (tenant_id is not null and user_id is not null and account_group_id is not null
      and wallet_tenant_id is not null and wallet_tenant_id=tenant_id and quarantined_at is null
      and max_concurrency between 1 and 10000 and requests_per_minute between 1 and 1000000)
  ),
  add constraint client_api_keys_revoked_ck check(revoked_at is null or not enabled),
  add constraint client_api_keys_supersedes_ck check(supersedes_key_id is null or supersedes_key_id<>id);
create index client_api_keys_owner_idx on client_api_keys(tenant_id,user_id,id);
create index client_api_keys_group_idx on client_api_keys(account_group_id,id);
create index client_api_keys_pending_idx on client_api_keys(id) where tenant_id is null;
create unique index client_api_keys_owner_name_uq
  on client_api_keys(tenant_id,user_id,lower(btrim(name)))
  where tenant_id is not null and revoked_at is null;

-- Historic observations have unknown owners; never infer a customer from a name.
alter table model_requests
  add column tenant_id uuid,
  add column user_id uuid,
  add column key_generation bigint,
  add column user_generation bigint,
  add column tenant_generation bigint,
  add constraint model_requests_owner_fk foreign key(tenant_id,user_id)
    references identity_users(tenant_id,id) on delete restrict,
  add constraint model_requests_identity_ck check (
    (tenant_id is null and user_id is null and key_generation is null
      and user_generation is null and tenant_generation is null)
    or (tenant_id is not null and user_id is not null and key_generation>0
      and key_generation is not null and user_generation is not null
      and tenant_generation is not null and user_generation>0 and tenant_generation>0)
  );
create index model_requests_owner_idx on model_requests(tenant_id,user_id,started_at,id)
  where tenant_id is not null;

create table model_key_group_grants (
  tenant_id uuid not null,
  user_id uuid not null,
  account_group_id text not null references account_groups(id) on delete restrict,
  granted boolean not null,
  revision bigint not null default 1 check(revision>0),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  primary key(tenant_id,user_id,account_group_id),
  foreign key(tenant_id,user_id) references identity_users(tenant_id,id) on delete restrict
);

create table model_key_command_receipts (
  actor_kind text not null check(actor_kind in ('customer_user','management_principal')),
  actor_id uuid not null,
  tenant_id uuid not null,
  user_id uuid not null,
  command text not null check(command in ('create','rotate')),
  idempotency_key text not null check(octet_length(idempotency_key) between 1 and 128),
  fingerprint bytea not null check(octet_length(fingerprint)=32),
  key_id text not null references client_api_keys(id) on delete restrict,
  created_at timestamptz not null default now(),
  primary key(actor_kind,actor_id,command,idempotency_key),
  foreign key(tenant_id,user_id) references identity_users(tenant_id,id) on delete restrict
);

create table model_key_audit_events (
  id uuid primary key default gen_random_uuid(),
  tenant_id uuid references identity_tenants(id) on delete restrict,
  user_id uuid,
  actor_kind text not null check(actor_kind in ('customer_user','management_principal')),
  actor_id uuid not null,
  session_id uuid not null references identity_sessions(id) on delete restrict,
  action text not null,
  key_id text references client_api_keys(id) on delete restrict,
  account_group_id text references account_groups(id) on delete restrict,
  reason text,
  created_at timestamptz not null default now(),
  foreign key(tenant_id,user_id) references identity_users(tenant_id,id) on delete restrict
);

create function enforce_model_key_bindings() returns trigger language plpgsql as $$
begin
  if tg_op='DELETE' then
    raise exception 'model keys must be revoked; retained history cannot be deleted';
  end if;
  if old.key_digest is distinct from new.key_digest
    or old.key_prefix is distinct from new.key_prefix
    or old.supersedes_key_id is distinct from new.supersedes_key_id
    or (old.tenant_id is not null and (
      old.tenant_id is distinct from new.tenant_id
      or old.user_id is distinct from new.user_id
      or old.account_group_id is distinct from new.account_group_id
      or old.wallet_tenant_id is distinct from new.wallet_tenant_id))
    or (old.revoked_at is not null and old.revoked_at is distinct from new.revoked_at) then
    raise exception 'model-key credential, ownership and revocation bindings are immutable';
  end if;
  return new;
end
$$;
create trigger model_key_bindings before update or delete on client_api_keys
  for each row execute function enforce_model_key_bindings();

create function reject_model_key_evidence_changes() returns trigger language plpgsql as $$
begin
  raise exception 'model-key authority evidence is append-only';
end
$$;
create trigger model_key_migration_append_only before update or delete on model_key_migration_events
  for each row execute function reject_model_key_evidence_changes();
create trigger model_key_audit_append_only before update or delete on model_key_audit_events
  for each row execute function reject_model_key_evidence_changes();
create trigger model_key_receipts_append_only before update or delete on model_key_command_receipts
  for each row execute function reject_model_key_evidence_changes();
