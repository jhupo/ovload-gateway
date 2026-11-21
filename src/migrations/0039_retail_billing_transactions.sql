-- Durable wallet transactions only. Forwarding does not invoke this contract.
do $$
begin
  if exists (select 1 from billing_reservations) then
    raise exception 'migration 0039 requires an empty unactivated retail reservation catalog; existing financial facts require explicit recovery';
  end if;
end;
$$;

alter table billing_reservations
  add column request_fingerprint bytea not null,
  add column key_generation bigint not null,
  add column user_generation bigint not null,
  add column tenant_generation bigint not null,
  add column route_revision bigint not null,
  add column catalog_generation bigint not null,
  add column expires_at timestamptz not null,
  add column row_version bigint not null default 1 check (row_version > 0),
  add constraint billing_reservations_fingerprint_ck check (octet_length(request_fingerprint) = 32),
  add constraint billing_reservations_generations_ck check (
    key_generation > 0 and user_generation > 0 and tenant_generation > 0
    and route_revision > 0 and catalog_generation > 0
  ),
  add constraint billing_reservations_snapshot_size_ck check (
    octet_length(quote_bounds::text) <= 32768
    and octet_length(frozen_price_snapshot::text) <= 32768
  ),
  add constraint billing_reservations_expiry_ck check (expires_at > created_at);

create index billing_reservations_expiry_idx
  on billing_reservations (expires_at, operation_id) where state = 'held';
create index billing_reservations_tenant_history_idx
  on billing_reservations (tenant_id, created_at desc, operation_id desc);

alter table billing_reservation_events
  drop constraint billing_reservation_events_kind_ck,
  add constraint billing_reservation_events_kind_ck check (
    event_kind in ('reserved', 'settled', 'released', 'reconciliation_opened',
      'reconciliation_resolved', 'dispatch_intent', 'dispatch_evidence')
  );

create function guard_retail_billing_reservation_contract()
returns trigger language plpgsql as $$
begin
  if tg_op = 'INSERT' then
    new.expires_at := new.created_at + interval '30 minutes';
    if new.row_version <> 1 then
      raise exception 'retail billing operations begin at version one';
    end if;
    if new.effective_multiplier_bps <> 10000 or not exists (
      select 1 from retail_price_catalog catalog
       where catalog.singleton and catalog.generation = new.catalog_generation
         and catalog.published_revision_id = new.price_revision_id
    ) then
      raise exception 'new retail funds operations require the current catalog and fixed multiplier';
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

-- Runs after the existing insert trigger has assigned the database admission time.
create trigger zz_billing_reservation_contract
before insert or update on billing_reservations
for each row execute function guard_retail_billing_reservation_contract();

alter table billing_dispatch_intents
  add column provider_account_id text not null,
  add column request_profile_generation bigint not null,
  add column egress_generation bigint not null,
  add column fingerprint bytea not null,
  add constraint billing_dispatch_intents_metadata_ck check (
    octet_length(provider_account_id) between 1 and 128
    and request_profile_generation > 0 and egress_generation > 0
    and octet_length(fingerprint) = 32
  ),
  add constraint billing_dispatch_intents_bounded_attempt_ck check (attempt_number <= 100);

create function guard_retail_billing_dispatch_intent()
returns trigger language plpgsql as $$
declare
  reservation billing_reservations%rowtype;
  last_attempt integer;
begin
  select * into reservation from billing_reservations
   where operation_id = new.operation_id and tenant_id = new.tenant_id for update;
  if not found or reservation.state <> 'held' or reservation.expires_at <= clock_timestamp() then
    raise exception 'dispatch requires a live held retail operation';
  end if;
  select coalesce(max(attempt_number), 0) into last_attempt
    from billing_dispatch_intents where operation_id = new.operation_id;
  if new.attempt_number <> last_attempt + 1 then
    raise exception 'retail dispatch attempts must be fresh and consecutive';
  end if;
  if exists (
    select 1 from billing_dispatch_intents intent
     where intent.operation_id = new.operation_id
       and coalesce((select evidence.outcome from billing_dispatch_evidence evidence
                      where evidence.operation_id = intent.operation_id
                        and evidence.attempt_number = intent.attempt_number
                      order by evidence.evidence_sequence desc limit 1), 'ambiguous') <> 'not_sent'
  ) then
    raise exception 'another retail attempt may already have executed';
  end if;
  return new;
end;
$$;

create trigger billing_dispatch_protocol
before insert on billing_dispatch_intents
for each row execute function guard_retail_billing_dispatch_intent();

create function guard_retail_billing_dispatch_evidence()
returns trigger language plpgsql as $$
declare
  previous_outcome text;
  previous_sequence integer;
