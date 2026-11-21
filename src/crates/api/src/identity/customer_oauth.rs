//! Browser-bound OAuth start and callback; credentials never enter redirects.
use super::{
    extract::IdentityRequest,
    wire::{self, IdentityHttpError},
};
use crate::auth::SessionState;
use axum::{
    Json, Router,
    extract::{
        ConnectInfo, Path, Query, State,
        rejection::{ExtensionRejection, JsonRejection, QueryRejection},
    },
    http::{HeaderMap, StatusCode, header},
    response::{IntoResponse, Response},
    routing::{get, post},
};
use ovload_admin::model::identity_access::{IdentityAudience, IdentityError};
use secrecy::SecretString;
use serde::Deserialize;
use std::net::SocketAddr;
pub(super) fn router<S: SessionState + Clone + Send + Sync + 'static>(
    audience: IdentityAudience,
) -> Router<S> {
    if audience == IdentityAudience::Management {
        return Router::new();
    }
    Router::new()
        .route("/auth/oauth/{provider}/start", post(start::<S>))
        .route("/auth/oauth/{provider}/callback", get(callback::<S>))
}
#[derive(Deserialize)]
#[serde(deny_unknown_fields)]
struct Start {
    invitation_code: Option<String>,
    email: Option<String>,
    display_name: Option<String>,
    consent_revision: Option<u64>,
}
#[derive(Deserialize)]
struct Callback {
    state: String,
    code: String,
}
async fn start<S: SessionState>(
    State(state): State<S>,
    request: IdentityRequest,
    Path(provider): Path<String>,
    peer: Result<ConnectInfo<SocketAddr>, ExtensionRejection>,
    payload: Result<Json<Start>, JsonRejection>,
) -> Result<Response, IdentityHttpError> {
    request.verify_human(&state).await?;
    let Json(value) = payload.map_err(|_| request.error(IdentityError::Invalid))?;
    let (url, browser) = state
        .admin_services()
        .identity_lifecycle()
        .begin_oauth(
            provider,
            value.email,
            value.display_name,
            value.consent_revision,
            peer.map_err(|_| request.error(IdentityError::Unavailable))?
                .0
                .ip(),
            value.invitation_code,
        )
        .await
        .map_err(|e| request.error(e))?;
    Ok((
        [(
            header::SET_COOKIE,
            format!(
                "__Host-ovload_oauth={browser}; Path=/; Secure; HttpOnly; SameSite=Lax; Max-Age=600"
            ),
        )],
        Json(serde_json::json!({"authorization_url":url})),
    )
        .into_response())
}
async fn callback<S: SessionState>(
    State(state): State<S>,
    request: IdentityRequest,
    Path(provider): Path<String>,
    headers: HeaderMap,
    query: Result<Query<Callback>, QueryRejection>,
) -> Result<Response, IdentityHttpError> {
    let Query(value) = query.map_err(|_| request.error(IdentityError::Invalid))?;
    let cookies = headers
        .get(header::COOKIE)
        .and_then(|v| v.to_str().ok())
        .ok_or_else(|| request.error(IdentityError::Unauthorized))?;
    let mut matching = cookies
        .split(';')
        .filter_map(|s| s.trim().strip_prefix("__Host-ovload_oauth="));
    let browser = matching
        .next()
        .ok_or_else(|| request.error(IdentityError::Unauthorized))?
        .to_owned();
    if matching.next().is_some() {
        return Err(request.error(IdentityError::Invalid));
    }
    let services = state.admin_services();
    let grant = services
        .identity_lifecycle()
        .complete_oauth(
            value.state,
            browser,
            provider,
            SecretString::from(value.code),
            services.identity(),
        )
        .await
        .map_err(|e| request.error(e))?;
    let (mut response, path) = if let Some(grant) = grant {
        (wire::grant_response(&request, &grant)?, "/user/dashboard")
    } else {
        (
            StatusCode::SEE_OTHER.into_response(),
            "/sign-up#verify-email",
        )
    };
    *response.status_mut() = StatusCode::SEE_OTHER;
    response
        .headers_mut()
        .insert(header::LOCATION, axum::http::HeaderValue::from_static(path));
    response.headers_mut().append(
        header::SET_COOKIE,
        axum::http::HeaderValue::from_static(
            "__Host-ovload_oauth=; Path=/; Secure; HttpOnly; SameSite=Lax; Max-Age=0",
        ),
    );
    // Session data is retrieved through the protected session route after navigation.
    *response.body_mut() = axum::body::Body::empty();
    Ok(response)
}
