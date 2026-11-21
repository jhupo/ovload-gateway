-- Tenant-owned USD retail billing. Provider procurement pricing remains in its
-- existing provider-owned records and is never used as a customer tariff.

create table retail_price_book_revisions (
  id uuid primary key default gen_random_uuid(),
  revision_no bigint not null unique,
  status text not null default 'draft',
  effective_at timestamptz not null,
  created_by uuid not null references identity_management_principals(id) on delete restrict,
  published_by uuid references identity_management_principals(id) on delete restrict,
  checksum bytea,
  created_at timestamptz not null default now(),
  published_at timestamptz,
  retired_at timestamptz,
  updated_at timestamptz not null default now(),
  constraint retail_price_book_revision_number_ck check (revision_no > 0),
  constraint retail_price_book_revision_status_ck check (status in ('draft', 'published', 'retired')),
  constraint retail_price_book_revision_checksum_ck check (checksum is null or octet_length(checksum) = 32),
  constraint retail_price_book_revision_state_ck check (
    (status = 'draft' and published_at is null and published_by is null and retired_at is null)
    or (status = 'published' and published_at is not null and published_by is not null
      and checksum is not null and retired_at is null)
    or (status = 'retired' and published_at is not null and published_by is not null
      and checksum is not null and retired_at is not null)
  ),
  constraint retail_price_book_revision_time_ck check (created_at <= updated_at)
);

create unique index retail_price_book_one_published_uq
  on retail_price_book_revisions ((status)) where status = 'published';

create table retail_time_bands (
  revision_id uuid not null references retail_price_book_revisions(id) on delete restrict,
  id text not null,
  timezone text not null,
  weekdays smallint[] not null,
  local_start_minute smallint not null,
  local_end_minute smallint not null,
  created_at timestamptz not null default now(),
  primary key (revision_id, id),
  constraint retail_time_bands_id_ck check (
    octet_length(id) between 1 and 64 and id = btrim(id) and id !~ '[[:cntrl:]]'
  ),
  constraint retail_time_bands_timezone_ck check (
    octet_length(timezone) between 1 and 128 and timezone = btrim(timezone)
  ),
  constraint retail_time_bands_weekdays_ck check (
    cardinality(weekdays) between 1 and 7
    and array_position(weekdays, null) is null
    and weekdays <@ array[1,2,3,4,5,6,7]::smallint[]
  ),
  constraint retail_time_bands_minutes_ck check (
    local_start_minute between 0 and 1439
    and local_end_minute between 1 and 1440
    and local_start_minute < local_end_minute
  )
);

create table retail_rate_cards (
  id uuid primary key default gen_random_uuid(),
  revision_id uuid not null references retail_price_book_revisions(id) on delete restrict,
  account_group_id text references account_groups(id) on delete restrict,
  public_model_id text not null,
  service_tier text not null,
  time_band_id text not null,
  context_min_tokens bigint not null default 0,
  context_max_tokens bigint,
  created_at timestamptz not null default now(),
  constraint retail_rate_cards_revision_id_uq unique (revision_id, id),
  constraint retail_rate_cards_revision_time_band_fk
    foreign key (revision_id, time_band_id) references retail_time_bands(revision_id, id) on delete restrict,
  constraint retail_rate_cards_model_ck check (
    octet_length(public_model_id) between 1 and 256
    and public_model_id = btrim(public_model_id)
    and public_model_id !~ '[[:cntrl:]]'
  ),
  constraint retail_rate_cards_tier_ck check (
    octet_length(service_tier) between 1 and 64
    and service_tier = btrim(service_tier)
    and service_tier !~ '[[:cntrl:]]'
  ),
  constraint retail_rate_cards_context_ck check (
    context_min_tokens >= 0 and (context_max_tokens is null or context_max_tokens > context_min_tokens)
  )
);

create unique index retail_rate_cards_selector_uq
  on retail_rate_cards (
    revision_id,
    coalesce(account_group_id, ''),
    public_model_id,
    service_tier,
    time_band_id,
    context_min_tokens
  );
create index retail_rate_cards_lookup_idx
  on retail_rate_cards (revision_id, public_model_id, service_tier, account_group_id);

create table retail_rates (
  id uuid primary key default gen_random_uuid(),
  rate_card_id uuid not null references retail_rate_cards(id) on delete restrict,
  dimension text not null,
  unit text not null,
  billable boolean not null,
  rate_usd_per_unit numeric(20,10) not null,
  created_at timestamptz not null default now(),
  constraint retail_rates_card_dimension_uq unique (rate_card_id, dimension),
  constraint retail_rates_amount_ck check (
    rate_usd_per_unit >= 0
    and ((billable and rate_usd_per_unit > 0) or (not billable and rate_usd_per_unit = 0))
  ),
  constraint retail_rates_unit_ck check (
    (dimension in ('input_tokens', 'cache_read_tokens', 'cache_write_tokens_5m',
       'cache_write_tokens_1h', 'output_tokens', 'audio_input_tokens', 'audio_output_tokens')
      and unit = 'per_1m_tokens')
    or (dimension in ('image_input', 'image_output') and unit = 'per_image')
    or (dimension in ('audio_input_seconds', 'audio_output_seconds') and unit = 'per_audio_second')
    or (dimension in ('search_calls', 'tool_calls') and unit = 'per_call')
    or (dimension = 'request_fee' and unit = 'per_request')
  )
);