begin
  perform 1 from billing_reservations
   where operation_id = new.operation_id and tenant_id = new.tenant_id for update;
  select evidence_sequence, outcome into previous_sequence, previous_outcome
    from billing_dispatch_evidence
   where operation_id = new.operation_id and attempt_number = new.attempt_number
   order by evidence_sequence desc limit 1;
  if new.evidence_sequence <> coalesce(previous_sequence, 0) + 1 then
    raise exception 'retail dispatch evidence must be consecutive';
  end if;
  if new.evidence_sequence > 2 or previous_outcome = new.outcome then
    raise exception 'retail dispatch evidence must add one bounded certainty transition';
  end if;
  if previous_outcome in ('sent', 'not_sent') and new.outcome <> previous_outcome then
    raise exception 'definitive retail dispatch evidence cannot be contradicted';
  end if;
  if new.outcome = 'sent' and exists (
    select 1 from billing_dispatch_evidence
     where operation_id = new.operation_id and attempt_number <> new.attempt_number and outcome = 'sent'
  ) then
    raise exception 'a retail operation can have only one executed attempt';
  end if;
  return new;
end;
$$;

create trigger billing_dispatch_evidence_protocol
before insert on billing_dispatch_evidence
for each row execute function guard_retail_billing_dispatch_evidence();

create table retail_billing_commands (
  operation_id text not null,
  tenant_id uuid not null,
  command text not null check (command in ('record_dispatch', 'complete')),
  idempotency_key text not null check (
    octet_length(idempotency_key) between 1 and 128 and idempotency_key ~ '^[!-~]+$'
  ),
  fingerprint bytea not null check (octet_length(fingerprint) = 32),
  created_at timestamptz not null default clock_timestamp(),
  primary key (operation_id, command, idempotency_key),
  foreign key (operation_id, tenant_id)
    references billing_reservations(operation_id, tenant_id) on delete restrict
);

create trigger retail_billing_commands_append_only
before update or delete on retail_billing_commands
for each row execute function reject_customer_billing_evidence_mutation();

alter table billing_usage_components
  drop constraint billing_usage_components_amount_ck,
  drop column charge_usd,
  add column exact_usd_numerator numeric(60,0) not null,
  add column exact_usd_denominator numeric(30,0) not null,
  add constraint billing_usage_components_amount_ck check (quantity >= 0 and unit_rate_usd >= 0),
  add constraint billing_usage_components_exact_ck check (
    exact_usd_numerator >= 0 and exact_usd_denominator > 0
  );

create function guard_retail_billing_usage_component()
returns trigger language plpgsql as $$
declare
  unit_denominator numeric;
  usage_facts jsonb;
begin
  if new.quantity <> trunc(new.quantity) or new.quantity > 18446744073709551615 then
    raise exception 'retail usage quantities must be unsigned 64-bit integers';
  end if;
  if not exists (
    select 1 from billing_reservations reservation
    join retail_rates rate on rate.rate_card_id = reservation.rate_card_id
     where reservation.operation_id = new.operation_id and reservation.tenant_id = new.tenant_id
       and rate.id = new.rate_id and rate.dimension = new.dimension
       and rate.unit = new.unit and rate.rate_usd_per_unit = new.unit_rate_usd
  ) then
    raise exception 'usage component must match its frozen retail rate';
  end if;
  unit_denominator := case new.unit when 'per_1m_tokens' then 1000000 else 1 end;
  if new.exact_usd_numerator * unit_denominator
    <> new.quantity * new.unit_rate_usd * new.exact_usd_denominator then
    raise exception 'usage component fraction must match its quantity and rate';
  end if;
  select receipt.usage_facts into usage_facts from billing_usage_receipts receipt
   where receipt.operation_id = new.operation_id and receipt.tenant_id = new.tenant_id;
  if not found or not exists (
    select 1 from jsonb_array_elements(usage_facts -> 'quantities') usage
     where usage ->> 'dimension' = new.dimension
       and jsonb_typeof(usage -> 'quantity') = 'number'
       and (usage ->> 'quantity')::numeric = new.quantity
  ) then
    raise exception 'usage component must match its authoritative receipt quantity';
  end if;
  return new;
end;
$$;

create trigger billing_usage_component_price
before insert on billing_usage_components
for each row execute function guard_retail_billing_usage_component();

create function check_retail_billing_receipt_components()
returns trigger language plpgsql as $$
declare
  reservation billing_reservations%rowtype;
  receipt billing_usage_receipts%rowtype;
  expected_count bigint;
  actual_count bigint;
  scaled_numerator numeric;
  rounded_scaled numeric;
  remainder numeric;
