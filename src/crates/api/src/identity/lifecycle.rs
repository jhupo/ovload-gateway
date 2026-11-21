//! Customer-owned credentials and scoped management customer profile commands.

use std::net::SocketAddr;

use axum::{
    Json, Router,
    extract::{
        ConnectInfo, DefaultBodyLimit, Path, Query, State,
        rejection::{ExtensionRejection, JsonRejection, PathRejection, QueryRejection},
    },
    http::{StatusCode, header},
    response::{IntoResponse, Response},
    routing::{get, patch, post},
};
use ovload_admin::model::identity::IdentityStatus;
use ovload_admin::model::{
    identity_access::{IdentityAudience, IdentityError},
    identity_lifecycle::*,
};
use ovload_core::access::{TenantId, UserId};
use secrecy::SecretString;
use serde::Deserialize;
use serde_json::{Value, json};
use uuid::Uuid;

use super::{
    extract::IdentityRequest,
    wire::{self, IdentityHttpError},
};
use crate::auth::SessionState;

pub(super) fn router<S: SessionState + Clone + Send + Sync + 'static>(
    audience: IdentityAudience,
) -> Router<S> {
    let router = Router::new().route("/profile/password-change", post(change_password::<S>));
    match audience {
        IdentityAudience::Customer => router
            .route("/profile", get(profile::<S>).patch(update_profile::<S>))
            .route("/auth/registration-policy", get(public_policy::<S>))
            .route("/auth/registrations", post(register::<S>))
            .route("/auth/registrations/verify", post(verify_registration::<S>))
            .route("/auth/password-reset", post(request_reset::<S>))
            .route("/auth/password-reset/confirm", post(reset_password::<S>)),
        IdentityAudience::Management => router
            .route("/users/{id}", patch(update_customer::<S>))
            .route(
                "/auth/settings",
                get(management_policy::<S>)
                    .patch(update_policy::<S>)
                    .layer(DefaultBodyLimit::max(2 * 1024 * 1024)),
            ),
    }
}

