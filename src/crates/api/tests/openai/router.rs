//! 验证 OpenAI 路由暴露范围、请求体限制与跨域行为

use axum::{
    body::Body,
    http::{Method, Request, StatusCode},
};
use tower::ServiceExt;

use super::api_router_with_origins;
use super::models::ModelsExecution;

const LARGE_BODY_BYTES: usize = 17 * 1024 * 1024;

#[tokio::test]
async fn browser_identity_requires_configured_origin_and_always_uses_secure_host_cookies() {
    use axum::body::to_bytes;
    use serde_json::{Value, json};
    let app = api_router_with_origins(ModelsExecution::new(), Vec::new())
        .await
        .layer(axum::Extension(axum::extract::ConnectInfo(
            std::net::SocketAddr::from(([127, 0, 0, 1], 41000)),
        )));
    for origins in [
        vec!["https://gateway.example.test"],
        vec!["http://admin.example.test"],
        vec!["http://192.0.2.1:8080"],
        vec!["http://[::1]:8080"],
        vec!["https://admin.example.test"],
        vec![],
        vec!["null"],
        vec!["invalid-origin"],
        vec!["http://admin.example.test/path"],
        vec!["http://admin.example.test?https"],
        vec!["http://user@admin.example.test"],
        vec!["http://admin.example.test", "https://admin.example.test"],
    ] {
        let request = |path: &str| {
            let mut builder = Request::post(path)
                .header("content-type", "application/json")
                .header("x-forwarded-proto", "http")
                .header("forwarded", "proto=http");
            for origin in &origins {
                builder = builder.header("origin", *origin);
            }
            builder
        };
        let response = app
            .clone()
            .oneshot(
                request("/api/admin/v1/auth/sessions")
                    .body(Body::from(
                        json!({"username": "admin_1", "password": "strong-admin-password"})
                            .to_string(),
                    ))
                    .unwrap(),
            )
            .await
            .unwrap();
        let expected = if origins.len() > 1 {
            StatusCode::BAD_REQUEST
        } else if origins == ["https://gateway.example.test"] {
            StatusCode::OK
        } else {
            StatusCode::FORBIDDEN
        };
        assert_eq!(response.status(), expected);
        if expected != StatusCode::OK {
            assert!(!response.headers().contains_key("set-cookie"));
            continue;
        }
        let cookie = response.headers()["set-cookie"].to_str().unwrap();
        let session = cookie.split(';').next().unwrap().to_owned();
        let attrs: Vec<_> = cookie.split(';').map(str::trim).collect();
        assert!(cookie.starts_with("__Host-ovload_management="));
        for attribute in ["Path=/", "Secure", "HttpOnly", "SameSite=Strict"] {
            assert!(attrs.contains(&attribute));
        }

        let response = app
            .clone()
            .oneshot(
                Request::get("/api/admin/v1/session")
                    .header("cookie", &session)
                    .body(Body::empty())
                    .unwrap(),
            )
            .await
            .unwrap();
        let body: Value =
            serde_json::from_slice(&to_bytes(response.into_body(), 4096).await.unwrap()).unwrap();
        assert_eq!(body["audience"], "management");
        let csrf = body["csrf_token"].as_str().unwrap();

        let response = app
            .clone()
            .oneshot(
                Request::delete("/api/admin/v1/auth/session")
                    .header("origin", "https://gateway.example.test")
                    .header("x-csrf-token", csrf)
                    .header("cookie", &session)
                    .body(Body::empty())
                    .unwrap(),
            )
            .await
            .unwrap();
        assert_eq!(response.status(), StatusCode::NO_CONTENT);
        let cookie = response.headers()["set-cookie"].to_str().unwrap();
        assert!(cookie.starts_with("__Host-ovload_management=;"));
        let attrs: Vec<_> = cookie.split(';').map(str::trim).collect();
        for attribute in [
            "Path=/",
            "Secure",
            "HttpOnly",
            "SameSite=Strict",
            "Max-Age=0",
        ] {
            assert!(attrs.contains(&attribute));
        }

        let response = app
            .clone()
            .oneshot(
                Request::get("/api/admin/v1/session")
                    .header("cookie", &session)
                    .body(Body::empty())
                    .unwrap(),
            )
            .await
            .unwrap();
        assert_eq!(response.status(), StatusCode::UNAUTHORIZED);
        let body: Value =
            serde_json::from_slice(&to_bytes(response.into_body(), 4096).await.unwrap()).unwrap();
        assert_eq!(body["error"]["code"], "identity.unauthorized");
    }
}

#[tokio::test]
async fn large_responses_bodies_should_reach_authentication() {
    let router = api_router_with_origins(ModelsExecution::new(), Vec::new()).await;
    let response = router
        .oneshot(
            Request::post("/v1/responses")
                .body(Body::from(vec![b'a'; LARGE_BODY_BYTES]))
                .expect("build large request"),
        )
        .await
        .expect("route large request");

    // 请求进入处理器后应因缺少凭据而被拒绝
    // 若提前施加正文大小限制，则会在认证前返回 413
    assert_eq!(response.status(), StatusCode::UNAUTHORIZED);
}

#[tokio::test]
async fn configured_cors_origin_assembles_router_and_answers_preflight() {
    let router = api_router_with_origins(
        ModelsExecution::new(),
        vec!["https://app.example.com".into()],
    )
    .await;

    let response = router
        .oneshot(
            Request::builder()
                .method(Method::OPTIONS)
                .uri("/v1/models")
                .header("origin", "https://app.example.com")
                .header("access-control-request-method", "GET")
                .header("access-control-request-headers", "authorization")
                .body(Body::empty())
                .expect("build preflight request"),
        )
        .await
        .expect("route preflight request");

    assert_eq!(response.status(), StatusCode::OK);
    assert_eq!(
        response
            .headers()
            .get("access-control-allow-origin")
            .and_then(|value| value.to_str().ok()),
        Some("https://app.example.com")
    );
    assert_eq!(
        response
            .headers()
            .get("access-control-allow-credentials")
            .and_then(|value| value.to_str().ok()),
        Some("true")
    );
    let allow_headers = response
        .headers()
        .get("access-control-allow-headers")
        .and_then(|value| value.to_str().ok())
        .expect("allow-headers present");
    assert!(allow_headers.contains("authorization"));
    assert!(allow_headers.contains("x-api-key"));
    assert!(allow_headers.contains("x-request-id"));
}
