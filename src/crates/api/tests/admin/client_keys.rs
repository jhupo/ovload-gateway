//! Superseded global key endpoints are gone; tenant APIs reject model credentials.

use axum::{
    body::Body,
    http::{Method, Request, StatusCode},
};
use tower::ServiceExt as _;

#[tokio::test]
async fn global_key_and_plaintext_recovery_routes_are_absent() {
    let fixture = super::AdminTestFixture::new().await;
    let app = crate::openai::api_router_with_admin(fixture.services);
    for path in [
        "/api/admin/client-keys",
        "/api/admin/client-keys/reveal?id=key-fixture",
        "/api/key-usage/config",
        "/api/key-usage/overview",
    ] {
        let response = app
            .clone()
            .oneshot(Request::get(path).body(Body::empty()).unwrap())
            .await
            .unwrap();
        assert_eq!(response.status(), StatusCode::NOT_FOUND, "{path}");
    }
}

#[tokio::test]
async fn model_credentials_cannot_authenticate_customer_or_management_key_routes() {
    let fixture = super::AdminTestFixture::new().await;
    let app = crate::openai::api_router_with_admin(fixture.services);
    for prefix in ["/api/v1", "/api/admin/v1"] {
        let response = app
            .clone()
            .oneshot(
                Request::builder()
                    .method(Method::GET)
                    .uri(format!("{prefix}/api-keys"))
                    .header("authorization", "Bearer model-secret-fixture")
                    .body(Body::empty())
                    .unwrap(),
            )
            .await
            .unwrap();
        assert_eq!(response.status(), StatusCode::UNAUTHORIZED);
        assert_eq!(response.headers()["cache-control"], "no-store");
        let body = crate::support::response_json(response).await;
        assert!(!body.to_string().contains("model-secret-fixture"));
    }
}

#[tokio::test]
async fn model_keys_cannot_start_a_browser_identity_session() {
    let (app, _) = crate::support::auth_app().await;
    let response = app
        .oneshot(crate::support::json_request(
            Method::POST,
            "/api/admin/v1/auth/sessions",
            serde_json::json!({ "mode":"key", "apiKey":"model-secret-fixture" }),
        ))
        .await
        .unwrap();
    assert_eq!(response.status(), StatusCode::BAD_REQUEST);
    assert!(!response.headers().contains_key("set-cookie"));
}
