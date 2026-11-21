-- Independent-customer and user execution ceilings; no organization/team model.
alter table identity_tenants
  add column max_concurrency bigint not null default 100,
  add column requests_per_minute bigint not null default 6000,
  add constraint identity_tenants_execution_limits_ck check (
    max_concurrency between 1 and 100000
    and requests_per_minute between 1 and 10000000
  );

alter table identity_users
  add column max_concurrency bigint not null default 20,
  add column requests_per_minute bigint not null default 1200,
  add constraint identity_users_execution_limits_ck check (
    max_concurrency between 1 and 100000
    and requests_per_minute between 1 and 10000000
  );

alter table model_requests add column owns_client_admission boolean;
update model_requests set owns_client_admission =
  (request_observation_json #>> '{scheduling,admissionDecisionMs}') is not null;
alter table model_requests alter column owns_client_admission set not null;
alter table model_requests alter column owns_client_admission set default true;

create function guard_request_admission_ownership() returns trigger language plpgsql as $$
begin
  if old.owns_client_admission is distinct from new.owns_client_admission then
    raise exception 'logical request admission ownership is immutable';
  end if;
  return new;
end
$$;
create trigger request_admission_ownership before update on model_requests
  for each row execute function guard_request_admission_ownership();

do $$
begin
  if exists (
    select 1 from model_requests
    where owns_client_admission and (tenant_id is null or user_id is null)
      and (outcome='running' or started_at >= clock_timestamp() - interval '61 seconds')
  ) then
    raise exception 'recent or running model requests lack customer ownership; reconcile them before migration 0041';
  end if;
end
$$;
