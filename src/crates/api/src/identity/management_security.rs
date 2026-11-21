//! Current operator profile and effective authority projections.

use axum::{
    Json, Router,
    extract::State,
    http::{StatusCode, header},
    response::{IntoResponse, Response},
    routing::get,
};
use ovload_admin::model::{
    identity_access::IdentitySession,
    management_security::{GrantRecord, PrincipalRecord},
};
use serde_json::{Value, json};

use super::{extract::IdentityRequest, wire::IdentityHttpError};
use crate::auth::SessionState;

pub(super) fn router<S: SessionState + Clone + Send + Sync + 'static>() -> Router<S> {
    Router::new()
        .route("/profile", get(own_profile::<S>))
        .route("/session/permissions", get(permissions::<S>))
}

async fn session<S: SessionState>(
    state: &S,
    request: &IdentityRequest,
) -> Result<IdentitySession, IdentityHttpError> {
    request
        .authenticate(state.admin_services().identity())
        .await
}

fn versioned(status: StatusCode, view: Value, revision: u64) -> Response {
    (
        status,
        [(header::ETAG, format!("\"{revision}\""))],
        Json(view),
    )
        .into_response()
}

fn principal_view(row: PrincipalRecord) -> Value {
    json!({"id":row.id.to_string(),"username":row.username,"status":row.status,"revision":row.revision,"created_at":row.created_at,"updated_at":row.updated_at})
}

fn grant_view(row: GrantRecord) -> Value {
    json!({"id":row.id,"principal_id":row.principal_id.to_string(),"scope":row.scope.as_str(),"tenant_id":row.scope.tenant_id().map(|id|id.to_string()),"permissions":row.permissions.iter().map(|p|p.as_str()).collect::<Vec<_>>(),"status":row.status,"expires_at":row.expires_at,"revision":row.revision,"created_at":row.created_at,"updated_at":row.updated_at})
}

async fn permissions<S: SessionState>(
    State(state): State<S>,
    request: IdentityRequest,
) -> Result<Response, IdentityHttpError> {
    let session = session(&state, &request).await?;
    let rows = state
        .admin_services()
        .management_security()
        .permissions(&session)
        .await
        .map_err(|e| request.error(e))?;
    Ok(Json(json!({"items":rows.into_iter().map(grant_view).collect::<Vec<_>>()})).into_response())
}

async fn own_profile<S: SessionState>(
    State(state): State<S>,
    request: IdentityRequest,
) -> Result<Response, IdentityHttpError> {
    let session = session(&state, &request).await?;
    let row = state
        .admin_services()
        .management_security()
        .own_profile(&session)
        .await
        .map_err(|e| request.error(e))?;
    let revision = row.revision;
    Ok(versioned(StatusCode::OK, principal_view(row), revision))
}
