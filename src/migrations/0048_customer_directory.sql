-- Administrative profile facts and indexed durable activity for the directory.
alter table identity_users add column notes text not null default '';
alter table identity_users add constraint identity_users_notes_ck check (
  octet_length(notes) <= 1000 and notes !~ '[\x01-\x08\x0B-\x1F\x7F]'
);

-- A login-email edit is a security change, with the same authority fence as a
-- password edit. Customer identity and ownership themselves remain immutable.
create or replace function guard_identity_user_generation()
returns trigger language plpgsql as $$
declare security_changed boolean;
begin
  security_changed := old.password_hash is distinct from new.password_hash
    or old.email is distinct from new.email
    or old.status is distinct from new.status
    or old.max_concurrency is distinct from new.max_concurrency
    or old.requests_per_minute is distinct from new.requests_per_minute;
  if old.id is distinct from new.id or old.tenant_id is distinct from new.tenant_id
    or old.created_at is distinct from new.created_at
    or new.revision <> old.revision+1
    or (security_changed and new.authority_generation <> old.authority_generation+1)
    or (not security_changed and new.authority_generation not in (old.authority_generation,old.authority_generation+1))
    or (old.email is distinct from new.email and new.email_verified_at is not null) then
    raise exception 'identity user revisions and credential authority must advance consistently';
  end if;
  return new;
end;
$$;

create index identity_sessions_customer_activity_idx
  on identity_sessions (tenant_id, user_id, created_at desc)
  where audience='customer';

create index model_requests_customer_activity_idx
  on model_requests (tenant_id, user_id, started_at desc)
  where owns_client_admission;
