-- Durable, bounded fixed-minute authentication budgets. Raw network/account
-- identifiers never enter the counters or audit metadata.
create table identity_auth_budgets (
  scope text not null,
  bucket_digest bytea not null,
  window_start timestamptz not null,
  attempts integer not null,
  primary key (scope, bucket_digest),
  constraint identity_auth_budgets_scope_ck check (scope in ('global', 'network', 'account')),
  constraint identity_auth_budgets_digest_ck check (octet_length(bucket_digest) = 32),
  constraint identity_auth_budgets_attempts_ck check (attempts between 1 and 1001)
);

create index identity_auth_budgets_expiry_idx
  on identity_auth_budgets (window_start, scope, bucket_digest);