begin
  select * into reservation from billing_reservations
   where operation_id = new.operation_id and tenant_id = new.tenant_id;
  select * into receipt from billing_usage_receipts
   where operation_id = new.operation_id and tenant_id = new.tenant_id;
  if not found then
    raise exception 'retail components require their immutable usage receipt';
  end if;
  if reservation.state <> 'settled' or reservation.settled_usd <> receipt.customer_charge_usd then
    raise exception 'retail receipt must be posted by its settled reservation';
  end if;
  if jsonb_typeof(receipt.usage_facts -> 'quantities') is distinct from 'array'
    or octet_length(receipt.usage_facts::text) > 32768 then
    raise exception 'retail receipt requires bounded canonical usage quantities';
  end if;
  select count(*) into expected_count from retail_rates where rate_card_id = reservation.rate_card_id;
  select count(*), coalesce(sum(component.quantity * component.unit_rate_usd * 10000000000
      * case component.unit when 'per_1m_tokens' then 1 else 1000000 end), 0)
    into actual_count, scaled_numerator from billing_usage_components component
   where component.operation_id = new.operation_id and component.tenant_id = new.tenant_id;
  if expected_count not between 5 and 14 or actual_count <> expected_count
    or jsonb_array_length(receipt.usage_facts -> 'quantities') <> expected_count
    or exists (
      select 1 from retail_rates rate
       where rate.rate_card_id = reservation.rate_card_id and not exists (
         select 1 from billing_usage_components component
          where component.operation_id = new.operation_id and component.tenant_id = new.tenant_id
            and component.rate_id = rate.id and component.dimension = rate.dimension and component.unit = rate.unit
       )
    ) then
    raise exception 'retail receipt must contain every selected rate and usage dimension exactly once';
  end if;
  -- Every term uses a common million-token denominator before the single rounding.
  rounded_scaled := trunc(scaled_numerator / 1000000);
  remainder := mod(scaled_numerator, 1000000);
  if remainder > 500000 or remainder = 500000 and mod(rounded_scaled, 2) = 1 then
    rounded_scaled := rounded_scaled + 1;
  end if;
  if receipt.customer_charge_usd * 10000000000 <> rounded_scaled then
    raise exception 'retail receipt must equal the single half-even rounded component total';
  end if;
  return null;
end;
$$;

create constraint trigger billing_receipt_complete_components
after insert on billing_usage_receipts deferrable initially deferred
for each row execute function check_retail_billing_receipt_components();

create constraint trigger billing_component_complete_receipt
after insert on billing_usage_components deferrable initially deferred
for each row execute function check_retail_billing_receipt_components();

alter table billing_reconciliation_cases
  add column resolved_actor_kind text,
  drop constraint billing_reconciliation_cases_state_ck,
  add constraint billing_reconciliation_cases_state_ck check (
    (state = 'open' and resolved_at is null and resolved_by is null
      and resolved_actor_kind is null and resolution is null)
    or (state = 'resolved' and resolved_at is not null and resolution is not null
      and resolved_actor_kind is not null
      and octet_length(resolution) between 1 and 512 and resolution = btrim(resolution)
      and ((resolved_actor_kind = 'system' and resolved_by is null)
        or (resolved_actor_kind = 'management_principal' and resolved_by is not null)))
  );

create or replace function enforce_billing_reconciliation_transition()
returns trigger language plpgsql as $$
begin
  if tg_op = 'DELETE' then
    raise exception 'billing reconciliation cases cannot be deleted';
  end if;
  if old.id is distinct from new.id or old.operation_id is distinct from new.operation_id
    or old.tenant_id is distinct from new.tenant_id or old.reason is distinct from new.reason
    or old.opened_at is distinct from new.opened_at or new.held_usd > old.held_usd
    or (old.known_charge_usd is not null and
      (new.known_charge_usd is null or new.known_charge_usd <> old.known_charge_usd))
    or (old.unresolved_usd is not null and
      (new.unresolved_usd is null or new.unresolved_usd > old.unresolved_usd)) then
    raise exception 'billing reconciliation facts are monotonic and operation-scoped';
  end if;
  if old.state = 'resolved' or old.state <> 'open' or new.state not in ('open', 'resolved') then
    raise exception 'billing reconciliation resolution is terminal';
  end if;
  return new;
end;
$$;

create function check_retail_billing_reconciliation_consistency()
returns trigger language plpgsql as $$
declare
  reservation_state text;
  case_state text;
begin
  select state into reservation_state from billing_reservations
   where operation_id = new.operation_id and tenant_id = new.tenant_id;
  select state into case_state from billing_reconciliation_cases
   where operation_id = new.operation_id and tenant_id = new.tenant_id;
  if reservation_state = 'reconciliation_required' and case_state is distinct from 'open'
    or reservation_state in ('settled', 'released') and case_state = 'open'
    or case_state = 'open' and reservation_state <> 'reconciliation_required'
    or case_state = 'resolved' and reservation_state not in ('settled', 'released') then
    raise exception 'retail reconciliation case must match its reservation state';
  end if;
  return null;
end;
$$;

create constraint trigger billing_reconciliation_reservation_consistency
after insert or update on billing_reservations deferrable initially deferred
for each row execute function check_retail_billing_reconciliation_consistency();

create constraint trigger billing_reconciliation_case_consistency
after insert or update on billing_reconciliation_cases deferrable initially deferred
for each row execute function check_retail_billing_reconciliation_consistency();
