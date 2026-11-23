// Modified for Ovload on 2026-10-27: workspace integration.

//! 验证 OpenAI 入口的 Bearer 认证与插件可见认证信息边界

use std::sync::{
    Arc,
    atomic::{AtomicUsize, Ordering},
};

use axum::http::{
    HeaderValue, Method, StatusCode,
    header::{self, AUTHORIZATION},
};
use futures::future::BoxFuture;

use ovload_api::openai::auth::ClientApiKeyAuthError;
use ovload_core::{
    engine::{
        authentication::ClientAuthenticationRequest,
        execution::{
            AuthenticatedClient, ClientAuthenticationError, ExecutionService, StartExecution,
            StartProviderExecution, StartedExecution,
        },
    },
    error::{GatewayError, GatewayErrorKind},
    routing::PublicModelId,
};
use tower::ServiceExt as _;

struct EnvelopeAuthentication {
    client: AuthenticatedClient,
    calls: AtomicUsize,
}

impl ExecutionService for EnvelopeAuthentication {
    fn authenticate_request(
        &self,
        request: ClientAuthenticationRequest,
    ) -> BoxFuture<'_, Result<AuthenticatedClient, ClientAuthenticationError>> {
        assert_eq!(request.authorization(), "External controlled-credential");
        let debug = format!("{request:?}");
        for private in [
            "controlled-credential",
            "controlled-fixture",
            "private-client",
            "192.0.2.9",
        ] {
            assert!(!debug.contains(private));
        }
        self.calls.fetch_add(1, Ordering::SeqCst);
        let client = self.client.clone();
        Box::pin(async move { Ok(client) })
    }

    fn public_models(&self, _: &AuthenticatedClient) -> Vec<PublicModelId> {
        Vec::new()
    }

    fn contains_public_model(&self, _: &AuthenticatedClient, _: &PublicModelId) -> bool {
        false
    }

    fn start(&self, _: StartExecution) -> BoxFuture<'_, Result<StartedExecution, GatewayError>> {
        Box::pin(async {
            Err(GatewayError::new(
                GatewayErrorKind::Internal,
                "authentication envelope test must not execute",
            ))
        })
    }

    fn start_provider_endpoint(
        &self,
        _: StartProviderExecution,
    ) -> BoxFuture<'_, Result<StartedExecution, GatewayError>> {
        Box::pin(async {
            Err(GatewayError::new(
                GatewayErrorKind::Internal,
                "authentication envelope test must not execute",
            ))
        })
    }
}

#[tokio::test]
async fn plugin_authentication_envelope_contains_only_authorization() {
    let fixture = crate::admin::AdminTestFixture::new().await;
    let execution = Arc::new(EnvelopeAuthentication {
        client: super::authenticated_client("unused-native-key"),
        calls: AtomicUsize::new(0),
    });
    let app = super::api_router_with_admin_and_execution(fixture.services, execution.clone());
    let mut request = crate::support::empty_request(Method::GET, "/v1/models");
    request.headers_mut().insert(
        header::AUTHORIZATION,
        HeaderValue::from_static("External controlled-credential"),
    );
    request.headers_mut().insert(
        header::COOKIE,
        HeaderValue::from_static("admin_session=controlled-fixture"),
    );
    request.headers_mut().insert(
        header::USER_AGENT,
        HeaderValue::from_static("private-client"),
    );
    request
        .headers_mut()
        .insert("x-forwarded-for", HeaderValue::from_static("192.0.2.9"));

    let response = app.oneshot(request).await.unwrap();

    assert_eq!(response.status(), StatusCode::OK);
    assert_eq!(execution.calls.load(Ordering::SeqCst), 1);
}

