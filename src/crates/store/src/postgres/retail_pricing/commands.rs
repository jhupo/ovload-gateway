//! Catalog-serialized commands, bounded batch inserts and immutable replay.

use ovload_admin::model::{
    identity_access::{IdentityError, IdentityManagementActor, IdentityResult},
    retail_pricing::{
        ChangePriceRevision, CreatePriceRevision, PriceBookState, PriceCatalogState,
        PriceRevisionDetail, PriceRevisionMutation, PriceRevisionRecord,
    },
};
use ovload_core::{access::Permission, billing::RetailPriceBook, metering::Decimal};
use serde::Serialize;
use sqlx::{Postgres, QueryBuilder, Row as _, Transaction};
use uuid::Uuid;

use super::{PgRetailPricingStore, db_error, load_catalog, read};

pub(super) async fn create(
    store: &PgRetailPricingStore,
    actor: IdentityManagementActor,
    command: CreatePriceRevision,
) -> IdentityResult<PriceRevisionMutation> {
    let mut tx = store.authorized(actor, Permission::BillingManage).await?;
    let catalog = load_catalog(&mut tx, true).await?;
    let fingerprint = command.fingerprint()?;
    if let Some(id) = replay(
        &mut tx,
        actor,
        "create",
        command.idempotency_key(),
        fingerprint,
    )
    .await?
    {
        return finish(tx, catalog, id, true).await;
    }
    if catalog.generation != command.expected_catalog_generation() {
        return Err(IdentityError::Conflict);
    }

    let id = Uuid::now_v7();
    sqlx::query(
        "insert into retail_price_book_revisions (id, effective_at, created_by)
         values ($1, clock_timestamp(), $2)",
    )
    .bind(id)
    .bind(actor.principal_id.as_uuid())
    .execute(&mut *tx)
    .await
    .map_err(db_error)?;
    insert_document(&mut tx, id, command.document()).await?;
    let checksum = command
        .document()
        .checksum()
        .map_err(|_| IdentityError::Invalid)?;
    let sealed = sqlx::query(
        "update retail_price_book_revisions
         set checksum=$2, row_version=row_version+1, updated_at=clock_timestamp()
         where id=$1 and status='draft' and checksum is null",
    )
    .bind(id)
    .bind(checksum.as_slice())
    .execute(&mut *tx)
    .await
    .map_err(db_error)?;
    changed_once(sealed.rows_affected())?;
    let catalog = advance_catalog(&mut tx, &catalog, catalog.published_revision_id).await?;
    record_command(
        &mut tx,
        actor,
        CommandEvidence {
            action: "create",
            idempotency_key: command.idempotency_key(),
            fingerprint,
            revision_id: id,
            generation: catalog.generation,
            reason: command.reason(),
        },
    )
    .await?;
    finish(tx, catalog, id, false).await
}

pub(super) async fn publish(
    store: &PgRetailPricingStore,
    actor: IdentityManagementActor,
    command: ChangePriceRevision,
) -> IdentityResult<PriceRevisionMutation> {
    change(store, actor, command, Transition::Publish).await
}

pub(super) async fn retire(
    store: &PgRetailPricingStore,
    actor: IdentityManagementActor,
    command: ChangePriceRevision,
) -> IdentityResult<PriceRevisionMutation> {
    change(store, actor, command, Transition::Retire).await
}

#[derive(Clone, Copy)]
enum Transition {
    Publish,
    Retire,
}

impl Transition {
    const fn as_str(self) -> &'static str {
        match self {
            Self::Publish => "publish",
            Self::Retire => "retire",
        }
    }
}

