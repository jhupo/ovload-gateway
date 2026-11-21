use super::{extract::IdentityRequest, wire::IdentityHttpError};
use crate::auth::SessionState;
use axum::{
    Json, Router,
    extract::{
        DefaultBodyLimit, Query, State,
        rejection::{JsonRejection, QueryRejection},
    },
    routing::{get, post},
};
use chrono::{DateTime, Utc};
use ovload_admin::{
    model::identity_access::IdentityError,
    ports::monitoring::{LogConfig, LogQuery},
};
use serde::Deserialize;
use serde_json::{Value, json};

pub(super) fn router<S: SessionState + Clone + Send + Sync + 'static>() -> Router<S> {
    Router::new()
        .route("/monitoring/resources", get(resources::<S>))
        .route("/monitoring/logs", get(logs::<S>))
        .route("/monitoring/logs/config", get(config::<S>).put(save::<S>))
        .route("/monitoring/logs/cleanup", post(cleanup::<S>))
        .layer(DefaultBodyLimit::max(4096))
}
async fn resources<S: SessionState>(
    State(state): State<S>,
    r: IdentityRequest,
) -> Result<Json<Value>, IdentityHttpError> {
    let s = r.authenticate(state.admin_services().identity()).await?;
    let (store, runtime) = state
        .admin_services()
        .monitoring()
        .ok_or_else(|| r.error(IdentityError::Unavailable))?;
    let mut result = store.resources(&s).await.map_err(|e| r.error(e))?;
    result["process"] = runtime.snapshot();
    Ok(Json(result))
}
async fn logs<S: SessionState>(
    State(state): State<S>,
    r: IdentityRequest,
    q: Result<Query<LogQuery>, QueryRejection>,
) -> Result<Json<Value>, IdentityHttpError> {
    let Query(q) = q.map_err(|_| r.error(IdentityError::Invalid))?;
    let s = r.authenticate(state.admin_services().identity()).await?;
    let (store, _) = state
        .admin_services()
        .monitoring()
        .ok_or_else(|| r.error(IdentityError::Unavailable))?;
    store.logs(&s, &q).await.map(Json).map_err(|e| r.error(e))
}
async fn config<S: SessionState>(
    State(state): State<S>,
    r: IdentityRequest,
) -> Result<Json<LogConfig>, IdentityHttpError> {
    let s = r.authenticate(state.admin_services().identity()).await?;
    let (store, _) = state
        .admin_services()
        .monitoring()
        .ok_or_else(|| r.error(IdentityError::Unavailable))?;
    store.config(&s).await.map(Json).map_err(|e| r.error(e))
}
async fn save<S: SessionState>(
    State(state): State<S>,
    r: IdentityRequest,
    body: Result<Json<LogConfig>, JsonRejection>,
) -> Result<Json<LogConfig>, IdentityHttpError> {
    r.require_csrf()?;
    let Json(cfg) = body.map_err(|_| r.error(IdentityError::Invalid))?;
    if r.revision()? != cfg.revision as u64 {
        return Err(r.error(IdentityError::Invalid));
    }
    let s = r.authenticate(state.admin_services().identity()).await?;
    let (store, _) = state
        .admin_services()
        .monitoring()
        .ok_or_else(|| r.error(IdentityError::Unavailable))?;
    store
        .save_config(&s, cfg)
        .await
        .map(Json)
        .map_err(|e| r.error(e))
}
#[derive(Deserialize)]
#[serde(deny_unknown_fields)]
struct Cleanup {
    before: DateTime<Utc>,
}
async fn cleanup<S: SessionState>(
    State(state): State<S>,
    r: IdentityRequest,
    body: Result<Json<Cleanup>, JsonRejection>,
) -> Result<Json<Value>, IdentityHttpError> {
    r.require_csrf()?;
    let Json(input) = body.map_err(|_| r.error(IdentityError::Invalid))?;
    let s = r.authenticate(state.admin_services().identity()).await?;
    let (store, _) = state
        .admin_services()
        .monitoring()
        .ok_or_else(|| r.error(IdentityError::Unavailable))?;
    let deleted = store
        .cleanup(&s, input.before)
        .await
        .map_err(|e| r.error(e))?;
    Ok(Json(json!({"deleted":deleted,"hasMore":deleted==10000})))
}
