-- Platform operators only; customer scope is an independent data partition.
create table identity_security_mutex (
  id boolean primary key default true check (id)
);
insert into identity_security_mutex (id) values (true);

-- Grants are additive immutable permission bundles. Revocation retains evidence.
drop index identity_grants_principal_scope_uq;
create index identity_grants_principal_scope_idx on identity_grants (principal_id, tenant_id);

create table identity_grant_requests (
  id uuid primary key,
  requester_id uuid not null references identity_management_principals(id) on delete restrict,
  principal_id uuid not null references identity_management_principals(id) on delete restrict,
  tenant_id uuid references identity_tenants(id) on delete restrict,
  role_id uuid not null references identity_roles(id) on delete restrict,
  role_revision bigint not null check (role_revision > 0),
  permissions text[] not null,
  reason text not null check (octet_length(reason) between 1 and 512),
  status text not null default 'pending' check (status in ('pending','approved','rejected')),
  expires_at timestamptz not null,
  grant_expires_at timestamptz,
  decision_by uuid references identity_management_principals(id) on delete restrict,
  decision_reason text check (octet_length(decision_reason) between 1 and 512),
  decided_at timestamptz,
  grant_id uuid references identity_grants(id) on delete restrict,
  revision bigint not null default 1 check (revision > 0),
  created_at timestamptz not null default clock_timestamp(),
  check (expires_at > created_at and expires_at <= created_at + interval '24 hours'),
  check (grant_expires_at is null or grant_expires_at > created_at),
  check (cardinality(permissions) between 1 and 13 and array_position(permissions,null) is null
    and permissions <@ array['identity.users.read','identity.users.manage','identity.sessions.manage',
      'identity.keys.read','identity.keys.manage','security.settings.manage','provider_accounts.read',
      'provider_accounts.manage','models.execute','usage.read','billing.read','billing.manage','plugins.manage']::text[]),
  check ((status='pending' and decision_by is null and decision_reason is null and decided_at is null and grant_id is null)
    or (status in ('approved','rejected') and decision_by is not null and decision_by<>requester_id
      and decision_reason is not null and decided_at is not null and decided_at<expires_at
      and ((status='approved' and grant_id is not null) or (status='rejected' and grant_id is null))))
);
create index identity_grant_requests_scope_idx on identity_grant_requests (tenant_id,id);

create function identity_guard_grant_request() returns trigger language plpgsql as $$
begin
  if tg_op='DELETE' then raise exception 'grant request is retained'; end if;
  if old.status<>'pending' or new.status='pending' or new.revision<>old.revision+1
    or row(new.id,new.requester_id,new.principal_id,new.tenant_id,new.role_id,new.role_revision,
      new.permissions,new.reason,new.expires_at,new.grant_expires_at,new.created_at)
      is distinct from row(old.id,old.requester_id,old.principal_id,old.tenant_id,old.role_id,
      old.role_revision,old.permissions,old.reason,old.expires_at,old.grant_expires_at,old.created_at)
  then raise exception 'invalid grant request transition'; end if;
  return new;
end;
$$;
create trigger identity_grant_request_guard before update or delete on identity_grant_requests
  for each row execute function identity_guard_grant_request();

-- All security mutations acquire the singleton mutex before identity locks.
-- The adapter prevents loss of the final active permanent platform security grant.
