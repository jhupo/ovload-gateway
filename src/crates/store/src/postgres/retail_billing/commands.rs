//! Immutable internal command receipts and append-only financial audit.

use ovload_core::{
    billing::{BillingOperationRef, RetailBillingError},
    metering::Decimal,
};
use serde_json::Value;
use sqlx::{Postgres, Row, Transaction};

use super::db_error;

pub(super) async fn replay(
    tx: &mut Transaction<'_, Postgres>,
    operation: &BillingOperationRef,
    command: &str,
    key: &str,
    fingerprint: [u8; 32],
) -> Result<bool, RetailBillingError> {
    let row = sqlx::query(
        "select fingerprint from retail_billing_commands
         where operation_id=$1 and tenant_id=$2 and command=$3 and idempotency_key=$4",
    )
    .bind(operation.operation_id().as_str())
    .bind(operation.tenant_id().as_uuid())
    .bind(command)
    .bind(key)
    .fetch_optional(&mut **tx)
    .await
    .map_err(db_error)?;
    let Some(row) = row else { return Ok(false) };
    let stored: Vec<u8> = row.try_get("fingerprint").map_err(db_error)?;
    if stored.as_slice() != fingerprint {
        return Err(RetailBillingError::Conflict);
    }
    Ok(true)
}

pub(super) async fn receipt(
    tx: &mut Transaction<'_, Postgres>,
    operation: &BillingOperationRef,
    command: &str,
    key: &str,
    fingerprint: [u8; 32],
) -> Result<(), RetailBillingError> {
    sqlx::query(
        "insert into retail_billing_commands (operation_id,tenant_id,command,idempotency_key,fingerprint)
         values ($1,$2,$3,$4,$5)",
    )
    .bind(operation.operation_id().as_str())
    .bind(operation.tenant_id().as_uuid())
    .bind(command)
    .bind(key)
    .bind(fingerprint.as_slice())
    .execute(&mut **tx)
    .await
    .map_err(db_error)?;
    Ok(())
}

pub(super) async fn event(
    tx: &mut Transaction<'_, Postgres>,
    operation: &BillingOperationRef,
    kind: &str,
    amount: Decimal,
    key: &str,
    facts: Value,
) -> Result<(), RetailBillingError> {
    sqlx::query(
        "insert into billing_reservation_events
         (operation_id,tenant_id,event_kind,amount_usd,actor_kind,idempotency_key,facts)
         values ($1,$2,$3,$4::text::numeric,'system',$5,$6)",
    )
    .bind(operation.operation_id().as_str())
    .bind(operation.tenant_id().as_uuid())
    .bind(kind)
    .bind(amount.canonical())
    .bind(key)
    .bind(&facts)
    .execute(&mut **tx)
    .await
    .map_err(db_error)?;
    sqlx::query(
        "insert into identity_audit_events
         (tenant_id,actor_kind,action,target_kind,metadata)
         values ($1,'system',$2,'retail_billing_operation',$3)",
    )
    .bind(operation.tenant_id().as_uuid())
    .bind(format!("billing.{kind}"))
    .bind(serde_json::json!({"operation_id":operation.operation_id().as_str(),"facts":facts}))
    .execute(&mut **tx)
    .await
    .map_err(db_error)?;
    Ok(())
}

pub(super) fn event_key(kind: &str, fingerprint: [u8; 32]) -> String {
    format!("{kind}:{}", hex::encode(fingerprint))
}
