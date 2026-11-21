//! Current-owner avatar metadata and canonical image delivery for both audiences.

use axum::{
    Json, Router,
    body::Bytes,
    extract::{DefaultBodyLimit, FromRequest as _, Request, State},
    http::{HeaderValue, header},
    response::{IntoResponse as _, Response},
    routing::get,
};
use ovload_admin::model::{
    identity_access::{IdentityAudience, IdentityError},
    profile_avatar::{MAX_AVATAR_UPLOAD_BYTES, ProfileAvatar},
};
use serde_json::json;

use super::{extract::IdentityRequest, wire::IdentityHttpError};
use crate::auth::SessionState;

pub(super) fn router<S: SessionState + Clone + Send + Sync + 'static>() -> Router<S> {
    Router::new()
        .route(
            "/profile/avatar",
            get(metadata::<S>)
                .put(upload::<S>)
                .delete(delete::<S>)
                .layer(DefaultBodyLimit::max(MAX_AVATAR_UPLOAD_BYTES)),
        )
        .route("/profile/avatar/image", get(image::<S>))
}

async fn metadata<S: SessionState>(
    State(state): State<S>,
    request: IdentityRequest,
) -> Result<Response, IdentityHttpError> {
    let current = request
        .authenticate(state.admin_services().identity())
        .await?;
    let value = state
        .admin_services()
        .profile_avatar()
        .get(&current)
        .await
        .map_err(|error| request.error(error))?;
    metadata_response(value, &request)
}

async fn upload<S: SessionState + Send + Sync>(
    State(state): State<S>,
    request: IdentityRequest,
    mut payload: Request,
) -> Result<Response, IdentityHttpError> {
    request.require_csrf()?;
    let revision = request.revision()?;
    let current = request
        .authenticate(state.admin_services().identity())
        .await?;
    if payload.headers().contains_key(header::CONTENT_ENCODING) {
        return Err(request.error(IdentityError::Invalid));
    }
    let mut content_types = payload.headers().get_all(header::CONTENT_TYPE).iter();
    let content_type = content_types
        .next()
        .filter(|_| content_types.next().is_none())
        .and_then(|value| value.to_str().ok())
        .filter(|value| matches!(*value, "image/png" | "image/jpeg" | "image/webp"))
        .ok_or_else(|| request.error(IdentityError::Invalid))?
        .to_owned();
    // Reapply at extraction so an enclosing JSON limit cannot narrow this route.
    DefaultBodyLimit::max(MAX_AVATAR_UPLOAD_BYTES).apply(&mut payload);
    let bytes = match Bytes::from_request(payload, &state).await {
        Ok(bytes) => bytes,
        Err(error) => return Ok(error.into_response()),
    };
    let value = state
        .admin_services()
        .profile_avatar()
        .upload(&current, revision, bytes.to_vec(), &content_type)
        .await
        .map_err(|error| request.error(error))?;
    metadata_response(value, &request)
}

async fn delete<S: SessionState>(
    State(state): State<S>,
    request: IdentityRequest,
) -> Result<Response, IdentityHttpError> {
    request.require_csrf()?;
    let revision = request.revision()?;
    let current = request
        .authenticate(state.admin_services().identity())
        .await?;
    let value = state
        .admin_services()
        .profile_avatar()
        .delete(&current, revision)
        .await
        .map_err(|error| request.error(error))?;
    metadata_response(value, &request)
}

async fn image<S: SessionState>(
    State(state): State<S>,
    request: IdentityRequest,
) -> Result<Response, IdentityHttpError> {
    let current = request
        .authenticate(state.admin_services().identity())
        .await?;
    let value = state
        .admin_services()
        .profile_avatar()
        .get(&current)
        .await
        .map_err(|error| request.error(error))?;
    let asset = value
        .asset
        .ok_or_else(|| request.error(IdentityError::NotFound))?;
    let mut response = asset.png.into_response();
    response
        .headers_mut()
        .insert(header::CONTENT_TYPE, HeaderValue::from_static("image/png"));
    response.headers_mut().insert(
        header::CONTENT_DISPOSITION,
        HeaderValue::from_static("inline; filename=\"avatar.png\""),
    );
    version_response(response, value.revision, &request)
}

fn metadata_response(
    value: ProfileAvatar,
    request: &IdentityRequest,
) -> Result<Response, IdentityHttpError> {
    let prefix = match request.audience {
        IdentityAudience::Customer => "/api/v1",
        IdentityAudience::Management => "/api/admin/v1",
    };
    let url = value
        .asset
        .as_ref()
        .map(|_| format!("{prefix}/profile/avatar/image"));
    let width = value.asset.as_ref().map(|asset| asset.width);
    let height = value.asset.as_ref().map(|asset| asset.height);
    let response = Json(json!({
        "revision":value.revision,
        "has_avatar":value.asset.is_some(),
        "url":url,
        "width":width,
        "height":height,
        "updated_at":value.updated_at,
    }))
    .into_response();
    version_response(response, value.revision, request)
}

fn version_response(
    mut response: Response,
    revision: u64,
    request: &IdentityRequest,
) -> Result<Response, IdentityHttpError> {
    response.headers_mut().insert(
        header::ETAG,
        format!("\"{revision}\"")
            .parse()
            .map_err(|_| request.error(IdentityError::Unavailable))?,
    );
    Ok(response)
}