create function enforce_retail_price_revision_transition()
returns trigger language plpgsql as $$
begin
  if tg_op = 'DELETE' then
    raise exception 'retail price book revisions cannot be deleted';
  end if;
  if old.id is distinct from new.id
    or old.revision_no is distinct from new.revision_no
    or old.created_by is distinct from new.created_by
    or old.created_at is distinct from new.created_at then
    raise exception 'retail price book revision identity is immutable';
  end if;
  if old.status = 'draft' and new.status in ('draft', 'published') then
    if new.updated_at < old.updated_at then
      raise exception 'retail price book update time cannot move backwards';
    end if;
    if new.status = 'published' then
      if not exists (select 1 from retail_rate_cards where revision_id = old.id) then
        raise exception 'a retail price book must contain at least one complete rate card';
      end if;
      if exists (
        select 1
          from retail_rate_cards card
         where card.revision_id = old.id
           and not (
             exists (select 1 from retail_rates rate where rate.rate_card_id = card.id and rate.dimension = 'input_tokens')
             and exists (select 1 from retail_rates rate where rate.rate_card_id = card.id and rate.dimension = 'cache_read_tokens')
             and exists (select 1 from retail_rates rate where rate.rate_card_id = card.id and rate.dimension = 'cache_write_tokens_5m')
             and exists (select 1 from retail_rates rate where rate.rate_card_id = card.id and rate.dimension = 'cache_write_tokens_1h')
             and exists (select 1 from retail_rates rate where rate.rate_card_id = card.id and rate.dimension = 'output_tokens')
           )
      ) then
        raise exception 'every retail rate card must explicitly price or mark free all text billing dimensions';
      end if;
      if exists (
        select 1
          from retail_rate_cards first_card
          join retail_rate_cards second_card
            on second_card.revision_id = first_card.revision_id
           and second_card.id <> first_card.id
           and coalesce(second_card.account_group_id, '') = coalesce(first_card.account_group_id, '')
           and second_card.public_model_id = first_card.public_model_id
           and second_card.service_tier = first_card.service_tier
           and second_card.time_band_id = first_card.time_band_id
           and first_card.context_min_tokens < coalesce(second_card.context_max_tokens, 9223372036854775807)
           and second_card.context_min_tokens < coalesce(first_card.context_max_tokens, 9223372036854775807)
         where first_card.revision_id = old.id
      ) then
        raise exception 'retail context bands cannot overlap within a model, group, service tier, and time band';
      end if;
    end if;
    return new;
  end if;
  if old.status = 'published' and new.status = 'retired'
    and old.effective_at = new.effective_at
    and old.published_by = new.published_by
    and old.checksum = new.checksum
    and old.published_at = new.published_at
    and new.retired_at is not null
    and new.updated_at >= old.updated_at then
    return new;
  end if;
  raise exception 'published retail price books are immutable and retirement is terminal';
end
$$;

create trigger retail_price_book_revision_transition
before update or delete on retail_price_book_revisions
for each row execute function enforce_retail_price_revision_transition();

create function enforce_retail_price_book_draft()
returns trigger language plpgsql as $$
declare
  old_revision uuid;
  new_revision uuid;
  revision_status text;
begin
  if tg_op in ('UPDATE', 'DELETE') then
    old_revision := old.revision_id;
    select status into revision_status
      from retail_price_book_revisions where id = old_revision for share;
    if revision_status is distinct from 'draft' then
      raise exception 'retail price book rows cannot be changed or moved out of a published revision';
    end if;
  end if;
  if tg_op in ('INSERT', 'UPDATE') then
    new_revision := new.revision_id;
    select status into revision_status
      from retail_price_book_revisions where id = new_revision for share;
    if revision_status is distinct from 'draft' then
      raise exception 'retail price book rows cannot be changed or moved into a published revision';
    end if;
  end if;
  if tg_op = 'DELETE' then
    return old;
  end if;
  return new;
end
$$;

create trigger retail_time_band_draft_only
before insert or update or delete on retail_time_bands
for each row execute function enforce_retail_price_book_draft();

create trigger retail_rate_card_draft_only
before insert or update or delete on retail_rate_cards
for each row execute function enforce_retail_price_book_draft();

create function enforce_retail_rate_draft()
returns trigger language plpgsql as $$
declare
  old_card uuid;
  new_card uuid;
  revision_status text;
begin
  if tg_op in ('UPDATE', 'DELETE') then
    old_card := old.rate_card_id;
    select revision.status into revision_status
      from retail_rate_cards card
      join retail_price_book_revisions revision on revision.id = card.revision_id
      where card.id = old_card for share of revision;
    if revision_status is distinct from 'draft' then
      raise exception 'retail rates cannot be changed or moved out of a published revision';
    end if;
  end if;
  if tg_op in ('INSERT', 'UPDATE') then
    new_card := new.rate_card_id;
    select revision.status into revision_status
      from retail_rate_cards card
      join retail_price_book_revisions revision on revision.id = card.revision_id
      where card.id = new_card for share of revision;
    if revision_status is distinct from 'draft' then
      raise exception 'retail rates cannot be changed or moved into a published revision';
    end if;
  end if;
  if tg_op = 'DELETE' then
    return old;
  end if;
  return new;
end
$$;

create trigger retail_rate_draft_only
before insert or update or delete on retail_rates
for each row execute function enforce_retail_rate_draft();

-- The wallet balance remains the settled-balance projection. Holds reduce its
-- available amount and are independently serialized against this same row.
alter table identity_tenant_wallets
  add column held_usd numeric(20,10) not null default 0,
  add constraint identity_tenant_wallets_held_ck check (held_usd >= 0 and balance_usd >= held_usd);

alter table client_api_keys
  add constraint client_api_keys_billing_owner_uq
    unique (id, tenant_id, user_id, wallet_tenant_id, account_group_id);

