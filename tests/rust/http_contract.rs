use axum::{
    body::{Body, to_bytes},
    http::{Request, StatusCode},
};
use tower::ServiceExt;

#[tokio::test]
async fn liveness_is_json_and_reports_the_compiled_version() {
    let response = ovload_server::router()
        .oneshot(
            Request::builder()
                .uri("/healthz")
                .body(Body::empty())
                .unwrap(),
        )
        .await
        .unwrap();
    assert_eq!(response.status(), StatusCode::OK);
    assert_eq!(response.headers()["content-type"], "application/json");
    let body = to_bytes(response.into_body(), 4096).await.unwrap();
    let value: serde_json::Value = serde_json::from_slice(&body).unwrap();
    assert_eq!(value["status"], "ok");
    assert_eq!(value["service"], "ovload-gateway");
    assert_eq!(value["version"], env!("CARGO_PKG_VERSION"));
}

#[tokio::test]
async fn unfinished_model_endpoint_is_not_reported_as_available() {
    let response = ovload_server::router()
        .oneshot(
            Request::builder()
                .method("POST")
                .uri("/v1/responses")
                .body(Body::empty())
                .unwrap(),
        )
        .await
        .unwrap();
    assert_eq!(response.status(), StatusCode::NOT_FOUND);
}

#[tokio::test]
async fn liveness_rejects_mutations() {
    let response = ovload_server::router()
        .oneshot(
            Request::builder()
                .method("POST")
                .uri("/healthz")
                .body(Body::empty())
                .unwrap(),
        )
        .await
        .unwrap();
    assert_eq!(response.status(), StatusCode::METHOD_NOT_ALLOWED);
}

#[tokio::test]
async fn deployed_static_routes_preserve_api_errors_and_readiness_failure() {
    let deps = ovload_server::storage::Dependencies {
        postgres: sqlx::postgres::PgPoolOptions::new()
            .acquire_timeout(std::time::Duration::from_millis(100))
            .connect_lazy("postgres://invalid:invalid@127.0.0.1:1/unavailable")
            .unwrap(),
        redis: redis::Client::open("redis://127.0.0.1:1/").unwrap(),
    };
    let dir = std::path::Path::new(env!("CARGO_MANIFEST_DIR")).join("../../tests/fixtures/static");
    let app = ovload_server::deployed_router(deps, dir);
    for (path, expected) in [
        ("/", StatusCode::OK),
        ("/login", StatusCode::OK),
        ("/healthz", StatusCode::OK),
        ("/readyz", StatusCode::SERVICE_UNAVAILABLE),
        ("/v1/responses", StatusCode::NOT_FOUND),
        ("/test.html", StatusCode::NOT_FOUND),
        ("/preview.html", StatusCode::NOT_FOUND),
        ("/missing.js", StatusCode::NOT_FOUND),
        ("/../Cargo.toml", StatusCode::NOT_FOUND),
    ] {
        let response = app
            .clone()
            .oneshot(Request::builder().uri(path).body(Body::empty()).unwrap())
            .await
            .unwrap();
        assert_eq!(response.status(), expected, "{path}");
        if path == "/" || path == "/login" {
            let body = to_bytes(response.into_body(), 4096).await.unwrap();
            assert!(String::from_utf8_lossy(&body).contains("Static contract fixture"));
        }
    }
}
