//! Typed HTTP inputs translated into identity application commands.

use std::{net::SocketAddr, str::FromStr as _};

use axum::{
    Json,
    extract::{
        ConnectInfo, Path, Query, State,
        rejection::{ExtensionRejection, JsonRejection, QueryRejection},
    },
    http::StatusCode,
    response::{IntoResponse, Response},
};
use ovload_admin::model::identity::IdentityStatus;
use ovload_admin::model::identity_access::{
    CustomerDirectoryQuery, CustomerDirectorySort, IdentityAudience, IdentityError,
    ProvisionCustomer, SetCustomerActive,
};
use ovload_core::access::{TenantId, UserId};
use secrecy::SecretString;
use serde::Deserialize;

use crate::auth::SessionState;

use super::{
    extract::IdentityRequest,
    wire::{self, CustomerDirectoryView, IdentityHttpError},
};

#[derive(Deserialize)]
#[serde(deny_unknown_fields)]
pub(super) struct LoginInput {
    login: Option<String>,
    consent_revision: Option<u64>,
    email: Option<String>,
    username: Option<String>,
    password: String,
}

#[derive(Deserialize)]
#[serde(deny_unknown_fields)]
pub(super) struct ProvisionInput {
    email: String,
    display_name: String,
    password: String,
    max_concurrency: u32,
    requests_per_minute: u32,
    notes: String,
}

#[derive(Deserialize)]
#[serde(deny_unknown_fields)]
pub(super) struct CustomerQuery {
    tenant_id: String,
}

#[derive(Deserialize)]
#[serde(deny_unknown_fields)]
pub(super) struct CustomersQuery {
    tenant_id: Option<String>,
    page: Option<u32>,
    page_size: Option<u16>,
    query: Option<String>,
    status: Option<String>,
    role: Option<String>,
    sort: Option<String>,
    order: Option<String>,
}

pub(super) async fn login<S: SessionState>(
    State(state): State<S>,
    request: IdentityRequest,
    peer: Result<ConnectInfo<SocketAddr>, ExtensionRejection>,
    payload: Result<Json<LoginInput>, JsonRejection>,
) -> Result<Response, IdentityHttpError> {
    request.verify_human(&state).await?;
    let Json(payload) = payload.map_err(|_| request.error(IdentityError::Invalid))?;
    let source = peer
        .map_err(|_| request.error(IdentityError::Unavailable))?
        .0
        .ip();
    let identity = state.admin_services().identity();
    let grant = if let Some(login) = payload.login {
        if payload.email.is_some() || payload.username.is_some() {
            return Err(request.error(IdentityError::Invalid));
        }
        identity
            .login_any(
                login,
                SecretString::from(payload.password),
                source,
                request.login_tokens.clone(),
                payload.consent_revision,
            )
            .await
    } else {
        let login = match (request.audience, payload.email, payload.username) {
            (IdentityAudience::Customer, Some(email), None) => email,
            (IdentityAudience::Management, None, Some(username)) => username,
            _ => return Err(request.error(IdentityError::Invalid)),
        };
        identity
            .login(
                request.audience,
                login,
                SecretString::from(payload.password),
                source,
                request.access.clone(),
                payload.consent_revision,
            )
            .await
    }
    .map_err(|error| request.error(error))?;
    wire::grant_response(&request, &grant)
}

pub(super) async fn session<S: SessionState>(
    State(state): State<S>,
    request: IdentityRequest,
) -> Result<Response, IdentityHttpError> {
    let session = request
        .authenticate(state.admin_services().identity())
        .await?;
    wire::session_response(&request, &session)
}

pub(super) async fn logout<S: SessionState>(
    State(state): State<S>,
    request: IdentityRequest,
) -> Result<Response, IdentityHttpError> {
    request.require_csrf()?;
    let service = state.admin_services().identity();
    let session = request.authenticate(service).await?;
    service
        .revoke_session(&session)
        .await
        .map_err(|error| request.error(error))?;
    wire::logout_response(&request)
}

pub(super) async fn provision_customer<S: SessionState>(
    State(state): State<S>,
    request: IdentityRequest,
    payload: Result<Json<ProvisionInput>, JsonRejection>,
) -> Result<Response, IdentityHttpError> {
    request.require_csrf()?;
    let Json(payload) = payload.map_err(|_| request.error(IdentityError::Invalid))?;
    let service = state.admin_services().identity();
    let session = request.authenticate(service).await?;
    let customer = service
        .provision_customer(
            &session,
            ProvisionCustomer {
                email: payload.email,
                display_name: payload.display_name,
                password: SecretString::from(payload.password),
                max_concurrency: payload.max_concurrency,
                requests_per_minute: payload.requests_per_minute,
                notes: payload.notes,
            },
        )
        .await
        .map_err(|error| request.error(error))?;
    Ok(wire::customer_response(StatusCode::CREATED, customer))
}

