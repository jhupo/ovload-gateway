alter table account_groups add column controls_json jsonb not null default '{"requestsPerMinute":0,"userOverrides":{}}'::jsonb;
alter table account_groups add constraint account_groups_controls_object check(jsonb_typeof(controls_json)='object');