create table billing_reservations (
  operation_id text primary key,
  tenant_id uuid not null references identity_tenants(id) on delete restrict,
  user_id uuid not null,
  model_key_id text not null,
  account_group_id text not null references account_groups(id) on delete restrict,
  wallet_tenant_id uuid not null references identity_tenant_wallets(tenant_id) on delete restrict,
  requested_public_model_id text not null,
  service_tier text not null,
  price_revision_id uuid not null references retail_price_book_revisions(id) on delete restrict,
  rate_card_id uuid not null,
  quote_usd numeric(20,10) not null,
  latest_settled_charge_usd numeric(20,10) not null,
  initial_hold_usd numeric(20,10) not null,
  reserved_usd numeric(20,10) not null,
  held_usd numeric(20,10) not null,
  settled_usd numeric(20,10) not null default 0,
  released_usd numeric(20,10) not null default 0,
  effective_multiplier_bps integer not null,
  input_token_bound bigint not null,
  output_token_bound bigint not null,
  quote_bounds jsonb not null,
  frozen_price_snapshot jsonb not null,
  state text not null default 'held',
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  settled_at timestamptz,
  constraint billing_reservations_operation_ck check (
    octet_length(operation_id) between 1 and 128 and operation_id = btrim(operation_id)
  ),
  constraint billing_reservations_owner_fk foreign key (tenant_id, user_id)
    references identity_users(tenant_id, id) on delete restrict,
  constraint billing_reservations_model_key_owner_fk
    foreign key (model_key_id, tenant_id, user_id, wallet_tenant_id, account_group_id)
    references client_api_keys(id, tenant_id, user_id, wallet_tenant_id, account_group_id) on delete restrict,
  constraint billing_reservations_price_card_fk foreign key (price_revision_id, rate_card_id)
    references retail_rate_cards(revision_id, id) on delete restrict,
  constraint billing_reservations_wallet_tenant_ck check (wallet_tenant_id = tenant_id),
  constraint billing_reservations_public_model_ck check (
    octet_length(requested_public_model_id) between 1 and 256
    and requested_public_model_id = btrim(requested_public_model_id)
  ),
  constraint billing_reservations_tier_ck check (
    octet_length(service_tier) between 1 and 64 and service_tier = btrim(service_tier)
  ),
  constraint billing_reservations_money_ck check (
    quote_usd >= 0 and latest_settled_charge_usd >= 0 and initial_hold_usd >= 0
    and reserved_usd >= 0 and held_usd >= 0 and settled_usd >= 0 and released_usd >= 0
    and reserved_usd = held_usd + settled_usd + released_usd
    and initial_hold_usd <= reserved_usd
    and initial_hold_usd = greatest(quote_usd, latest_settled_charge_usd * 2)
  ),
  constraint billing_reservations_policy_ck check (
    effective_multiplier_bps between 0 and 1000000
    and input_token_bound > 0 and output_token_bound > 0
    and jsonb_typeof(quote_bounds) = 'object'
    and jsonb_typeof(frozen_price_snapshot) = 'object'
  ),
  constraint billing_reservations_state_ck check (
    (state in ('held', 'reconciliation_required') and settled_at is null
      and settled_usd = 0 and released_usd = 0)
    or (state = 'settled' and held_usd = 0 and settled_at is not null)
    or (state = 'released' and held_usd = 0 and settled_usd = 0 and settled_at is not null)
  ),
  constraint billing_reservations_time_ck check (created_at <= updated_at)
);

create unique index billing_reservations_operation_tenant_uq
  on billing_reservations (operation_id, tenant_id);
create index billing_reservations_wallet_state_idx
  on billing_reservations (wallet_tenant_id, state, created_at, operation_id);
create index billing_reservations_history_idx
  on billing_reservations (
    tenant_id, model_key_id, wallet_tenant_id, account_group_id,
    requested_public_model_id, service_tier, settled_at desc, operation_id desc
  ) where state = 'settled';

create function enforce_billing_reservation_transition()
returns trigger language plpgsql as $$
declare
  wallet_balance numeric(20,10);
  wallet_held numeric(20,10);
begin
  if tg_op = 'DELETE' then
    raise exception 'billing reservations cannot be deleted';
  end if;
  new.updated_at := clock_timestamp();
  if new.state in ('settled', 'released') and old.state not in ('settled', 'released') then
    new.settled_at := new.updated_at;
  end if;
  if old.operation_id is distinct from new.operation_id
    or old.tenant_id is distinct from new.tenant_id
    or old.user_id is distinct from new.user_id
    or old.model_key_id is distinct from new.model_key_id
    or old.account_group_id is distinct from new.account_group_id
    or old.wallet_tenant_id is distinct from new.wallet_tenant_id
    or old.requested_public_model_id is distinct from new.requested_public_model_id
    or old.service_tier is distinct from new.service_tier
    or old.price_revision_id is distinct from new.price_revision_id
    or old.rate_card_id is distinct from new.rate_card_id
    or old.quote_usd is distinct from new.quote_usd
    or old.latest_settled_charge_usd is distinct from new.latest_settled_charge_usd
    or old.initial_hold_usd is distinct from new.initial_hold_usd
    or old.effective_multiplier_bps is distinct from new.effective_multiplier_bps
    or old.input_token_bound is distinct from new.input_token_bound
    or old.output_token_bound is distinct from new.output_token_bound
    or old.quote_bounds is distinct from new.quote_bounds
    or old.frozen_price_snapshot is distinct from new.frozen_price_snapshot
    or old.created_at is distinct from new.created_at then
    raise exception 'billing reservation identity and quote are immutable';
  end if;
  if old.state in ('settled', 'released')
    or not (
      (old.state = 'held' and new.state in ('held', 'settled', 'released', 'reconciliation_required'))
      or (old.state = 'reconciliation_required' and new.state in ('reconciliation_required', 'settled', 'released'))
    ) then
    raise exception 'invalid or terminal billing reservation transition';
  end if;
  if new.updated_at < old.updated_at
    or new.reserved_usd < old.reserved_usd
    or new.settled_usd < old.settled_usd
    or new.released_usd < old.released_usd then
    raise exception 'billing reservation amounts and timestamps are monotonic';
  end if;
  if new.reserved_usd > old.reserved_usd then
    if new.reserved_usd - old.reserved_usd <> new.held_usd - old.held_usd
      or new.settled_usd <> old.settled_usd
      or new.released_usd <> old.released_usd then
      raise exception 'reservation extensions must increase the hold by the same amount';
    end if;
    select balance_usd, held_usd into wallet_balance, wallet_held
      from identity_tenant_wallets where tenant_id = old.wallet_tenant_id for update;
    if not found or wallet_balance - wallet_held < new.held_usd - old.held_usd then
      raise exception 'wallet cannot fund the reservation extension';
    end if;
  end if;
  if new.state in ('held', 'reconciliation_required') then
    if new.settled_usd <> old.settled_usd or new.released_usd <> old.released_usd
      or new.held_usd <> old.held_usd + (new.reserved_usd - old.reserved_usd) then
      raise exception 'open reservations may only retain or extend their hold';
    end if;
  elsif new.state = 'settled' then
    if new.reserved_usd <> old.reserved_usd or new.held_usd <> 0
      or new.settled_usd - old.settled_usd + new.released_usd - old.released_usd <> old.held_usd then
      raise exception 'settlement must consume or release the complete remaining hold';
    end if;
  elsif new.state = 'released' then
    if new.reserved_usd <> old.reserved_usd or new.settled_usd <> 0
      or new.held_usd <> 0 or new.released_usd - old.released_usd <> old.held_usd then
      raise exception 'release must return the complete remaining hold';
    end if;
  end if;
  return new;
end
$$;

create trigger billing_reservation_transition
before update or delete on billing_reservations
for each row execute function enforce_billing_reservation_transition();