pub(super) async fn customer<S: SessionState>(
    State(state): State<S>,
    request: IdentityRequest,
    Path(id): Path<String>,
    query: Result<Query<CustomerQuery>, QueryRejection>,
) -> Result<Response, IdentityHttpError> {
    let Query(query) = query.map_err(|_| request.error(IdentityError::Invalid))?;
    let tenant =
        TenantId::from_str(&query.tenant_id).map_err(|_| request.error(IdentityError::Invalid))?;
    let user = UserId::from_str(&id).map_err(|_| request.error(IdentityError::Invalid))?;
    let service = state.admin_services().identity();
    let session = request.authenticate(service).await?;
    let customer = state
        .admin_services()
        .identity_lifecycle()
        .customer(&session, tenant, user)
        .await
        .map_err(|error| request.error(error))?;
    super::lifecycle::account_response(customer, &request)
}

pub(super) async fn customers<S: SessionState>(
    State(state): State<S>,
    request: IdentityRequest,
    query: Result<Query<CustomersQuery>, QueryRejection>,
) -> Result<Response, IdentityHttpError> {
    let Query(query) = query.map_err(|_| request.error(IdentityError::Invalid))?;
    let tenant = query
        .tenant_id
        .map(|id| TenantId::from_str(&id))
        .transpose()
        .map_err(|_| request.error(IdentityError::Invalid))?;
    if query.role.as_deref().is_some_and(|role| role != "user") {
        return Err(request.error(IdentityError::Invalid));
    }
    let statuses = query
        .status
        .map(|statuses| {
            statuses
                .split(',')
                .map(|status| match status {
                    "active" => Ok(IdentityStatus::Active),
                    "suspended" => Ok(IdentityStatus::Suspended),
                    "revoked" => Ok(IdentityStatus::Revoked),
                    _ => Err(request.error(IdentityError::Invalid)),
                })
                .collect::<Result<Vec<_>, _>>()
        })
        .transpose()?
        .unwrap_or_default();
    let sort = match query.sort.as_deref().unwrap_or("created_at") {
        "id" => CustomerDirectorySort::Id,
        "display_name" => CustomerDirectorySort::DisplayName,
        "balance_usd" => CustomerDirectorySort::BalanceUsd,
        "created_at" => CustomerDirectorySort::CreatedAt,
        _ => return Err(request.error(IdentityError::Invalid)),
    };
    let descending = match query.order.as_deref().unwrap_or("desc") {
        "asc" => false,
        "desc" => true,
        _ => return Err(request.error(IdentityError::Invalid)),
    };
    let service = state.admin_services().identity();
    let session = request.authenticate(service).await?;
    let customers = service
        .customers(
            &session,
            CustomerDirectoryQuery {
                tenant_id: tenant,
                page: query.page.unwrap_or(1),
                page_size: query.page_size.unwrap_or(10),
                query: query.query.unwrap_or_default(),
                statuses,
                sort,
                descending,
            },
        )
        .await
        .map_err(|error| request.error(error))?;
    let items: Vec<_> = customers
        .items
        .into_iter()
        .map(CustomerDirectoryView::from)
        .collect();
    Ok(Json(serde_json::json!({
        "items": items,
        "total": customers.total,
        "page": customers.page,
        "page_size": customers.page_size,
    }))
    .into_response())
}

pub(super) async fn suspend<S: SessionState>(
    State(state): State<S>,
    request: IdentityRequest,
    Path(id): Path<String>,
    query: Result<Query<CustomerQuery>, QueryRejection>,
) -> Result<Response, IdentityHttpError> {
    lifecycle(state, request, id, query, false).await
}

pub(super) async fn activate<S: SessionState>(
    State(state): State<S>,
    request: IdentityRequest,
    Path(id): Path<String>,
    query: Result<Query<CustomerQuery>, QueryRejection>,
) -> Result<Response, IdentityHttpError> {
    lifecycle(state, request, id, query, true).await
}

async fn lifecycle<S: SessionState>(
    state: S,
    request: IdentityRequest,
    id: String,
    query: Result<Query<CustomerQuery>, QueryRejection>,
    active: bool,
) -> Result<Response, IdentityHttpError> {
    request.require_csrf()?;
    let Query(query) = query.map_err(|_| request.error(IdentityError::Invalid))?;
    let command = SetCustomerActive {
        tenant_id: TenantId::from_str(&query.tenant_id)
            .map_err(|_| request.error(IdentityError::Invalid))?,
        user_id: UserId::from_str(&id).map_err(|_| request.error(IdentityError::Invalid))?,
        expected_revision: request.revision()?,
        active,
    };
    let service = state.admin_services().identity();
    let session = request.authenticate(service).await?;
    let customer = service
        .set_customer_active(&session, command)
        .await
        .map_err(|error| request.error(error))?;
    Ok(wire::customer_response(StatusCode::OK, customer))
}
