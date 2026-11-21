//! Tenant-scoped financial operation history without financial mutation routes.

use std::str::FromStr as _;

use axum::{
    Json,
    extract::{
        Path, Query, State,
        rejection::{PathRejection, QueryRejection},
    },
    response::{IntoResponse, Response},
};
use chrono::{DateTime, Utc};
use ovload_admin::model::{
    billing_operations::BillingOperationPage, identity_access::IdentityError,
};
use ovload_core::{access::TenantId, billing::BillingOperationRecord, engine::ModelRequestId};
use serde::{Deserialize, Serialize};

use crate::auth::SessionState;

use super::{extract::IdentityRequest, wire::IdentityHttpError};

#[derive(Deserialize)]
#[serde(deny_unknown_fields)]
pub(super) struct ListQuery {
    cursor: Option<String>,
    limit: Option<u16>,
}

impl ListQuery {
    fn cursor(&self) -> Result<Option<ModelRequestId>, IdentityError> {
        self.cursor
            .as_ref()
            .map(|cursor| ModelRequestId::new(cursor.clone()).map_err(|_| IdentityError::Invalid))
            .transpose()
    }
}

#[derive(Serialize)]
struct OperationView {
    operation_id: String,
    tenant_id: String,
    user_id: String,
    api_key_id: String,
    account_group_id: String,
    public_model_id: String,
    service_tier: String,
    price_revision_id: String,
    currency: &'static str,
    scale: u8,
    state: &'static str,
    row_version: u64,
    maximum_charge_usd: String,
    initial_reservation_usd: String,
    reserved_usd: String,
    held_usd: String,
    settled_usd: String,
    released_usd: String,
    created_at: DateTime<Utc>,
    updated_at: DateTime<Utc>,
    expires_at: DateTime<Utc>,
    completed_at: Option<DateTime<Utc>>,
}

impl From<BillingOperationRecord> for OperationView {
    fn from(record: BillingOperationRecord) -> Self {
        let operation = record.operation();
        let target = record.target();
        Self {
            operation_id: operation.operation_id().to_string(),
            tenant_id: operation.tenant_id().to_string(),
            user_id: operation.user_id().to_string(),
            api_key_id: operation.key_id().to_string(),
            account_group_id: target.group().to_string(),
            public_model_id: target.public_model().to_string(),
            service_tier: target.service_tier().to_owned(),
            price_revision_id: record.price_revision_id().to_string(),
            currency: "USD",
            scale: 10,
            state: record.state().as_str(),
            row_version: record.row_version(),
            maximum_charge_usd: record.maximum_charge().canonical(),
            initial_reservation_usd: record.initial_reservation().canonical(),
            reserved_usd: record.reserved_amount().canonical(),
            held_usd: record.held_amount().canonical(),
            settled_usd: record.settled_amount().canonical(),
            released_usd: record.released_amount().canonical(),
            created_at: record.created_at(),
            updated_at: record.updated_at(),
            expires_at: record.expires_at(),
            completed_at: record.completed_at(),
        }
    }
}

#[derive(Serialize)]
struct PageView {
    items: Vec<OperationView>,
    next_cursor: Option<String>,
}

impl From<BillingOperationPage> for PageView {
    fn from(page: BillingOperationPage) -> Self {
        Self {
            items: page.items.into_iter().map(Into::into).collect(),
            next_cursor: page.next_cursor.map(|cursor| cursor.to_string()),
        }
    }
}

pub(super) async fn customer_list<S: SessionState>(
    State(state): State<S>,
    request: IdentityRequest,
    query: Result<Query<ListQuery>, QueryRejection>,
) -> Result<Response, IdentityHttpError> {
    let Query(query) = query.map_err(|_| request.error(IdentityError::Invalid))?;
    let cursor = query.cursor().map_err(|error| request.error(error))?;
    let session = request
        .authenticate(state.admin_services().identity())
        .await?;
    let page = state
        .admin_services()
        .billing_operations()
        .customer_list(&session, cursor, query.limit.unwrap_or(50))
        .await
        .map_err(|error| request.error(error))?;
    Ok(Json(PageView::from(page)).into_response())
}

pub(super) async fn customer_get<S: SessionState>(
    State(state): State<S>,
    request: IdentityRequest,
    path: Result<Path<String>, PathRejection>,
) -> Result<Response, IdentityHttpError> {
    let Path(raw_id) = path.map_err(|_| request.error(IdentityError::Invalid))?;
    let operation_id =
        ModelRequestId::new(raw_id).map_err(|_| request.error(IdentityError::Invalid))?;
    let session = request
        .authenticate(state.admin_services().identity())
        .await?;
    let record = state
        .admin_services()
        .billing_operations()
        .customer_get(&session, &operation_id)
        .await
        .map_err(|error| request.error(error))?;
    Ok(Json(OperationView::from(record)).into_response())
}

pub(super) async fn management_list<S: SessionState>(
    State(state): State<S>,
    request: IdentityRequest,
    path: Result<Path<String>, PathRejection>,
    query: Result<Query<ListQuery>, QueryRejection>,
) -> Result<Response, IdentityHttpError> {
    let Path(raw_tenant_id) = path.map_err(|_| request.error(IdentityError::Invalid))?;
    let tenant_id =
        TenantId::from_str(&raw_tenant_id).map_err(|_| request.error(IdentityError::Invalid))?;
    let Query(query) = query.map_err(|_| request.error(IdentityError::Invalid))?;
    let cursor = query.cursor().map_err(|error| request.error(error))?;
    let session = request
        .authenticate(state.admin_services().identity())
        .await?;
    let page = state
        .admin_services()
        .billing_operations()
        .management_list(&session, tenant_id, cursor, query.limit.unwrap_or(50))
        .await
        .map_err(|error| request.error(error))?;
    Ok(Json(PageView::from(page)).into_response())
}

pub(super) async fn management_get<S: SessionState>(
    State(state): State<S>,
    request: IdentityRequest,
    path: Result<Path<(String, String)>, PathRejection>,
) -> Result<Response, IdentityHttpError> {
    let Path((raw_tenant_id, raw_id)) = path.map_err(|_| request.error(IdentityError::Invalid))?;
    let tenant_id =
        TenantId::from_str(&raw_tenant_id).map_err(|_| request.error(IdentityError::Invalid))?;
    let operation_id =
        ModelRequestId::new(raw_id).map_err(|_| request.error(IdentityError::Invalid))?;
    let session = request
        .authenticate(state.admin_services().identity())
        .await?;
    let record = state
        .admin_services()
        .billing_operations()
        .management_get(&session, tenant_id, &operation_id)
        .await
        .map_err(|error| request.error(error))?;
    Ok(Json(OperationView::from(record)).into_response())
}
