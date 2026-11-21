//! Deadline recovery only records uncertainty; it never infers nonexecution.

use ovload_core::{
    billing::{
        BillingOperationRef, BillingOperationState, BillingUnresolvedReason, RetailBillingError,
    },
    metering::Decimal,
};
use serde_json::json;
use sqlx::{Postgres, Row, Transaction, postgres::PgRow};
use uuid::Uuid;

use super::{PgRetailBillingStore, attempts, commands, db_error, read};

pub(super) async fn open(
    tx: &mut Transaction<'_, Postgres>,
    row: &PgRow,
    reason: BillingUnresolvedReason,
    known: Option<Decimal>,
    key: &str,
) -> Result<(), RetailBillingError> {
    let record = read::record_from_row(row)?;
    if !matches!(
        record.state(),
        BillingOperationState::Held | BillingOperationState::ReconciliationRequired
    ) {
        return Err(RetailBillingError::Conflict);
    }
    if record.state() == BillingOperationState::Held {
        sqlx::query(
            "update billing_reservations set state='reconciliation_required', row_version=row_version+1
             where operation_id=$1 and tenant_id=$2 and state='held'",
        )
        .bind(record.operation().operation_id().as_str())
        .bind(record.operation().tenant_id().as_uuid())
        .execute(&mut **tx).await.map_err(db_error)?;
    }
    let existing = sqlx::query(
        "select id,state,known_charge_usd::text as known_charge_usd
         from billing_reconciliation_cases where operation_id=$1 and tenant_id=$2 for update",
    )
    .bind(record.operation().operation_id().as_str())
    .bind(record.operation().tenant_id().as_uuid())
    .fetch_optional(&mut **tx)
    .await
    .map_err(db_error)?;
    let unresolved = known
        .map(|charge| {
            let amount = if charge > record.held_amount() {
                charge
                    .scaled()
                    .checked_sub(record.held_amount().scaled())
                    .ok_or(RetailBillingError::Unavailable)?
            } else {
                0
            };
            Decimal::from_scaled(amount).map_err(|_| RetailBillingError::Unavailable)
        })
        .transpose()?;
    let (id, event_kind) = if let Some(existing) = existing {
        let state: String = existing.try_get("state").map_err(db_error)?;
        if state != "open" {
            return Err(RetailBillingError::Conflict);
        }
        let saved: Option<String> = existing.try_get("known_charge_usd").map_err(db_error)?;
        let saved: Option<Decimal> = saved
            .map(|value| value.parse())
            .transpose()
            .map_err(|_| RetailBillingError::Unavailable)?;
        if saved
            .zip(known)
            .is_some_and(|(saved, known)| saved != known)
        {
            return Err(RetailBillingError::Conflict);
        }
        let id: Uuid = existing.try_get("id").map_err(db_error)?;
        if saved.is_none() && known.is_some() {
            sqlx::query(
                "update billing_reconciliation_cases
                 set known_charge_usd=$2::text::numeric, unresolved_usd=$3::text::numeric where id=$1",
            )
            .bind(id).bind(known.map(Decimal::canonical)).bind(unresolved.map(Decimal::canonical))
            .execute(&mut **tx).await.map_err(db_error)?;
        }
        (id, "evidence_added")
    } else {
        let id = Uuid::now_v7();
        sqlx::query(
            "insert into billing_reconciliation_cases
             (id,operation_id,tenant_id,reason,held_usd,known_charge_usd,unresolved_usd)
             values ($1,$2,$3,$4,$5::text::numeric,$6::text::numeric,$7::text::numeric)",
        )
        .bind(id)
        .bind(record.operation().operation_id().as_str())
        .bind(record.operation().tenant_id().as_uuid())
        .bind(reason.as_str())
        .bind(record.held_amount().canonical())
        .bind(known.map(Decimal::canonical))
        .bind(unresolved.map(Decimal::canonical))
        .execute(&mut **tx)
        .await
        .map_err(db_error)?;
        (id, "opened")
    };
    let facts = json!({"reason":reason.as_str(),"known_charge_usd":known.map(Decimal::canonical)});
    sqlx::query(
        "insert into billing_reconciliation_events
         (case_id,event_kind,actor_kind,facts,idempotency_key) values ($1,$2,'system',$3,$4)",
    )
    .bind(id)
    .bind(event_kind)
    .bind(&facts)
    .bind(key)
    .execute(&mut **tx)
    .await
    .map_err(db_error)?;
    commands::event(
        tx,
        record.operation(),
        "reconciliation_opened",
        record.held_amount(),
        key,
        facts,
    )
    .await
}