async fn change(
    store: &PgRetailPricingStore,
    actor: IdentityManagementActor,
    command: ChangePriceRevision,
    transition: Transition,
) -> IdentityResult<PriceRevisionMutation> {
    let mut tx = store.authorized(actor, Permission::BillingManage).await?;
    let catalog = load_catalog(&mut tx, true).await?;
    let fingerprint = command.fingerprint()?;
    if let Some(id) = replay(
        &mut tx,
        actor,
        transition.as_str(),
        command.idempotency_key(),
        fingerprint,
    )
    .await?
    {
        return finish(tx, catalog, id, true).await;
    }
    if catalog.generation != command.expected_catalog_generation() {
        return Err(IdentityError::Conflict);
    }
    let record = read::load_revision(&mut tx, command.id(), true).await?;
    if record.summary.row_version != command.expected_row_version() {
        return Err(IdentityError::Conflict);
    }

    let pointer = match transition {
        Transition::Publish => {
            if record.summary.state != PriceBookState::Draft {
                return Err(IdentityError::Conflict);
            }
            if let Some(previous) = catalog.published_revision_id {
                retire_row(&mut tx, previous).await?;
            }
            let updated = sqlx::query(
                "update retail_price_book_revisions
                 set status='published', published_by=$2, effective_at=clock_timestamp(),
                     published_at=clock_timestamp(), updated_at=clock_timestamp(), row_version=row_version+1
                 where id=$1 and status='draft' and checksum is not null",
            )
            .bind(command.id())
            .bind(actor.principal_id.as_uuid())
            .execute(&mut *tx)
            .await
            .map_err(db_error)?;
            changed_once(updated.rows_affected())?;
            Some(command.id())
        }
        Transition::Retire => {
            if record.summary.state != PriceBookState::Published
                || catalog.published_revision_id != Some(command.id())
            {
                return Err(IdentityError::Conflict);
            }
            retire_row(&mut tx, command.id()).await?;
            None
        }
    };
    let catalog = advance_catalog(&mut tx, &catalog, pointer).await?;
    record_command(
        &mut tx,
        actor,
        CommandEvidence {
            action: transition.as_str(),
            idempotency_key: command.idempotency_key(),
            fingerprint,
            revision_id: command.id(),
            generation: catalog.generation,
            reason: command.reason(),
        },
    )
    .await?;
    finish(tx, catalog, command.id(), false).await
}

async fn retire_row(tx: &mut Transaction<'_, Postgres>, id: Uuid) -> IdentityResult<()> {
    let result = sqlx::query(
        "update retail_price_book_revisions
         set status='retired', retired_at=clock_timestamp(), updated_at=clock_timestamp(),
             row_version=row_version+1
         where id=$1 and status='published'",
    )
    .bind(id)
    .execute(&mut **tx)
    .await
    .map_err(db_error)?;
    changed_once(result.rows_affected())
}

async fn advance_catalog(
    tx: &mut Transaction<'_, Postgres>,
    current: &PriceCatalogState,
    pointer: Option<Uuid>,
) -> IdentityResult<PriceCatalogState> {
    let expected = i64::try_from(current.generation).map_err(|_| IdentityError::Unavailable)?;
    let next = expected.checked_add(1).ok_or(IdentityError::Unavailable)?;
    let result = sqlx::query(
        "update retail_price_catalog set generation=$2, published_revision_id=$3
         where singleton and generation=$1",
    )
    .bind(expected)
    .bind(next)
    .bind(pointer)
    .execute(&mut **tx)
    .await
    .map_err(db_error)?;
    changed_once(result.rows_affected())?;
    Ok(PriceCatalogState {
        generation: u64::try_from(next).map_err(|_| IdentityError::Unavailable)?,
        published_revision_id: pointer,
    })
}

async fn replay(
    tx: &mut Transaction<'_, Postgres>,
    actor: IdentityManagementActor,
    action: &str,
    key: &str,
    fingerprint: [u8; 32],
) -> IdentityResult<Option<Uuid>> {
    let row = sqlx::query(
        "select fingerprint, revision_id from retail_price_commands
         where actor_principal_id=$1 and command=$2 and idempotency_key=$3",
    )
    .bind(actor.principal_id.as_uuid())
    .bind(action)
    .bind(key)
    .fetch_optional(&mut **tx)
    .await
    .map_err(db_error)?;
    let Some(row) = row else { return Ok(None) };
    let stored: Vec<u8> = row.try_get("fingerprint").map_err(db_error)?;
    if stored.as_slice() != fingerprint {
        return Err(IdentityError::Conflict);
    }
    Ok(Some(row.try_get("revision_id").map_err(db_error)?))
}

struct CommandEvidence<'a> {
    action: &'static str,
    idempotency_key: &'a str,
    fingerprint: [u8; 32],
    revision_id: Uuid,
    generation: u64,
    reason: &'a str,
}

