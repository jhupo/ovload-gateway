//! Mounted browser identities, credential mutation and authority isolation.

use axum::{
    Router,
    body::Body,
    http::{Method, Request, StatusCode, header},
    response::Response,
};
use serde_json::{Value, json};
use tower::ServiceExt as _;

use crate::{
    admin::{MANAGEMENT_COOKIE, management_csrf},
    support::{auth_app, cookie_request, empty_request, json_request, response_json},
};

const LOGIN: &str = "/api/admin/v1/auth/sessions";
const SESSION: &str = "/api/admin/v1/session";
const PASSWORD: &str = "/api/admin/v1/profile/password-change";

#[derive(Clone)]
struct BrowserSession {
    cookie: String,
    csrf: String,
}

fn cookies(response: &Response) -> String {
    response
        .headers()
        .get_all(header::SET_COOKIE)
        .iter()
        .map(|value| {
            value
                .to_str()
                .expect("cookie header")
                .split(';')
                .next()
                .expect("cookie pair")
        })
        .collect::<Vec<_>>()
        .join("; ")
}
async fn login(app: &Router, password: &str, previous: Option<&str>) -> Response {
    let mut request = json_request(
        Method::POST,
        LOGIN,
        json!({"username":"admin_1","password":password}),
    );
    if let Some(cookie) = previous {
        request
            .headers_mut()
            .insert(header::COOKIE, cookie.parse().unwrap());
    }
    app.clone().oneshot(request).await.unwrap()
}
async fn browser(app: &Router) -> BrowserSession {
    let response = login(app, "strong-admin-password", None).await;
    assert_eq!(response.status(), StatusCode::OK);
    assert_eq!(
        response
            .headers()
            .get_all(header::SET_COOKIE)
            .iter()
            .count(),
        1
    );
    for value in response.headers().get_all(header::SET_COOKIE) {
        let value = value.to_str().unwrap();
        assert!(value.starts_with("__Host-ovload_management="));
        for attribute in ["Path=/", "Secure", "HttpOnly", "SameSite=Strict"] {
            assert!(value.contains(attribute));
        }
        assert!(!value.contains("strong-admin-password"));
    }
    let cookie = cookies(&response);
    let body = response_json(response).await;
    assert_eq!(body["audience"], "management");
    BrowserSession {
        cookie,
        csrf: body["csrf_token"].as_str().unwrap().to_owned(),
    }
}
fn authorized(method: Method, path: &str, session: &BrowserSession, body: Value) -> Request<Body> {
    let mut request = json_request(method, path, body);
    request
        .headers_mut()
        .insert(header::COOKIE, session.cookie.parse().unwrap());
    request
        .headers_mut()
        .insert("x-csrf-token", session.csrf.parse().unwrap());
    request
}
async fn get(app: &Router, path: &str, cookie: &str) -> Response {
    app.clone()
        .oneshot(cookie_request(Method::GET, path, cookie))
        .await
        .unwrap()
}
async fn change(
    app: &Router,
    session: &BrowserSession,
    old: &str,
    new: &str,
    revision: &str,
) -> Response {
    let mut request = authorized(
        Method::POST,
        PASSWORD,
        session,
        json!({"current_password":old,"new_password":new}),
    );
    request
        .headers_mut()
        .insert(header::IF_MATCH, revision.parse().unwrap());
    app.clone().oneshot(request).await.unwrap()
}

#[tokio::test]
async fn unified_login_resolves_management_and_replaces_its_cookie() {
    let (app, _) = auth_app().await;
    let response = app
        .clone()
        .oneshot(json_request(
            Method::POST,
            "/api/v1/auth/sessions",
            json!({"login":"admin_1","password":"strong-admin-password"}),
        ))
        .await
        .unwrap();
    assert_eq!(response.status(), StatusCode::OK);
    let cookie = cookies(&response);
    assert!(cookie.starts_with("__Host-ovload_management="));
    assert_eq!(response_json(response).await["audience"], "management");
    assert_eq!(get(&app, SESSION, &cookie).await.status(), StatusCode::OK);
    assert_eq!(
        get(&app, "/api/v1/session", &cookie).await.status(),
        StatusCode::UNAUTHORIZED
    );

    let mut request = json_request(
        Method::POST,
        "/api/v1/auth/sessions",
        json!({"login":"admin_1","password":"strong-admin-password"}),
    );
    request
        .headers_mut()
        .insert(header::COOKIE, cookie.parse().unwrap());
    let response = app.clone().oneshot(request).await.unwrap();
    assert_eq!(response.status(), StatusCode::OK);
    let next_cookie = cookies(&response);
    assert_eq!(
        get(&app, SESSION, &cookie).await.status(),
        StatusCode::UNAUTHORIZED
    );
    assert_eq!(
        get(&app, SESSION, &next_cookie).await.status(),
        StatusCode::OK
    );
}

