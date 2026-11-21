//! Fresh, non-replayable dispatch intents and monotonic bounded evidence.

use ovload_core::{
    billing::{
        BeginRetailDispatch, BillingDispatchEvidence, BillingOperationRef, BillingOperationState,
        RecordRetailDispatch, RetailBillingError,
    },
    metering::Decimal,
    routing::AccountGroupId,
};
use serde_json::json;
use sqlx::{Postgres, Row, Transaction};

use super::{PgRetailBillingStore, authority_error, bigint, commands, db_error, read, tariff};

pub(super) async fn begin(
    store: &PgRetailBillingStore,
    command: BeginRetailDispatch,
) -> Result<(), RetailBillingError> {
    let mut tx = store.begin().await?;
    let group: Option<String> = sqlx::query_scalar(
        "select account_group_id from billing_reservations
         where operation_id=$1 and tenant_id=$2 and user_id=$3 and model_key_id=$4",
    )
    .bind(command.operation().operation_id().as_str())
    .bind(command.operation().tenant_id().as_uuid())
    .bind(command.operation().user_id().as_uuid())
    .bind(command.operation().key_id().as_str())
    .fetch_optional(&mut *tx)
    .await
    .map_err(db_error)?;
    let group = AccountGroupId::new(group.ok_or(RetailBillingError::NotFound)?)
        .map_err(|_| RetailBillingError::Unavailable)?;
    super::super::model_keys::lock_model_key_authority(&mut tx, command.identity(), &group)
        .await
        .map_err(authority_error)?;
    read::lock_wallet(&mut tx, command.operation().tenant_id()).await?;
    let row = read::load(&mut tx, command.operation()).await?;
    let record = read::record_from_row(&row)?;
    let identity = command.identity();
    if read::positive(row.try_get("key_generation").map_err(db_error)?)? != identity.key_generation
        || read::positive(row.try_get("user_generation").map_err(db_error)?)?
            != identity.user_generation
        || read::positive(row.try_get("tenant_generation").map_err(db_error)?)?
            != identity.tenant_generation
    {
        return Err(RetailBillingError::Unauthorized);
    }
    if record.state() != BillingOperationState::Held || expired(&mut tx, &record).await? {
        return Err(RetailBillingError::Conflict);
    }
    tariff::frozen(&mut tx, &row).await?;
    let previous = outcomes(&mut tx, command.operation()).await?;
    if previous.len() >= 100
        || usize::try_from(command.attempt().number()).ok() != Some(previous.len() + 1)
        || previous
            .iter()
            .any(|(_, outcome)| *outcome != Some(BillingDispatchEvidence::NotSent))
    {
        return Err(RetailBillingError::Conflict);
    }
    let attempt = command.attempt();
    let fingerprint = command.fingerprint()?;
    super::super::model_keys::lock_model_key_authority(&mut tx, command.identity(), &group)
        .await
        .map_err(authority_error)?;
    sqlx::query(
        "insert into billing_dispatch_intents
         (operation_id,tenant_id,attempt_number,provider_kind,upstream_model_id,
          provider_account_id,request_profile_generation,egress_generation,fingerprint)
         values ($1,$2,$3,$4,$5,$6,$7,$8,$9)",
    )
    .bind(command.operation().operation_id().as_str())
    .bind(command.operation().tenant_id().as_uuid())
    .bind(i32::try_from(attempt.number()).map_err(|_| RetailBillingError::Invalid)?)
    .bind(attempt.provider().as_str())
    .bind(attempt.upstream_model().as_str())
    .bind(attempt.provider_account().as_str())
    .bind(bigint(attempt.request_profile_generation())?)
    .bind(bigint(attempt.egress_generation())?)
    .bind(fingerprint.as_slice())
    .execute(&mut *tx)
    .await
    .map_err(db_error)?;
    commands::event(
        &mut tx,
        command.operation(),
        "dispatch_intent",
        Decimal::ZERO,
        &format!("dispatch-intent:{}", attempt.number()),
        json!({
            "attempt":attempt.number(),"fingerprint":hex::encode(fingerprint),
        }),
    )
    .await?;
    tx.commit().await.map_err(db_error)
}