create function check_wallet_reservation_funds()
returns trigger language plpgsql as $$
declare
  wallet_balance numeric(20,10);
  wallet_held numeric(20,10);
begin
  if tg_op = 'INSERT' then
    if new.state <> 'held' or new.reserved_usd <> new.initial_hold_usd
      or new.held_usd <> new.initial_hold_usd or new.settled_usd <> 0 or new.released_usd <> 0 then
      raise exception 'a wallet reservation must begin with its complete initial hold';
    end if;
    select balance_usd, held_usd into wallet_balance, wallet_held
      from identity_tenant_wallets where tenant_id = new.wallet_tenant_id for update;
    if not found or wallet_balance - wallet_held < new.initial_hold_usd then
      raise exception 'wallet has insufficient available funds';
    end if;
  elsif new.reserved_usd > old.reserved_usd then
    select balance_usd, held_usd into wallet_balance, wallet_held
      from identity_tenant_wallets where tenant_id = new.wallet_tenant_id for update;
    if not found or wallet_balance - wallet_held < new.reserved_usd - old.reserved_usd then
      raise exception 'wallet has insufficient available funds for the reservation extension';
    end if;
  end if;
  return new;
end
$$;

create trigger billing_reservation_funds
before insert or update on billing_reservations
for each row execute function check_wallet_reservation_funds();

create function project_wallet_held_balance()
returns trigger language plpgsql as $$
declare
  held_delta numeric(20,10);
begin
  if tg_op = 'INSERT' then
    held_delta := new.held_usd;
  else
    held_delta := new.held_usd - old.held_usd;
  end if;
  if held_delta <> 0 then
    update identity_tenant_wallets
       set held_usd = held_usd + held_delta,
           revision = revision + 1,
           updated_at = clock_timestamp()
     where tenant_id = new.wallet_tenant_id;
    if not found then
      raise exception 'tenant wallet is unavailable';
    end if;
  end if;
  return new;
end
$$;

create trigger billing_reservation_wallet_hold_projection
after insert or update on billing_reservations
for each row execute function project_wallet_held_balance();

create table wallet_ledger_entries (
  id uuid primary key default gen_random_uuid(),
  tenant_id uuid not null references identity_tenants(id) on delete restrict,
  direction text not null,
  entry_kind text not null,
  amount_usd numeric(20,10) not null,
  source_id uuid,
  operation_id text,
  related_entry_id uuid,
  idempotency_key text not null,
  created_at timestamptz not null default now(),
  constraint wallet_ledger_entries_tenant_id_uq unique (tenant_id, id),
  constraint wallet_ledger_entries_related_fk foreign key (tenant_id, related_entry_id)
    references wallet_ledger_entries(tenant_id, id) on delete restrict,
  constraint wallet_ledger_entries_operation_fk foreign key (operation_id, tenant_id)
    references billing_reservations(operation_id, tenant_id) on delete restrict,
  constraint wallet_ledger_entries_direction_ck check (direction in ('credit', 'debit')),
  constraint wallet_ledger_entries_kind_ck check (
    (entry_kind = 'operator_credit' and direction = 'credit' and source_id is not null and operation_id is null and related_entry_id is null)
    or (entry_kind = 'customer_usage' and direction = 'debit' and source_id is null and operation_id is not null and related_entry_id is null)
    or (entry_kind = 'migration_opening' and direction = 'credit' and source_id = tenant_id and operation_id is null and related_entry_id is null)
    or (entry_kind = 'correction_credit' and direction = 'credit' and related_entry_id is not null and operation_id is null)
    or (entry_kind = 'correction_debit' and direction = 'debit' and related_entry_id is not null and operation_id is null)
  ),
  constraint wallet_ledger_entries_amount_ck check (amount_usd > 0),
  constraint wallet_ledger_entries_idempotency_ck check (
    octet_length(idempotency_key) between 1 and 128 and idempotency_key = btrim(idempotency_key)
  )
);

create unique index wallet_ledger_entries_idempotency_uq
  on wallet_ledger_entries (tenant_id, idempotency_key);
create unique index wallet_ledger_entries_usage_operation_uq
  on wallet_ledger_entries (tenant_id, operation_id) where entry_kind = 'customer_usage';
create unique index wallet_ledger_entries_source_uq
  on wallet_ledger_entries (tenant_id, entry_kind, source_id) where source_id is not null;
create index wallet_ledger_entries_tenant_history_idx
  on wallet_ledger_entries (tenant_id, created_at desc, id desc);

insert into wallet_ledger_entries (
  tenant_id, direction, entry_kind, amount_usd, source_id, idempotency_key
)
select tenant_id, 'credit', 'migration_opening', balance_usd, tenant_id,
       'migration:0037:opening:' || tenant_id::text
  from identity_tenant_wallets
 where balance_usd > 0;

create table wallet_credit_commands (
  id uuid primary key default gen_random_uuid(),
  tenant_id uuid not null references identity_tenants(id) on delete restrict,
  actor_principal_id uuid not null references identity_management_principals(id) on delete restrict,
  session_id uuid not null references identity_sessions(id) on delete restrict,
  idempotency_key text not null,
  fingerprint bytea not null,
  created_at timestamptz not null default now(),
  constraint wallet_credit_commands_tenant_id_uq unique (tenant_id, id),
  constraint wallet_credit_commands_idempotency_uq unique (tenant_id, actor_principal_id, idempotency_key),
  constraint wallet_credit_commands_key_ck check (
    octet_length(idempotency_key) between 1 and 128 and idempotency_key = btrim(idempotency_key)
  ),
  constraint wallet_credit_commands_fingerprint_ck check (octet_length(fingerprint) = 32)
);

create table wallet_credit_grants (
  id uuid primary key default gen_random_uuid(),
  tenant_id uuid not null references identity_tenants(id) on delete restrict,
  command_id uuid not null unique,
  ledger_entry_id uuid not null unique,
  amount_usd numeric(20,10) not null,
  balance_after_usd numeric(20,10) not null,
  held_after_usd numeric(20,10) not null,
  reason text not null,
  created_at timestamptz not null default now(),
  constraint wallet_credit_grants_command_fk foreign key (tenant_id, command_id)
    references wallet_credit_commands(tenant_id, id) on delete restrict,
  constraint wallet_credit_grants_ledger_fk foreign key (tenant_id, ledger_entry_id)
    references wallet_ledger_entries(tenant_id, id) on delete restrict,
  constraint wallet_credit_grants_amount_ck check (
    amount_usd > 0 and balance_after_usd >= 0 and held_after_usd >= 0
    and held_after_usd <= balance_after_usd
  ),
  constraint wallet_credit_grants_reason_ck check (
    octet_length(reason) between 1 and 512 and reason = btrim(reason) and reason !~ '[[:cntrl:]]'
  )
);

