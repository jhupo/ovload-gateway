//! USD wallet HTTP translation for customer reads and management funding.

use std::str::FromStr as _;

use axum::{
    Json,
    extract::{
        Path, Query, State,
        rejection::{JsonRejection, QueryRejection},
    },
    http::StatusCode,
    response::{IntoResponse, Response},
};
use ovload_admin::model::{
    billing::{CreditTenantWallet, WalletCreditEntry, WalletCreditPage},
    identity_access::IdentityError,
};
use ovload_core::{access::TenantId, metering::Decimal};
use serde::{Deserialize, Serialize};

use crate::auth::SessionState;

use super::{extract::IdentityRequest, wire::IdentityHttpError};

#[derive(Serialize)]
struct WalletBalanceView {
    tenant_id: String,
    currency: &'static str,
    scale: u8,
    settled_usd: String,
    held_usd: String,
    available_usd: String,
}

impl From<ovload_admin::model::billing::WalletBalance> for WalletBalanceView {
    fn from(balance: ovload_admin::model::billing::WalletBalance) -> Self {
        Self {
            tenant_id: balance.tenant_id().to_string(),
            currency: "USD",
            scale: 10,
            settled_usd: balance.settled_usd().canonical(),
            held_usd: balance.held_usd().canonical(),
            available_usd: balance.available_usd().canonical(),
        }
    }
}

#[derive(Deserialize)]
#[serde(deny_unknown_fields)]
pub(super) struct CreditInput {
    paid_cny: Option<String>,
    amount_usd: String,
    reason: String,
}

#[derive(Serialize)]
struct CreditReceiptView {
    ledger_entry_id: String,
    amount_usd: String,
    balance: WalletBalanceView,
    created_at: chrono::DateTime<chrono::Utc>,
}

impl From<ovload_admin::model::billing::WalletCreditReceipt> for CreditReceiptView {
    fn from(receipt: ovload_admin::model::billing::WalletCreditReceipt) -> Self {
        Self {
            ledger_entry_id: receipt.ledger_entry_id().to_string(),
            amount_usd: receipt.amount_usd().canonical(),
            balance: WalletBalanceView::from(receipt.resulting_balance().clone()),
            created_at: *receipt.created_at(),
        }
    }
}

#[derive(Deserialize)]
#[serde(deny_unknown_fields)]
pub(super) struct CreditHistoryQuery {
    cursor: Option<uuid::Uuid>,
    limit: Option<u16>,
}

#[derive(Serialize)]
struct CreditEntryView {
    ledger_entry_id: String,
    tenant_id: String,
    principal_id: String,
    kind: &'static str,
    amount_usd: String,
    reason: String,
    created_at: chrono::DateTime<chrono::Utc>,
}

impl From<WalletCreditEntry> for CreditEntryView {
    fn from(entry: WalletCreditEntry) -> Self {
        Self {
            ledger_entry_id: entry.ledger_entry_id.to_string(),
            tenant_id: entry.tenant_id.to_string(),
            principal_id: entry.principal_id.to_string(),
            kind: "admin",
            amount_usd: entry.amount_usd.canonical(),
            reason: entry.reason,
            created_at: entry.created_at,
        }
    }
}

#[derive(Serialize)]
struct CreditHistoryView {
    items: Vec<CreditEntryView>,
    next_cursor: Option<String>,
    currency: &'static str,
    scale: u8,
    total_credited_usd: String,
}

impl From<WalletCreditPage> for CreditHistoryView {
    fn from(page: WalletCreditPage) -> Self {
        Self {
            items: page.items.into_iter().map(CreditEntryView::from).collect(),
            next_cursor: page.next_cursor.map(|cursor| cursor.to_string()),
            currency: "USD",
            scale: 10,
            total_credited_usd: page.total_credited_usd,
        }
    }
}

pub(super) async fn customer_balance<S: SessionState>(
    State(state): State<S>,
    request: IdentityRequest,
) -> Result<Response, IdentityHttpError> {
    let session = request
        .authenticate(state.admin_services().identity())
        .await?;
    let balance = state
        .admin_services()
        .billing()
        .customer_wallet_balance(&session)
        .await
        .map_err(|error| request.error(error))?;
    Ok(Json(WalletBalanceView::from(balance)).into_response())
}

pub(super) async fn management_wallet_balance<S: SessionState>(
    State(state): State<S>,
    request: IdentityRequest,
    tenant_path: Result<Path<String>, axum::extract::rejection::PathRejection>,
) -> Result<Response, IdentityHttpError> {
    let Path(raw_tenant_id) = tenant_path.map_err(|_| request.error(IdentityError::Invalid))?;
    let tenant_id =
        TenantId::from_str(&raw_tenant_id).map_err(|_| request.error(IdentityError::Invalid))?;
    let session = request
        .authenticate(state.admin_services().identity())
        .await?;
    let balance = state
        .admin_services()
        .billing()
        .management_wallet_balance(&session, tenant_id)
        .await
        .map_err(|error| request.error(error))?;
    Ok(Json(WalletBalanceView::from(balance)).into_response())
}

pub(super) async fn management_wallet_credits<S: SessionState>(
    State(state): State<S>,
    request: IdentityRequest,
    tenant_path: Result<Path<String>, axum::extract::rejection::PathRejection>,
    query: Result<Query<CreditHistoryQuery>, QueryRejection>,
) -> Result<Response, IdentityHttpError> {
    let Path(raw_tenant_id) = tenant_path.map_err(|_| request.error(IdentityError::Invalid))?;
    let tenant_id =
        TenantId::from_str(&raw_tenant_id).map_err(|_| request.error(IdentityError::Invalid))?;
    let Query(query) = query.map_err(|_| request.error(IdentityError::Invalid))?;
    let session = request
        .authenticate(state.admin_services().identity())
        .await?;
    let page = state
        .admin_services()
        .billing()
        .management_wallet_credits(&session, tenant_id, query.cursor, query.limit.unwrap_or(50))
        .await
        .map_err(|error| request.error(error))?;
    Ok(Json(CreditHistoryView::from(page)).into_response())
}

pub(super) async fn credit_wallet<S: SessionState>(
    State(state): State<S>,
    request: IdentityRequest,
    tenant_path: Result<Path<String>, axum::extract::rejection::PathRejection>,
    payload: Result<Json<CreditInput>, JsonRejection>,
) -> Result<Response, IdentityHttpError> {
    request.require_csrf()?;
    let Path(raw_tenant_id) = tenant_path.map_err(|_| request.error(IdentityError::Invalid))?;
    let tenant_id =
        TenantId::from_str(&raw_tenant_id).map_err(|_| request.error(IdentityError::Invalid))?;
    let Json(payload) = payload.map_err(|_| request.error(IdentityError::Invalid))?;
    let amount_usd = Decimal::from_str(&payload.amount_usd)
        .map_err(|_| request.error(IdentityError::Invalid))?;
    let command = CreditTenantWallet::new(
        tenant_id,
        amount_usd,
        payload.reason,
        request.idempotency_key()?,
    )
    .and_then(|command| command.with_paid_cny(payload.paid_cny))
    .map_err(|error| request.error(error))?;
    let session = request
        .authenticate(state.admin_services().identity())
        .await?;
    let receipt = state
        .admin_services()
        .billing()
        .credit_tenant_wallet(&session, command)
        .await
        .map_err(|error| request.error(error))?;
    Ok((StatusCode::OK, Json(CreditReceiptView::from(receipt))).into_response())
}
