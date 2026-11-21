//! Plugin management, resources and callback HTTP boundaries.

use axum::{
    body::Body,
    http::{Request, StatusCode},
};
use tower::ServiceExt as _;

use super::super::AdminTestFixture;

#[tokio::test]
async fn management_calls_and_callbacks_preserve_headers_and_override_defaults() {
    let fixture = published_fixture().await;
    let target = format!("plugin-instance-diagnostic/{}/7", "a".repeat(64));
    for uri in [
        format!("/api/admin/plugins/extensions/{target}/api/echo"),
        format!("/plugins/callbacks/{target}/oauth?state=nonce"),
    ] {
        let callback = uri.starts_with("/plugins/callbacks/");
        let mut request = Request::get(uri)
            .header("cookie", crate::admin::MANAGEMENT_COOKIE)
            .header("origin", crate::admin::MANAGEMENT_ORIGIN)
            .header("x-csrf-token", crate::admin::management_csrf());
        if callback {
            request = request.header("authorization", "Bearer management-fixture");
        }
        let response = crate::openai::api_router_with_admin(fixture.services.clone())
            .oneshot(
                request
                    .header(
                        "x-plugin-binary",
                        axum::http::HeaderValue::from_bytes(&[0xff]).unwrap(),
                    )
                    .header("set-cookie", "first=1")
                    .header("set-cookie", "second=2")
                    .header("content-security-policy", "default-src 'self'")
                    .header("x-cpr-plugin-response", "untrusted")
                    .body(Body::empty())
                    .unwrap(),
            )
            .await
            .unwrap();
        assert_eq!(response.status(), StatusCode::OK);
        assert_eq!(
            response.headers()["cookie"],
            crate::admin::MANAGEMENT_COOKIE
        );
        if callback {
            assert_eq!(
                response.headers()["authorization"],
                "Bearer management-fixture"
            );
        } else {
            assert!(!response.headers().contains_key("authorization"));
        }
        assert_eq!(response.headers()["x-plugin-binary"].as_bytes(), &[0xff]);
        assert_eq!(
            response
                .headers()
                .get_all("set-cookie")
                .iter()
                .map(|value| value.to_str().unwrap())
                .collect::<Vec<_>>(),
            ["first=1", "second=2"]
        );
        assert_eq!(
            response.headers()["content-security-policy"],
            "default-src 'self'"
        );
        assert_eq!(response.headers()["x-cpr-plugin-response"], "1");
        assert_eq!(
            response
                .headers()
                .get_all("x-cpr-plugin-response")
                .iter()
                .count(),
            1
        );
    }
}

pub(super) fn resource_fixture(
    path: &str,
) -> ovload_admin::model::plugins::management::PluginManagementResponse {
    ovload_admin::model::plugins::management::PluginManagementResponse {
        headers: Vec::new(),
        status: if path == "missing" { 404 } else { 200 },
        content_type: if path.ends_with(".css") {
            "text/css"
        } else {
            "text/html"
        }
        .into(),
        body: std::sync::Arc::from(path.as_bytes()),
    }
}

async fn published_fixture() -> AdminTestFixture {
    use ovload_core::routing::ConfigRevision;
    use ovload_core::routing::RuntimeSnapshot;
    use ovload_core::routing::extensions::ExtensionSetId;
    use ovload_core::routing::extensions::ExtensionSetLease;
    use ovload_core::routing::extensions::ExtensionSetReference;
    use std::sync::Arc;
    struct Lease;
    impl ExtensionSetLease for Lease {
        fn is_ready(&self) -> bool {
            true
        }
    }
    let fixture = AdminTestFixture::new().await;
    fixture.insert_management_session();
    fixture
        .auth
        .set_api_key(&format!("admin-{}", "a".repeat(64)));
    fixture.published_snapshot.publish(
        RuntimeSnapshot::new(
            ConfigRevision::new(7).unwrap(),
            ovload_core::settings::SettingsValues::new(1, "smart", Default::default(), None, None),
            vec![],
            vec![],
            vec![],
        )
        .unwrap()
        .with_extensions(Some(ExtensionSetReference::new(
            ExtensionSetId::new("management-test".into()).unwrap(),
            Arc::new(Lease),
        ))),
    );
    fixture
}