create table billing_reservation_events (
  id uuid primary key default gen_random_uuid(),
  operation_id text not null,
  tenant_id uuid not null,
  event_kind text not null,
  amount_usd numeric(20,10) not null,
  actor_kind text not null,
  actor_id uuid,
  idempotency_key text not null,
  facts jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now(),
  constraint billing_reservation_events_operation_fk foreign key (operation_id, tenant_id)
    references billing_reservations(operation_id, tenant_id) on delete restrict,
  constraint billing_reservation_events_kind_ck check (
    event_kind in ('reserved', 'extended', 'settled', 'released', 'reconciliation_opened', 'reconciliation_resolved')
  ),
  constraint billing_reservation_events_actor_ck check (
    actor_kind in ('system', 'customer_user', 'management_principal')
  ),
  constraint billing_reservation_events_amount_ck check (amount_usd >= 0),
  constraint billing_reservation_events_idempotency_uq unique (operation_id, idempotency_key),
  constraint billing_reservation_events_json_ck check (jsonb_typeof(facts) = 'object')
);

create table billing_dispatch_intents (
  operation_id text not null,
  tenant_id uuid not null,
  attempt_number integer not null,
  provider_kind text not null,
  upstream_model_id text not null,
  created_at timestamptz not null default now(),
  primary key (operation_id, attempt_number),
  constraint billing_dispatch_intents_operation_fk foreign key (operation_id, tenant_id)
    references billing_reservations(operation_id, tenant_id) on delete restrict,
  constraint billing_dispatch_intents_attempt_ck check (attempt_number > 0),
  constraint billing_dispatch_intents_provider_ck check (
    octet_length(provider_kind) between 1 and 64 and provider_kind = btrim(provider_kind)
  ),
  constraint billing_dispatch_intents_model_ck check (
    octet_length(upstream_model_id) between 1 and 256 and upstream_model_id = btrim(upstream_model_id)
  )
);

create function require_open_billing_dispatch()
returns trigger language plpgsql as $$
declare
  reservation_state text;
begin
  select state into reservation_state
    from billing_reservations
   where operation_id = new.operation_id and tenant_id = new.tenant_id
   for update;
  if reservation_state is distinct from 'held' then
    raise exception 'dispatch intent requires an open held billing reservation';
  end if;
  return new;
end
$$;

create trigger billing_dispatch_requires_hold
before insert on billing_dispatch_intents
for each row execute function require_open_billing_dispatch();

create table billing_dispatch_evidence (
  operation_id text not null,
  tenant_id uuid not null,
  attempt_number integer not null,
  evidence_sequence integer not null,
  outcome text not null,
  evidence_reference text,
  recorded_by text not null,
  actor_id uuid,
  created_at timestamptz not null default now(),
  primary key (operation_id, attempt_number, evidence_sequence),
  constraint billing_dispatch_evidence_intent_fk foreign key (operation_id, attempt_number)
    references billing_dispatch_intents(operation_id, attempt_number) on delete restrict,
  constraint billing_dispatch_evidence_operation_fk foreign key (operation_id, tenant_id)
    references billing_reservations(operation_id, tenant_id) on delete restrict,
  constraint billing_dispatch_evidence_sequence_ck check (evidence_sequence > 0),
  constraint billing_dispatch_evidence_outcome_ck check (outcome in ('not_sent', 'sent', 'ambiguous')),
  constraint billing_dispatch_evidence_actor_ck check (
    recorded_by in ('provider', 'gateway', 'management_principal', 'system')
  ),
  constraint billing_dispatch_evidence_reference_ck check (
    evidence_reference is null or octet_length(evidence_reference) <= 512
  )
);

create table billing_usage_evidence (
  operation_id text not null,
  tenant_id uuid not null,
  evidence_sequence integer not null,
  authority text not null,
  complete boolean not null,
  usage_facts jsonb not null,
  evidence_reference text,
  created_at timestamptz not null default now(),
  primary key (operation_id, evidence_sequence),
  constraint billing_usage_evidence_operation_fk foreign key (operation_id, tenant_id)
    references billing_reservations(operation_id, tenant_id) on delete restrict,
  constraint billing_usage_evidence_sequence_ck check (evidence_sequence > 0),
  constraint billing_usage_evidence_authority_ck check (
    authority in ('provider_reported', 'provider_native', 'operator_reconciled')
  ),
  constraint billing_usage_evidence_facts_ck check (jsonb_typeof(usage_facts) = 'object'),
  constraint billing_usage_evidence_reference_ck check (
    evidence_reference is null or octet_length(evidence_reference) <= 512
  ),
  constraint billing_usage_evidence_tenant_sequence_uq unique (operation_id, tenant_id, evidence_sequence)
);

create table billing_usage_receipts (
  operation_id text primary key,
  tenant_id uuid not null,
  usage_evidence_sequence integer not null,
  authority text not null,
  usage_facts jsonb not null,
  customer_charge_usd numeric(20,10) not null,
  price_revision_id uuid not null references retail_price_book_revisions(id) on delete restrict,
  frozen_price_snapshot jsonb not null,
  dispatch_certainty text not null,
  settled_at timestamptz not null default now(),
  constraint billing_usage_receipts_operation_tenant_uq unique (operation_id, tenant_id),
  constraint billing_usage_receipts_operation_fk foreign key (operation_id, tenant_id)
    references billing_reservations(operation_id, tenant_id) on delete restrict,
  constraint billing_usage_receipts_evidence_fk foreign key (operation_id, tenant_id, usage_evidence_sequence)
    references billing_usage_evidence(operation_id, tenant_id, evidence_sequence) on delete restrict,
  constraint billing_usage_receipts_authority_ck check (
    authority in ('provider_reported', 'provider_native', 'operator_reconciled')
  ),
  constraint billing_usage_receipts_json_ck check (
    jsonb_typeof(usage_facts) = 'object' and jsonb_typeof(frozen_price_snapshot) = 'object'
  ),
  constraint billing_usage_receipts_charge_ck check (customer_charge_usd >= 0),
  constraint billing_usage_receipts_dispatch_ck check (dispatch_certainty in ('sent', 'not_sent'))
);