#[derive(Deserialize)]
#[serde(deny_unknown_fields)]
struct RegistrationInput {
    invitation_code: Option<String>,
    consent_revision: Option<u64>,
    email: String,
    display_name: String,
    password: String,
}
#[derive(Deserialize)]
#[serde(deny_unknown_fields)]
struct EmailInput {
    email: String,
}
#[derive(Deserialize)]
#[serde(deny_unknown_fields)]
struct TokenInput {
    token: String,
}
#[derive(Deserialize)]
#[serde(deny_unknown_fields)]
struct ResetInput {
    token: String,
    new_password: String,
}
#[derive(Deserialize)]
#[serde(deny_unknown_fields)]
struct PasswordInput {
    current_password: String,
    new_password: String,
}
#[derive(Deserialize)]
#[serde(deny_unknown_fields)]
struct ProfileInput {
    display_name: String,
}
#[derive(Deserialize)]
#[serde(deny_unknown_fields)]
struct CustomerInput {
    email: String,
    display_name: String,
    max_concurrency: u32,
    requests_per_minute: u32,
    notes: String,
    password: Option<String>,
}
#[derive(Deserialize)]
#[serde(deny_unknown_fields)]
struct TenantQuery {
    tenant_id: Uuid,
}
async fn public_policy<S: SessionState>(
    State(state): State<S>,
    request: IdentityRequest,
) -> Result<Response, IdentityHttpError> {
    let value = state
        .admin_services()
        .identity_lifecycle()
        .registration_policy()
        .await
        .map_err(|e| request.error(e))?;
    let oauth_available = state
        .admin_services()
        .identity_lifecycle()
        .oauth_providers()
        .await
        .map_err(|e| request.error(e))?;
    let oauth_providers: Vec<_> = value
        .enabled_providers
        .into_iter()
        .filter(|provider| oauth_available.contains(provider))
        .collect();
    let mail_available = state
        .admin_services()
        .identity_lifecycle()
        .mail_available()
        .await;
    Ok(Json(json!({"mail_available":mail_available,"oauth_available":oauth_available,"oauth_providers":oauth_providers,"revision":value.revision,"agreement":value.agreement,"registration_enabled":value.registration_enabled,"verification_required":value.verification_required,"recovery_enabled":value.recovery_enabled})).into_response())
}
async fn register<S: SessionState>(
    State(state): State<S>,
    request: IdentityRequest,
    peer: Result<ConnectInfo<SocketAddr>, ExtensionRejection>,
    payload: Result<Json<RegistrationInput>, JsonRejection>,
) -> Result<Response, IdentityHttpError> {
    request.verify_human(&state).await?;
    let Json(value) = payload.map_err(|_| request.error(IdentityError::Invalid))?;
    let source = source(&request, peer)?;
    state
        .admin_services()
        .identity_lifecycle()
        .register(
            ovload_admin::model::identity_lifecycle::RegistrationInput {
                invitation_code: value.invitation_code,
                consent_revision: value.consent_revision,
                email: value.email,
                display_name: value.display_name,
                password: SecretString::from(value.password),
            },
            source,
        )
        .await
        .map_err(|e| request.error(e))?;
    Ok(accepted())
}
async fn request_reset<S: SessionState>(
    State(state): State<S>,
    request: IdentityRequest,
    peer: Result<ConnectInfo<SocketAddr>, ExtensionRejection>,
    payload: Result<Json<EmailInput>, JsonRejection>,
) -> Result<Response, IdentityHttpError> {
    request.verify_human(&state).await?;
    let Json(value) = payload.map_err(|_| request.error(IdentityError::Invalid))?;
    state
        .admin_services()
        .identity_lifecycle()
        .request_password_reset(value.email, source(&request, peer)?)
        .await
        .map_err(|e| request.error(e))?;
    Ok(accepted())
}
async fn verify_registration<S: SessionState>(
    State(state): State<S>,
    request: IdentityRequest,
    peer: Result<ConnectInfo<SocketAddr>, ExtensionRejection>,
    payload: Result<Json<TokenInput>, JsonRejection>,
) -> Result<Response, IdentityHttpError> {
    let Json(value) = payload.map_err(|_| request.error(IdentityError::Invalid))?;
    state
        .admin_services()
        .identity_lifecycle()
        .verify_registration(SecretString::from(value.token), source(&request, peer)?)
        .await
        .map_err(|e| request.error(e))?;
    Ok(StatusCode::NO_CONTENT.into_response())
}
async fn reset_password<S: SessionState>(
    State(state): State<S>,
    request: IdentityRequest,
    peer: Result<ConnectInfo<SocketAddr>, ExtensionRejection>,
    payload: Result<Json<ResetInput>, JsonRejection>,
) -> Result<Response, IdentityHttpError> {
    let Json(value) = payload.map_err(|_| request.error(IdentityError::Invalid))?;
    state
        .admin_services()
        .identity_lifecycle()
        .reset_password(
            SecretString::from(value.token),
            SecretString::from(value.new_password),
            source(&request, peer)?,
        )
        .await
        .map_err(|e| request.error(e))?;
    Ok(StatusCode::NO_CONTENT.into_response())
}
async fn profile<S: SessionState>(
    State(state): State<S>,
    request: IdentityRequest,
) -> Result<Response, IdentityHttpError> {
    let session = request
        .authenticate(state.admin_services().identity())
        .await?;
    let value = state
        .admin_services()
        .identity_lifecycle()
        .profile(&session)
        .await
        .map_err(|e| request.error(e))?;
    account_response(value, &request)
}
async fn update_profile<S: SessionState>(
    State(state): State<S>,
    request: IdentityRequest,
    payload: Result<Json<ProfileInput>, JsonRejection>,
) -> Result<Response, IdentityHttpError> {
    request.require_csrf()?;
    let Json(value) = payload.map_err(|_| request.error(IdentityError::Invalid))?;
    let session = request
        .authenticate(state.admin_services().identity())
        .await?;
    let value = state
        .admin_services()
        .identity_lifecycle()
        .update_profile(
            &session,
            UpdateOwnProfile {
                expected_revision: request.revision()?,
                display_name: value.display_name,
            },
        )
        .await
        .map_err(|e| request.error(e))?;
    account_response(value, &request)
}
async fn change_password<S: SessionState>(
    State(state): State<S>,
    request: IdentityRequest,
    peer: Result<ConnectInfo<SocketAddr>, ExtensionRejection>,
    payload: Result<Json<PasswordInput>, JsonRejection>,
) -> Result<Response, IdentityHttpError> {
    request.require_csrf()?;
    let Json(value) = payload.map_err(|_| request.error(IdentityError::Invalid))?;
    let session = request
        .authenticate(state.admin_services().identity())
        .await?;
    state
        .admin_services()
        .identity_lifecycle()
        .change_password(
            &session,
            request.revision()?,
            SecretString::from(value.current_password),
            SecretString::from(value.new_password),
            source(&request, peer)?,
        )
        .await
        .map_err(|e| request.error(e))?;
    wire::logout_response(&request)
}
async fn update_customer<S: SessionState>(
    State(state): State<S>,
    request: IdentityRequest,
    path: Result<Path<Uuid>, PathRejection>,
    query: Result<Query<TenantQuery>, QueryRejection>,
    payload: Result<Json<CustomerInput>, JsonRejection>,
) -> Result<Response, IdentityHttpError> {
    request.require_csrf()?;
    let Path(id) = path.map_err(|_| request.error(IdentityError::Invalid))?;
    let Query(scope) = query.map_err(|_| request.error(IdentityError::Invalid))?;
    let Json(value) = payload.map_err(|_| request.error(IdentityError::Invalid))?;
    if id.is_nil() || scope.tenant_id.is_nil() {
        return Err(request.error(IdentityError::Invalid));
    }
    let session = request
        .authenticate(state.admin_services().identity())
        .await?;
    let value = state
        .admin_services()
        .identity_lifecycle()
        .update_customer(
            &session,
            UpdateCustomerAccount {
                changes: CustomerAccountChanges {
                    tenant_id: TenantId::new(scope.tenant_id),
                    user_id: UserId::new(id),
                    expected_revision: request.revision()?,
                    email: value.email,
                    display_name: value.display_name,
                    max_concurrency: value.max_concurrency,
                    requests_per_minute: value.requests_per_minute,
                    notes: value.notes,
                },
                password: value.password.map(SecretString::from),
            },
        )
        .await
        .map_err(|e| request.error(e))?;
    account_response(value, &request)
}
fn source(
    request: &IdentityRequest,
    peer: Result<ConnectInfo<SocketAddr>, ExtensionRejection>,
) -> Result<std::net::IpAddr, IdentityHttpError> {
    Ok(peer
        .map_err(|_| request.error(IdentityError::Unavailable))?
        .0
        .ip())
}
fn accepted() -> Response {
    (StatusCode::ACCEPTED, Json(json!({"status":"accepted"}))).into_response()
}
pub(super) fn account_response(
    value: CustomerAccountRecord,
    request: &IdentityRequest,
) -> Result<Response, IdentityHttpError> {
    let c = value.customer;
    let status = match c.status {
        IdentityStatus::Active => "active",
        IdentityStatus::Suspended => "suspended",
        IdentityStatus::Revoked => "revoked",
    };
    let mut body = json!({"id":c.id.to_string(),"tenant_id":c.tenant_id.to_string(),"email":c.email,"display_name":c.display_name,"status":status,"revision":c.revision,"created_at":c.created_at,"updated_at":c.updated_at,
        "max_concurrency":value.max_concurrency,"requests_per_minute":value.requests_per_minute,"customer_max_concurrency":value.customer_max_concurrency,"customer_requests_per_minute":value.customer_requests_per_minute,"email_verified_at":value.email_verified_at});
    if request.audience == IdentityAudience::Management {
        body["notes"] = Value::String(value.notes);
    }
    version_response(body, c.revision, request)
}
fn version_response(
    body: Value,
    revision: u64,
    request: &IdentityRequest,
) -> Result<Response, IdentityHttpError> {
    let mut response = Json(body).into_response();
    response.headers_mut().insert(
        header::ETAG,
        format!("\"{revision}\"")
            .parse()
            .map_err(|_| request.error(IdentityError::Unavailable))?,
    );
    Ok(response)
}

async fn management_policy<S: SessionState>(
    State(state): State<S>,
    request: IdentityRequest,
) -> Result<Response, IdentityHttpError> {
    let session = request
        .authenticate(state.admin_services().identity())
        .await?;
    let value = state
        .admin_services()
        .identity_lifecycle()
        .management_policy(&session)
        .await
        .map_err(|e| request.error(e))?;
    Ok(Json(value).into_response())
}
async fn update_policy<S: SessionState>(
    State(state): State<S>,
    request: IdentityRequest,
    payload: Result<Json<RegistrationPolicy>, JsonRejection>,
) -> Result<Response, IdentityHttpError> {
    request.require_csrf()?;
    let session = request
        .authenticate(state.admin_services().identity())
        .await?;
    let Json(value) = payload.map_err(|_| request.error(IdentityError::Invalid))?;
    if value.revision != request.revision()? {
        return Err(request.error(IdentityError::Invalid));
    }
    let value = state
        .admin_services()
        .identity_lifecycle()
        .update_policy(&session, value)
        .await
        .map_err(|e| request.error(e))?;
    Ok(Json(value).into_response())
}