#[tokio::test]
async fn unified_login_rejects_invalid_credentials_and_caller_selected_authority() {
    let (app, _) = auth_app().await;
    for login in ["admin_1", "unknown@example.invalid"] {
        let response = app
            .clone()
            .oneshot(json_request(
                Method::POST,
                "/api/v1/auth/sessions",
                json!({"login":login,"password":"wrong-password"}),
            ))
            .await
            .unwrap();
        assert_eq!(response.status(), StatusCode::UNAUTHORIZED);
        assert!(!response.headers().contains_key(header::SET_COOKIE));
        assert_eq!(
            response_json(response).await["error"]["code"],
            "identity.unauthorized"
        );
    }
    for payload in [
        json!({"login":"admin_1","password":"strong-admin-password","audience":"management"}),
        json!({"login":"admin_1","password":"strong-admin-password","role":"admin"}),
        json!({"login":"admin_1","password":"strong-admin-password","username":"admin_1"}),
    ] {
        let response = app
            .clone()
            .oneshot(json_request(Method::POST, "/api/v1/auth/sessions", payload))
            .await
            .unwrap();
        assert_eq!(response.status(), StatusCode::BAD_REQUEST);
        assert!(!response.headers().contains_key(header::SET_COOKIE));
    }
}

#[tokio::test]
async fn management_credentials_are_strict_non_enumerating_and_redacted() {
    let (app, _) = auth_app().await;
    for payload in [
        json!({"username":"admin_1","password":"wrong-password-secret"}),
        json!({"username":"unknown","password":"wrong-password-secret"}),
    ] {
        let response = app
            .clone()
            .oneshot(json_request(Method::POST, LOGIN, payload))
            .await
            .unwrap();
        assert_eq!(response.status(), StatusCode::UNAUTHORIZED);
        assert!(!response.headers().contains_key(header::SET_COOKIE));
        assert!(
            !response_json(response)
                .await
                .to_string()
                .contains("password-secret")
        );
    }
    for payload in [
        json!({"username":"admin_1","password":"strong-admin-password","role":"admin"}),
        json!({"username":"admin_1","password":"strong-admin-password","permissions":["security.settings.manage"]}),
        json!({"email":"admin_1","password":"strong-admin-password"}),
        json!({"mode":"admin","password":"strong-admin-password"}),
    ] {
        let response = app
            .clone()
            .oneshot(json_request(Method::POST, LOGIN, payload))
            .await
            .unwrap();
        assert_eq!(response.status(), StatusCode::BAD_REQUEST);
        assert!(!response.headers().contains_key(header::SET_COOKIE));
        assert!(
            !response_json(response)
                .await
                .to_string()
                .contains("strong-admin-password")
        );
    }
}

#[tokio::test]
async fn login_requires_exact_origin_and_rejects_key_credentials() {
    let (app, _) = auth_app().await;
    for origin in [None, Some("https://foreign.example.test")] {
        let mut request = json_request(
            Method::POST,
            LOGIN,
            json!({"username":"admin_1","password":"strong-admin-password"}),
        );
        request.headers_mut().remove(header::ORIGIN);
        if let Some(origin) = origin {
            request
                .headers_mut()
                .insert(header::ORIGIN, origin.parse().unwrap());
        }
        let response = app.clone().oneshot(request).await.unwrap();
        assert_eq!(response.status(), StatusCode::FORBIDDEN);
        assert!(!response.headers().contains_key(header::SET_COOKIE));
    }
    for (name, value) in [
        (
            header::AUTHORIZATION.as_str(),
            "Bearer model-secret-fixture",
        ),
        ("x-api-key", "admin-secret-fixture"),
    ] {
        let mut request = json_request(
            Method::POST,
            LOGIN,
            json!({"username":"admin_1","password":"strong-admin-password"}),
        );
        request.headers_mut().insert(
            axum::http::HeaderName::from_bytes(name.as_bytes()).unwrap(),
            value.parse().unwrap(),
        );
        let response = app.clone().oneshot(request).await.unwrap();
        assert_eq!(response.status(), StatusCode::UNAUTHORIZED);
        assert!(!response.headers().contains_key(header::SET_COOKIE));
    }
}

