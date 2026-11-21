-- Optional operator-seeded UI fixtures. Never grants entitlements or usable redemption codes.
-- Empty on normal installations; accessible only to management billing readers.
create table management_test_datasets (
 id text primary key check (id='ui-preview'),
 document jsonb not null check (jsonb_typeof(document)='object' and octet_length(document::text)<=1048576),
 created_at timestamptz not null default clock_timestamp()
);