async fn record_command(
    tx: &mut Transaction<'_, Postgres>,
    actor: IdentityManagementActor,
    evidence: CommandEvidence<'_>,
) -> IdentityResult<()> {
    sqlx::query(
        "insert into retail_price_commands
         (actor_principal_id, session_id, command, idempotency_key, fingerprint,
          revision_id, catalog_generation, reason)
         values ($1,$2,$3,$4,$5,$6,$7,$8)",
    )
    .bind(actor.principal_id.as_uuid())
    .bind(actor.session_id.as_uuid())
    .bind(evidence.action)
    .bind(evidence.idempotency_key)
    .bind(evidence.fingerprint.as_slice())
    .bind(evidence.revision_id)
    .bind(i64::try_from(evidence.generation).map_err(|_| IdentityError::Unavailable)?)
    .bind(evidence.reason)
    .execute(&mut **tx)
    .await
    .map_err(db_error)?;
    let audit_action = match evidence.action {
        "create" => "billing.retail_price_created",
        "publish" => "billing.retail_price_published",
        "retire" => "billing.retail_price_retired",
        _ => return Err(IdentityError::Unavailable),
    };
    sqlx::query(
        "insert into identity_audit_events
         (actor_kind, actor_id, session_id, action, target_kind, target_id, reason, metadata)
         values ('management_principal',$1,$2,$3,'retail_price_revision',$4,$5,$6)",
    )
    .bind(actor.principal_id.as_uuid())
    .bind(actor.session_id.to_string())
    .bind(audit_action)
    .bind(evidence.revision_id)
    .bind(evidence.reason)
    .bind(serde_json::json!({"catalog_generation":evidence.generation}))
    .execute(&mut **tx)
    .await
    .map_err(db_error)?;
    Ok(())
}

async fn finish(
    mut tx: Transaction<'_, Postgres>,
    catalog: PriceCatalogState,
    id: Uuid,
    replayed: bool,
) -> IdentityResult<PriceRevisionMutation> {
    let revision: PriceRevisionRecord = read::load_revision(&mut tx, id, false).await?;
    tx.commit().await.map_err(db_error)?;
    Ok(PriceRevisionMutation {
        detail: PriceRevisionDetail { catalog, revision },
        replayed,
    })
}

fn changed_once(rows: u64) -> IdentityResult<()> {
    if rows != 1 {
        return Err(IdentityError::Conflict);
    }
    Ok(())
}

struct NewRateRow {
    id: Uuid,
    card_id: Uuid,
    dimension: String,
    unit: String,
    billable: bool,
    usd: String,
}

async fn insert_document(
    tx: &mut Transaction<'_, Postgres>,
    id: Uuid,
    document: &RetailPriceBook,
) -> IdentityResult<()> {
    sqlx::query(
        "insert into retail_time_bands
         (revision_id,id,timezone,weekdays,local_start_minute,local_end_minute)
         values ($1,'always','UTC',array[1,2,3,4,5,6,7]::smallint[],0,1440)",
    )
    .bind(id)
    .execute(&mut **tx)
    .await
    .map_err(db_error)?;

    let cards: Vec<_> = document
        .cards()
        .iter()
        .map(|card| (Uuid::now_v7(), card))
        .collect();
    let mut query = QueryBuilder::<Postgres>::new(
        "insert into retail_rate_cards
         (id,revision_id,account_group_id,public_model_id,service_tier,time_band_id,
          context_min_tokens,context_max_tokens) ",
    );
    query.push_values(&cards, |mut row, (card_id, card)| {
        row.push_bind(*card_id)
            .push_bind(id)
            .push_bind(card.account_group_id().map(|group| group.as_str()))
            .push_bind(card.public_model_id())
            .push_bind(card.service_tier())
            .push_bind("always")
            .push_bind(0_i64)
            .push_bind(None::<i64>);
    });
    query.build().execute(&mut **tx).await.map_err(db_error)?;

    let mut rates = Vec::new();
    for (card_id, card) in &cards {
        for rate in card.rates().rates() {
            rates.push(NewRateRow {
                id: Uuid::now_v7(),
                card_id: *card_id,
                dimension: enum_string(rate.dimension())?,
                unit: enum_string(rate.denominator())?,
                billable: rate.usd_per_unit() != Decimal::ZERO,
                usd: rate.usd_per_unit().canonical(),
            });
        }
    }
    let mut query = QueryBuilder::<Postgres>::new(
        "insert into retail_rates (id,rate_card_id,dimension,unit,billable,rate_usd_per_unit) ",
    );
    query.push_values(&rates, |mut row, rate| {
        row.push_bind(rate.id)
            .push_bind(rate.card_id)
            .push_bind(&rate.dimension)
            .push_bind(&rate.unit)
            .push_bind(rate.billable)
            .push_bind(&rate.usd)
            .push_unseparated("::text::numeric");
    });
    query.build().execute(&mut **tx).await.map_err(db_error)?;
    Ok(())
}

fn enum_string(value: impl Serialize) -> IdentityResult<String> {
    match serde_json::to_value(value).map_err(|_| IdentityError::Unavailable)? {
        serde_json::Value::String(value) => Ok(value),
        _ => Err(IdentityError::Unavailable),
    }
}
