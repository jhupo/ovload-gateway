-- Manual browser session rotation has been removed. Access authentication,
-- expiry, ownership and revocation evidence remain unchanged.
select id from identity_security_mutex where id = true for update;
lock table identity_roles, identity_grants, identity_grant_requests in access exclusive mode;
alter table identity_sessions drop column refresh_digest;

-- Capture original facts before changing current projections. Actual before and
-- after rows become append-only system evidence in the same transaction.
create temporary table retired_session_permission_snapshots on commit drop as
select null::uuid as tenant_id, 'identity_role'::text as target_kind, id as target_id,
  to_jsonb(role_record) as before_record
from identity_roles role_record where 'identity.sessions.manage' = any(permissions)
union all
select tenant_id, 'identity_grant', id, to_jsonb(grant_record)
from identity_grants grant_record where 'identity.sessions.manage' = any(permissions)
union all
select tenant_id, 'identity_grant_request', id, to_jsonb(request_record)
from identity_grant_requests request_record where 'identity.sessions.manage' = any(permissions);

alter table identity_roles drop constraint identity_roles_permissions_ck;
alter table identity_grants drop constraint identity_grants_permissions_ck;

-- The imported request checks are unnamed. Select only checks that depend on
-- permissions or status, preserving independent expiry and identity checks.
do $$
declare
  constraint_name text;
begin
  for constraint_name in
    select distinct constraint_record.conname
    from pg_constraint constraint_record
    join pg_attribute attribute_record
      on attribute_record.attrelid = constraint_record.conrelid
      and attribute_record.attnum = any(constraint_record.conkey)
    where constraint_record.conrelid = 'identity_grant_requests'::regclass
      and constraint_record.contype = 'c'
      and attribute_record.attname in ('permissions', 'status')
  loop
    execute format('alter table identity_grant_requests drop constraint %I', constraint_name);
  end loop;
end;
$$;

alter table identity_grant_requests disable trigger identity_grant_request_guard;

update identity_roles
set permissions = array_remove(permissions, 'identity.sessions.manage'),
    revision = revision + 1,
    updated_at = clock_timestamp()
where 'identity.sessions.manage' = any(permissions);

update identity_grants
set permissions = array_remove(permissions, 'identity.sessions.manage'),
    status = case
      when cardinality(array_remove(permissions, 'identity.sessions.manage')) = 0 then 'revoked'
      else status
    end,
    authority_generation = authority_generation + 1,
    updated_at = clock_timestamp()
where 'identity.sessions.manage' = any(permissions);

update identity_grant_requests
set permissions = array_remove(permissions, 'identity.sessions.manage'),
    status = case
      when status = 'pending' then 'retired'
      else status
    end,
    decision_reason = case
      when status = 'pending' then 'Browser session management was removed; submit a new request'
      else decision_reason
    end,
    decided_at = case
      when status = 'pending' then clock_timestamp()
      else decided_at
    end,
    revision = revision + 1
where 'identity.sessions.manage' = any(permissions);

alter table identity_roles add constraint identity_roles_permissions_ck check (
  array_position(permissions, null) is null
  and permissions <@ array[
    'identity.users.read', 'identity.users.manage', 'identity.keys.read',
    'identity.keys.manage', 'security.settings.manage', 'provider_accounts.read',
    'provider_accounts.manage', 'models.execute', 'usage.read', 'billing.read',
    'billing.manage', 'plugins.manage'
  ]::text[]
);

alter table identity_grants add constraint identity_grants_permissions_ck check (
  (cardinality(permissions) > 0 or status = 'revoked')
  and array_position(permissions, null) is null
  and permissions <@ array[
    'identity.users.read', 'identity.users.manage', 'identity.keys.read',
    'identity.keys.manage', 'security.settings.manage', 'provider_accounts.read',
    'provider_accounts.manage', 'models.execute', 'usage.read', 'billing.read',
    'billing.manage', 'plugins.manage'
  ]::text[]
);

alter table identity_grant_requests
  add constraint identity_grant_requests_status_ck
    check (status in ('pending', 'approved', 'rejected', 'retired')),
  add constraint identity_grant_requests_permissions_ck check (
    cardinality(permissions) between 0 and 12
    and (cardinality(permissions) > 0 or status <> 'pending')
    and array_position(permissions, null) is null
    and permissions <@ array[
      'identity.users.read', 'identity.users.manage', 'identity.keys.read',
      'identity.keys.manage', 'security.settings.manage', 'provider_accounts.read',
      'provider_accounts.manage', 'models.execute', 'usage.read', 'billing.read',
      'billing.manage', 'plugins.manage'
    ]::text[]
  ),
  add constraint identity_grant_requests_decision_ck check (
    (status = 'pending' and decision_by is null and decision_reason is null
      and decided_at is null and grant_id is null)
    or (status in ('approved', 'rejected') and decision_by is not null
      and decision_by <> requester_id and decision_reason is not null
      and decided_at is not null and decided_at < expires_at
      and ((status = 'approved' and grant_id is not null)
        or (status = 'rejected' and grant_id is null)))
    or (status = 'retired' and decision_by is null and decision_reason is not null
      and decided_at is not null and grant_id is null)
  );

insert into identity_audit_events
  (tenant_id, actor_kind, action, target_kind, target_id, reason, metadata)
select snapshot.tenant_id, 'system', 'identity.permission_retired', snapshot.target_kind,
  snapshot.target_id, 'Browser session management was removed',
  jsonb_build_object('before', snapshot.before_record, 'after', to_jsonb(role_record))
from retired_session_permission_snapshots snapshot
join identity_roles role_record on snapshot.target_kind = 'identity_role'
  and role_record.id = snapshot.target_id
union all
select snapshot.tenant_id, 'system', 'identity.permission_retired', snapshot.target_kind,
  snapshot.target_id, 'Browser session management was removed',
  jsonb_build_object('before', snapshot.before_record, 'after', to_jsonb(grant_record))
from retired_session_permission_snapshots snapshot
join identity_grants grant_record on snapshot.target_kind = 'identity_grant'
  and grant_record.id = snapshot.target_id
union all
select snapshot.tenant_id, 'system', 'identity.permission_retired', snapshot.target_kind,
  snapshot.target_id, 'Browser session management was removed',
  jsonb_build_object('before', snapshot.before_record, 'after', to_jsonb(request_record))
from retired_session_permission_snapshots snapshot
join identity_grant_requests request_record on snapshot.target_kind = 'identity_grant_request'
  and request_record.id = snapshot.target_id;

alter table identity_grant_requests enable trigger identity_grant_request_guard;
