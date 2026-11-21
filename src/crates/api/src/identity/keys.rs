//! Browser key management never accepts model bearer credentials.

use std::str::FromStr as _;

use axum::{
    Json,
    extract::{
        Path, Query, State,
        rejection::{JsonRejection, QueryRejection},
    },
    http::{HeaderValue, StatusCode, header},
    response::{IntoResponse, Response},
};
use chrono::{DateTime, Utc};
use ovload_admin::{
    ModelKeyService,
    model::{
        identity_access::{IdentityAudience, IdentityError, IdentitySession},
        model_keys::*,
    },
};
use ovload_core::{
    access::{TenantId, UserId},
    policy::{ClientApiKeyId, RateLimits},
    routing::AccountGroupId,
};
use secrecy::ExposeSecret as _;
use serde::{Deserialize, Serialize};

use crate::auth::SessionState;

use super::{extract::IdentityRequest, wire::IdentityHttpError};

#[derive(Default, Deserialize)]
#[serde(deny_unknown_fields)]
pub(super) struct OwnerQuery {
    tenant_id: Option<String>,
    user_id: Option<String>,
    cursor: Option<String>,
    limit: Option<u16>,
}

impl OwnerQuery {
    fn owner(
        &self,
        request: &IdentityRequest,
        actor: &IdentitySession,
    ) -> Result<ModelKeyOwner, IdentityHttpError> {
        let explicit = match (&self.tenant_id, &self.user_id) {
            (None, None) => None,
            (Some(tenant), Some(user)) => Some(ModelKeyOwner {
                tenant_id: TenantId::from_str(tenant)
                    .map_err(|_| request.error(IdentityError::Invalid))?,
                user_id: UserId::from_str(user)
                    .map_err(|_| request.error(IdentityError::Invalid))?,
            }),
            _ => return Err(request.error(IdentityError::Invalid)),
        };
        ModelKeyService::owner(actor, explicit).map_err(|error| request.error(error))
    }

    fn cursor(
        &self,
        request: &IdentityRequest,
    ) -> Result<Option<ClientApiKeyId>, IdentityHttpError> {
        self.cursor
            .as_deref()
            .map(|id| parse_id(request, id))
            .transpose()
    }

    fn require_item(&self, request: &IdentityRequest) -> Result<(), IdentityHttpError> {
        if self.cursor.is_some() || self.limit.is_some() {
            return Err(request.error(IdentityError::Invalid));
        }
        Ok(())
    }
}

#[derive(Deserialize)]
#[serde(deny_unknown_fields)]
pub(super) struct CreateInput {
    group_id: String,
    name: String,
    #[serde(default = "default_limits")]
    limits: RateLimits,
    expires_at: Option<DateTime<Utc>>,
    reason: Option<String>,
}

#[derive(Deserialize)]
#[serde(deny_unknown_fields)]
pub(super) struct UpdateInput {
    name: String,
    enabled: bool,
    limits: RateLimits,
    expires_at: Option<DateTime<Utc>>,
    reason: Option<String>,
}

#[derive(Deserialize)]
#[serde(deny_unknown_fields)]
pub(super) struct ReasonInput {
    reason: Option<String>,
}

#[derive(Deserialize)]
#[serde(deny_unknown_fields)]
pub(super) struct GroupInput {
    group_id: String,
    reason: String,
}

#[derive(Deserialize)]
#[serde(deny_unknown_fields)]
pub(super) struct AssignmentInput {
    name: String,
    group_id: String,
    enabled: bool,
    limits: RateLimits,
    reason: String,
}

fn default_limits() -> RateLimits {
    RateLimits {
        max_concurrency: 4,
        requests_per_minute: 60,
    }
}

#[derive(Serialize)]
struct KeyView {
    id: String,
    tenant_id: String,
    user_id: String,
    group_id: String,
    billing_source: &'static str,
    name: String,
    prefix: String,
    enabled: bool,
    limits: RateLimits,
    expires_at: Option<DateTime<Utc>>,
    revoked_at: Option<DateTime<Utc>>,
    revision: u64,
    created_at: DateTime<Utc>,
    updated_at: DateTime<Utc>,
    supersedes_key_id: Option<String>,
}

impl From<ModelKeyRecord> for KeyView {
    fn from(record: ModelKeyRecord) -> Self {
        Self {
            id: record.id.as_str().to_owned(),
            tenant_id: record.owner.tenant_id.to_string(),
            user_id: record.owner.user_id.to_string(),
            group_id: record.group_id.as_str().to_owned(),
            billing_source: "wallet",
            name: record.name,
            prefix: record.prefix,
            enabled: record.enabled,
            limits: record.limits,
            expires_at: record.expires_at,
            revoked_at: record.revoked_at,
            revision: record.revision,
            created_at: record.created_at,
            updated_at: record.updated_at,
            supersedes_key_id: record.supersedes_key_id.map(|id| id.as_str().to_owned()),
        }
    }
}

