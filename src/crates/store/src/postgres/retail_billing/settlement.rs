//! One receipt, one debit, and complete hold consumption in a single transaction.

use ovload_core::{
    billing::{
        BillingDispatchEvidence, BillingOperationRecord, BillingOperationRef,
        BillingOperationState, BillingUnresolvedReason, CompleteRetailBilling,
        RetailBillingCompletion, RetailBillingError, RetailPricePreview, RetailUsageEvidence,
    },
    metering::Decimal,
};
use serde::Serialize;
use serde_json::{Value, json};
use sha2::{Digest, Sha256};
use sqlx::{Postgres, Row, Transaction};
use uuid::Uuid;

use super::{PgRetailBillingStore, attempts, commands, db_error, read, reconciliation, tariff};

pub(super) async fn complete(
    store: &PgRetailBillingStore,
    command: CompleteRetailBilling,
) -> Result<BillingOperationRecord, RetailBillingError> {
    let mut tx = store.begin().await?;
    read::lock_wallet(&mut tx, command.operation().tenant_id()).await?;
    let row = read::load(&mut tx, command.operation()).await?;
    let fingerprint = command.fingerprint()?;
    if commands::replay(
        &mut tx,
        command.operation(),
        "complete",
        command.idempotency_key(),
        fingerprint,
    )
    .await?
    {
        let record = read::record_from_row(&row)?;
        tx.commit().await.map_err(db_error)?;
        return Ok(record);
    }
    let record = read::record_from_row(&row)?;
    if !matches!(
        record.state(),
        BillingOperationState::Held | BillingOperationState::ReconciliationRequired
    ) {
        return Err(RetailBillingError::Conflict);
    }
    let key = commands::event_key("complete", fingerprint);
    let outcomes = attempts::outcomes(&mut tx, command.operation()).await?;
    match command.completion() {
        RetailBillingCompletion::ProvenNotSent => {
            tariff::frozen(&mut tx, &row).await?;
            if outcomes
                .iter()
                .any(|(_, outcome)| *outcome != Some(BillingDispatchEvidence::NotSent))
            {
                return Err(RetailBillingError::Conflict);
            }
            release(&mut tx, command.operation()).await?;
            reconciliation::resolve(&mut tx, command.operation(), Decimal::ZERO, &key).await?;
            commands::event(
                &mut tx,
                command.operation(),
                "released",
                record.held_amount(),
                &key,
                json!({}),
            )
            .await?;
        }
        RetailBillingCompletion::Unresolved(reason) => {
            reconciliation::open(&mut tx, &row, *reason, None, &key).await?;
        }
        RetailBillingCompletion::AuthoritativeUsage(evidence) => {
            let (tariff, bounds) = tariff::frozen(&mut tx, &row).await?;
            let charge = tariff
                .rates
                .settle(evidence.usage(), &bounds, tariff.multiplier_bps);
            let valid = charge.is_ok();
            let evidence_sequence =
                usage_evidence(&mut tx, command.operation(), evidence, valid).await?;
            match charge {
                Err(_) => {
                    reconciliation::open(
                        &mut tx,
                        &row,
                        BillingUnresolvedReason::UsageIncomplete,
                        None,
                        &key,
                    )
                    .await?
                }
                Ok(charge) => {
                    let has_one_sent = outcomes
                        .iter()
                        .filter(|(_, outcome)| *outcome == Some(BillingDispatchEvidence::Sent))
                        .count()
                        == 1;
                    let complete_dispatch = outcomes.iter().all(|(_, outcome)| {
                        matches!(
                            outcome,
                            Some(BillingDispatchEvidence::NotSent | BillingDispatchEvidence::Sent)
                        )
                    });
                    if !has_one_sent || !complete_dispatch {
                        reconciliation::open(
                            &mut tx,
                            &row,
                            BillingUnresolvedReason::DispatchUnknown,
                            Some(charge.amount()),
                            &key,
                        )
                        .await?;
                    } else {
                        if charge.amount() > record.held_amount() {
                            return Err(RetailBillingError::Unavailable);
                        }
                        let calculation = tariff
                            .rates
                            .preview(evidence.usage(), tariff.multiplier_bps)
                            .map_err(|_| RetailBillingError::Unavailable)?;
                        settle(
                            &mut tx,
                            &record,
                            &row,
                            &tariff,
                            evidence,
                            evidence_sequence,
                            &calculation,
                        )
                        .await?;
                        reconciliation::resolve(
                            &mut tx,
                            command.operation(),
                            charge.amount(),
                            &key,
                        )
                        .await?;
                        commands::event(
                            &mut tx,
                            command.operation(),
                            "settled",
                            charge.amount(),
                            &key,
                            json!({"usage_evidence_sequence":evidence_sequence}),
                        )
                        .await?;
                    }
                }
            }
        }
    }
    commands::receipt(
        &mut tx,
        command.operation(),
        "complete",
        command.idempotency_key(),
        fingerprint,
    )
    .await?;
    let row = read::load(&mut tx, command.operation()).await?;
    let result = read::record_from_row(&row)?;
    tx.commit().await.map_err(db_error)?;
    Ok(result)
}

async fn release(
    tx: &mut Transaction<'_, Postgres>,
    operation: &BillingOperationRef,
) -> Result<(), RetailBillingError> {
    sqlx::query(
        "update billing_reservations set state='released',held_usd=0,released_usd=reserved_usd,
         row_version=row_version+1 where operation_id=$1 and tenant_id=$2 and state in ('held','reconciliation_required')",
    ).bind(operation.operation_id().as_str()).bind(operation.tenant_id().as_uuid())
        .execute(&mut **tx).await.map_err(db_error)?;
    Ok(())
}