create table billing_usage_components (
  id uuid primary key default gen_random_uuid(),
  operation_id text not null,
  tenant_id uuid not null,
  rate_id uuid not null references retail_rates(id) on delete restrict,
  dimension text not null,
  unit text not null,
  quantity numeric(30,10) not null,
  unit_rate_usd numeric(20,10) not null,
  charge_usd numeric(20,10) not null,
  created_at timestamptz not null default now(),
  constraint billing_usage_components_receipt_fk foreign key (operation_id, tenant_id)
    references billing_usage_receipts(operation_id, tenant_id) on delete restrict,
  constraint billing_usage_components_amount_ck check (
    quantity >= 0 and unit_rate_usd >= 0 and charge_usd >= 0
  ),
  constraint billing_usage_components_unit_ck check (
    octet_length(unit) between 1 and 32 and unit = btrim(unit)
  ),
  constraint billing_usage_components_dimension_ck check (
    octet_length(dimension) between 1 and 64 and dimension = btrim(dimension)
  ),
  constraint billing_usage_components_operation_dimension_uq unique (operation_id, dimension, unit)
);

create table billing_reconciliation_cases (
  id uuid primary key default gen_random_uuid(),
  operation_id text not null unique,
  tenant_id uuid not null,
  reason text not null,
  state text not null default 'open',
  held_usd numeric(20,10) not null,
  known_charge_usd numeric(20,10),
  unresolved_usd numeric(20,10),
  opened_at timestamptz not null default now(),
  resolved_at timestamptz,
  resolved_by uuid references identity_management_principals(id) on delete restrict,
  resolution text,
  constraint billing_reconciliation_cases_operation_fk foreign key (operation_id, tenant_id)
    references billing_reservations(operation_id, tenant_id) on delete restrict,
  constraint billing_reconciliation_cases_reason_ck check (
    reason in ('dispatch_unknown', 'usage_incomplete', 'usage_unrecognized', 'charge_exceeds_hold', 'settlement_unavailable')
  ),
  constraint billing_reconciliation_cases_state_ck check (
    (state = 'open' and resolved_at is null and resolved_by is null and resolution is null)
    or (state = 'resolved' and resolved_at is not null and resolution is not null
      and octet_length(resolution) between 1 and 512 and resolution = btrim(resolution)
      and resolved_by is not null)
  ),
  constraint billing_reconciliation_cases_money_ck check (
    held_usd >= 0 and (known_charge_usd is null or known_charge_usd >= 0)
    and (unresolved_usd is null or unresolved_usd >= 0)
  )
);
create index billing_reconciliation_open_idx
  on billing_reconciliation_cases (opened_at, operation_id) where state = 'open';

create table billing_reconciliation_events (
  id uuid primary key default gen_random_uuid(),
  case_id uuid not null references billing_reconciliation_cases(id) on delete restrict,
  event_kind text not null,
  actor_kind text not null,
  actor_id uuid,
  facts jsonb not null default '{}'::jsonb,
  idempotency_key text not null,
  created_at timestamptz not null default now(),
  constraint billing_reconciliation_events_kind_ck check (
    event_kind in ('opened', 'evidence_added', 'charge_captured', 'funds_released', 'waived', 'resolved')
  ),
  constraint billing_reconciliation_events_actor_ck check (
    actor_kind in ('system', 'management_principal')
  ),
  constraint billing_reconciliation_events_facts_ck check (jsonb_typeof(facts) = 'object'),
  constraint billing_reconciliation_events_idempotency_uq unique (case_id, idempotency_key)
);

create function enforce_billing_dispatch_evidence_open()
returns trigger language plpgsql as $$
declare
  reservation_state text;
begin
  select state into reservation_state
    from billing_reservations
   where operation_id = new.operation_id and tenant_id = new.tenant_id
   for update;
  if reservation_state not in ('held', 'reconciliation_required') then
    raise exception 'dispatch evidence cannot change after billing operation closure';
  end if;
  return new;
end
$$;

create trigger billing_dispatch_evidence_open
before insert on billing_dispatch_evidence
for each row execute function enforce_billing_dispatch_evidence_open();

create function enforce_billing_usage_evidence_open()
returns trigger language plpgsql as $$
declare
  reservation_state text;
begin
  select state into reservation_state
    from billing_reservations
   where operation_id = new.operation_id and tenant_id = new.tenant_id
   for update;
  if reservation_state not in ('held', 'reconciliation_required') then
    raise exception 'usage evidence cannot be added after billing operation closure';
  end if;
  return new;
end
$$;

create trigger billing_usage_evidence_open
before insert on billing_usage_evidence
for each row execute function enforce_billing_usage_evidence_open();

create function enforce_billing_usage_receipt_evidence()
returns trigger language plpgsql as $$
declare
  reservation billing_reservations%rowtype;
  evidence billing_usage_evidence%rowtype;
  has_sent_attempt boolean;
  has_unknown_attempt boolean;
begin
  select * into reservation from billing_reservations
   where operation_id = new.operation_id and tenant_id = new.tenant_id
   for update;
  if not found or reservation.state not in ('held', 'reconciliation_required') then
    raise exception 'usage receipt requires an open billing reservation';
  end if;
  if new.price_revision_id <> reservation.price_revision_id
    or new.frozen_price_snapshot <> reservation.frozen_price_snapshot then
    raise exception 'usage receipt must retain the reservation price snapshot';
  end if;
  select * into evidence from billing_usage_evidence
   where operation_id = new.operation_id
     and tenant_id = new.tenant_id
     and evidence_sequence = new.usage_evidence_sequence;
  if not found or not evidence.complete
    or evidence.authority <> new.authority
    or evidence.usage_facts <> new.usage_facts then
    raise exception 'usage receipt requires matching complete authoritative evidence';
  end if;
  if new.dispatch_certainty <> 'sent' then
    raise exception 'customer usage receipt requires confirmed dispatch';
  end if;
  select exists (
    select 1 from billing_dispatch_intents intent
     where intent.operation_id = new.operation_id
       and (select evidence.outcome from billing_dispatch_evidence evidence
             where evidence.operation_id = intent.operation_id
               and evidence.attempt_number = intent.attempt_number
             order by evidence.evidence_sequence desc limit 1) = 'sent'
  ), exists (
    select 1 from billing_dispatch_intents intent
     where intent.operation_id = new.operation_id
       and coalesce((select evidence.outcome from billing_dispatch_evidence evidence
                      where evidence.operation_id = intent.operation_id
                        and evidence.attempt_number = intent.attempt_number
                      order by evidence.evidence_sequence desc limit 1), 'ambiguous') = 'ambiguous'
  ) into has_sent_attempt, has_unknown_attempt;
  if not has_sent_attempt or has_unknown_attempt then
    raise exception 'usage receipt requires resolved evidence for every dispatch attempt';
  end if;
  return new;