#[tokio::test]
async fn audience_cookies_and_caller_headers_cannot_create_management_authority() {
    let (app, _) = auth_app().await;
    let session = browser(&app).await;
    assert_eq!(
        get(&app, SESSION, &session.cookie).await.status(),
        StatusCode::OK
    );
    let foreign = session
        .cookie
        .replace("__Host-ovload_management", "__Host-ovload_customer");
    assert_eq!(
        get(&app, SESSION, &foreign).await.status(),
        StatusCode::UNAUTHORIZED
    );
    assert_eq!(
        get(&app, "/api/v1/session", &session.cookie).await.status(),
        StatusCode::UNAUTHORIZED
    );
    for (name, value) in [
        ("authorization", "Bearer model-secret-fixture"),
        ("x-api-key", "admin-secret-fixture"),
        ("cookie", "cpr_session=legacy-fixture"),
    ] {
        let request = Request::get("/api/admin/system/version")
            .header(name, value)
            .header("x-request-id", "authority-rejection")
            .body(Body::empty())
            .unwrap();
        assert_eq!(
            app.clone().oneshot(request).await.unwrap().status(),
            StatusCode::UNAUTHORIZED
        );
    }
}

#[tokio::test]
async fn removed_session_management_routes_are_not_available_to_either_audience() {
    let (app, _) = auth_app().await;
    let session = browser(&app).await;
    for namespace in ["/api/v1", "/api/admin/v1"] {
        for (method, suffix) in [
            (Method::GET, "/sessions"),
            (
                Method::DELETE,
                "/sessions/00000000-0000-0000-0000-000000000001",
            ),
            (Method::POST, "/session/rotate"),
        ] {
            let path = format!("{namespace}{suffix}");
            let response = app
                .clone()
                .oneshot(authorized(method, &path, &session, json!({})))
                .await
                .unwrap();
            assert_eq!(response.status(), StatusCode::NOT_FOUND, "{path}");
            assert!(!response.headers().contains_key(header::SET_COOKIE));
            assert_eq!(
                response_json(response).await["error"]["code"],
                "identity.not_found"
            );
        }
    }
    assert_eq!(
        get(&app, SESSION, &session.cookie).await.status(),
        StatusCode::OK
    );
}

#[tokio::test]
async fn logout_requires_csrf() {
    let (app, _) = auth_app().await;
    let session = browser(&app).await;
    let mut missing = authorized(
        Method::DELETE,
        "/api/admin/v1/auth/session",
        &session,
        json!({}),
    );
    missing.headers_mut().remove("x-csrf-token");
    assert_eq!(
        app.clone().oneshot(missing).await.unwrap().status(),
        StatusCode::FORBIDDEN
    );
    let mut wrong = authorized(
        Method::DELETE,
        "/api/admin/v1/auth/session",
        &session,
        json!({}),
    );
    wrong
        .headers_mut()
        .insert("x-csrf-token", management_csrf().parse().unwrap());
    assert_eq!(
        app.clone().oneshot(wrong).await.unwrap().status(),
        StatusCode::FORBIDDEN
    );
    assert_eq!(
        get(&app, SESSION, &session.cookie).await.status(),
        StatusCode::OK
    );
}

#[tokio::test]
async fn same_owner_login_replaces_only_its_current_session() {
    let (app, _) = auth_app().await;
    let first = browser(&app).await;
    let other = browser(&app).await;
    let response = login(&app, "strong-admin-password", Some(&first.cookie)).await;
    assert_eq!(response.status(), StatusCode::OK);
    let next_cookie = cookies(&response);
    assert_ne!(next_cookie, first.cookie);
    assert_eq!(
        get(&app, SESSION, &first.cookie).await.status(),
        StatusCode::UNAUTHORIZED
    );
    assert_eq!(
        get(&app, SESSION, &next_cookie).await.status(),
        StatusCode::OK
    );
    assert_eq!(
        get(&app, SESSION, &other.cookie).await.status(),
        StatusCode::OK
    );
}

#[tokio::test]
async fn logout_revokes_the_session_and_clears_its_host_cookie() {
    let (app, _) = auth_app().await;
    let session = browser(&app).await;
    let response = app
        .clone()
        .oneshot(authorized(
            Method::DELETE,
            "/api/admin/v1/auth/session",
            &session,
            json!({}),
        ))
        .await
        .unwrap();
    assert_eq!(response.status(), StatusCode::NO_CONTENT);
    assert_eq!(
        response
            .headers()
            .get_all(header::SET_COOKIE)
            .iter()
            .count(),
        1
    );
    for value in response.headers().get_all(header::SET_COOKIE) {
        assert!(value.to_str().unwrap().contains("Max-Age=0"));
    }
    assert_eq!(
        get(&app, SESSION, &session.cookie).await.status(),
        StatusCode::UNAUTHORIZED
    );
}