pub(super) async fn resolve(
    tx: &mut Transaction<'_, Postgres>,
    operation: &BillingOperationRef,
    charge: Decimal,
    key: &str,
) -> Result<(), RetailBillingError> {
    let row = sqlx::query(
        "select id,state,known_charge_usd::text as known_charge_usd from billing_reconciliation_cases
         where operation_id=$1 and tenant_id=$2 for update",
    )
    .bind(operation.operation_id().as_str()).bind(operation.tenant_id().as_uuid())
    .fetch_optional(&mut **tx).await.map_err(db_error)?;
    let Some(row) = row else { return Ok(()) };
    let state: String = row.try_get("state").map_err(db_error)?;
    if state != "open" {
        return Err(RetailBillingError::Conflict);
    }
    let known: Option<String> = row.try_get("known_charge_usd").map_err(db_error)?;
    let known: Option<Decimal> = known
        .map(|value| value.parse())
        .transpose()
        .map_err(|_| RetailBillingError::Unavailable)?;
    if known.is_some_and(|known| known != charge) {
        return Err(RetailBillingError::Conflict);
    }
    let id: Uuid = row.try_get("id").map_err(db_error)?;
    sqlx::query(
        "update billing_reconciliation_cases set state='resolved',held_usd=0,
           known_charge_usd=$2::text::numeric,unresolved_usd=0,
           resolved_at=clock_timestamp(),resolved_actor_kind='system',resolution='durable operation completed'
         where id=$1 and state='open'",
    )
    .bind(id).bind(charge.canonical()).execute(&mut **tx).await.map_err(db_error)?;
    sqlx::query(
        "insert into billing_reconciliation_events
         (case_id,event_kind,actor_kind,facts,idempotency_key) values ($1,'resolved','system',$2,$3)",
    )
    .bind(id).bind(json!({"settled_usd":charge.canonical()})).bind(key)
    .execute(&mut **tx).await.map_err(db_error)?;
    commands::event(
        tx,
        operation,
        "reconciliation_resolved",
        charge,
        &format!("resolved:{key}"),
        json!({"case_id":id}),
    )
    .await
}

pub(super) async fn recover_expired(
    store: &PgRetailBillingStore,
    limit: u16,
) -> Result<u64, RetailBillingError> {
    if !(1..=32).contains(&limit) {
        return Err(RetailBillingError::Invalid);
    }
    let mut scan = store.begin().await?;
    let rows = sqlx::query(
        "select operation_id,tenant_id,user_id,model_key_id from billing_reservations
         where state='held' and expires_at<=clock_timestamp()
         order by expires_at,operation_id limit $1",
    )
    .bind(i64::from(limit))
    .fetch_all(&mut *scan)
    .await
    .map_err(db_error)?;
    let operations = rows
        .iter()
        .map(read::operation_from_row)
        .collect::<Result<Vec<_>, _>>()?;
    scan.commit().await.map_err(db_error)?;
    let mut recovered = 0;
    for operation in operations {
        let mut tx = store.begin().await?;
        read::lock_wallet(&mut tx, operation.tenant_id()).await?;
        let row = read::load(&mut tx, &operation).await?;
        let record = read::record_from_row(&row)?;
        if record.state() == BillingOperationState::Held
            && attempts::expired(&mut tx, &record).await?
        {
            open(
                &mut tx,
                &row,
                BillingUnresolvedReason::DispatchUnknown,
                None,
                "expiry",
            )
            .await?;
            recovered += 1;
        }
        tx.commit().await.map_err(db_error)?;
    }
    Ok(recovered)
}
