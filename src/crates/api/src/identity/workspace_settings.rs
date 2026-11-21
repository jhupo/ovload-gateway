//! Feature/page configuration and public visibility flags.

use super::{extract::IdentityRequest, wire::IdentityHttpError};
use crate::auth::SessionState;
use axum::{
    Json, Router,
    extract::{DefaultBodyLimit, Path, State, rejection::JsonRejection},
    http::header,
    response::{IntoResponse, Response},
    routing::get,
};
use ovload_admin::model::{
    identity_access::{IdentityAudience, IdentityError},
    workspace_settings::{WorkspaceSettings, WorkspaceSettingsKind},
};
use serde::Deserialize;

pub(super) fn router<S: SessionState + Clone + Send + Sync + 'static>(
    audience: IdentityAudience,
) -> Router<S> {
    match audience {
        IdentityAudience::Customer => {
            Router::new().route("/workspace/visibility", get(public_get::<S>))
        }
        IdentityAudience::Management => Router::new().route(
            "/workspace/settings/{kind}",
            get(management_get::<S>)
                .patch(update::<S>)
                .layer(DefaultBodyLimit::max(256 * 1024 + 1024)),
        ),
    }
}

fn metadata(settings: WorkspaceSettings) -> Response {
    (
        [(header::ETAG, format!("\"{}\"", settings.revision))],
        Json(settings),
    )
        .into_response()
}

async fn public_get<S: SessionState>(
    State(state): State<S>,
    request: IdentityRequest,
) -> Result<Response, IdentityHttpError> {
    let flags = state
        .admin_services()
        .site_settings()
        .workspace_visibility()
        .await
        .map_err(|e| request.error(e))?;
    Ok(Json(flags).into_response())
}

async fn management_get<S: SessionState>(
    State(state): State<S>,
    request: IdentityRequest,
    Path(kind): Path<WorkspaceSettingsKind>,
) -> Result<Response, IdentityHttpError> {
    let session = request
        .authenticate(state.admin_services().identity())
        .await?;
    let result = state
        .admin_services()
        .site_settings()
        .workspace_get(&session, kind)
        .await
        .map_err(|e| request.error(e))?;
    Ok(metadata(result))
}

#[derive(Deserialize)]
#[serde(deny_unknown_fields)]
struct Input {
    values: serde_json::Value,
}

async fn update<S: SessionState>(
    State(state): State<S>,
    request: IdentityRequest,
    Path(kind): Path<WorkspaceSettingsKind>,
    payload: Result<Json<Input>, JsonRejection>,
) -> Result<Response, IdentityHttpError> {
    request.require_csrf()?;
    let Json(input) = payload.map_err(|_| request.error(IdentityError::Invalid))?;
    let session = request
        .authenticate(state.admin_services().identity())
        .await?;
    let result = state
        .admin_services()
        .site_settings()
        .workspace_update(&session, kind, request.revision()?, input.values)
        .await
        .map_err(|e| request.error(e))?;
    Ok(metadata(result))
}