fn key_response(status: StatusCode, record: ModelKeyRecord) -> Response {
    let revision = record.revision;
    let mut response = (status, Json(KeyView::from(record))).into_response();
    if let Ok(value) = HeaderValue::from_str(&format!("\"{revision}\"")) {
        response.headers_mut().insert(header::ETAG, value);
    }
    response
}

fn issued_response(issued: IssuedModelKey) -> Response {
    let status = if issued.replayed {
        StatusCode::OK
    } else {
        StatusCode::CREATED
    };
    let revision = issued.record.revision;
    let mut response = (
        status,
        Json(serde_json::json!({
            "key": KeyView::from(issued.record),
            "secret": issued.secret.as_ref().map(|secret| secret.expose_secret()),
            "secret_disclosed": issued.secret.is_some(), "replayed": issued.replayed,
        })),
    )
        .into_response();
    if let Ok(value) = HeaderValue::from_str(&format!("\"{revision}\"")) {
        response.headers_mut().insert(header::ETAG, value);
    }
    response
}

fn reason(request: &IdentityRequest, value: Option<String>) -> Result<String, IdentityHttpError> {
    match (request.audience, value) {
        (_, Some(value)) => Ok(value),
        (IdentityAudience::Customer, None) => Ok("customer_request".to_owned()),
        _ => Err(request.error(IdentityError::Invalid)),
    }
}

fn parse_id(request: &IdentityRequest, raw: &str) -> Result<ClientApiKeyId, IdentityHttpError> {
    if raw.len() > 128 {
        return Err(request.error(IdentityError::Invalid));
    }
    ClientApiKeyId::new(raw).map_err(|_| request.error(IdentityError::Invalid))
}

fn parse_group(request: &IdentityRequest, raw: &str) -> Result<AccountGroupId, IdentityHttpError> {
    if raw.len() > 128 {
        return Err(request.error(IdentityError::Invalid));
    }
    AccountGroupId::new(raw).map_err(|_| request.error(IdentityError::Invalid))
}

pub(super) async fn list<S: SessionState>(
    State(state): State<S>,
    request: IdentityRequest,
    query: Result<Query<OwnerQuery>, QueryRejection>,
) -> Result<Response, IdentityHttpError> {
    let Query(query) = query.map_err(|_| request.error(IdentityError::Invalid))?;
    let actor = request
        .authenticate(state.admin_services().identity())
        .await?;
    let owner = query.owner(&request, &actor)?;
    let page = state
        .admin_services()
        .model_keys()
        .list(
            &actor,
            owner,
            query.cursor(&request)?,
            query.limit.unwrap_or(50),
        )
        .await
        .map_err(|error| request.error(error))?;
    Ok(Json(serde_json::json!({ "items": page.items.into_iter().map(KeyView::from).collect::<Vec<_>>(), "next_cursor": page.next_cursor.map(|id| id.as_str().to_owned()) })).into_response())
}

pub(super) async fn get<S: SessionState>(
    State(state): State<S>,
    request: IdentityRequest,
    Path(id): Path<String>,
    query: Result<Query<OwnerQuery>, QueryRejection>,
) -> Result<Response, IdentityHttpError> {
    let Query(query) = query.map_err(|_| request.error(IdentityError::Invalid))?;
    query.require_item(&request)?;
    let actor = request
        .authenticate(state.admin_services().identity())
        .await?;
    let record = state
        .admin_services()
        .model_keys()
        .get(
            &actor,
            query.owner(&request, &actor)?,
            &parse_id(&request, &id)?,
        )
        .await
        .map_err(|error| request.error(error))?;
    Ok(key_response(StatusCode::OK, record))
}

pub(super) async fn create<S: SessionState>(
    State(state): State<S>,
    request: IdentityRequest,
    query: Result<Query<OwnerQuery>, QueryRejection>,
    payload: Result<Json<CreateInput>, JsonRejection>,
) -> Result<Response, IdentityHttpError> {
    request.require_csrf()?;
    let Query(query) = query.map_err(|_| request.error(IdentityError::Invalid))?;
    query.require_item(&request)?;
    let Json(input) = payload.map_err(|_| request.error(IdentityError::Invalid))?;
    let actor = request
        .authenticate(state.admin_services().identity())
        .await?;
    let result = state
        .admin_services()
        .model_keys()
        .create(
            &actor,
            query.owner(&request, &actor)?,
            CreateModelKey {
                group_id: parse_group(&request, &input.group_id)?,
                name: input.name,
                limits: input.limits,
                expires_at: input.expires_at,
                idempotency_key: request.idempotency_key()?,
                reason: reason(&request, input.reason)?,
            },
        )
        .await
        .map_err(|error| request.error(error))?;
    Ok(issued_response(result))
}

