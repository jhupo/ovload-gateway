create table authentication_security (
 singleton boolean primary key default true check(singleton),
 revision bigint not null default 1 check(revision>0),
 policy jsonb not null default '{}',
 encrypted bytea not null default ''::bytea
);
insert into authentication_security(singleton) values(true);
alter table identity_sessions add column last_seen_at timestamptz not null default clock_timestamp();
alter table identity_sessions add column step_up_at timestamptz;
alter table identity_sessions add column is_admin_key boolean not null default false;
create unique index identity_one_admin_key on identity_sessions(principal_id) where is_admin_key and revoked_at is null;
create table authentication_failures (
 source_digest bytea primary key,
 failures integer not null default 0,
 window_start timestamptz not null default clock_timestamp(),
 blocked_until timestamptz
);
