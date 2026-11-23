-- Keep API-key admission fences independent of browser credential expiry.
alter table identity_users add column limits_revision bigint not null default 0
  check (limits_revision >= 0);

create or replace function guard_identity_user_generation()
returns trigger language plpgsql as $$
declare security_changed boolean;
begin
  security_changed := old.password_hash is distinct from new.password_hash
    or old.email is distinct from new.email
    or old.status is distinct from new.status;
  if old.id is distinct from new.id or old.tenant_id is distinct from new.tenant_id
    or old.created_at is distinct from new.created_at
    or new.revision <> old.revision+1
    or (security_changed and new.authority_generation <> old.authority_generation+1)
    or (not security_changed and new.authority_generation not in (old.authority_generation,old.authority_generation+1))
    or (old.email is distinct from new.email and new.email_verified_at is not null) then
    raise exception 'identity user revisions and credential authority must advance consistently';
  end if;
  new.limits_revision := old.limits_revision + case when
    old.max_concurrency is distinct from new.max_concurrency
    or old.requests_per_minute is distinct from new.requests_per_minute then 1 else 0 end;
  return new;
end;
$$;

-- Sessions need an idle-timeout baseline when the policy is enabled again.
alter table authentication_security add column idle_timeout_enabled_at timestamptz;
