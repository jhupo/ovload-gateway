use super::{IdentityPolicy, extract::IdentityRequest, wire::IdentityHttpError};
use crate::auth::SessionState;
use axum::{
    Extension, Form, Json, Router,
    extract::{DefaultBodyLimit, Path, State, rejection::JsonRejection},
    http::StatusCode,
    routing::{get, post},
};
use ovload_admin::model::identity_access::{IdentityAudience, IdentityError};
use serde::Deserialize;
use serde_json::{Value, json};

pub(super) fn router<S: SessionState + Clone + Send + Sync + 'static>(
    audience: IdentityAudience,
) -> Router<S> {
    match audience {
        IdentityAudience::Management => Router::new()
            .route(
                "/settings/integrations/{kind}",
                get(load::<S>).patch(save::<S>),
            )
            .route(
                "/settings/backups/state",
                get(backup_state::<S>).patch(backup_toggle::<S>),
            )
            .route("/settings/mail/test", post(test_mail::<S>))
            .route("/settings/audit/{id}/test", post(test_audit::<S>))
            .layer(DefaultBodyLimit::max(600 * 1024)),
        IdentityAudience::Customer => Router::new()
            .route("/payments/{view}", get(payment_view::<S>))
            .route("/payments", post(payment_command::<S>)),
    }
}
pub(super) fn callback_router<S: SessionState + Clone + Send + Sync + 'static>() -> Router<S> {
    Router::new()
        .route("/api/payments/alipay/notify", post(notify::<S>))
        .layer(DefaultBodyLimit::max(32 * 1024))
}
async fn load<S: SessionState>(
    State(state): State<S>,
    r: IdentityRequest,
    Path(kind): Path<String>,
) -> Result<Json<Value>, IdentityHttpError> {
    let s = r.authenticate(state.admin_services().identity()).await?;
    state
        .admin_services()
        .application_settings()
        .load(&kind, &s)
        .await
        .map(Json)
        .map_err(|e| r.error(e))
}
#[derive(Deserialize)]
#[serde(deny_unknown_fields)]
struct Input {
    values: Value,
    #[serde(default = "empty")]
    secrets: Value,
}
fn empty() -> Value {
    json!({})
}
async fn backup_state<S: SessionState>(
    State(state): State<S>,
    r: IdentityRequest,
) -> Result<Json<Value>, IdentityHttpError> {
    let s = r.authenticate(state.admin_services().identity()).await?;
    state
        .admin_services()
        .application_settings()
        .backup_storage(&s, None, None)
        .await
        .map(Json)
        .map_err(|e| r.error(e))
}
#[derive(Deserialize)]
#[serde(deny_unknown_fields)]
struct BackupToggle {
    enabled: bool,
}
async fn backup_toggle<S: SessionState>(
    State(state): State<S>,
    r: IdentityRequest,
    input: Result<Json<BackupToggle>, JsonRejection>,
) -> Result<Json<Value>, IdentityHttpError> {
    r.require_csrf()?;
    let Json(input) = input.map_err(|_| r.error(IdentityError::Invalid))?;
    let s = r.authenticate(state.admin_services().identity()).await?;
    state
        .admin_services()
        .application_settings()
        .backup_storage(&s, Some(r.revision()?), Some(input.enabled))
        .await
        .map(Json)
        .map_err(|e| r.error(e))
}
async fn save<S: SessionState>(
    State(state): State<S>,
    r: IdentityRequest,
    Path(kind): Path<String>,
    input: Result<Json<Input>, JsonRejection>,
) -> Result<Json<Value>, IdentityHttpError> {
    r.require_csrf()?;
    let Json(input) = input.map_err(|_| r.error(IdentityError::Invalid))?;
    let s = r.authenticate(state.admin_services().identity()).await?;
    state
        .admin_services()
        .application_settings()
        .save(&kind, &s, r.revision()?, input.values, input.secrets)
        .await
        .map(Json)
        .map_err(|e| r.error(e))
}
#[derive(Deserialize)]
#[serde(deny_unknown_fields)]
struct MailTest {
    recipient: Option<String>,
}
async fn test_mail<S: SessionState>(
    State(state): State<S>,
    r: IdentityRequest,
    input: Result<Json<MailTest>, JsonRejection>,
) -> Result<Json<Value>, IdentityHttpError> {
    r.require_csrf()?;
    let Json(input) = input.map_err(|_| r.error(IdentityError::Invalid))?;
    let s = r.authenticate(state.admin_services().identity()).await?;
    state
        .admin_services()
        .application_settings()
        .test_mail(&s, input.recipient)
        .await
        .map(Json)
        .map_err(|e| r.error(e))
}
async fn test_audit<S: SessionState>(
    State(state): State<S>,
    r: IdentityRequest,
    Path(id): Path<String>,
) -> Result<Json<Value>, IdentityHttpError> {
    r.require_csrf()?;
    let s = r.authenticate(state.admin_services().identity()).await?;
    state
        .admin_services()
        .application_settings()
        .audit_probe(&s, &id)
        .await
        .map(Json)
        .map_err(|e| r.error(e))
}
async fn payment_view<S: SessionState>(
    State(state): State<S>,
    Extension(p): Extension<IdentityPolicy>,
    r: IdentityRequest,
    Path(view): Path<String>,
) -> Result<Json<Value>, IdentityHttpError> {
    if !["config", "orders"].contains(&view.as_str()) {
        return Err(r.error(IdentityError::NotFound));
    }
    let s = r.authenticate(state.admin_services().identity()).await?;
    state
        .admin_services()
        .application_settings()
        .payment(&s, json!({"action":view}), &p.public_origin)
        .await
        .map(Json)
        .map_err(|e| r.error(e))
}
async fn payment_command<S: SessionState>(
    State(state): State<S>,
    Extension(p): Extension<IdentityPolicy>,
    r: IdentityRequest,
    input: Result<Json<Value>, JsonRejection>,
) -> Result<Json<Value>, IdentityHttpError> {
    r.require_csrf()?;
    let Json(input) = input.map_err(|_| r.error(IdentityError::Invalid))?;
    let s = r.authenticate(state.admin_services().identity()).await?;
    state
        .admin_services()
        .application_settings()
        .payment(&s, input, &p.public_origin)
        .await
        .map(Json)
        .map_err(|e| r.error(e))
}
async fn notify<S: SessionState>(
    State(state): State<S>,
    Form(fields): Form<Vec<(String, String)>>,
) -> (StatusCode, &'static str) {
    match state
        .admin_services()
        .application_settings()
        .notify(fields)
        .await
    {
        Ok(()) => (StatusCode::OK, "success"),
        Err(_) => (StatusCode::BAD_REQUEST, "failure"),
    }
}
