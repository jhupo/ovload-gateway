-- Customer identity, tenant ownership, management grants, and append-only audit.
-- Existing provider accounts and platform configuration remain platform-owned;
-- tenant ownership is explicit on customer-private records only.

create table identity_tenants (
  id uuid primary key default gen_random_uuid(),
  slug text not null unique,
  display_name text not null,
  status text not null default 'active',
  revision bigint not null default 1,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint identity_tenants_slug_ck check (
    octet_length(slug) between 3 and 64
    and slug = btrim(slug)
    and slug ~ '^[a-z0-9][a-z0-9-]{1,62}[a-z0-9]$'
  ),
  constraint identity_tenants_name_ck check (
    octet_length(display_name) between 1 and 160
    and display_name = btrim(display_name)
    and display_name !~ '[[:cntrl:]]'
  ),
  constraint identity_tenants_status_ck check (status in ('active', 'suspended', 'revoked')),
  constraint identity_tenants_revision_ck check (revision > 0),
  constraint identity_tenants_time_ck check (created_at <= updated_at)
);

create table identity_tenant_wallets (
  tenant_id uuid primary key references identity_tenants(id) on delete restrict,
  currency text not null default 'USD',
  balance_usd numeric(20,10) not null default 0,
  revision bigint not null default 1,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint identity_tenant_wallets_currency_ck check (currency = 'USD'),
  constraint identity_tenant_wallets_balance_ck check (balance_usd >= 0),
  constraint identity_tenant_wallets_revision_ck check (revision > 0),
  constraint identity_tenant_wallets_time_ck check (created_at <= updated_at)
);

create table identity_users (
  id uuid primary key default gen_random_uuid(),
  tenant_id uuid not null references identity_tenants(id) on delete restrict,
  email text not null,
  password_hash text not null,
  display_name text not null,
  status text not null default 'active',
  revision bigint not null default 1,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint identity_users_email_ck check (
    octet_length(email) between 3 and 320
    and email = btrim(email)
    and email = lower(email)
    and email !~ '[[:cntrl:]]'
  ),
  constraint identity_users_password_ck check (octet_length(password_hash) between 1 and 1024),
  constraint identity_users_name_ck check (
    octet_length(display_name) between 1 and 160
    and display_name = btrim(display_name)
    and display_name !~ '[[:cntrl:]]'
  ),
  constraint identity_users_status_ck check (status in ('active', 'suspended', 'revoked')),
  constraint identity_users_revision_ck check (revision > 0),
  constraint identity_users_time_ck check (created_at <= updated_at)
);

create unique index identity_users_email_uq on identity_users (lower(email));
create unique index identity_users_tenant_id_uq on identity_users (tenant_id, id);
create index identity_users_tenant_idx on identity_users (tenant_id, id);

create table identity_management_principals (
  id uuid primary key default gen_random_uuid(),
  username text not null unique,
  password_hash text not null,
  status text not null default 'active',
  revision bigint not null default 1,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint identity_management_principals_username_ck check (
    octet_length(username) between 1 and 128
    and username = btrim(username)
    and username !~ '[[:cntrl:]]'
  ),
  constraint identity_management_principals_password_ck check (octet_length(password_hash) between 1 and 1024),
  constraint identity_management_principals_status_ck check (status in ('active', 'suspended', 'revoked')),
  constraint identity_management_principals_revision_ck check (revision > 0),
  constraint identity_management_principals_time_ck check (created_at <= updated_at)
);

create table identity_roles (
  id uuid primary key default gen_random_uuid(),
  name text not null unique,
  scope text not null,
  permissions text[] not null,
  revision bigint not null default 1,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint identity_roles_scope_ck check (scope in ('platform', 'tenant')),
  constraint identity_roles_permissions_ck check (
    cardinality(permissions) > 0
    and array_position(permissions, null) is null
    and permissions <@ array[
      'identity.users.read', 'identity.users.manage', 'identity.sessions.manage',
      'identity.keys.read', 'identity.keys.manage', 'security.settings.manage',
      'provider_accounts.read', 'provider_accounts.manage', 'models.execute',
      'usage.read', 'billing.read', 'billing.manage', 'plugins.manage'
    ]::text[]
  ),
  constraint identity_roles_revision_ck check (revision > 0),
  constraint identity_roles_time_ck check (created_at <= updated_at)
);

