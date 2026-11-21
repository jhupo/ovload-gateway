create table announcements (
  id uuid primary key,
  title text not null check (length(title) between 1 and 160),
  content text not null check (length(content) between 1 and 100000),
  status text not null check (status in ('draft','published','archived')),
  delivery text not null check (delivery in ('silent','popup')),
  group_ids text[] not null default '{}',
  starts_at timestamptz,
  ends_at timestamptz,
  created_at timestamptz not null default clock_timestamp(),
  updated_at timestamptz not null default clock_timestamp(),
  revision bigint not null default 1,
  created_by uuid not null references identity_management_principals(id),
  check (ends_at is null or starts_at is null or ends_at > starts_at)
);
create table announcement_reads (
  announcement_id uuid not null references announcements(id) on delete cascade,
  user_id uuid not null references identity_users(id) on delete cascade,
  revision bigint not null,
  read_at timestamptz not null default clock_timestamp(),
  primary key (announcement_id,user_id)
);
create index announcements_active_idx on announcements(status, starts_at, ends_at);