async fn resource_request(
    fixture: &AdminTestFixture,
    method: &str,
    uri: &str,
    session: bool,
    validators: &[&str],
) -> axum::response::Response {
    let mut request = Request::builder()
        .method(method)
        .uri(uri)
        .header("x-request-id", "management-cache-test");
    if session {
        request = request
            .header("cookie", crate::admin::MANAGEMENT_COOKIE)
            .header("origin", crate::admin::MANAGEMENT_ORIGIN)
            .header("x-csrf-token", crate::admin::management_csrf());
    }
    for validator in validators {
        request = request.header("if-none-match", *validator);
    }
    crate::openai::api_router_with_admin(fixture.services.clone())
        .oneshot(request.body(Body::empty()).unwrap())
        .await
        .unwrap()
}

#[tokio::test]
async fn large_html_resource_should_remain_uncompressed() {
    let fixture = published_fixture().await;
    let path = format!("ui/{}.html", "a".repeat(2048));
    let response = crate::openai::api_router_with_admin(fixture.services)
        .oneshot(
            Request::builder()
                .uri(format!(
                    "/api/admin/plugins/extensions/plugin-instance-diagnostic/{}/7/resources/{path}",
                    "a".repeat(64)
                ))
                .header("cookie", crate::admin::MANAGEMENT_COOKIE).header("origin", crate::admin::MANAGEMENT_ORIGIN).header("x-csrf-token", crate::admin::management_csrf())
                .header("accept-encoding", "gzip")
                .body(Body::empty())
                .unwrap(),
        )
        .await
        .unwrap();
    assert_eq!(response.status(), StatusCode::OK);
    assert_eq!(response.headers()["content-type"], "text/html");
    assert!(!response.headers().contains_key("content-encoding"));
    assert_eq!(
        axum::body::to_bytes(response.into_body(), 4096)
            .await
            .unwrap(),
        path
    );
}

#[tokio::test]
async fn static_resources_revalidate_privately_after_authorization() {
    use axum::body::to_bytes;
    use ovload_admin::ports::plugins::PluginStore as _;

    let fixture = published_fixture().await;
    let prefix = format!(
        "/api/admin/plugins/extensions/plugin-instance-diagnostic/{}/7",
        "a".repeat(64)
    );
    let uri = format!("{prefix}/resources/ui/index.html");
    let first = resource_request(&fixture, "GET", &uri, true, &[]).await;
    assert_eq!(first.status(), StatusCode::OK);
    assert_eq!(first.headers()["cache-control"], "private, no-cache");
    let etag = first.headers()["etag"].to_str().unwrap().to_owned();
    let csp = first.headers()["content-security-policy"].clone();
    assert_eq!(
        to_bytes(first.into_body(), 1024).await.unwrap(),
        "ui/index.html"
    );

    for validators in [
        vec![etag.as_str()],
        vec!["*"],
        vec!["\"other,tag\"", etag.as_str()],
        vec!["\"other\"", &format!("W/{etag}")],
    ] {
        for method in ["GET", "HEAD"] {
            let response = resource_request(&fixture, method, &uri, true, &validators).await;
            assert_eq!(
                response.status(),
                StatusCode::NOT_MODIFIED,
                "{validators:?}"
            );
            assert_eq!(response.headers()["etag"], etag);
            assert_eq!(response.headers()["cache-control"], "private, no-cache");
            assert_eq!(response.headers()["content-security-policy"], csp);
            assert_eq!(response.headers()["x-content-type-options"], "nosniff");
            assert!(
                to_bytes(response.into_body(), 1024)
                    .await
                    .unwrap()
                    .is_empty()
            );
        }
    }
    for validators in [vec!["\"other\""], vec!["invalid"]] {
        assert_eq!(
            resource_request(&fixture, "GET", &uri, true, &validators)
                .await
                .status(),
            StatusCode::OK
        );
    }
    let changed = resource_request(
        &fixture,
        "GET",
        &format!("{prefix}/resources/ui/other.css"),
        true,
        &[&etag],
    )
    .await;
    assert_eq!(changed.status(), StatusCode::OK);
    assert_ne!(changed.headers()["etag"], etag);
    let unauthenticated = resource_request(&fixture, "GET", &uri, false, &[&etag]).await;
    assert_eq!(unauthenticated.status(), StatusCode::UNAUTHORIZED);
    assert_eq!(unauthenticated.headers()["cache-control"], "no-store");

    let original = fixture
        .plugin_ports
        .load_instances()
        .await
        .unwrap()
        .instances;
    for change in ["disable", "untrust", "revision", "version"] {
        let mut instances = original.clone();
        match change {
            "disable" => instances[0].enabled = false,
            "untrust" => instances[0].trusted_process = false,
            "revision" => instances[0].revision = ovload_admin::model::Revision::new(8).unwrap(),
            _ => instances[0].artifact_sha256 = "b".repeat(64),
        }
        *fixture.plugin_ports.instances.lock().unwrap() = Some(instances);
        let response = resource_request(&fixture, "GET", &uri, true, &[&etag]).await;
        assert_eq!(response.status(), StatusCode::CONFLICT, "{change}");
        assert_eq!(response.headers()["cache-control"], "no-store");
        assert!(!response.headers().contains_key("etag"));
    }
}