pub(super) async fn update<S: SessionState>(
    State(state): State<S>,
    request: IdentityRequest,
    Path(id): Path<String>,
    query: Result<Query<OwnerQuery>, QueryRejection>,
    payload: Result<Json<UpdateInput>, JsonRejection>,
) -> Result<Response, IdentityHttpError> {
    request.require_csrf()?;
    let Query(query) = query.map_err(|_| request.error(IdentityError::Invalid))?;
    query.require_item(&request)?;
    let Json(input) = payload.map_err(|_| request.error(IdentityError::Invalid))?;
    let actor = request
        .authenticate(state.admin_services().identity())
        .await?;
    let record = state
        .admin_services()
        .model_keys()
        .update(
            &actor,
            query.owner(&request, &actor)?,
            UpdateModelKey {
                id: parse_id(&request, &id)?,
                expected_revision: request.revision()?,
                name: input.name,
                enabled: input.enabled,
                limits: input.limits,
                expires_at: input.expires_at,
                reason: reason(&request, input.reason)?,
            },
        )
        .await
        .map_err(|error| request.error(error))?;
    Ok(key_response(StatusCode::OK, record))
}

pub(super) async fn rotate<S: SessionState>(
    State(state): State<S>,
    request: IdentityRequest,
    Path(id): Path<String>,
    query: Result<Query<OwnerQuery>, QueryRejection>,
    payload: Result<Json<ReasonInput>, JsonRejection>,
) -> Result<Response, IdentityHttpError> {
    request.require_csrf()?;
    let Query(query) = query.map_err(|_| request.error(IdentityError::Invalid))?;
    query.require_item(&request)?;
    let Json(input) = payload.map_err(|_| request.error(IdentityError::Invalid))?;
    let actor = request
        .authenticate(state.admin_services().identity())
        .await?;
    let issued = state
        .admin_services()
        .model_keys()
        .rotate(
            &actor,
            query.owner(&request, &actor)?,
            parse_id(&request, &id)?,
            request.revision()?,
            request.idempotency_key()?,
            reason(&request, input.reason)?,
        )
        .await
        .map_err(|error| request.error(error))?;
    Ok(issued_response(issued))
}

pub(super) async fn revoke<S: SessionState>(
    State(state): State<S>,
    request: IdentityRequest,
    Path(id): Path<String>,
    query: Result<Query<OwnerQuery>, QueryRejection>,
    payload: Result<Json<ReasonInput>, JsonRejection>,
) -> Result<Response, IdentityHttpError> {
    request.require_csrf()?;
    let Query(query) = query.map_err(|_| request.error(IdentityError::Invalid))?;
    query.require_item(&request)?;
    let Json(input) = payload.map_err(|_| request.error(IdentityError::Invalid))?;
    let actor = request
        .authenticate(state.admin_services().identity())
        .await?;
    let record = state
        .admin_services()
        .model_keys()
        .revoke(
            &actor,
            query.owner(&request, &actor)?,
            RevokeModelKey {
                id: parse_id(&request, &id)?,
                expected_revision: request.revision()?,
                reason: reason(&request, input.reason)?,
            },
        )
        .await
        .map_err(|error| request.error(error))?;
    Ok(key_response(StatusCode::OK, record))
}

pub(super) async fn groups<S: SessionState>(
    State(state): State<S>,
    request: IdentityRequest,
    query: Result<Query<OwnerQuery>, QueryRejection>,
) -> Result<Response, IdentityHttpError> {
    let Query(query) = query.map_err(|_| request.error(IdentityError::Invalid))?;
    query.require_item(&request)?;
    let actor = request
        .authenticate(state.admin_services().identity())
        .await?;
    let groups = state
        .admin_services()
        .model_keys()
        .group_grants(&actor, query.owner(&request, &actor)?)
        .await
        .map_err(|error| request.error(error))?;
    Ok(Json(serde_json::json!({ "items": groups.into_iter().map(|group| serde_json::json!({"id":group.id.as_str(), "name":group.name})).collect::<Vec<_>>() })).into_response())
}

