// Modified for Ovload on 2026-10-27: workspace integration.

//! 验证管理接口的错误封装、状态码与输入信息脱敏

use axum::{
    Router,
    body::{Body, to_bytes},
    http::{Method, Request, StatusCode, header},
};
use ovload_api::auth::SessionState;
use serde_json::{Value, json};
use tower::ServiceExt as _;

use super::{AdminTestFixture, AdminTestState};

const SESSION_COOKIE: &str = crate::admin::MANAGEMENT_COOKIE;

fn app(state: AdminTestState) -> Router {
    crate::openai::api_router_with_admin(state.admin_services().clone()).layer(axum::Extension(
        axum::extract::ConnectInfo(std::net::SocketAddr::from(([127, 0, 0, 1], 41000))),
    ))
}

fn request(method: Method, uri: &str, body: Body) -> Request<Body> {
    Request::builder()
        .method(method)
        .uri(uri)
        .header("x-request-id", "req_admin_errors")
        .header("origin", crate::admin::MANAGEMENT_ORIGIN)
        .header("x-csrf-token", crate::admin::management_csrf())
        .body(body)
        .expect("build admin error request")
}

async fn response_json(response: axum::response::Response) -> (StatusCode, String, Value) {
    let status = response.status();
    let content_type = response
        .headers()
        .get(header::CONTENT_TYPE)
        .and_then(|value| value.to_str().ok())
        .unwrap_or_default()
        .to_owned();
    let body = to_bytes(response.into_body(), 64 * 1024)
        .await
        .expect("read admin error response body");
    let body = serde_json::from_slice(&body).expect("parse admin error response JSON");
    (status, content_type, body)
}

