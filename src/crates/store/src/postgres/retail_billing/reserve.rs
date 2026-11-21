//! Wallet-serialized sizing using current prices and the latest actual charge.

use ovload_core::billing::{
    BillingOperationRecord, BillingOperationRef, PrechargePolicy, ReserveRetailBilling,
    RetailBillingError,
};
use serde_json::json;
use sqlx::{Postgres, QueryBuilder, Row, Transaction};

use super::{PgRetailBillingStore, authority_error, bigint, commands, db_error, read, tariff};

pub(super) async fn reserve(
    store: &PgRetailBillingStore,
    command: ReserveRetailBilling,
) -> Result<BillingOperationRecord, RetailBillingError> {
    let fingerprint = command.fingerprint()?;
    let identity = command.identity();
    let operation = BillingOperationRef::new(
        command.operation_id().clone(),
        identity.tenant_id,
        identity.user_id,
        identity.key_id.clone(),
    )?;
    let mut tx = store.begin().await?;
    super::super::model_keys::lock_model_key_authority(&mut tx, identity, command.target().group())
        .await
        .map_err(authority_error)?;
    let (balance, held) = read::lock_wallet(&mut tx, identity.tenant_id).await?;
    if let Some(record) = replay(&mut tx, &operation, fingerprint).await? {
        super::super::model_keys::lock_model_key_authority(
            &mut tx,
            identity,
            command.target().group(),
        )
        .await
        .map_err(authority_error)?;
        tx.commit().await.map_err(db_error)?;
        return Ok(record);
    }
    let blocked: bool = sqlx::query_scalar(
        "select exists(select 1 from billing_reconciliation_cases
         where tenant_id=$1 and state='open' and unresolved_usd>0)",
    )
    .bind(identity.tenant_id.as_uuid())
    .fetch_one(&mut *tx)
    .await
    .map_err(db_error)?;
    if blocked {
        return Err(RetailBillingError::ReconciliationRequired);
    }
    let (catalog_generation, selected) =
        tariff::current(&mut tx, command.target(), identity).await?;
    let quote = selected
        .rates
        .quote(command.bounds(), selected.multiplier_bps)
        .map_err(|_| RetailBillingError::Invalid)?;
    // This statement starts after the wallet lock, including any lock wait.
    let latest: Option<String> = sqlx::query_scalar(
        "select settled_usd::text from billing_reservations
         where tenant_id=$1 and model_key_id=$2 and wallet_tenant_id=$1 and account_group_id=$3
           and requested_public_model_id=$4 and service_tier=$5 and state='settled' and settled_usd>0
         order by settled_at desc, operation_id desc limit 1",
    )
    .bind(identity.tenant_id.as_uuid())
    .bind(identity.key_id.as_str())
    .bind(command.target().group().as_str())
    .bind(command.target().public_model().as_str())
    .bind(command.target().service_tier())
    .fetch_optional(&mut *tx)
    .await
    .map_err(db_error)?;
    let latest = latest
        .map(|value| value.parse())
        .transpose()
        .map_err(|_| RetailBillingError::Unavailable)?
        .unwrap_or(ovload_core::metering::Decimal::ZERO);
    let reserve = PrechargePolicy
        .reserve(Some(latest), &quote)
        .map_err(|_| RetailBillingError::Invalid)?;
    let subscription: Option<uuid::Uuid> =
        sqlx::query_scalar("select commerce_select_subscription($1,$2,$3::text::numeric)")
            .bind(identity.tenant_id.as_uuid())
            .bind(identity.user_id.as_uuid())
            .bind(reserve.canonical())
            .fetch_one(&mut *tx)
            .await
            .map_err(db_error)?;
    let available = balance
        .scaled()
        .checked_sub(held.scaled())
        .ok_or(RetailBillingError::Unavailable)?;
    if subscription.is_none() && reserve.scaled() > available {
        return Err(RetailBillingError::InsufficientFunds);
    }
    super::super::model_keys::lock_model_key_authority(&mut tx, identity, command.target().group())
        .await
        .map_err(authority_error)?;
    sqlx::query(
        "insert into billing_reservations
         (operation_id,tenant_id,user_id,model_key_id,account_group_id,wallet_tenant_id,
          requested_public_model_id,service_tier,price_revision_id,rate_card_id,quote_usd,
          latest_settled_charge_usd,initial_hold_usd,reserved_usd,held_usd,effective_multiplier_bps,
          input_token_bound,output_token_bound,quote_bounds,frozen_price_snapshot,request_fingerprint,
          key_generation,user_generation,tenant_generation,route_revision,catalog_generation,expires_at,subscription_id)
         values ($1,$2,$3,$4,$5,$2,$6,$7,$8,$9,$10::text::numeric,$11::text::numeric,
                 $12::text::numeric,$12::text::numeric,$12::text::numeric,$23,$13,$14,$15,$16,$17,
                 $18,$19,$20,$21,$22,clock_timestamp()+interval '30 minutes',$24)",
    )
    .bind(operation.operation_id().as_str())
    .bind(identity.tenant_id.as_uuid())
    .bind(identity.user_id.as_uuid())
    .bind(identity.key_id.as_str())
    .bind(command.target().group().as_str())
    .bind(command.target().public_model().as_str())
    .bind(command.target().service_tier())
    .bind(selected.revision_id)
    .bind(selected.card_id)
    .bind(quote.maximum_charge().canonical())
    .bind(latest.canonical())
    .bind(reserve.canonical())
    .bind(bigint(command.bounds().input_tokens().maximum_tokens())?)
    .bind(bigint(command.bounds().output_tokens())?)
    .bind(command.bounds().canonical_facts()?)
    .bind(selected.snapshot()?)
    .bind(fingerprint.as_slice())
    .bind(bigint(identity.key_generation)?)
    .bind(bigint(identity.user_generation)?)
    .bind(bigint(identity.tenant_generation)?)
    .bind(bigint(command.route_revision().get())?)
    .bind(bigint(catalog_generation)?)
    .bind(i32::try_from(selected.multiplier_bps).map_err(|_| RetailBillingError::Unavailable)?)
    .bind(subscription)
    .execute(&mut *tx)
    .await
    .map_err(db_error)?;
    commands::event(
        &mut tx,
        &operation,
        "reserved",
        reserve,
        "reserved",
        json!({
            "catalog_generation":catalog_generation,"price_revision_id":selected.revision_id,
            "fingerprint":hex::encode(fingerprint),
        }),
    )
    .await?;
    let row = read::load(&mut tx, &operation).await?;
    let record = read::record_from_row(&row)?;
    tx.commit().await.map_err(db_error)?;
    Ok(record)
}

async fn replay(
    tx: &mut Transaction<'_, Postgres>,
    operation: &BillingOperationRef,
    fingerprint: [u8; 32],
) -> Result<Option<BillingOperationRecord>, RetailBillingError> {
    let mut query = QueryBuilder::<Postgres>::new("select ");
    query
        .push(read::RECORD_COLUMNS)
        .push(" from billing_reservations where operation_id=")
        .push_bind(operation.operation_id().as_str())
        .push(" for update");
    let row = query
        .build()
        .fetch_optional(&mut **tx)
        .await
        .map_err(db_error)?;
    let Some(row) = row else { return Ok(None) };
    let record = read::record_from_row(&row)?;
    let saved: Vec<u8> = row.try_get("request_fingerprint").map_err(db_error)?;
    if record.operation() != operation || saved.as_slice() != fingerprint {
        return Err(RetailBillingError::Conflict);
    }
    Ok(Some(record))
}
