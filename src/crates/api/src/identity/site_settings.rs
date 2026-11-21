//! Public site metadata and management-only singleton mutations.

use axum::{
    Json, Router,
    extract::{DefaultBodyLimit, FromRequest as _, Request, State, rejection::JsonRejection},
    http::{HeaderMap, header},
    response::{IntoResponse, Response},
    routing::get,
};
use bytes::Bytes;
use chrono::{DateTime, Utc};
use ovload_admin::model::{
    identity_access::{IdentityAudience, IdentityError},
    site_settings::{MAX_SITE_LOGO_UPLOAD_BYTES, SiteSettings, UpdateSiteSettings},
};
use serde::{Deserialize, Serialize};

use crate::auth::SessionState;

use super::{extract::IdentityRequest, wire::IdentityHttpError};

pub(super) fn router<S: SessionState + Clone + Send + Sync + 'static>(
    audience: IdentityAudience,
) -> Router<S> {
    match audience {
        IdentityAudience::Customer => Router::new()
            .route("/site-settings", get(public_get::<S>))
            .route("/site-settings/logo", get(public_logo::<S>)),
        IdentityAudience::Management => Router::new()
            .route(
                "/site-settings",
                get(management_get::<S>).patch(update::<S>),
            )
            .route(
                "/site-settings/logo",
                axum::routing::put(upload_logo::<S>).delete(delete_logo::<S>),
            ),
    }
}

#[derive(Deserialize)]
#[serde(deny_unknown_fields)]
struct SettingsInput {
    name: String,
    subtitle: String,
    support: String,
    endpoint: String,
}

#[derive(Serialize)]
struct SettingsView {
    timezone: String,
    revision: u64,
    name: String,
    subtitle: String,
    support: String,
    endpoint: String,
    logo_url: Option<String>,
    logo_width: Option<u32>,
    logo_height: Option<u32>,
    updated_at: DateTime<Utc>,
}

fn metadata(settings: SiteSettings, timezone: ovload_core::time::DeploymentTimeZone) -> Response {
    let logo_url = settings
        .logo
        .as_ref()
        .map(|_| format!("/api/v1/site-settings/logo?v={}", settings.revision));
    let view = SettingsView {
        timezone: timezone.name().to_owned(),
        revision: settings.revision,
        name: settings.name,
        subtitle: settings.subtitle,
        support: settings.support,
        endpoint: settings.endpoint,
        logo_url,
        logo_width: settings.logo.as_ref().map(|logo| logo.width),
        logo_height: settings.logo.as_ref().map(|logo| logo.height),
        updated_at: settings.updated_at,
    };
    (
        [(header::ETAG, format!("\"{}\"", view.revision))],
        Json(view),
    )
        .into_response()
}

async fn public_get<S: SessionState>(
    State(state): State<S>,
    request: IdentityRequest,
) -> Result<Response, IdentityHttpError> {
    let settings = state
        .admin_services()
        .site_settings()
        .public_get()
        .await
        .map_err(|error| request.error(error))?;
    Ok(metadata(settings, state.admin_services().timezone()))
}

async fn public_logo<S: SessionState>(
    State(state): State<S>,
    request: IdentityRequest,
) -> Result<Response, IdentityHttpError> {
    let settings = state
        .admin_services()
        .site_settings()
        .public_get()
        .await
        .map_err(|error| request.error(error))?;
    let logo = settings
        .logo
        .ok_or_else(|| request.error(IdentityError::NotFound))?;
    Ok((
        [
            (header::CONTENT_TYPE, "image/png".to_owned()),
            (header::CONTENT_DISPOSITION, "inline".to_owned()),
            (header::ETAG, format!("\"{}\"", settings.revision)),
        ],
        logo.png,
    )
        .into_response())
}

async fn management_get<S: SessionState>(
    State(state): State<S>,
    request: IdentityRequest,
) -> Result<Response, IdentityHttpError> {
    let session = request
        .authenticate(state.admin_services().identity())
        .await?;
    let settings = state
        .admin_services()
        .site_settings()
        .get(&session)
        .await
        .map_err(|error| request.error(error))?;
    Ok(metadata(settings, state.admin_services().timezone()))
}

async fn update<S: SessionState>(
    State(state): State<S>,
    request: IdentityRequest,
    payload: Result<Json<SettingsInput>, JsonRejection>,
) -> Result<Response, IdentityHttpError> {
    request.require_csrf()?;
    let Json(input) = payload.map_err(|_| request.error(IdentityError::Invalid))?;
    let session = request
        .authenticate(state.admin_services().identity())
        .await?;
    let settings = state
        .admin_services()
        .site_settings()
        .update(
            &session,
            request.revision()?,
            UpdateSiteSettings {
                name: input.name,
                subtitle: input.subtitle,
                support: input.support,
                endpoint: input.endpoint,
            },
        )
        .await
        .map_err(|error| request.error(error))?;
    Ok(metadata(settings, state.admin_services().timezone()))
}

async fn upload_logo<S: SessionState + Send + Sync>(
    State(state): State<S>,
    request: IdentityRequest,
    mut payload: Request,
) -> Result<Response, IdentityHttpError> {
    request.require_csrf()?;
    let session = request
        .authenticate(state.admin_services().identity())
        .await?;
    let content_type = image_content_type(payload.headers())
        .map_err(|error| request.error(error))?
        .to_owned();
    DefaultBodyLimit::max(MAX_SITE_LOGO_UPLOAD_BYTES).apply(&mut payload);
    let bytes = match Bytes::from_request(payload, &state).await {
        Ok(bytes) => bytes,
        Err(error) => return Ok(error.into_response()),
    };
    let settings = state
        .admin_services()
        .site_settings()
        .upload_logo(&session, request.revision()?, bytes.to_vec(), &content_type)
        .await
        .map_err(|error| request.error(error))?;
    Ok(metadata(settings, state.admin_services().timezone()))
}

async fn delete_logo<S: SessionState>(
    State(state): State<S>,
    request: IdentityRequest,
) -> Result<Response, IdentityHttpError> {
    request.require_csrf()?;
    let session = request
        .authenticate(state.admin_services().identity())
        .await?;
    let settings = state
        .admin_services()
        .site_settings()
        .delete_logo(&session, request.revision()?)
        .await
        .map_err(|error| request.error(error))?;
    Ok(metadata(settings, state.admin_services().timezone()))
}

fn image_content_type(headers: &HeaderMap) -> Result<&str, IdentityError> {
    if headers.get_all(header::CONTENT_TYPE).iter().count() != 1
        || headers.contains_key(header::CONTENT_ENCODING)
    {
        return Err(IdentityError::Invalid);
    }
    headers
        .get(header::CONTENT_TYPE)
        .and_then(|value| value.to_str().ok())
        .filter(|value| matches!(*value, "image/png" | "image/jpeg"))
        .ok_or(IdentityError::Invalid)
}