#[tokio::test]
async fn password_change_compares_current_credentials_and_revokes_every_session() {
    let (app, _) = auth_app().await;
    let first = browser(&app).await;
    let second = browser(&app).await;
    assert_eq!(
        change(
            &app,
            &first,
            "wrong-password",
            "new-strong-password",
            "\"1\""
        )
        .await
        .status(),
        StatusCode::UNAUTHORIZED
    );
    assert_eq!(
        change(&app, &first, "strong-admin-password", "short", "\"1\"")
            .await
            .status(),
        StatusCode::BAD_REQUEST
    );
    assert_eq!(
        change(
            &app,
            &first,
            "strong-admin-password",
            "new-strong-password",
            "\"2\""
        )
        .await
        .status(),
        StatusCode::CONFLICT
    );
    assert_eq!(
        get(&app, SESSION, &first.cookie).await.status(),
        StatusCode::OK
    );
    let response = change(
        &app,
        &first,
        "strong-admin-password",
        "new-strong-password",
        "\"1\"",
    )
    .await;
    assert_eq!(response.status(), StatusCode::NO_CONTENT);
    for value in response.headers().get_all(header::SET_COOKIE) {
        assert!(value.to_str().unwrap().contains("Max-Age=0"));
    }
    for old in [&first, &second] {
        assert_eq!(
            get(&app, SESSION, &old.cookie).await.status(),
            StatusCode::UNAUTHORIZED
        );
    }
    assert_eq!(
        login(&app, "strong-admin-password", None).await.status(),
        StatusCode::UNAUTHORIZED
    );
    assert_eq!(
        login(&app, "new-strong-password", None).await.status(),
        StatusCode::OK
    );
}

#[tokio::test]
async fn failed_password_transaction_preserves_credentials_and_sessions() {
    let (app, fixture) = auth_app().await;
    let session = browser(&app).await;
    fixture.fail_identity_writes(true);
    assert_eq!(
        change(
            &app,
            &session,
            "strong-admin-password",
            "new-strong-password",
            "\"1\""
        )
        .await
        .status(),
        StatusCode::SERVICE_UNAVAILABLE
    );
    assert_eq!(
        get(&app, SESSION, &session.cookie).await.status(),
        StatusCode::OK
    );
    fixture.fail_identity_writes(false);
    assert_eq!(
        login(&app, "strong-admin-password", None).await.status(),
        StatusCode::OK
    );
    assert_eq!(
        login(&app, "new-strong-password", None).await.status(),
        StatusCode::UNAUTHORIZED
    );
}

#[tokio::test]
async fn live_permission_revocation_and_session_expiry_control_resource_access() {
    let (app, fixture) = auth_app().await;
    fixture.insert_management_session();
    let path = "/api/admin/system/version";
    assert_eq!(
        get(&app, path, MANAGEMENT_COOKIE).await.status(),
        StatusCode::OK
    );
    fixture.deny_management_permissions();
    assert_eq!(
        get(&app, path, MANAGEMENT_COOKIE).await.status(),
        StatusCode::FORBIDDEN
    );
    assert_eq!(
        get(&app, "/api/admin/v1/profile", MANAGEMENT_COOKIE)
            .await
            .status(),
        StatusCode::OK
    );
    fixture.expire_management_session();
    assert_eq!(
        get(&app, SESSION, MANAGEMENT_COOKIE).await.status(),
        StatusCode::UNAUTHORIZED
    );
}

#[tokio::test]
async fn public_policy_is_closed_and_legacy_login_routes_cannot_authenticate() {
    let (app, _) = auth_app().await;
    let response = app
        .clone()
        .oneshot(empty_request(
            Method::GET,
            "/api/v1/auth/registration-policy",
        ))
        .await
        .unwrap();
    assert_eq!(response.status(), StatusCode::OK);
    assert_eq!(
        response_json(response).await,
        json!({
            "mail_available": false,
            "oauth_available": [],
            "oauth_providers": [],
            "revision": 1,
            "agreement": {"enabled":false,"mode":"modal","updated":"","documents":[]},
            "registration_enabled": false,
            "verification_required": false,
            "recovery_enabled": false
        })
    );
    for path in [
        "/api/auth/login",
        "/api/auth/password",
        "/api/auth/refresh",
        "/api/auth/logout",
    ] {
        let response = app
            .clone()
            .oneshot(json_request(
                Method::POST,
                path,
                json!({"password":"strong-admin-password"}),
            ))
            .await
            .unwrap();
        assert!(!response.status().is_success(), "{path}");
        assert!(!response.headers().contains_key(header::SET_COOKIE));
    }
}