end
$$;

create trigger billing_usage_receipt_requires_evidence
before insert on billing_usage_receipts
for each row execute function enforce_billing_usage_receipt_evidence();

create function enforce_billing_reservation_final_evidence()
returns trigger language plpgsql as $$
declare
  receipt billing_usage_receipts%rowtype;
  has_unresolved_attempt boolean;
  has_non_not_sent_attempt boolean;
  usage_debit_amount numeric(20,10);
begin
  if new.state not in ('settled', 'released') then
    return new;
  end if;
  select exists (
    select 1 from billing_dispatch_intents intent
     where intent.operation_id = new.operation_id
       and coalesce((select evidence.outcome from billing_dispatch_evidence evidence
                      where evidence.operation_id = intent.operation_id
                        and evidence.attempt_number = intent.attempt_number
                      order by evidence.evidence_sequence desc limit 1), 'ambiguous') = 'ambiguous'
  ) into has_unresolved_attempt;
  if has_unresolved_attempt then
    raise exception 'billing operation cannot close with an unresolved dispatch attempt';
  end if;
  if new.state = 'released' then
    select exists (
      select 1 from billing_dispatch_intents intent
       where intent.operation_id = new.operation_id
         and coalesce((select evidence.outcome from billing_dispatch_evidence evidence
                        where evidence.operation_id = intent.operation_id
                          and evidence.attempt_number = intent.attempt_number
                        order by evidence.evidence_sequence desc limit 1), '') <> 'not_sent'
    ) into has_non_not_sent_attempt;
    if has_non_not_sent_attempt then
      raise exception 'billing reservation may be released only when every attempt is proven not sent';
    end if;
    if exists (select 1 from billing_usage_receipts where operation_id = new.operation_id)
      or exists (select 1 from wallet_ledger_entries where operation_id = new.operation_id and entry_kind = 'customer_usage') then
      raise exception 'a billed operation cannot be released';
    end if;
    return new;
  end if;

  select * into receipt from billing_usage_receipts
   where operation_id = new.operation_id and tenant_id = new.tenant_id;
  if not found
    or receipt.customer_charge_usd <> new.settled_usd
    or receipt.price_revision_id <> new.price_revision_id
    or receipt.dispatch_certainty <> 'sent' then
    raise exception 'settled reservation requires a matching usage receipt';
  end if;
  if new.settled_usd = 0 then
    if exists (select 1 from wallet_ledger_entries where operation_id = new.operation_id and entry_kind = 'customer_usage') then
      raise exception 'zero customer charge cannot create a wallet debit';
    end if;
  else
    select amount_usd into usage_debit_amount from wallet_ledger_entries
     where operation_id = new.operation_id and tenant_id = new.tenant_id and entry_kind = 'customer_usage';
    if not found or usage_debit_amount <> new.settled_usd then
      raise exception 'wallet debit must match the settled customer usage receipt';
    end if;
  end if;
  return new;
end
$$;

create constraint trigger billing_reservation_terminal_evidence
after update on billing_reservations
deferrable initially deferred
for each row execute function enforce_billing_reservation_final_evidence();

create function enforce_wallet_ledger_entry()
returns trigger language plpgsql as $$
declare
  current_balance numeric(20,10);
  receipt billing_usage_receipts%rowtype;
  reservation billing_reservations%rowtype;
begin
  if new.entry_kind = 'operator_credit' then
    if not exists (
      select 1 from wallet_credit_commands credit_command
       where credit_command.id = new.source_id and credit_command.tenant_id = new.tenant_id
    ) then
      raise exception 'operator wallet credit must reference an idempotent credit command';
    end if;
  elsif new.entry_kind = 'migration_opening' then
    raise exception 'opening ledger balances may only be written by migration 0037';
  elsif new.entry_kind = 'customer_usage' then
    select * into receipt from billing_usage_receipts
     where operation_id = new.operation_id and tenant_id = new.tenant_id;
    if not found then
      raise exception 'customer wallet debit must match a usage receipt';
    end if;
    select * into reservation from billing_reservations
     where operation_id = new.operation_id and tenant_id = new.tenant_id;
    if not found or receipt.customer_charge_usd <> new.amount_usd
      or reservation.state <> 'settled' or reservation.settled_usd <> new.amount_usd then
      raise exception 'customer wallet debit must match its settled usage receipt';
    end if;
  end if;
  select balance_usd into current_balance from identity_tenant_wallets
   where tenant_id = new.tenant_id for update;
  if not found then
    raise exception 'tenant wallet is unavailable';
  end if;
  if new.direction = 'debit' and current_balance < new.amount_usd then
    raise exception 'wallet ledger debit exceeds settled balance';
  end if;
  update identity_tenant_wallets
     set balance_usd = case new.direction
       when 'credit' then balance_usd + new.amount_usd
       else balance_usd - new.amount_usd
     end,
     revision = revision + 1,
     updated_at = clock_timestamp()
   where tenant_id = new.tenant_id;
  return new;
end
$$;

create trigger wallet_ledger_projects_balance
after insert on wallet_ledger_entries
for each row execute function enforce_wallet_ledger_entry();

create function enforce_wallet_credit_grant()
returns trigger language plpgsql as $$
declare
  command wallet_credit_commands%rowtype;
  ledger wallet_ledger_entries%rowtype;
  wallet_balance numeric(20,10);
  wallet_held numeric(20,10);
