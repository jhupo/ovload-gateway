use super::{extract::IdentityRequest, wire::IdentityHttpError};
use crate::auth::SessionState;
use axum::{
    Json, Router,
    extract::{ConnectInfo, State, rejection::JsonRejection},
    response::{IntoResponse, Response},
    routing::{get, post},
};
use ovload_admin::model::{
    identity_access::{IdentityAudience, IdentityError},
    identity_security::SecurityPolicy,
};
use secrecy::{ExposeSecret as _, SecretString};
use serde::Deserialize;
use serde_json::{Value, json};
use std::net::SocketAddr;
pub(super) fn router<S: SessionState + Clone + Send + Sync + 'static>(
    audience: IdentityAudience,
) -> Router<S> {
    let r = Router::new()
        .route("/auth/security-policy", get(public::<S>))
        .route("/auth/step-up", post(step_up::<S>))
        .route("/auth/step-up/status", get(step_up_status::<S>));
    if audience == IdentityAudience::Management {
        r.route("/security-settings", get(load::<S>).patch(save::<S>))
            .route(
                "/security-settings/admin-key",
                get(key_status::<S>).post(key::<S>).delete(revoke_key::<S>),
            )
    } else {
        r
    }
}
#[derive(Deserialize)]
#[serde(deny_unknown_fields)]
struct Update {
    values: SecurityPolicy,
    #[serde(default = "empty")]
    secrets: Value,
}
fn empty() -> Value {
    json!({})
}
async fn step_up_status<S: SessionState>(
    State(s): State<S>,
    r: IdentityRequest,
) -> Result<Response, IdentityHttpError> {
    let session = r.authenticate(s.admin_services().identity()).await?;
    let allowed = s
        .admin_services()
        .identity()
        .step_up_allowed(&session)
        .await
        .map_err(|e| r.error(e))?;
    Ok(Json(json!({"allowed":allowed})).into_response())
}
#[derive(Deserialize)]
#[serde(deny_unknown_fields)]
struct Password {
    password: String,
}
async fn public<S: SessionState>(
    State(s): State<S>,
    r: IdentityRequest,
) -> Result<Response, IdentityHttpError> {
    let p = s
        .admin_services()
        .identity()
        .security_policy()
        .await
        .map_err(|e| r.error(e))?;
    Ok(Json(json!({"humanVerification":p.human_verification,"siteKey":if p.human_verification{p.captcha_site_key}else{String::new()}})).into_response())
}
async fn load<S: SessionState>(
    State(s): State<S>,
    r: IdentityRequest,
) -> Result<Response, IdentityHttpError> {
    let session = r.authenticate(s.admin_services().identity()).await?;
    Ok(Json(
        s.admin_services()
            .identity_lifecycle()
            .security_settings(&session)
            .await
            .map_err(|e| r.error(e))?,
    )
    .into_response())
}
async fn save<S: SessionState>(
    State(s): State<S>,
    r: IdentityRequest,
    payload: Result<Json<Update>, JsonRejection>,
) -> Result<Response, IdentityHttpError> {
    r.require_csrf()?;
    let Json(v) = payload.map_err(|_| r.error(IdentityError::Invalid))?;
    let session = r.authenticate(s.admin_services().identity()).await?;
    Ok(Json(
        s.admin_services()
            .identity_lifecycle()
            .save_security_settings(&session, r.revision()?, v.values, v.secrets)
            .await
            .map_err(|e| r.error(e))?,
    )
    .into_response())
}
async fn step_up<S: SessionState>(
    State(s): State<S>,
    r: IdentityRequest,
    ConnectInfo(peer): ConnectInfo<SocketAddr>,
    payload: Result<Json<Password>, JsonRejection>,
) -> Result<Response, IdentityHttpError> {
    r.require_csrf()?;
    let Json(v) = payload.map_err(|_| r.error(IdentityError::Invalid))?;
    let session = r.authenticate(s.admin_services().identity()).await?;
    s.admin_services()
        .identity_lifecycle()
        .verify_step_up(&session, SecretString::from(v.password), peer.ip())
        .await
        .map_err(|e| r.error(e))?;
    Ok(Json(json!({"verified":true,"expiresInSeconds":600})).into_response())
}
async fn key<S: SessionState>(
    State(s): State<S>,
    r: IdentityRequest,
) -> Result<Response, IdentityHttpError> {
    r.require_csrf()?;
    let session = r.authenticate(s.admin_services().identity()).await?;
    s.admin_services()
        .identity_lifecycle()
        .security_settings(&session)
        .await
        .map_err(|e| r.error(e))?;
    let grant = s
        .admin_services()
        .identity()
        .rotate_admin_key(&session)
        .await
        .map_err(|e| r.error(e))?;
    Ok(
        Json(
            json!({"key":grant.access_token.expose_secret(),"expiresAt":grant.session.expires_at}),
        )
        .into_response(),
    )
}

async fn key_status<S: SessionState>(
    State(state): State<S>,
    request: IdentityRequest,
) -> Result<Response, IdentityHttpError> {
    let session = request
        .authenticate(state.admin_services().identity())
        .await?;
    let status = state
        .admin_services()
        .identity()
        .admin_key_status(&session)
        .await
        .map_err(|error| request.error(error))?;
    Ok(Json(status).into_response())
}

async fn revoke_key<S: SessionState>(
    State(state): State<S>,
    request: IdentityRequest,
) -> Result<Response, IdentityHttpError> {
    request.require_csrf()?;
    let session = request
        .authenticate(state.admin_services().identity())
        .await?;
    state
        .admin_services()
        .identity()
        .revoke_admin_key(&session)
        .await
        .map_err(|error| request.error(error))?;
    Ok(axum::http::StatusCode::NO_CONTENT.into_response())
}
