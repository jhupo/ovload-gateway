create table system_log_config (
  singleton boolean primary key default true check(singleton),
  revision bigint not null default 1 check(revision>0),
  enabled boolean not null default true,
  level text not null default 'INFO' check(level in ('DEBUG','INFO','WARN','ERROR')),
  retention_days integer not null default 7 check(retention_days between 1 and 90)
);
insert into system_log_config(singleton) values(true);
create table system_logs (
  id text primary key,
  occurred_at timestamptz not null,
  level text not null,
  component text not null,
  message text not null,
  request_id text,
  provider text,
  account_id text,
  fields jsonb not null default '{}'
);
create index system_logs_time_idx on system_logs(occurred_at desc,id desc);
create index system_logs_request_idx on system_logs(request_id,occurred_at desc);
create index system_logs_level_idx on system_logs(level,occurred_at desc);
create table system_log_changes (
  id bigserial primary key,
  occurred_at timestamptz not null default clock_timestamp(),
  principal_id uuid not null,
  action text not null,
  details jsonb not null
);
