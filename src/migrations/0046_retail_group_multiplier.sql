-- New funds operations freeze the current group policy; old operations retain it.
create or replace function guard_retail_billing_reservation_contract()
returns trigger language plpgsql as $$
begin
  if tg_op = 'INSERT' then
    new.expires_at := new.created_at + interval '30 minutes';
    if new.row_version <> 1 then
      raise exception 'retail billing operations begin at version one';
    end if;
    if not exists (
      select 1 from account_groups group_policy
       where group_policy.id = new.account_group_id and group_policy.enabled
         and group_policy.retail_multiplier_bps = new.effective_multiplier_bps
    ) or not exists (
      select 1 from retail_price_catalog catalog
       where catalog.singleton and catalog.generation = new.catalog_generation
         and catalog.published_revision_id = new.price_revision_id
    ) then
      raise exception 'new retail funds operations require current catalog and group policy';
    end if;
  elsif new.row_version <> old.row_version + 1 then
    raise exception 'retail billing operation version must advance exactly once';
  elsif old.request_fingerprint is distinct from new.request_fingerprint
    or old.reserved_usd is distinct from new.reserved_usd
    or old.key_generation is distinct from new.key_generation
    or old.user_generation is distinct from new.user_generation
    or old.tenant_generation is distinct from new.tenant_generation
    or old.route_revision is distinct from new.route_revision
    or old.catalog_generation is distinct from new.catalog_generation
    or old.expires_at is distinct from new.expires_at then
    raise exception 'retail billing admission facts are immutable';
  end if;
  return new;
end;
$$;