pub(super) async fn grant_group<S: SessionState>(
    State(state): State<S>,
    request: IdentityRequest,
    Path(user): Path<String>,
    query: Result<Query<OwnerQuery>, QueryRejection>,
    payload: Result<Json<GroupInput>, JsonRejection>,
) -> Result<Response, IdentityHttpError> {
    request.require_csrf()?;
    let Query(mut query) = query.map_err(|_| request.error(IdentityError::Invalid))?;
    if query.user_id.is_some() {
        return Err(request.error(IdentityError::Invalid));
    }
    query.user_id = Some(user);
    query.require_item(&request)?;
    let Json(input) = payload.map_err(|_| request.error(IdentityError::Invalid))?;
    let actor = request
        .authenticate(state.admin_services().identity())
        .await?;
    state
        .admin_services()
        .model_keys()
        .set_group_grant(
            &actor,
            query.owner(&request, &actor)?,
            SetModelKeyGroupGrant {
                group_id: parse_group(&request, &input.group_id)?,
                granted: true,
                reason: input.reason,
            },
        )
        .await
        .map_err(|error| request.error(error))?;
    Ok(StatusCode::NO_CONTENT.into_response())
}

pub(super) async fn ungrant_group<S: SessionState>(
    State(state): State<S>,
    request: IdentityRequest,
    Path((user, group)): Path<(String, String)>,
    query: Result<Query<OwnerQuery>, QueryRejection>,
    payload: Result<Json<ReasonInput>, JsonRejection>,
) -> Result<Response, IdentityHttpError> {
    request.require_csrf()?;
    let Query(mut query) = query.map_err(|_| request.error(IdentityError::Invalid))?;
    if query.user_id.is_some() {
        return Err(request.error(IdentityError::Invalid));
    }
    query.user_id = Some(user);
    query.require_item(&request)?;
    let Json(input) = payload.map_err(|_| request.error(IdentityError::Invalid))?;
    let actor = request
        .authenticate(state.admin_services().identity())
        .await?;
    state
        .admin_services()
        .model_keys()
        .set_group_grant(
            &actor,
            query.owner(&request, &actor)?,
            SetModelKeyGroupGrant {
                group_id: parse_group(&request, &group)?,
                granted: false,
                reason: reason(&request, input.reason)?,
            },
        )
        .await
        .map_err(|error| request.error(error))?;
    Ok(StatusCode::NO_CONTENT.into_response())
}

pub(super) async fn pending<S: SessionState>(
    State(state): State<S>,
    request: IdentityRequest,
    query: Result<Query<OwnerQuery>, QueryRejection>,
) -> Result<Response, IdentityHttpError> {
    let Query(query) = query.map_err(|_| request.error(IdentityError::Invalid))?;
    if query.tenant_id.is_some() || query.user_id.is_some() {
        return Err(request.error(IdentityError::Invalid));
    }
    let actor = request
        .authenticate(state.admin_services().identity())
        .await?;
    let page = state
        .admin_services()
        .model_keys()
        .pending(&actor, query.cursor(&request)?, query.limit.unwrap_or(50))
        .await
        .map_err(|error| request.error(error))?;
    Ok(Json(serde_json::json!({ "items": page.items.into_iter().map(|key| serde_json::json!({"id":key.id.as_str(), "name":key.name, "prefix":key.prefix,"former_enabled":key.former_enabled})).collect::<Vec<_>>(), "next_cursor":page.next_cursor.map(|id|id.as_str().to_owned()) })).into_response())
}

pub(super) async fn assign<S: SessionState>(
    State(state): State<S>,
    request: IdentityRequest,
    Path(id): Path<String>,
    query: Result<Query<OwnerQuery>, QueryRejection>,
    payload: Result<Json<AssignmentInput>, JsonRejection>,
) -> Result<Response, IdentityHttpError> {
    request.require_csrf()?;
    let Query(query) = query.map_err(|_| request.error(IdentityError::Invalid))?;
    query.require_item(&request)?;
    let Json(input) = payload.map_err(|_| request.error(IdentityError::Invalid))?;
    let actor = request
        .authenticate(state.admin_services().identity())
        .await?;
    let record = state
        .admin_services()
        .model_keys()
        .assign_pending(
            &actor,
            query.owner(&request, &actor)?,
            AssignPendingModelKey {
                id: parse_id(&request, &id)?,
                name: input.name,
                group_id: parse_group(&request, &input.group_id)?,
                enabled: input.enabled,
                limits: input.limits,
                reason: input.reason,
            },
        )
        .await
        .map_err(|error| request.error(error))?;
    Ok(key_response(StatusCode::OK, record))
}
