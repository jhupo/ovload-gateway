//! Invalid stored facts fail reads instead of being silently normalized.

use std::str::FromStr as _;

use ovload_admin::model::{
    customer_usage::{CustomerUsageRecord, CustomerUsageSummary},
    identity_access::{IdentityError, IdentityResult},
};
use ovload_core::{
    billing::BillingOperationState,
    engine::{ExecutionOutcome, ModelRequestId},
    metering::Decimal,
    policy::ClientApiKeyId,
    routing::PublicModelId,
};
use sqlx::{Row as _, postgres::PgRow};

use super::super::identity::db_error;

fn unsigned(row: &PgRow, field: &str) -> IdentityResult<u64> {
    u64::try_from(row.try_get::<i64, _>(field).map_err(db_error)?)
        .map_err(|_| IdentityError::Unavailable)
}

fn optional_unsigned(row: &PgRow, field: &str) -> IdentityResult<Option<u64>> {
    row.try_get::<Option<i64>, _>(field)
        .map_err(db_error)?
        .map(|value| u64::try_from(value).map_err(|_| IdentityError::Unavailable))
        .transpose()
}

fn summed(row: &PgRow, field: &str) -> IdentityResult<Option<u64>> {
    row.try_get::<Option<String>, _>(field)
        .map_err(db_error)?
        .map(|value| value.parse().map_err(|_| IdentityError::Unavailable))
        .transpose()
}

fn amount(row: &PgRow) -> IdentityResult<Option<Decimal>> {
    row.try_get::<Option<String>, _>("retail_charge_usd")
        .map_err(db_error)?
        .map(|value| Decimal::from_str(&value).map_err(|_| IdentityError::Unavailable))
        .transpose()
}

pub(super) fn record(row: &PgRow) -> IdentityResult<CustomerUsageRecord> {
    let outcome = match row
        .try_get::<String, _>("outcome")
        .map_err(db_error)?
        .as_str()
    {
        "running" => ExecutionOutcome::Running,
        "succeeded" => ExecutionOutcome::Succeeded,
        "failed" => ExecutionOutcome::Failed,
        "cancelled" => ExecutionOutcome::Cancelled,
        "incomplete" => ExecutionOutcome::Incomplete,
        _ => return Err(IdentityError::Unavailable),
    };
    let retail_state = row
        .try_get::<Option<String>, _>("retail_state")
        .map_err(db_error)?
        .map(|state| match state.as_str() {
            "held" => Ok(BillingOperationState::Held),
            "settled" => Ok(BillingOperationState::Settled),
            "released" => Ok(BillingOperationState::Released),
            "reconciliation_required" => Ok(BillingOperationState::ReconciliationRequired),
            _ => Err(IdentityError::Unavailable),
        })
        .transpose()?;
    let record = CustomerUsageRecord {
        request_id: ModelRequestId::new(row.try_get::<String, _>("id").map_err(db_error)?)
            .map_err(|_| IdentityError::Unavailable)?,
        api_key_id: ClientApiKeyId::new(
            row.try_get::<String, _>("client_api_key_ref")
                .map_err(db_error)?,
        )
        .map_err(|_| IdentityError::Unavailable)?,
        public_model_id: row
            .try_get::<Option<String>, _>("requested_model_id")
            .map_err(db_error)?
            .map(|value| PublicModelId::new(value).map_err(|_| IdentityError::Unavailable))
            .transpose()?,
        operation: row.try_get("operation").map_err(db_error)?,
        outcome,
        client_status_code: row
            .try_get::<Option<i32>, _>("client_status_code")
            .map_err(db_error)?
            .map(|value| u16::try_from(value).map_err(|_| IdentityError::Unavailable))
            .transpose()?,
        started_at: row.try_get("started_at").map_err(db_error)?,
        completed_at: row.try_get("completed_at").map_err(db_error)?,
        input_tokens: optional_unsigned(row, "input_tokens")?,
        output_tokens: optional_unsigned(row, "output_tokens")?,
        cached_input_tokens: optional_unsigned(row, "cached_input_tokens")?,
        cache_write_input_tokens: optional_unsigned(row, "cache_write_input_tokens")?,
        reasoning_output_tokens: optional_unsigned(row, "reasoning_output_tokens")?,
        total_tokens: optional_unsigned(row, "total_tokens")?,
        first_token_ms: optional_unsigned(row, "first_token_ms")?,
        latency_ms: optional_unsigned(row, "latency_ms")?,
        retail_charge_usd: amount(row)?,
        retail_state,
    };
    if record
        .completed_at
        .is_some_and(|completed| completed < record.started_at)
        || (record.retail_state == Some(BillingOperationState::Settled))
            != record.retail_charge_usd.is_some()
    {
        return Err(IdentityError::Unavailable);
    }
    Ok(record)
}

pub(super) fn summary(row: &PgRow) -> IdentityResult<CustomerUsageSummary> {
    Ok(CustomerUsageSummary {
        requests: unsigned(row, "requests")?,
        succeeded: unsigned(row, "succeeded")?,
        failed: unsigned(row, "failed")?,
        cancelled: unsigned(row, "cancelled")?,
        incomplete: unsigned(row, "incomplete")?,
        running: unsigned(row, "running")?,
        usage_reported_requests: unsigned(row, "usage_reported_requests")?,
        input_tokens: summed(row, "input_tokens")?,
        output_tokens: summed(row, "output_tokens")?,
        cached_input_tokens: summed(row, "cached_input_tokens")?,
        cache_write_input_tokens: summed(row, "cache_write_input_tokens")?,
        reasoning_output_tokens: summed(row, "reasoning_output_tokens")?,
        total_tokens: summed(row, "total_tokens")?,
        settled_requests: unsigned(row, "settled_requests")?,
        retail_charge_usd: amount(row)?,
    })
}