#[tokio::test]
async fn malformed_login_json_uses_the_identity_error_contract() {
    let fixture = AdminTestFixture::new().await;
    let mut request = request(
        Method::POST,
        "/api/admin/v1/auth/sessions",
        Body::from(r#"{"password":"secret""#),
    );
    request
        .headers_mut()
        .insert(header::CONTENT_TYPE, "application/json".parse().unwrap());

    let response = app(fixture.state())
        .oneshot(request)
        .await
        .expect("malformed JSON response");
    let actual = response_json(response).await;

    assert_eq!(
        actual,
        (
            StatusCode::BAD_REQUEST,
            "application/json".to_owned(),
            json!({
                "error":{"code":"identity.invalid_input","message":"invalid identity input"},
                "request_id":"req_admin_errors"
            })
        )
    );
}

#[tokio::test]
async fn invalid_login_json_data_should_not_echo_the_submitted_value() {
    let fixture = AdminTestFixture::new().await;
    let submitted = "password-must-not-leak";
    let mut request = request(
        Method::POST,
        "/api/admin/v1/auth/sessions",
        Body::from(
            json!({ "mode": "admin", "password": submitted, "rememberMe": true }).to_string(),
        ),
    );
    request
        .headers_mut()
        .insert(header::CONTENT_TYPE, "application/json".parse().unwrap());

    let response = app(fixture.state())
        .oneshot(request)
        .await
        .expect("invalid JSON data response");
    let actual = response_json(response).await;

    assert_eq!(
        actual,
        (
            StatusCode::BAD_REQUEST,
            "application/json".to_owned(),
            json!({
                "error":{"code":"identity.invalid_input","message":"invalid identity input"},
                "request_id":"req_admin_errors"
            })
        )
    );
    assert!(!actual.2.to_string().contains(submitted));
}

#[tokio::test]
async fn login_without_json_content_type_returns_a_safe_identity_error() {
    let fixture = AdminTestFixture::new().await;
    let response = app(fixture.state())
        .oneshot(request(
            Method::POST,
            "/api/admin/v1/auth/sessions",
            Body::from(json!({ "mode": "admin", "password": "secret" }).to_string()),
        ))
        .await
        .expect("missing JSON content type response");
    let actual = response_json(response).await;

    assert_eq!(
        actual,
        (
            StatusCode::BAD_REQUEST,
            "application/json".to_owned(),
            json!({
                "error":{"code":"identity.invalid_input","message":"invalid identity input"},
                "request_id":"req_admin_errors"
            })
        )
    );
}

#[tokio::test]
async fn malformed_admin_query_should_use_a_safe_bad_request_envelope() {
    let fixture = AdminTestFixture::new().await;
    fixture.insert_management_session();
    let mut request = request(
        Method::GET,
        "/api/admin/usage/records?page=not-a-number",
        Body::empty(),
    );
    request
        .headers_mut()
        .insert(header::COOKIE, SESSION_COOKIE.parse().unwrap());

    let response = app(fixture.state())
        .oneshot(request)
        .await
        .expect("invalid query response");
    let actual = response_json(response).await;

    assert_eq!(
        actual,
        (
            StatusCode::BAD_REQUEST,
            "application/json".to_owned(),
            json!({
                "code": 40001,
                "errorKey": "admin.bad_request",
                "params": {},
                "data": null
            })
        )
    );
}

#[tokio::test]
async fn invalid_time_range_should_use_its_published_business_code() {
    let fixture = AdminTestFixture::new().await;
    fixture.insert_management_session();
    let mut request = request(
        Method::GET,
        "/api/admin/dashboard/summary?startTime=not-a-time",
        Body::empty(),
    );
    request
        .headers_mut()
        .insert(header::COOKIE, SESSION_COOKIE.parse().unwrap());

    let response = app(fixture.state())
        .oneshot(request)
        .await
        .expect("invalid time range response");
    let actual = response_json(response).await;

    assert_eq!(
        actual,
        (
            StatusCode::BAD_REQUEST,
            "application/json".to_owned(),
            json!({
                "code": 40002,
                "errorKey": "admin.invalid_time_range",
                "params": {},
                "data": null
            })
        )
    );
}

#[tokio::test]
async fn unknown_admin_path_should_not_fall_through_to_the_spa() {
    let fixture = AdminTestFixture::new().await;
    let response = app(fixture.state())
        .oneshot(request(
            Method::GET,
            "/api/admin/not-a-real-route",
            Body::empty(),
        ))
        .await
        .expect("unknown admin path response");
    let actual = response_json(response).await;

    assert_eq!(
        actual,
        (
            StatusCode::NOT_FOUND,
            "application/json".to_owned(),
            json!({
                "code": 40401,
                "errorKey": "admin.not_found",
                "params": {},
                "data": null
            })
        )
    );
}

#[tokio::test]
async fn unsupported_admin_method_should_keep_allow_and_return_an_envelope() {
    let fixture = AdminTestFixture::new().await;
    let response = app(fixture.state())
        .oneshot(request(
            Method::POST,
            "/api/admin/system/version",
            Body::empty(),
        ))
        .await
        .expect("unsupported admin method response");
    let allow = response
        .headers()
        .get(header::ALLOW)
        .and_then(|value| value.to_str().ok())
        .unwrap_or_default()
        .to_owned();
    let actual = response_json(response).await;

    assert_eq!(
        (allow, actual),
        (
            "GET,HEAD".to_owned(),
            (
                StatusCode::METHOD_NOT_ALLOWED,
                "application/json".to_owned(),
                json!({
                    "code": 40001,
                    "errorKey": "admin.bad_request",
                    "params": {},
                    "data": null
                })
            )
        )
    );
}

#[tokio::test]
async fn admin_auth_failures_should_use_stable_chinese_contracts() {
    let fixture = AdminTestFixture::new().await;
    let unauthenticated = app(fixture.state())
        .clone()
        .oneshot(request(Method::GET, "/api/admin/accounts", Body::empty()))
        .await
        .expect("missing session response");
    let mut invalid_api_key = request(Method::GET, "/api/admin/accounts", Body::empty());
    invalid_api_key
        .headers_mut()
        .insert("x-api-key", "admin-invalid".parse().unwrap());
    let invalid_api_key = app(fixture.state())
        .clone()
        .oneshot(invalid_api_key)
        .await
        .expect("invalid API key response");
    let mut invalid_login = request(
        Method::POST,
        "/api/admin/v1/auth/sessions",
        Body::from(json!({ "username": "admin_1", "password": "wrong-password" }).to_string()),
    );
    invalid_login
        .headers_mut()
        .insert(header::CONTENT_TYPE, "application/json".parse().unwrap());
    let invalid_login = app(fixture.state())
        .oneshot(invalid_login)
        .await
        .expect("invalid credentials response");

    let actual = [
        response_json(unauthenticated).await,
        response_json(invalid_api_key).await,
    ];

    assert_eq!(
        actual.map(|(status, _, body)| (status, body["code"].clone(), body["errorKey"].clone())),
        [
            (
                StatusCode::UNAUTHORIZED,
                json!(40101),
                json!("admin.session_required")
            ),
            (
                StatusCode::UNAUTHORIZED,
                json!(40101),
                json!("admin.session_required")
            ),
        ]
    );
    let (status, _, body) = response_json(invalid_login).await;
    assert_eq!(status, StatusCode::UNAUTHORIZED);
    assert_eq!(body["error"]["code"], "identity.unauthorized");
    assert_eq!(body["request_id"], "req_admin_errors");
}

mod provider {
    use std::time::SystemTime;

    use chrono::Utc;
    use ovload_admin::{
        model::{
            Revision,
            accounts::{AccountPageItem, AccountRecord},
        },
        ports::provider::{ProviderAdminError, ProviderAdminErrorKind as Kind},
    };
    use ovload_core::{
        account::{
            AccountStatusFacts, AccountWeight, CredentialState, QuotaState, resolve_account_status,
        },
        routing::ProviderKind,
    };
    use tower_http::request_id::{MakeRequestUuid, PropagateRequestIdLayer, SetRequestIdLayer};

    use super::*;

    #[tokio::test]
    async fn unsupported_quota_should_preserve_account_capacity_wire() {
        let fixture = AdminTestFixture::new().await;
        fixture.insert_management_session();
        for (used_slots, total_slots) in [(Some(3), Some(5)), (Some(0), None), (None, Some(10))] {
            let mut stored = account("openai");
            stored.capacity = ovload_admin::model::accounts::AccountCapacity {
                used_slots,
                total_slots,
            };
            *fixture.account.lock().unwrap() = Some(stored);
            let mut request = request(
                Method::GET,
                "/api/admin/accounts/quota?accountId=acct_error_test",
                Body::empty(),
            );
            request
                .headers_mut()
                .insert(header::COOKIE, SESSION_COOKIE.parse().unwrap());
            let response = app(fixture.state()).oneshot(request).await.unwrap();
            let (status, _, body) = response_json(response).await;
            assert_eq!(status, StatusCode::OK);
            assert_eq!(
                body["data"]["account"]["capacity"],
                json!({
                    "usedSlots": used_slots,
                    "totalSlots": total_slots,
                })
            );
        }
    }

    #[tokio::test]
    async fn provider_public_errors_survive_import_credential_and_quota_refresh_handlers() {
        let fixture = AdminTestFixture::new().await;
        fixture.insert_management_session();
        for provider in ["openai", "xai"] {
            *fixture.account.lock().unwrap() = Some(account(provider));
            for (kind, status, code, error_key) in [
                (Kind::Invalid, 400, 40001, "admin.invalid"),
                (Kind::Conflict, 409, 40901, "admin.conflict"),
                (Kind::BadGateway, 502, 50201, "admin.bad_gateway"),
                (Kind::Unavailable, 503, 50301, "admin.unavailable"),
                (Kind::Ambiguous, 502, 50202, "admin.upstream_result_unknown"),
            ] {
                *fixture.provider_error.lock().unwrap() = Some(
                    ProviderAdminError::new(kind)
                        .with_public_message("provider operation failed")
                        .with_message("raw-upstream-secret-marker"),
                );
                for (path, body) in [
                    (
                        "/api/admin/accounts/refresh",
                        json!({"accountId": "acct_error_test"}),
                    ),
                    (
                        "/api/admin/accounts/import",
                        json!({"provider": provider, "data": {"accessToken": "at-synthetic-test"}}),
                    ),
                    (
                        "/api/admin/accounts/quota/refresh",
                        json!({"accountId": "acct_error_test"}),
                    ),
                ] {
                    let response = send(&fixture, path, body).await;
                    assert_eq!(response.headers()["x-request-id"], "req_admin_errors");
                    let actual = response_json(response).await;
                    assert_eq!(
                        actual,
                        (
                            StatusCode::from_u16(status).unwrap(),
                            "application/json".to_owned(),
                            if matches!(kind, Kind::BadGateway | Kind::Unavailable | Kind::Ambiguous) {
                                json!({"code": code, "errorKey": error_key, "params": {}, "message": "provider operation failed", "data": null})
                            } else {
                                json!({"code": code, "errorKey": error_key, "params": {}, "data": null})
                            },
                        )
                    );
                    assert!(!actual.2.to_string().contains("raw-upstream-secret-marker"));
                    assert_eq!(fixture.auth.audit_count(), 0);
                }
            }
        }
    }

    #[tokio::test]
    async fn provider_diagnostics_without_public_messages_still_use_safe_fallbacks() {
        let fixture = AdminTestFixture::new().await;
        fixture.insert_management_session();
        for (kind, status, code, error_key) in [
            (Kind::BadGateway, 502, 50201, "admin.bad_gateway"),
            (Kind::Unavailable, 503, 50301, "admin.unavailable"),
            (Kind::Ambiguous, 502, 50202, "admin.upstream_result_unknown"),
            (Kind::Internal, 500, 50001, "admin.internal"),
        ] {
            let error = ProviderAdminError::new(kind).with_message("private-provider-diagnostics");
            // 即使 Provider 错标了公开文案，未知内部异常仍不得通过 500 信封下发
            *fixture.provider_error.lock().unwrap() = Some(if kind == Kind::Internal {
                error.with_public_message("internal-detail-must-stay-hidden")
            } else {
                error
            });
            let response = send(
                &fixture,
                "/api/admin/accounts/import",
                json!({"provider": "openai", "data": {}}),
            )
            .await;
            let (actual_status, _, body) = response_json(response).await;
            assert_eq!(actual_status.as_u16(), status);
            assert_eq!(
                body,
                json!({"code": code, "errorKey": error_key, "params": {}, "data": null})
            );
        }
    }

    async fn send(fixture: &AdminTestFixture, path: &str, body: Value) -> axum::response::Response {
        let mut request = request(Method::POST, path, Body::from(body.to_string()));
        request
            .headers_mut()
            .insert(header::COOKIE, SESSION_COOKIE.parse().unwrap());
        request
            .headers_mut()
            .insert(header::CONTENT_TYPE, "application/json".parse().unwrap());
        let name = header::HeaderName::from_static("x-request-id");
        app(fixture.state())
            .layer(PropagateRequestIdLayer::new(name.clone()))
            .layer(SetRequestIdLayer::new(name, MakeRequestUuid))
            .oneshot(request)
            .await
            .unwrap()
    }

    fn account(provider: &str) -> AccountPageItem {
        let now = Utc::now();
        let facts = AccountStatusFacts {
            enabled: true,
            credential_state: CredentialState::Ready,
            access_token_expires_at: None,
            quota: QuotaState::unknown(),
            cooldown: None,
            last_error_reason: None,
            last_error_message: None,
        };
        AccountPageItem {
            config_revision: ovload_admin::model::Revision::new(1).unwrap(),
            capacity: ovload_admin::model::accounts::AccountCapacity {
                used_slots: None,
                total_slots: None,
            },
            account: AccountRecord {
                outbound_proxy_id: None,
                outbound_proxy_enabled: true,
                notes: None,
                model_access: Default::default(),
                id: "acct_error_test".to_owned(),
                provider_kind: ProviderKind::new(provider).unwrap(),
                groups: Vec::new(),
                name: "synthetic account".to_owned(),
                email: None,
                upstream_user_id: None,
                upstream_account_id: None,
                plan_type: None,
                authentication_kind: "oauth".to_owned(),
                credential_revision: Revision::new(1).unwrap(),
                has_refresh_token: true,
                access_token_expires_at: None,
                next_refresh_at: None,
                enabled: facts.enabled,
                concurrency_limit: None,
                weight: AccountWeight::default(),
                outbound_proxy: None,
                credential_state: facts.credential_state,
                credential_observed_at: now,
                quota: facts.quota,
                last_error_reason: None,
                last_error_message: None,
                created_at: now,
                updated_at: now,
            },
            projection: resolve_account_status(&facts, SystemTime::now()),
        }
    }
}