#[tokio::test]
async fn public_resources_cache_but_dynamic_calls_callbacks_and_errors_do_not() {
    let fixture = published_fixture().await;
    let target = format!("plugin-instance-diagnostic/{}/7", "a".repeat(64));
    let public = format!("/plugins/resources/{target}/public/login.css");
    let first = resource_request(&fixture, "GET", &public, false, &[]).await;
    assert_eq!(first.status(), StatusCode::OK);
    let etag = first.headers()["etag"].to_str().unwrap();
    assert_eq!(
        resource_request(&fixture, "GET", &public, false, &[etag])
            .await
            .status(),
        StatusCode::NOT_MODIFIED
    );
    for (uri, status) in [
        (
            format!("/plugins/resources/{target}/ui/index.html"),
            StatusCode::NOT_FOUND,
        ),
        (
            format!("/api/admin/plugins/extensions/{target}/resources/missing"),
            StatusCode::NOT_FOUND,
        ),
        (
            format!("/api/admin/plugins/extensions/{target}/api/echo"),
            StatusCode::OK,
        ),
        (
            format!("/plugins/callbacks/{target}/oauth?state=nonce"),
            StatusCode::OK,
        ),
    ] {
        let response = resource_request(&fixture, "GET", &uri, true, &["*"]).await;
        assert_eq!(response.status(), status, "{uri}");
        assert_eq!(response.headers()["cache-control"], "no-store");
        assert!(!response.headers().contains_key("etag"));
    }
    *fixture.plugin_ports.instances.lock().unwrap() = Some(vec![]);
    let response = resource_request(&fixture, "GET", &public, false, &[etag]).await;
    assert_eq!(response.status(), StatusCode::CONFLICT);
    assert_eq!(response.headers()["cache-control"], "no-store");
}