begin
  select * into command from wallet_credit_commands
   where id = new.command_id and tenant_id = new.tenant_id;
  if not found then
    raise exception 'wallet grant requires a durable operator credit command';
  end if;
  select * into ledger from wallet_ledger_entries
   where id = new.ledger_entry_id and tenant_id = new.tenant_id;
  if not found or ledger.entry_kind <> 'operator_credit'
    or ledger.direction <> 'credit' or ledger.source_id <> command.id
    or ledger.amount_usd <> new.amount_usd then
    raise exception 'wallet grant must match its operator credit ledger entry';
  end if;
  select balance_usd, held_usd into wallet_balance, wallet_held
    from identity_tenant_wallets where tenant_id = new.tenant_id for share;
  if not found or wallet_balance <> new.balance_after_usd
    or wallet_held <> new.held_after_usd then
    raise exception 'wallet grant balance snapshot must match the projected wallet';
  end if;
  return new;
end
$$;

create function enforce_wallet_credit_command_session()
returns trigger language plpgsql as $$
declare
  session_active boolean;
begin
  select session.revoked_at is null
       and session.expires_at > clock_timestamp()
       and session.authority_generation = principal.revision
       and principal.status = 'active'
    into session_active
    from identity_sessions session
    join identity_management_principals principal on principal.id = session.principal_id
     where session.id = new.session_id
       and session.principal_id = new.actor_principal_id
       and session.audience = 'management'
   for update of session, principal;
  if session_active is distinct from true then
    raise exception 'wallet credit command requires an active management session';
  end if;
  return new;
end
$$;

create trigger wallet_credit_command_active_session
before insert on wallet_credit_commands
for each row execute function enforce_wallet_credit_command_session();

create trigger wallet_credit_grant_matches_ledger
before insert on wallet_credit_grants
for each row execute function enforce_wallet_credit_grant();

create function enforce_billing_reservation_price()
returns trigger language plpgsql as $$
declare
  revision_status text;
  selected_effective_at timestamptz;
  latest_charge numeric(20,10);
  card retail_rate_cards%rowtype;
begin
  if tg_op <> 'INSERT' then
    return new;
  end if;
  new.created_at := clock_timestamp();
  new.updated_at := new.created_at;
  perform 1 from identity_tenant_wallets
   where tenant_id = new.wallet_tenant_id for update;
  if not found then
    raise exception 'tenant wallet is unavailable';
  end if;
  select revision.status, revision.effective_at into revision_status, selected_effective_at
    from retail_price_book_revisions revision
   where revision.id = new.price_revision_id for share;
  if not found or revision_status not in ('published', 'retired') or selected_effective_at > new.created_at then
    raise exception 'billing reservation requires an effective published retail price revision';
  end if;
  select * into card from retail_rate_cards
   where id = new.rate_card_id and revision_id = new.price_revision_id;
  if not found or card.public_model_id <> new.requested_public_model_id
    or card.service_tier <> new.service_tier
    or card.account_group_id is not null and card.account_group_id <> new.account_group_id
    or card.context_min_tokens <> 0 or card.context_max_tokens is not null then
    raise exception 'billing reservation price card does not cover the requested model, group, tier, and complete context band';
  end if;
  select settled_usd into latest_charge from billing_reservations
   where tenant_id = new.tenant_id
     and model_key_id = new.model_key_id
     and wallet_tenant_id = new.wallet_tenant_id
     and account_group_id = new.account_group_id
     and requested_public_model_id = new.requested_public_model_id
     and service_tier = new.service_tier
     and state = 'settled'
     and settled_usd > 0
   order by settled_at desc, operation_id desc
   limit 1;
  if coalesce(latest_charge, 0) <> new.latest_settled_charge_usd then
    raise exception 'reservation sizing amount must match the latest settled customer charge';
  end if;
  return new;
end
$$;

create trigger billing_reservation_effective_price
before insert on billing_reservations
for each row execute function enforce_billing_reservation_price();

create function enforce_billing_reconciliation_transition()
returns trigger language plpgsql as $$
begin
  if tg_op = 'DELETE' then
    raise exception 'billing reconciliation cases cannot be deleted';
  end if;
  if old.operation_id is distinct from new.operation_id
    or old.tenant_id is distinct from new.tenant_id
    or old.reason is distinct from new.reason
    or old.opened_at is distinct from new.opened_at
    or new.held_usd > old.held_usd
    or old.known_charge_usd is not null and new.known_charge_usd < old.known_charge_usd
    or old.unresolved_usd is not null and new.unresolved_usd > old.unresolved_usd then
    raise exception 'billing reconciliation facts are monotonic and operation-scoped';
  end if;
  if old.state = 'resolved'
    or not ((old.state = 'open' and new.state in ('open', 'resolved'))) then
    raise exception 'billing reconciliation resolution is terminal';
  end if;
  return new;
end
$$;

create trigger billing_reconciliation_transition
before update or delete on billing_reconciliation_cases
for each row execute function enforce_billing_reconciliation_transition();

create function reject_customer_billing_evidence_mutation()
returns trigger language plpgsql as $$
begin
  raise exception 'customer billing evidence is append-only';
end
$$;

create trigger wallet_ledger_entries_append_only
before update or delete on wallet_ledger_entries
for each row execute function reject_customer_billing_evidence_mutation();
create trigger wallet_credit_commands_append_only
before update or delete on wallet_credit_commands
for each row execute function reject_customer_billing_evidence_mutation();
create trigger wallet_credit_grants_append_only
before update or delete on wallet_credit_grants
for each row execute function reject_customer_billing_evidence_mutation();
create trigger billing_reservation_events_append_only
before update or delete on billing_reservation_events
for each row execute function reject_customer_billing_evidence_mutation();
create trigger billing_dispatch_intents_append_only
before update or delete on billing_dispatch_intents
for each row execute function reject_customer_billing_evidence_mutation();
create trigger billing_dispatch_evidence_append_only
before update or delete on billing_dispatch_evidence
for each row execute function reject_customer_billing_evidence_mutation();
create trigger billing_usage_evidence_append_only
before update or delete on billing_usage_evidence
for each row execute function reject_customer_billing_evidence_mutation();
create trigger billing_usage_receipts_append_only
before update or delete on billing_usage_receipts
for each row execute function reject_customer_billing_evidence_mutation();
create trigger billing_usage_components_append_only
before update or delete on billing_usage_components
for each row execute function reject_customer_billing_evidence_mutation();
create trigger billing_reconciliation_events_append_only
before update or delete on billing_reconciliation_events
for each row execute function reject_customer_billing_evidence_mutation();