pub(super) async fn record(
    store: &PgRetailBillingStore,
    command: RecordRetailDispatch,
) -> Result<(), RetailBillingError> {
    let mut tx = store.begin().await?;
    read::lock_wallet(&mut tx, command.operation().tenant_id()).await?;
    let row = read::load(&mut tx, command.operation()).await?;
    let fingerprint = command.fingerprint()?;
    if commands::replay(
        &mut tx,
        command.operation(),
        "record_dispatch",
        command.idempotency_key(),
        fingerprint,
    )
    .await?
    {
        return tx.commit().await.map_err(db_error);
    }
    let operation = read::record_from_row(&row)?;
    if !matches!(
        operation.state(),
        BillingOperationState::Held | BillingOperationState::ReconciliationRequired
    ) {
        return Err(RetailBillingError::Conflict);
    }
    let previous = outcomes(&mut tx, command.operation()).await?;
    let previous = previous
        .iter()
        .find(|(number, _)| *number == command.attempt())
        .ok_or(RetailBillingError::NotFound)?
        .1;
    if previous == Some(command.evidence())
        || previous.is_some_and(|value| value != BillingDispatchEvidence::Ambiguous)
    {
        return Err(RetailBillingError::Conflict);
    }
    let sequence: i32 = sqlx::query_scalar(
        "select coalesce(max(evidence_sequence),0)+1 from billing_dispatch_evidence
         where operation_id=$1 and tenant_id=$2 and attempt_number=$3",
    )
    .bind(command.operation().operation_id().as_str())
    .bind(command.operation().tenant_id().as_uuid())
    .bind(i32::try_from(command.attempt()).map_err(|_| RetailBillingError::Invalid)?)
    .fetch_one(&mut *tx)
    .await
    .map_err(db_error)?;
    if sequence > 2 {
        return Err(RetailBillingError::Conflict);
    }
    sqlx::query(
        "insert into billing_dispatch_evidence
         (operation_id,tenant_id,attempt_number,evidence_sequence,outcome,evidence_reference,recorded_by)
         values ($1,$2,$3,$4,$5,$6,'gateway')",
    )
    .bind(command.operation().operation_id().as_str())
    .bind(command.operation().tenant_id().as_uuid())
    .bind(i32::try_from(command.attempt()).map_err(|_| RetailBillingError::Invalid)?)
    .bind(sequence)
    .bind(command.evidence().as_str())
    .bind(command.reference())
    .execute(&mut *tx)
    .await
    .map_err(db_error)?;
    commands::receipt(
        &mut tx,
        command.operation(),
        "record_dispatch",
        command.idempotency_key(),
        fingerprint,
    )
    .await?;
    commands::event(
        &mut tx,
        command.operation(),
        "dispatch_evidence",
        Decimal::ZERO,
        &commands::event_key("dispatch", fingerprint),
        json!({
            "attempt":command.attempt(),"outcome":command.evidence().as_str(),"sequence":sequence,
        }),
    )
    .await?;
    tx.commit().await.map_err(db_error)
}

pub(super) async fn outcomes(
    tx: &mut Transaction<'_, Postgres>,
    operation: &BillingOperationRef,
) -> Result<Vec<(u32, Option<BillingDispatchEvidence>)>, RetailBillingError> {
    let rows = sqlx::query(
        "select intent.attempt_number,
          (select evidence.outcome from billing_dispatch_evidence evidence
           where evidence.operation_id=intent.operation_id and evidence.attempt_number=intent.attempt_number
           order by evidence.evidence_sequence desc limit 1) as outcome
         from billing_dispatch_intents intent where operation_id=$1 and tenant_id=$2
         order by attempt_number limit 101",
    )
    .bind(operation.operation_id().as_str())
    .bind(operation.tenant_id().as_uuid())
    .fetch_all(&mut **tx)
    .await
    .map_err(db_error)?;
    if rows.len() > 100 {
        return Err(RetailBillingError::Unavailable);
    }
    rows.into_iter()
        .enumerate()
        .map(|(index, row)| {
            let number = u32::try_from(row.try_get::<i32, _>("attempt_number").map_err(db_error)?)
                .map_err(|_| RetailBillingError::Unavailable)?;
            if usize::try_from(number).ok() != Some(index + 1) {
                return Err(RetailBillingError::Unavailable);
            }
            let outcome = row
                .try_get::<Option<String>, _>("outcome")
                .map_err(db_error)?
                .map(|value| {
                    serde_json::from_value(serde_json::Value::String(value))
                        .map_err(|_| RetailBillingError::Unavailable)
                })
                .transpose()?;
            Ok((number, outcome))
        })
        .collect()
}

pub(super) async fn expired(
    tx: &mut Transaction<'_, Postgres>,
    operation: &ovload_core::billing::BillingOperationRecord,
) -> Result<bool, RetailBillingError> {
    sqlx::query_scalar("select $1::timestamptz <= clock_timestamp()")
        .bind(operation.expires_at())
        .fetch_one(&mut **tx)
        .await
        .map_err(db_error)
}
