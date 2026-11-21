//! Canonical numeric projection and tenant-scoped financial hydration.

use ovload_core::{
    access::{TenantId, UserId},
    billing::{
        BillingOperationRecord, BillingOperationRef, BillingOperationSnapshot,
        BillingOperationState, RetailBillingError, RetailBillingTarget,
    },
    engine::ModelRequestId,
    metering::Decimal,
    policy::ClientApiKeyId,
    routing::{AccountGroupId, PublicModelId},
};
use sqlx::{Postgres, QueryBuilder, Row, Transaction, postgres::PgRow};

use super::db_error;

pub(crate) const RECORD_COLUMNS: &str = "operation_id, tenant_id, user_id, model_key_id, \
    account_group_id, requested_public_model_id, service_tier, price_revision_id, rate_card_id, \
    quote_usd::text as quote_usd, latest_settled_charge_usd::text as latest_settled_charge_usd, \
    initial_hold_usd::text as initial_hold_usd, reserved_usd::text as reserved_usd, \
    held_usd::text as held_usd, settled_usd::text as settled_usd, released_usd::text as released_usd, \
    effective_multiplier_bps, input_token_bound, output_token_bound, quote_bounds, \
    frozen_price_snapshot, state, created_at, updated_at, settled_at, expires_at, row_version, \
    request_fingerprint, key_generation, user_generation, tenant_generation, route_revision, catalog_generation";

pub(crate) fn record_from_row(row: &PgRow) -> Result<BillingOperationRecord, RetailBillingError> {
    let state: String = row.try_get("state").map_err(db_error)?;
    let state = match state.as_str() {
        "held" => BillingOperationState::Held,
        "settled" => BillingOperationState::Settled,
        "released" => BillingOperationState::Released,
        "reconciliation_required" => BillingOperationState::ReconciliationRequired,
        _ => return Err(RetailBillingError::Unavailable),
    };
    BillingOperationRecord::new(BillingOperationSnapshot {
        operation: operation_from_row(row)?,
        target: target_from_row(row)?,
        price_revision_id: row.try_get("price_revision_id").map_err(db_error)?,
        state,
        maximum_charge: decimal(row, "quote_usd")?,
        initial_reservation: decimal(row, "initial_hold_usd")?,
        reserved_amount: decimal(row, "reserved_usd")?,
        held_amount: decimal(row, "held_usd")?,
        settled_amount: decimal(row, "settled_usd")?,
        released_amount: decimal(row, "released_usd")?,
        created_at: row.try_get("created_at").map_err(db_error)?,
        updated_at: row.try_get("updated_at").map_err(db_error)?,
        expires_at: row.try_get("expires_at").map_err(db_error)?,
        completed_at: row.try_get("settled_at").map_err(db_error)?,
        row_version: positive(row.try_get("row_version").map_err(db_error)?)?,
    })
    .map_err(|_| RetailBillingError::Unavailable)
}

pub(super) fn operation_from_row(row: &PgRow) -> Result<BillingOperationRef, RetailBillingError> {
    BillingOperationRef::new(
        ModelRequestId::new(row.try_get::<String, _>("operation_id").map_err(db_error)?)
            .map_err(|_| RetailBillingError::Unavailable)?,
        TenantId::new(row.try_get("tenant_id").map_err(db_error)?),
        UserId::new(row.try_get("user_id").map_err(db_error)?),
        ClientApiKeyId::new(row.try_get::<String, _>("model_key_id").map_err(db_error)?)
            .map_err(|_| RetailBillingError::Unavailable)?,
    )
    .map_err(|_| RetailBillingError::Unavailable)
}

pub(super) fn target_from_row(row: &PgRow) -> Result<RetailBillingTarget, RetailBillingError> {
    RetailBillingTarget::new(
        AccountGroupId::new(
            row.try_get::<String, _>("account_group_id")
                .map_err(db_error)?,
        )
        .map_err(|_| RetailBillingError::Unavailable)?,
        PublicModelId::new(
            row.try_get::<String, _>("requested_public_model_id")
                .map_err(db_error)?,
        )
        .map_err(|_| RetailBillingError::Unavailable)?,
        row.try_get("service_tier").map_err(db_error)?,
    )
    .map_err(|_| RetailBillingError::Unavailable)
}

pub(super) async fn load(
    tx: &mut Transaction<'_, Postgres>,
    operation: &BillingOperationRef,
) -> Result<PgRow, RetailBillingError> {
    let mut query = QueryBuilder::<Postgres>::new("select ");
    query
        .push(RECORD_COLUMNS)
        .push(" from billing_reservations where operation_id=")
        .push_bind(operation.operation_id().as_str())
        .push(" and tenant_id=")
        .push_bind(operation.tenant_id().as_uuid())
        .push(" and user_id=")
        .push_bind(operation.user_id().as_uuid())
        .push(" and model_key_id=")
        .push_bind(operation.key_id().as_str())
        .push(" for update");
    query
        .build()
        .fetch_optional(&mut **tx)
        .await
        .map_err(db_error)?
        .ok_or(RetailBillingError::NotFound)
}

pub(super) async fn lock_wallet(
    tx: &mut Transaction<'_, Postgres>,
    tenant: TenantId,
) -> Result<(Decimal, Decimal), RetailBillingError> {
    let row = sqlx::query(
        "select balance_usd::text as balance_usd, held_usd::text as held_usd
         from identity_tenant_wallets where tenant_id=$1 for update",
    )
    .bind(tenant.as_uuid())
    .fetch_optional(&mut **tx)
    .await
    .map_err(db_error)?
    .ok_or(RetailBillingError::NotFound)?;
    Ok((decimal(&row, "balance_usd")?, decimal(&row, "held_usd")?))
}

pub(super) fn decimal(row: &PgRow, name: &str) -> Result<Decimal, RetailBillingError> {
    row.try_get::<String, _>(name)
        .map_err(db_error)?
        .parse()
        .map_err(|_| RetailBillingError::Unavailable)
}

pub(super) fn positive(value: i64) -> Result<u64, RetailBillingError> {
    u64::try_from(value)
        .ok()
        .filter(|value| *value > 0)
        .ok_or(RetailBillingError::Unavailable)
}