create table identity_grants (
  id uuid primary key default gen_random_uuid(),
  principal_id uuid not null references identity_management_principals(id) on delete restrict,
  tenant_id uuid references identity_tenants(id) on delete restrict,
  permissions text[] not null,
  status text not null default 'active',
  expires_at timestamptz,
  authority_generation bigint not null default 1,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint identity_grants_permissions_ck check (
    cardinality(permissions) > 0
    and array_position(permissions, null) is null
    and permissions <@ array[
      'identity.users.read', 'identity.users.manage', 'identity.sessions.manage',
      'identity.keys.read', 'identity.keys.manage', 'security.settings.manage',
      'provider_accounts.read', 'provider_accounts.manage', 'models.execute',
      'usage.read', 'billing.read', 'billing.manage', 'plugins.manage'
    ]::text[]
  ),
  constraint identity_grants_status_ck check (status in ('active', 'suspended', 'revoked')),
  constraint identity_grants_generation_ck check (authority_generation > 0),
  constraint identity_grants_time_ck check (created_at <= updated_at)
);

create unique index identity_grants_principal_scope_uq
  on identity_grants (principal_id, coalesce(tenant_id, '00000000-0000-0000-0000-000000000000'::uuid));
create index identity_grants_lookup_idx on identity_grants (principal_id, status, expires_at);

create table identity_sessions (
  id uuid primary key default gen_random_uuid(),
  access_digest bytea not null unique,
  refresh_digest bytea not null unique,
  audience text not null,
  tenant_id uuid references identity_tenants(id) on delete restrict,
  user_id uuid,
  principal_id uuid references identity_management_principals(id) on delete restrict,
  csrf_digest bytea not null,
  authority_generation bigint not null,
  expires_at timestamptz not null,
  revoked_at timestamptz,
  created_at timestamptz not null default now(),
  constraint identity_sessions_audience_ck check (audience in ('customer', 'management')),
  constraint identity_sessions_owner_ck check (
    (audience = 'customer' and tenant_id is not null and user_id is not null and principal_id is null)
    or (audience = 'management' and tenant_id is null and user_id is null and principal_id is not null)
  ),
  constraint identity_sessions_access_ck check (octet_length(access_digest) = 32),
  constraint identity_sessions_refresh_ck check (octet_length(refresh_digest) = 32),
  constraint identity_sessions_csrf_ck check (octet_length(csrf_digest) = 32),
  constraint identity_sessions_generation_ck check (authority_generation > 0),
  constraint identity_sessions_time_ck check (created_at < expires_at),
  constraint identity_sessions_customer_user_fk
    foreign key (tenant_id, user_id) references identity_users(tenant_id, id) on delete restrict
);

create index identity_sessions_user_idx on identity_sessions (user_id, revoked_at, expires_at);
create index identity_sessions_principal_idx on identity_sessions (principal_id, revoked_at, expires_at);

create table identity_model_keys (
  id uuid primary key default gen_random_uuid(),
  tenant_id uuid not null references identity_tenants(id) on delete restrict,
  user_id uuid not null,
  name text not null,
  key_digest bytea not null unique,
  key_prefix text not null,
  enabled boolean not null default true,
  revoked_at timestamptz,
  authority_generation bigint not null default 1,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint identity_model_keys_digest_ck check (octet_length(key_digest) = 32),
  constraint identity_model_keys_prefix_ck check (octet_length(key_prefix) between 3 and 16),
  constraint identity_model_keys_name_ck check (
    octet_length(name) between 1 and 160
    and name = btrim(name)
    and name !~ '[[:cntrl:]]'
  ),
  constraint identity_model_keys_generation_ck check (authority_generation > 0),
  constraint identity_model_keys_time_ck check (created_at <= updated_at),
  constraint identity_model_keys_customer_user_fk
    foreign key (tenant_id, user_id) references identity_users(tenant_id, id) on delete restrict
);

create index identity_model_keys_owner_idx on identity_model_keys (tenant_id, user_id, id);

create table identity_audit_events (
  id uuid primary key default gen_random_uuid(),
  tenant_id uuid references identity_tenants(id) on delete restrict,
  actor_kind text not null,
  actor_id uuid,
  session_id text,
  action text not null,
  target_kind text not null,
  target_id uuid,
  reason text,
  metadata jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now(),
  constraint identity_audit_events_actor_kind_ck check (
    actor_kind in ('customer_user', 'management_principal', 'model_key', 'plugin', 'system', 'anonymous')
  ),
  constraint identity_audit_events_reason_ck check (reason is null or octet_length(reason) between 1 and 512),
  constraint identity_audit_events_metadata_ck check (jsonb_typeof(metadata) = 'object')
);

create index identity_audit_events_tenant_idx on identity_audit_events (tenant_id, created_at desc, id desc);
create index identity_audit_events_actor_idx on identity_audit_events (actor_id, created_at desc, id desc);

create or replace function reject_identity_audit_mutation()
returns trigger
language plpgsql
as $$
begin
  raise exception 'identity audit events are append-only';
end;
$$;

create trigger identity_audit_events_no_update
before update or delete on identity_audit_events
for each row execute function reject_identity_audit_mutation();