#[tokio::test]
async fn native_authentication_checks_the_current_envelope_at_the_http_entry() {
    let fixture = crate::admin::AdminTestFixture::new().await;
    let maximum_key = "x"
        .repeat(ovload_core::engine::authentication::MAXIMUM_AUTHORIZATION_BYTES - "Bearer ".len());
    let oversized_key = format!("{maximum_key}x");
    let mut cases = vec![
        ("missing", "sk_client", None, StatusCode::UNAUTHORIZED),
        (
            "opaque",
            "sk_client",
            Some(HeaderValue::from_bytes(&[0xff]).unwrap()),
            StatusCode::UNAUTHORIZED,
        ),
        (
            "lowercase scheme",
            "sk_client",
            Some(HeaderValue::from_static("bearer sk_client")),
            StatusCode::UNAUTHORIZED,
        ),
        (
            "empty token",
            "sk_client",
            Some(HeaderValue::from_static("Bearer    ")),
            StatusCode::UNAUTHORIZED,
        ),
        (
            "whitespace inside token",
            "sk_client",
            Some(HeaderValue::from_static("Bearer key with spaces")),
            StatusCode::UNAUTHORIZED,
        ),
        (
            "trimmed token",
            "sk_client",
            Some(HeaderValue::from_static("Bearer   sk_client   ")),
            StatusCode::OK,
        ),
    ];
    for key in ["q", "sk-old/key+value=:!@", maximum_key.as_str()] {
        cases.push((
            "configured native key",
            key,
            Some(HeaderValue::from_str(&format!("Bearer {key}")).unwrap()),
            StatusCode::OK,
        ));
    }
    cases.push((
        "oversized envelope",
        oversized_key.as_str(),
        Some(HeaderValue::from_str(&format!("Bearer {oversized_key}")).unwrap()),
        StatusCode::UNAUTHORIZED,
    ));

    for (case, key, authorization, expected) in cases {
        let app =
            super::api_router_with_admin_and_client(fixture.services.clone(), key, "key-auth");
        let mut request = crate::support::empty_request(Method::GET, "/v1/models");
        // actor 标记既不能代替认证，也不能干扰已有的原生 Key
        request.headers_mut().insert(
            "x-openai-actor-authorization",
            HeaderValue::from_static("proxy-managed"),
        );
        if let Some(authorization) = authorization {
            request.headers_mut().insert(AUTHORIZATION, authorization);
        }
        let response = app.oneshot(request).await.unwrap();
        assert_eq!(response.status(), expected, "{case}");
    }
}

#[test]
fn client_auth_failure_reasons_should_be_stable_and_secret_free() {
    assert_eq!(
        [
            ClientApiKeyAuthError::MissingAuthorization,
            ClientApiKeyAuthError::MalformedAuthorization,
            ClientApiKeyAuthError::InvalidKeyFormat,
            ClientApiKeyAuthError::InvalidKey,
            ClientApiKeyAuthError::RuntimeUnavailable,
        ]
        .map(ClientApiKeyAuthError::reason),
        [
            "missing_authorization",
            "malformed_authorization",
            "invalid_key_format",
            "invalid_key",
            "runtime_unavailable",
        ]
    );
}