async fn usage_evidence(
    tx: &mut Transaction<'_, Postgres>,
    operation: &BillingOperationRef,
    evidence: &RetailUsageEvidence,
    complete: bool,
) -> Result<i32, RetailBillingError> {
    let sequence:i32=sqlx::query_scalar(
        "select coalesce(max(evidence_sequence),0)+1 from billing_usage_evidence where operation_id=$1 and tenant_id=$2",
    ).bind(operation.operation_id().as_str()).bind(operation.tenant_id().as_uuid())
        .fetch_one(&mut **tx).await.map_err(db_error)?;
    if sequence > 32 {
        return Err(RetailBillingError::Conflict);
    }
    sqlx::query(
        "insert into billing_usage_evidence
         (operation_id,tenant_id,evidence_sequence,authority,complete,usage_facts,evidence_reference)
         values ($1,$2,$3,$4,$5,$6,$7)",
    ).bind(operation.operation_id().as_str()).bind(operation.tenant_id().as_uuid())
        .bind(sequence).bind(evidence.authority().as_str()).bind(complete)
        .bind(evidence.usage().canonical_facts()?).bind(evidence.reference())
        .execute(&mut **tx).await.map_err(db_error)?;
    Ok(sequence)
}

async fn settle(
    tx: &mut Transaction<'_, Postgres>,
    record: &BillingOperationRecord,
    row: &sqlx::postgres::PgRow,
    tariff: &tariff::SelectedTariff,
    evidence: &RetailUsageEvidence,
    sequence: i32,
    calculation: &RetailPricePreview,
) -> Result<(), RetailBillingError> {
    let operation = record.operation();
    sqlx::query(
        "insert into billing_usage_receipts
         (operation_id,tenant_id,usage_evidence_sequence,authority,usage_facts,customer_charge_usd,
          price_revision_id,frozen_price_snapshot,dispatch_certainty)
         values ($1,$2,$3,$4,$5,$6::text::numeric,$7,$8,'sent')",
    )
    .bind(operation.operation_id().as_str())
    .bind(operation.tenant_id().as_uuid())
    .bind(sequence)
    .bind(evidence.authority().as_str())
    .bind(evidence.usage().canonical_facts()?)
    .bind(calculation.amount().canonical())
    .bind(record.price_revision_id())
    .bind(
        row.try_get::<Value, _>("frozen_price_snapshot")
            .map_err(db_error)?,
    )
    .execute(&mut **tx)
    .await
    .map_err(db_error)?;
    for component in calculation.components() {
        let rate = component.rate();
        let rate_id = tariff
            .rate_ids
            .get(&rate.dimension())
            .ok_or(RetailBillingError::Unavailable)?;
        sqlx::query(
            "insert into billing_usage_components
             (operation_id,tenant_id,rate_id,dimension,unit,quantity,unit_rate_usd,exact_usd_numerator,exact_usd_denominator)
             values ($1,$2,$3,$4,$5,$6::text::numeric,$7::text::numeric,$8::text::numeric,$9::text::numeric)",
        ).bind(operation.operation_id().as_str()).bind(operation.tenant_id().as_uuid()).bind(rate_id)
            .bind(enum_string(rate.dimension())?).bind(enum_string(rate.denominator())?)
            .bind(component.quantity().to_string()).bind(rate.usd_per_unit().canonical())
            .bind(component.exact_usd_numerator()).bind(component.exact_usd_denominator())
            .execute(&mut **tx).await.map_err(db_error)?;
    }
    sqlx::query(
        "update billing_reservations set state='settled',held_usd=0,settled_usd=$3::text::numeric,
         released_usd=reserved_usd-$3::text::numeric,row_version=row_version+1
         where operation_id=$1 and tenant_id=$2 and state in ('held','reconciliation_required')",
    )
    .bind(operation.operation_id().as_str())
    .bind(operation.tenant_id().as_uuid())
    .bind(calculation.amount().canonical())
    .execute(&mut **tx)
    .await
    .map_err(db_error)?;
    let subscription: Option<Uuid> = sqlx::query_scalar(
        "select subscription_id from billing_reservations where operation_id=$1",
    )
    .bind(operation.operation_id().as_str())
    .fetch_one(&mut **tx)
    .await
    .map_err(db_error)?;
    if let Some(subscription) = subscription.filter(|_| calculation.amount() != Decimal::ZERO) {
        sqlx::query("insert into commerce_subscription_charges(operation_id,subscription_id,tenant_id,amount_usd) values($1,$2,$3,$4::text::numeric)")
            .bind(operation.operation_id().as_str()).bind(subscription).bind(operation.tenant_id().as_uuid())
            .bind(calculation.amount().canonical()).execute(&mut **tx).await.map_err(db_error)?;
    } else if subscription.is_none() && calculation.amount() != Decimal::ZERO {
        sqlx::query(
            "insert into wallet_ledger_entries
             (id,tenant_id,direction,entry_kind,amount_usd,operation_id,idempotency_key)
             values ($1,$2,'debit','customer_usage',$3::text::numeric,$4,$5)",
        )
        .bind(Uuid::now_v7())
        .bind(operation.tenant_id().as_uuid())
        .bind(calculation.amount().canonical())
        .bind(operation.operation_id().as_str())
        .bind(format!(
            "retail-usage:{}",
            hex::encode(Sha256::digest(operation.operation_id().as_str().as_bytes()))
        ))
        .execute(&mut **tx)
        .await
        .map_err(db_error)?;
    }
    Ok(())
}

fn enum_string(value: impl Serialize) -> Result<String, RetailBillingError> {
    match serde_json::to_value(value).map_err(|_| RetailBillingError::Unavailable)? {
        Value::String(value) => Ok(value),
        _ => Err(RetailBillingError::Unavailable),
    }
}
