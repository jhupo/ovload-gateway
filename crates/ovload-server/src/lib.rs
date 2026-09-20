//! HTTP application assembly, independent of process startup.
use axum::{Json, Router, routing::get};
use serde::Serialize;

#[derive(Serialize)]
struct Health {
    status: &'static str,
    service: &'static str,
    version: &'static str,
}

async fn health() -> Json<Health> {
    Json(Health {
        status: "ok",
        service: "ovload-gateway",
        version: env!("CARGO_PKG_VERSION"),
    })
}

pub fn router() -> Router {
    Router::new().route("/healthz", get(health))
}

pub mod storage;

/// Assemble deployed routes; missing model endpoints remain explicit 404s.
pub fn deployed_router(dependencies: storage::Dependencies, web_dir: std::path::PathBuf) -> Router {
    use axum::{extract::State, http::StatusCode};
    use tower_http::services::{ServeDir, ServeFile};
    async fn ready(State(deps): State<storage::Dependencies>) -> StatusCode {
        if deps.ready().await {
            StatusCode::OK
        } else {
            StatusCode::SERVICE_UNAVAILABLE
        }
    }
    router()
        .merge(
            Router::new()
                .route("/readyz", get(ready))
                .with_state(dependencies),
        )
        .route_service("/login", ServeFile::new(web_dir.join("index.html")))
        .fallback_service(ServeDir::new(web_dir))
}