#[tokio::test]
async fn protected_plugin_routes_require_admin_before_reading_bodies_but_public_resources_do_not() {
    let fixture = AdminTestFixture::new().await;
    fixture.insert_management_session();
    let prefix = "/api/admin/plugins/extensions/instance/sha256/1";
    for (method, uri) in [
        ("GET", "/api/admin/plugins/extensions".to_owned()),
        ("GET", format!("{prefix}/resources/ui/index.html")),
        ("POST", format!("{prefix}/api/echo")),
        ("POST", format!("{prefix}/callback-tickets")),
    ] {
        let response = crate::openai::api_router_with_admin(fixture.services.clone())
            .oneshot(
                Request::builder()
                    .method(method)
                    .uri(uri)
                    .header("x-request-id", "management-test")
                    .body(Body::from_stream(futures::stream::poll_fn(
                        |_| -> std::task::Poll<Option<Result<bytes::Bytes, std::io::Error>>> {
                            panic!("未认证请求不能读取正文")
                        },
                    )))
                    .unwrap(),
            )
            .await
            .unwrap();
        assert_eq!(response.status(), StatusCode::UNAUTHORIZED);
        assert_eq!(response.headers()["cache-control"], "no-store");
    }
    let response = crate::openai::api_router_with_admin(fixture.services.clone())
        .oneshot(
            Request::builder()
                .uri("/plugins/resources/instance/sha256/1/ui/index.html")
                .body(Body::empty())
                .unwrap(),
        )
        .await
        .unwrap();
    assert_eq!(
        response.status(),
        StatusCode::SERVICE_UNAVAILABLE,
        "公开资源仍要求可用的发布视图，不能绕过实例授权"
    );
    let response = crate::openai::api_router_with_admin(fixture.services.clone())
        .oneshot(
            Request::builder()
                .method("POST")
                .uri(format!("{prefix}/api/echo"))
                .header("x-request-id", "management-limit")
                .header("cookie", crate::admin::MANAGEMENT_COOKIE)
                .header("origin", crate::admin::MANAGEMENT_ORIGIN)
                .header("x-csrf-token", crate::admin::management_csrf())
                .header("content-type", "application/octet-stream")
                .body(Body::from(vec![0_u8; 1024 * 1024 + 1]))
                .unwrap(),
        )
        .await
        .unwrap();
    assert_eq!(response.status(), StatusCode::PAYLOAD_TOO_LARGE);

    let response = crate::openai::api_router_with_admin(fixture.services.clone())
        .oneshot(
            Request::builder()
                .method("POST")
                .uri(format!("{prefix}/models/responses?clientKeyId=client-key"))
                .header("x-request-id", "management-model-limit")
                .header("cookie", crate::admin::MANAGEMENT_COOKIE)
                .header("origin", crate::admin::MANAGEMENT_ORIGIN)
                .header("x-csrf-token", crate::admin::management_csrf())
                .header("content-type", "application/json")
                .body(Body::from(vec![0_u8; 8 * 1024 * 1024 + 1]))
                .unwrap(),
        )
        .await
        .unwrap();
    assert_eq!(response.status(), StatusCode::NOT_FOUND);
}

#[tokio::test]
async fn public_callback_rejects_head_missing_duplicate_state_and_body_before_dispatch() {
    let fixture = AdminTestFixture::new().await;
    let prefix = "/plugins/callbacks/instance/sha256/1/oauth";
    for (method, query, body, expected) in [
        ("HEAD", "state=one", "", StatusCode::METHOD_NOT_ALLOWED),
        ("GET", "code=one", "", StatusCode::BAD_REQUEST),
        ("GET", "state=", "", StatusCode::BAD_REQUEST),
        ("GET", "state=one&state=two", "", StatusCode::BAD_REQUEST),
        ("GET", "state=one&%73tate=two", "", StatusCode::BAD_REQUEST),
        ("GET", "state=one", "body", StatusCode::BAD_REQUEST),
        // 合法 GET 没有管理 Cookie 仍进入服务；当前测试未发布视图，返回 503 而不是 401
        ("GET", "state=one", "", StatusCode::SERVICE_UNAVAILABLE),
    ] {
        let response = crate::openai::api_router_with_admin(fixture.services.clone())
            .oneshot(
                Request::builder()
                    .method(method)
                    .uri(format!("{prefix}?{query}"))
                    .body(Body::from(body))
                    .unwrap(),
            )
            .await
            .unwrap();
        assert_eq!(response.status(), expected, "{method} {query}");
    }
}
