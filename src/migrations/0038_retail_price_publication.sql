-- Immediate, versioned publication of immutable complete retail documents.
-- Existing migration bytes and existing financial evidence remain untouched.

alter table retail_price_book_revisions
  add column row_version bigint not null default 1,
  add constraint retail_price_revision_row_version_ck check (row_version > 0);

create sequence retail_price_revision_no_seq as bigint minvalue 1 no cycle;
select setval(
  'retail_price_revision_no_seq',
  coalesce((select max(revision_no) from retail_price_book_revisions), 1),
  exists (select 1 from retail_price_book_revisions)
);
alter sequence retail_price_revision_no_seq
  owned by retail_price_book_revisions.revision_no;
alter table retail_price_book_revisions alter column revision_no
  set default nextval('retail_price_revision_no_seq');

create table retail_price_catalog (
  singleton boolean primary key default true check (singleton),
  generation bigint not null default 1 check (generation > 0),
  published_revision_id uuid references retail_price_book_revisions(id) on delete restrict,
  updated_at timestamptz not null default now()
);

insert into retail_price_catalog (published_revision_id)
select (select id from retail_price_book_revisions where status = 'published');

create function guard_retail_price_revision()
returns trigger language plpgsql as $$
begin
  if tg_op = 'INSERT' then
    if new.status <> 'draft' or new.row_version <> 1 or new.checksum is not null
      or new.published_by is not null or new.published_at is not null or new.retired_at is not null then
      raise exception 'retail revisions must begin as clean drafts';
    end if;
    return new;
  end if;
  if new.row_version <> old.row_version + 1 then
    raise exception 'retail revision version must advance exactly once';
  end if;
  if old.checksum is not null and new.checksum is distinct from old.checksum then
    raise exception 'sealed retail document digest is immutable';
  end if;
  if old.status = 'draft' and new.status = 'draft' then
    if old.checksum is not null or new.checksum is null then
      raise exception 'a complete retail draft can be sealed only once';
    end if;
  elsif old.status = 'draft' and new.status = 'published' then
    if old.checksum is null or new.checksum is null then
      raise exception 'retail publication requires a sealed document';
    end if;
    new.effective_at := clock_timestamp();
    new.published_at := new.effective_at;
    new.updated_at := new.effective_at;
  end if;
  return new;
end;
$$;

create trigger retail_price_revision_guard
before insert or update on retail_price_book_revisions
for each row execute function guard_retail_price_revision();

create or replace function enforce_retail_price_book_draft()
returns trigger language plpgsql as $$
declare
  revision_id uuid;
  revision_status text;
  content_digest bytea;
begin
  if tg_op = 'UPDATE' then
    if old.id is distinct from new.id or old.revision_id is distinct from new.revision_id then
      raise exception 'retail child identity and revision are immutable';
    end if;
  end if;
  if tg_op = 'DELETE' then
    revision_id := old.revision_id;
  else
    revision_id := new.revision_id;
  end if;
  select revision.status, revision.checksum into revision_status, content_digest
    from retail_price_book_revisions revision where revision.id = revision_id for share;
  if not found or revision_status <> 'draft' or content_digest is not null then
    raise exception 'retail document content is immutable after sealing';
  end if;
  if tg_op = 'DELETE' then
    return old;
  end if;
  return new;
end;
$$;

create or replace function enforce_retail_rate_draft()
returns trigger language plpgsql as $$
declare
  selected_card_id uuid;
  revision_status text;
  content_digest bytea;
begin
  if tg_op = 'UPDATE' then
    if old.id is distinct from new.id or old.rate_card_id is distinct from new.rate_card_id then
      raise exception 'retail rate identity and card are immutable';
    end if;
  end if;
  if tg_op = 'DELETE' then
    selected_card_id := old.rate_card_id;
  else
    selected_card_id := new.rate_card_id;
  end if;
  select revision.status, revision.checksum into revision_status, content_digest
    from retail_rate_cards card
    join retail_price_book_revisions revision on revision.id = card.revision_id
   where card.id = selected_card_id for share of card, revision;
  if not found or revision_status <> 'draft' or content_digest is not null then
    raise exception 'retail rates are immutable after document sealing';
  end if;
  if tg_op = 'DELETE' then
    return old;
  end if;
  return new;
end;
$$;

create function guard_retail_price_catalog()
returns trigger language plpgsql as $$
begin
  if tg_op = 'DELETE' then
    raise exception 'the retail price catalog cannot be deleted';
  end if;
  if new.singleton is distinct from old.singleton or new.generation <> old.generation + 1 then
    raise exception 'the retail catalog generation must advance exactly once';
  end if;
  new.updated_at := clock_timestamp();
  return new;
end;
$$;

create trigger retail_price_catalog_version
before update or delete on retail_price_catalog
for each row execute function guard_retail_price_catalog();

create function check_retail_price_catalog_pointer()
returns trigger language plpgsql as $$
declare
  pointer uuid;
  active_revision uuid;
begin
  select published_revision_id into pointer from retail_price_catalog where singleton;
  if not found then
    raise exception 'retail price catalog is unavailable';
  end if;
  select id into active_revision from retail_price_book_revisions
   where status = 'published' and checksum is not null and effective_at <= clock_timestamp();
  if pointer is distinct from active_revision then
    raise exception 'retail catalog pointer must match the effective published revision';
  end if;
  return null;
end;
$$;

create constraint trigger retail_catalog_publication_consistency
after insert or update on retail_price_catalog
deferrable initially deferred
for each row execute function check_retail_price_catalog_pointer();

create constraint trigger retail_revision_publication_consistency
after insert or update on retail_price_book_revisions
deferrable initially deferred
for each row execute function check_retail_price_catalog_pointer();

create table retail_price_commands (
  actor_principal_id uuid not null references identity_management_principals(id) on delete restrict,
  session_id uuid not null references identity_sessions(id) on delete restrict,
  command text not null check (command in ('create', 'publish', 'retire')),
  idempotency_key text not null check (
    octet_length(idempotency_key) between 1 and 128 and idempotency_key ~ '^[!-~]+$'
  ),
  fingerprint bytea not null check (octet_length(fingerprint) = 32),
  revision_id uuid not null references retail_price_book_revisions(id) on delete restrict,
  catalog_generation bigint not null check (catalog_generation > 0),
  reason text not null check (
    octet_length(reason) between 1 and 512 and reason = btrim(reason) and reason !~ '[[:cntrl:]]'
  ),
  created_at timestamptz not null default now(),
  primary key (actor_principal_id, command, idempotency_key)
);

create trigger retail_price_commands_append_only
before update or delete on retail_price_commands
for each row execute function reject_customer_billing_evidence_mutation();