#[tokio::test]
async fn http_settings_freeze_before_plan_resolution_and_apply_before_admission() {
    use ovload_core::engine::middleware::http as contract;
    use ovload_core::engine::middleware::*;
    use ovload_core::routing::extensions::*;
    struct Lease;
    impl ExtensionSetLease for Lease {
        fn is_ready(&self) -> bool {
            true
        }
    }
    #[derive(Debug)]
    struct Entry;
    impl MiddlewarePlan for Entry {
        fn has_http(&self) -> bool {
            true
        }
        fn handle_http(
            &self,
            _: contract::Context,
            mut request: contract::Request,
            next: contract::Next,
        ) -> BoxFuture<'static, Result<contract::Response, MiddlewareError>> {
            let settings = request
                .extensions_mut()
                .get_mut::<contract::Settings>()
                .unwrap();
            let context = settings.runtime.as_ref().unwrap();
            let mut values = serde_json::to_value(context.values()).unwrap();
            assert_eq!(values["responses_max_decompressed_body_bytes"], 32);
            assert_eq!(values["min_codex_cli_version"], "0.40.0");
            values["responses_max_decompressed_body_bytes"] = serde_json::json!(1024);
            values["min_codex_cli_version"] = serde_json::Value::Null;
            settings.runtime = Some(
                context
                    .replace(serde_json::from_value(values).unwrap(), "entry")
                    .unwrap(),
            );
            next.run(request)
        }
        fn handle(
            &self,
            _: MiddlewareContext,
            request: MiddlewareRequest,
            next: MiddlewareNext,
        ) -> BoxFuture<'static, Result<MiddlewareResponse, MiddlewareError>> {
            next.run(request)
        }
    }
    let snapshot = super::snapshot("sk_entry", "openai");
    let settings = snapshot
        .settings()
        .clone()
        .with_min_codex_client_versions(super::CodexClientMinVersions::new(
            None,
            Some(super::CodexClientVersion::parse("0.40.0").unwrap()),
        ))
        .with_responses_max_decompressed_body_bytes(32);
    let snapshot = snapshot.with_settings(&settings).unwrap();
    let snapshots = super::RuntimeSnapshotHandle::new(snapshot);
    let execution = Arc::new(super::DefaultExecutionService::new(
        snapshots.clone(),
        (
            super::model_key_authority("key_api_test", "sk_entry"),
            Arc::new(super::IgnoredClientApiKeyUsage),
        ),
        Arc::new(super::UnusedExecutionStore),
        super::ProviderRegistry::default(),
        Arc::new(super::UnusedAdmissions),
        Arc::new(super::UnusedContinuation),
        Arc::new(crate::support::RecordingDiagnostics::default()),
    ));
    let admin = crate::admin::AdminTestFixture::new().await;
    let bundle = ovload_api::initialize(
        ovload_api::ApiConfig {
            identity_public_origin: "https://gateway.example.test".to_owned(),
            asset_directory: std::env::temp_dir(),
            cors_allowed_origins: vec![],
            request_timeout_seconds: None,
            request_id_header: "x-request-id".into(),
        },
        execution,
        admin.services,
        vec![],
        Arc::new(super::EmptyWorkerHealth),
        Arc::new(super::TestLifecycle::default()),
        Arc::new(crate::support::RecordingDiagnostics::default()),
    )
    .unwrap();
    let baseline = bundle.dispatcher();
    let plan = FrozenMiddlewarePlan::new(
        Arc::new(Entry),
        ExtensionSetReference::new(
            ExtensionSetId::new("entry-settings".into()).unwrap(),
            Arc::new(Lease),
        ),
    );
    let publisher = snapshots.clone();
    let router = bundle
        .with_middleware(move |snapshot| {
            let snapshot = snapshot.unwrap();
            assert_eq!(snapshot.responses_max_decompressed_body_bytes(), 32);
            publisher.publish(
                snapshot
                    .with_settings(
                        &snapshot
                            .settings()
                            .clone()
                            .with_responses_max_decompressed_body_bytes(64),
                    )
                    .unwrap(),
            );
            Some(plan.clone())
        })
        .router();
    let invalid = format!("{}!", " ".repeat(100));
    let compressed = zstd::stream::encode_all(invalid.as_bytes(), 0).unwrap();
    let request = || {
        axum::http::Request::post("/v1/responses")
            .header(AUTHORIZATION, "Bearer sk_entry")
            .header("user-agent", "codex_cli_rs/0.1.0")
            .header("content-encoding", "zstd")
            .body(axum::body::Body::from(compressed.clone()))
            .unwrap()
    };
    let response = router.oneshot(request()).await.unwrap();
    assert_eq!(response.status(), StatusCode::BAD_REQUEST);
    let body: serde_json::Value = serde_json::from_slice(
        &axum::body::to_bytes(response.into_body(), usize::MAX)
            .await
            .unwrap(),
    )
    .unwrap();
    assert_eq!(
        body["error"]["code"], "invalid_json",
        "the expanded body must reach the decoder"
    );
    let context = contract::Context {
        request_id: "baseline".into(),
        call_id: "baseline".into(),
        parent_call_id: None,
        plugin_instance_id: None,
        plan: None,
        extensions: Default::default(),
        cancellation: Default::default(),
    };
    use http_body_util::BodyExt as _;
    let response = baseline
        .dispatch(
            context,
            request().map(|body| body.map_err(|error| Box::new(error) as _).boxed_unsync()),
        )
        .await
        .unwrap();
    assert_eq!(
        response.status(),
        StatusCode::BAD_REQUEST
    );
    let body = response.into_body().collect().await.unwrap().to_bytes();
    let body: serde_json::Value = serde_json::from_slice(&body).unwrap();
    assert_eq!(
        body["error"]["code"], "request_too_large",
        "request changes must not alter the published baseline"
    );
    assert_eq!(
        snapshots
            .acquire()
            .unwrap()
            .responses_max_decompressed_body_bytes(),
        64
    );
}
