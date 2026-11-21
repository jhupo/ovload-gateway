-- Preserve imported audit history and distinguish the new management authority.
alter table admin_audit_events drop constraint admin_audit_events_actor_kind_ck;
alter table admin_audit_events add constraint admin_audit_events_actor_kind_ck check (
  actor_kind in ('admin_session', 'admin_api_key', 'system', 'anonymous', 'management_session')
);
alter table admin_audit_events add constraint admin_audit_events_management_actor_ck check (
  actor_kind <> 'management_session'
  or (actor_admin_user_id is null and actor_ref ~ '^management:[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$')
);
