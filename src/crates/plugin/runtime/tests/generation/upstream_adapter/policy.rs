//! Frozen outbound policies exercise the real adapter callback and Host send path.

use super::*;
use ovload_core::{
    engine::{
        authentication::ModelKeyExecutionGuard,
        execution::ClientTransport,
        extensions::ExtensionCallScope,
        middleware::{
            FrozenMiddlewarePlan, MiddlewareContext, MiddlewareError, MiddlewareNext,
            MiddlewarePlan, MiddlewareRequest, MiddlewareResponse,
            outbound::{self, Target},
        },
        nested::ExecutionEffects,
    },
    lifecycle::Deadline,
    settings::privacy::{CompiledPrivacyPolicy, PrivacyError, PrivacyRuleOutcome},
};
use std::sync::Mutex;
use tokio::sync::Notify;

#[derive(Debug)]
struct RedactPrivacy;

impl CompiledPrivacyPolicy for RedactPrivacy {
    fn apply(
        &self,
        body: &mut Value,
        headers: &mut ::http::HeaderMap,
        _: &mut Option<String>,
        _: &dyn Fn() -> bool,
    ) -> Result<Vec<PrivacyRuleOutcome>, PrivacyError> {
        if let Some(body) = body.as_object_mut() {
            body.insert("input".into(), json!("redacted fixture"));
        }
        headers.insert("x-privacy", ::http::HeaderValue::from_static("applied"));
        Ok(Vec::new())
    }
}

#[derive(Debug, Clone, Copy)]
enum Change {
    None,
    Rewrite,
    Oversize,
    InvalidJson,
    Compressed,
    WebSocket,
    Reject,
    Canary,
    Revoke,
    Wait,
}

struct Policy {
    change: Change,
    destination: String,
    calls: AtomicUsize,
    seen: Mutex<Vec<Vec<u8>>>,
    reached: Notify,
    authority: Option<Arc<crate::model_keys::FixtureAuthority>>,
}

impl std::fmt::Debug for Policy {
    fn fmt(&self, formatter: &mut std::fmt::Formatter<'_>) -> std::fmt::Result {
        formatter
            .debug_struct("Policy")
            .field("change", &self.change)
            .finish_non_exhaustive()
    }
}

impl Policy {
    fn new(change: Change, destination: impl Into<String>) -> Arc<Self> {
        Arc::new(Self {
            change,
            destination: destination.into(),
            calls: AtomicUsize::new(0),
            seen: Mutex::new(Vec::new()),
            reached: Notify::new(),
            authority: None,
        })
    }
}

impl MiddlewarePlan for Policy {
    fn has_outbound(&self, context: &MiddlewareContext) -> bool {
        assert!(context.extension_scope().contains("instance-one"));
        assert_eq!(context.provider().unwrap().as_str(), "openai");
        assert_eq!(context.model(), Some("native-model"));
        assert_eq!(context.account_id().unwrap().as_str(), "acct_one");
        true
    }

    fn handle_outbound(
        &self,
        _: MiddlewareContext,
        mut request: outbound::Request,
        next: outbound::Next,
    ) -> BoxFuture<'static, Result<outbound::Request, MiddlewareError>> {
        self.calls.fetch_add(1, Ordering::SeqCst);
        self.seen.lock().unwrap().push(request.body.to_vec());
        self.reached.notify_one();
        match self.change {
            Change::None => request.headers.push(MiddlewareHeader::new(
                "x-outbound",
                Bytes::from_static(b"applied"),
            )),
            Change::Rewrite => {
                let Target::Http { uri, .. } = &mut request.target else {
                    panic!("HTTP target");
                };
                *uri = self.destination.parse().unwrap();
            }
            Change::Oversize => request.body = vec![b'x'; 8_193].into(),
            Change::InvalidJson => request.body = Bytes::from_static(b"not JSON"),
            Change::Compressed => request.headers.push(MiddlewareHeader::new(
                "content-encoding",
                Bytes::from_static(b"gzip"),
            )),
            Change::WebSocket => {
                request.target = Target::WebSocket {
                    uri: "wss://example.invalid/socket".parse().unwrap(),
                }
            }
            Change::Reject => return Box::pin(async { Err(MiddlewareError::Rejected) }),
            Change::Canary => {
                return Box::pin(async {
                    Err(MiddlewareError::Provider(
                        ProviderError::new(
                            ProviderErrorKind::RequestPolicyDenied,
                            UpstreamSendState::NotSent,
                        )
                        .with_source(std::io::Error::other("fixture-secret-canary")),
                    ))
                });
            }
            Change::Revoke => self.authority.as_ref().unwrap().revoke("key-one"),
            Change::Wait => return Box::pin(futures::future::pending()),
        }
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

fn policy_context(
    runtime: &ovload_plugin_runtime::PluginRuntime,
    generation: &ExtensionSetReference,
    policy: Option<Arc<Policy>>,
    privacy: bool,
    cancellation: CancellationToken,
    authority: Option<Arc<crate::model_keys::FixtureAuthority>>,
) -> AttemptContext {
    let mut request = crate::model_keys::authorize_context(RequestAttemptContext::new(
        ModelRequestId::new("req_policy").unwrap(),
        ClientApiKeyId::new("key-one").unwrap(),
    ))
    .with_upstream_adapters(runtime.execution_registry().upstream_adapters(generation))
    .with_request_body_limit(8_192)
    .with_execution_effects(Some(Arc::new(ExecutionEffects::default())))
    .with_privacy(privacy.then(|| Arc::new(RedactPrivacy) as Arc<dyn CompiledPrivacyPolicy>))
    .with_middleware(
        policy.map(|policy| FrozenMiddlewarePlan::new(policy, generation.clone())),
        Arc::from([]),
        "/v1/responses".into(),
        ClientTransport::HttpJson,
    );
    if let Some(authority) = authority {
        request = request.with_model_key_authority(ModelKeyExecutionGuard::new(
            authority,
            crate::model_keys::identity("key-one"),
        ));
    }
    AttemptContext::new(
        request,
        NonZeroU32::MIN,
        Deadline::default(),
        AccountSelectionPolicy::new(
            ovload_core::account::RotationStrategy::RoundRobin,
            NonZeroU32::MIN,
        ),
        AccountAttemptContext::new(Default::default(), None, None),
        None,
        cancellation,
    )
}

async fn collect_failure(mut stream: EventStream) -> ProviderError {
    tokio::time::timeout(Duration::from_secs(3), async {
        while let Some(event) = stream.next().await {
            match event {
                Ok(event) => assert!(
                    !event
                        .canonical_facts()
                        .iter()
                        .any(|fact| matches!(fact, GatewayEvent::Completed(_)))
                ),
                Err(failure) => return failure,
            }
        }
        panic!("the adapter must report a terminal host rejection");
    })
    .await
    .expect("a sticky preparation failure must wake execution without a request deadline")
}

async fn cleanup(
    runtime: &ovload_plugin_runtime::PluginRuntime,
    generation: ExtensionSetReference,
    cache: &tempfile::TempDir,
) {
    drop(generation);
    runtime.shutdown().await;
    super::super::wait_until_empty(cache.path()).await;
}

#[tokio::test]
async fn privacy_precedes_outbound_middleware_and_the_same_selected_account_send() {
    let server = MockServer::start().await;
    Mock::given(method("POST"))
        .and(path("/adapter/responses"))
        .and(header("authorization", "Bearer fixture-native-token"))
        .and(header("x-privacy", "applied"))
        .and(header("x-outbound", "applied"))
        .respond_with(ResponseTemplate::new(200).set_body_json(json!({"ok":true})))
        .expect(1)
        .mount(&server)
        .await;
    let (cache, _, runtime) = setup(configuration(&server.uri(), false)).await;
    let generation = ExtensionPreparationPort::prepare(&runtime, ConfigRevision::new(1).unwrap())
        .await
        .unwrap();
    let policy = Policy::new(Change::None, "");
    let context = policy_context(
        &runtime,
        &generation,
        Some(policy.clone()),
        true,
        CancellationToken::new(),
        None,
    );
    let account = Account::new();
    let mut stream = execute_with_context(account.clone(), context, None);
    assert!(server.received_requests().await.unwrap().is_empty());
    let mut completed = 0;
    while let Some(event) = stream.next().await {
        completed += event
            .unwrap()
            .canonical_facts()
            .iter()
            .filter(|fact| matches!(fact, GatewayEvent::Completed(_)))
            .count();
    }
    assert_eq!(completed, 1);
    assert_eq!(policy.calls.load(Ordering::SeqCst), 1);
    let seen: Value = serde_json::from_slice(&policy.seen.lock().unwrap()[0]).unwrap();
    assert_eq!(seen["input"], "redacted fixture");
    let requests = server.received_requests().await.unwrap();
    let sent: Value = serde_json::from_slice(&requests[0].body).unwrap();
    assert_eq!(sent["input"], "redacted fixture");
    assert_eq!(account.failures.load(Ordering::SeqCst), 0);
    drop(stream);
    cleanup(&runtime, generation, &cache).await;
}

#[tokio::test]
async fn rewritten_http_cannot_change_origin_purpose_transport_encoding_or_body_budget() {
    for (change, destination, privacy, expected) in [
        (
            Change::Rewrite,
            "https://different.invalid/responses",
            false,
            ProviderErrorKind::RequestPolicyDenied,
        ),
        (
            Change::Rewrite,
            "auxiliary",
            false,
            ProviderErrorKind::RequestPolicyDenied,
        ),
        (
            Change::Oversize,
            "",
            false,
            ProviderErrorKind::InvalidRequest,
        ),
        (
            Change::WebSocket,
            "",
            false,
            ProviderErrorKind::InvalidRequest,
        ),
        (
            Change::InvalidJson,
            "",
            true,
            ProviderErrorKind::RequestPolicyDenied,
        ),
        (
            Change::Compressed,
            "",
            true,
            ProviderErrorKind::RequestPolicyDenied,
        ),
    ] {
        let server = MockServer::start().await;
        let mut config = configuration(&server.uri(), false);
        config["upstream_registration"]["adapters"][0]["paths"] = json!([
            {"path":"responses","purpose":"inference"},
            {"path":"upload","purpose":"auxiliary"}
        ]);
        let (cache, _, runtime) = setup(config).await;
        let generation =
            ExtensionPreparationPort::prepare(&runtime, ConfigRevision::new(1).unwrap())
                .await
                .unwrap();
        let destination = if destination == "auxiliary" {
            format!("{}/adapter/upload?part=1", server.uri())
        } else {
            destination.to_owned()
        };
        let context = policy_context(
            &runtime,
            &generation,
            Some(Policy::new(change, destination)),
            privacy,
            CancellationToken::new(),
            None,
        );
        let account = Account::new();
        let failure = collect_failure(execute_with_context(account.clone(), context, None)).await;
        assert_eq!(failure.kind(), expected);
        assert_eq!(failure.send_state(), UpstreamSendState::NotSent);
        assert!(failure.retry_is_prohibited());
        assert_eq!(account.failures.load(Ordering::SeqCst), 1);
        assert!(server.received_requests().await.unwrap().is_empty());
        cleanup(&runtime, generation, &cache).await;
    }
}

#[tokio::test]
async fn preparation_rejection_wakes_setup_and_event_consumption_even_if_plugin_catches_it() {
    for before_reply in [true, false] {
        let server = MockServer::start().await;
        let mut config = configuration(&server.uri(), false);
        config["upstream_callbacks_before_reply"] = json!(before_reply);
        config["upstream_ignore_callback_errors"] = json!(true);
        config["upstream_caught_error_delay_ms"] = json!(30_000);
        let (cache, _, runtime) = setup(config).await;
        let generation =
            ExtensionPreparationPort::prepare(&runtime, ConfigRevision::new(1).unwrap())
                .await
                .unwrap();
        let context = policy_context(
            &runtime,
            &generation,
            Some(Policy::new(Change::Reject, "")),
            false,
            CancellationToken::new(),
            None,
        );
        let account = Account::new();
        let failure = collect_failure(execute_with_context(account.clone(), context, None)).await;
        assert_eq!(failure.kind(), ProviderErrorKind::RequestPolicyDenied);
        assert_eq!(failure.send_state(), UpstreamSendState::NotSent);
        assert!(failure.retry_is_prohibited());
        assert_eq!(account.failures.load(Ordering::SeqCst), 1);
        assert!(server.received_requests().await.unwrap().is_empty());
        cleanup(&runtime, generation, &cache).await;
    }
}

#[tokio::test]
async fn malformed_callback_parameters_and_excessive_payload_remain_typed_host_rejections() {
    for too_large in [false, true] {
        let server = MockServer::start().await;
        let mut config = configuration(&server.uri(), false);
        config["upstream_ignore_callback_errors"] = json!(true);
        if too_large {
            config["upstream_callbacks"][0]["body"] = json!("x".repeat(8_193));
        } else {
            config["upstream_callbacks"][0]["params"]["method"] = json!(42);
        }
        let (cache, _, runtime) = setup(config).await;
        let generation =
            ExtensionPreparationPort::prepare(&runtime, ConfigRevision::new(1).unwrap())
                .await
                .unwrap();
        let context = policy_context(
            &runtime,
            &generation,
            None,
            false,
            CancellationToken::new(),
            None,
        );
        let failure = collect_failure(execute_with_context(Account::new(), context, None)).await;
        assert_eq!(
            failure.kind(),
            if too_large {
                ProviderErrorKind::MessageTooBig
            } else {
                ProviderErrorKind::InvalidRequest
            }
        );
        assert_eq!(failure.send_state(), UpstreamSendState::NotSent);
        assert!(failure.retry_is_prohibited());
        assert!(server.received_requests().await.unwrap().is_empty());
        cleanup(&runtime, generation, &cache).await;
    }
}

#[tokio::test]
async fn privacy_rejects_empty_non_json_and_compressed_inference_before_send() {
    for (body, encoding) in [("", None), ("not JSON", None), ("request", Some("gzip"))] {
        let server = MockServer::start().await;
        let mut config = configuration(&server.uri(), false);
        config["upstream_callbacks"][0]["body"] = json!(body);
        if let Some(encoding) = encoding {
            config["upstream_callbacks"][0]["params"]["headers"]
                .as_array_mut()
                .unwrap()
                .push(json!(["content-encoding", encoding.as_bytes()]));
        }
        let (cache, _, runtime) = setup(config).await;
        let generation =
            ExtensionPreparationPort::prepare(&runtime, ConfigRevision::new(1).unwrap())
                .await
                .unwrap();
        let context = policy_context(
            &runtime,
            &generation,
            None,
            true,
            CancellationToken::new(),
            None,
        );
        let failure = collect_failure(execute_with_context(Account::new(), context, None)).await;
        assert_eq!(failure.kind(), ProviderErrorKind::RequestPolicyDenied);
        assert_eq!(failure.send_state(), UpstreamSendState::NotSent);
        assert!(failure.retry_is_prohibited());
        assert!(server.received_requests().await.unwrap().is_empty());
        cleanup(&runtime, generation, &cache).await;
    }
}

#[tokio::test]
async fn revocation_after_async_preparation_prevents_the_host_send() {
    let server = MockServer::start().await;
    let (cache, _, runtime) = setup(configuration(&server.uri(), false)).await;
    let generation = ExtensionPreparationPort::prepare(&runtime, ConfigRevision::new(1).unwrap())
        .await
        .unwrap();
    let authority = Arc::new(crate::model_keys::FixtureAuthority::new([(
        "key-one",
        "fixture-secret",
    )]));
    let policy = Arc::new(Policy {
        change: Change::Revoke,
        destination: String::new(),
        calls: AtomicUsize::new(0),
        seen: Mutex::new(Vec::new()),
        reached: Notify::new(),
        authority: Some(authority.clone()),
    });
    let context = policy_context(
        &runtime,
        &generation,
        Some(policy.clone()),
        false,
        CancellationToken::new(),
        Some(authority),
    );
    let failure = collect_failure(execute_with_context(Account::new(), context, None)).await;
    assert_eq!(failure.kind(), ProviderErrorKind::RequestPolicyDenied);
    assert_eq!(failure.send_state(), UpstreamSendState::NotSent);
    assert!(failure.retry_is_prohibited());
    assert_eq!(policy.calls.load(Ordering::SeqCst), 1);
    assert!(server.received_requests().await.unwrap().is_empty());
    cleanup(&runtime, generation, &cache).await;
}

#[tokio::test]
async fn cancellation_during_outbound_preparation_never_sends() {
    let server = MockServer::start().await;
    let (cache, _, runtime) = setup(configuration(&server.uri(), false)).await;
    let generation = ExtensionPreparationPort::prepare(&runtime, ConfigRevision::new(1).unwrap())
        .await
        .unwrap();
    let policy = Policy::new(Change::Wait, "");
    let cancellation = CancellationToken::new();
    let context = policy_context(
        &runtime,
        &generation,
        Some(policy.clone()),
        false,
        cancellation.clone(),
        None,
    );
    let mut stream = execute_with_context(Account::new(), context, None);
    let failure = {
        let first = stream.next();
        tokio::pin!(first);
        tokio::select! {
            result = &mut first => panic!("preparation should still be waiting: {}", result.is_some()),
            () = policy.reached.notified() => {}
        }
        cancellation.cancel();
        first.await.unwrap().unwrap_err()
    };
    assert_eq!(failure.kind(), ProviderErrorKind::Cancelled);
    assert_eq!(failure.send_state(), UpstreamSendState::NotSent);
    assert!(server.received_requests().await.unwrap().is_empty());
    drop(stream);
    cleanup(&runtime, generation, &cache).await;
}

#[tokio::test]
async fn managed_websocket_policies_reject_before_plugin_or_handshake() {
    for privacy in [false, true] {
        let server = MockServer::start().await;
        let marker = tempfile::NamedTempFile::new().unwrap();
        let mut config = configuration(&server.uri(), false);
        config["upstream_marker"] = json!(marker.path());
        config["upstream_registration"]["adapters"][0]["transport"] = json!("websocket");
        config["upstream_callbacks"] = json!([{"method":"host.upstream.websocket.open","params":{"path":"responses","headers":[]}}]);
        let (cache, _, runtime) = setup(config).await;
        let generation =
            ExtensionPreparationPort::prepare(&runtime, ConfigRevision::new(1).unwrap())
                .await
                .unwrap();
        let context = policy_context(
            &runtime,
            &generation,
            (!privacy).then(|| Policy::new(Change::None, "")),
            privacy,
            CancellationToken::new(),
            None,
        );
        let failure = collect_failure(execute_with_context(Account::new(), context, None)).await;
        assert_eq!(failure.kind(), ProviderErrorKind::RequestPolicyDenied);
        assert_eq!(failure.send_state(), UpstreamSendState::NotSent);
        assert!(failure.retry_is_prohibited());
        assert!(std::fs::read(marker.path()).unwrap().is_empty());
        assert!(server.received_requests().await.unwrap().is_empty());
        cleanup(&runtime, generation, &cache).await;
    }
}

#[tokio::test]
async fn preparation_rejections_discard_untrusted_error_sources() {
    let server = MockServer::start().await;
    let (cache, _, runtime) = setup(configuration(&server.uri(), false)).await;
    let generation = ExtensionPreparationPort::prepare(&runtime, ConfigRevision::new(1).unwrap())
        .await
        .unwrap();
    let context = policy_context(
        &runtime,
        &generation,
        Some(Policy::new(Change::Canary, "")),
        false,
        CancellationToken::new(),
        None,
    );
    let failure = collect_failure(execute_with_context(Account::new(), context, None)).await;
    assert_eq!(failure.kind(), ProviderErrorKind::RequestPolicyDenied);
    assert!(failure.retry_is_prohibited());
    assert!(
        !failure
            .error_details()
            .unwrap_or_default()
            .contains("fixture-secret-canary")
    );
    assert!(!format!("{failure:?}").contains("fixture-secret-canary"));
    assert!(server.received_requests().await.unwrap().is_empty());
    cleanup(&runtime, generation, &cache).await;
}

struct MeteredAccount {
    account: Arc<Account>,
    decoded: std::path::PathBuf,
}

impl UpstreamAccountConnection for MeteredAccount {
    fn account_id(&self) -> &ProviderAccountId {
        self.account.account_id()
    }
    fn credential_revision(&self) -> CredentialRevision {
        self.account.credential_revision()
    }
    fn authentication_kind(&self) -> &str {
        self.account.authentication_kind()
    }
    fn outbound_proxy(&self) -> Option<&OutboundProxy> {
        self.account.outbound_proxy()
    }
    fn authorization(&self) -> Result<Vec<MiddlewareHeader>, ProviderError> {
        self.account.authorization()
    }
    fn calculate_cost(&self, tier: Option<&str>, usage: &Usage) -> Option<CalculatedCost> {
        std::fs::write(&self.decoded, b"decoded").unwrap();
        self.account.calculate_cost(tier, usage)
    }
    fn record_failure(&self, error: ProviderError) -> BoxFuture<'_, ProviderError> {
        self.account.record_failure(error)
    }
}

#[tokio::test]
async fn terminal_preparation_rejection_preserves_usage_cost_and_observation_without_success() {
    let server = MockServer::start().await;
    Mock::given(method("POST"))
        .respond_with(ResponseTemplate::new(200).set_body_string("{}"))
        .expect(1)
        .mount(&server)
        .await;
    let marker_directory = tempfile::tempdir().unwrap();
    let decoded = marker_directory.path().join("decoded");
    let mut config = configuration(&server.uri(), false);
    config["upstream_tail_callback"] = json!({
        "gate_marker":decoded,
        "method":"host.upstream.http.do",
        "params":{"method":42,"path":"responses","headers":[]}
    });
    let (cache, _, runtime) = setup(config).await;
    let generation = ExtensionPreparationPort::prepare(&runtime, ConfigRevision::new(1).unwrap())
        .await
        .unwrap();
    let context = policy_context(
        &runtime,
        &generation,
        None,
        false,
        CancellationToken::new(),
        None,
    );
    let account = Account::new();
    let selected = Arc::new(MeteredAccount {
        account: account.clone(),
        decoded,
    });
    let provider = ProviderKind::new("openai").unwrap();
    let model = UpstreamModelId::new("native-model").unwrap();
    let adapter = context
        .upstream_adapter_for_account(&provider, &model, &account.id)
        .unwrap()
        .unwrap();
    let metadata = ProviderCallMetadata::new(
        provider,
        model,
        account.id.clone(),
        UpstreamTransport::new(adapter.transport()).unwrap(),
    );
    let operation = Operation::Generate(GenerateRequest::from_protocol_payload(
        ProtocolPayload::json_object(
            "openai",
            json!({"model":"native-model","input":"fixture"})
                .as_object()
                .unwrap()
                .clone(),
        )
        .unwrap(),
    ));
    let stream = adapter.execute(UpstreamAdapterInvocation {
        operation,
        headers: vec![],
        context,
        metadata,
        account: selected,
    });
    let mut failure = collect_failure(stream).await;
    assert_eq!(failure.kind(), ProviderErrorKind::InvalidRequest);
    assert_eq!(failure.send_state(), UpstreamSendState::Sent);
    assert!(failure.retry_is_prohibited());
    let atomic = failure.take_atomic_client_events();
    assert!(
        atomic
            .iter()
            .any(|event| event.response_observation().is_some())
    );
    let facts: Vec<_> = atomic
        .into_iter()
        .flat_map(|event| event.into_parts().0)
        .collect();
    assert_eq!(facts.len(), 2);
    assert!(matches!(facts[0], GatewayEvent::Usage(_)));
    assert!(matches!(facts[1], GatewayEvent::CalculatedCost(_)));
    assert_eq!(account.failures.load(Ordering::SeqCst), 1);
    cleanup(&runtime, generation, &cache).await;
}

#[tokio::test]
async fn exhausted_extension_scope_rejects_before_plugin_or_network() {
    let server = MockServer::start().await;
    let marker = tempfile::NamedTempFile::new().unwrap();
    let mut config = configuration(&server.uri(), false);
    config["upstream_marker"] = json!(marker.path());
    let (cache, _, runtime) = setup(config).await;
    let generation = ExtensionPreparationPort::prepare(&runtime, ConfigRevision::new(1).unwrap())
        .await
        .unwrap();
    let scope = (0..ExtensionCallScope::MAXIMUM_DEPTH)
        .fold(ExtensionCallScope::default(), |scope, index| {
            scope.extending(format!("ancestor-{index}")).unwrap()
        });
    let context = policy_context(
        &runtime,
        &generation,
        None,
        false,
        CancellationToken::new(),
        None,
    )
    .with_extension_scope(scope);
    let failure = collect_failure(execute_with_context(Account::new(), context, None)).await;
    assert_eq!(failure.kind(), ProviderErrorKind::RequestPolicyDenied);
    assert_eq!(failure.send_state(), UpstreamSendState::NotSent);
    assert!(failure.retry_is_prohibited());
    assert!(std::fs::read(marker.path()).unwrap().is_empty());
    assert!(server.received_requests().await.unwrap().is_empty());
    cleanup(&runtime, generation, &cache).await;
}

#[tokio::test]
async fn normalized_auxiliary_aliases_apply_header_privacy_without_creating_a_body() {
    let server = MockServer::start().await;
    for target in ["/adapter/upload", "/adapter/responses"] {
        Mock::given(method("POST"))
            .and(path(target))
            .and(header("x-privacy", "applied"))
            .and(header("x-outbound", "applied"))
            .respond_with(ResponseTemplate::new(200).set_body_string("{}"))
            .expect(1)
            .mount(&server)
            .await;
    }
    let mut config = configuration(&server.uri(), false);
    config["upstream_registration"]["adapters"][0]["paths"] = json!([
        {"path":"responses","purpose":"inference"},
        {"path":"./upload","purpose":"auxiliary"}
    ]);
    let mut auxiliary = config["upstream_callbacks"][0].clone();
    auxiliary["params"]["path"] = json!("upload?part=1");
    auxiliary["params"]["headers"] = json!([]);
    auxiliary["body"] = json!("");
    config["upstream_callbacks"]
        .as_array_mut()
        .unwrap()
        .insert(0, auxiliary);
    let (cache, _, runtime) = setup(config).await;
    let generation = ExtensionPreparationPort::prepare(&runtime, ConfigRevision::new(1).unwrap())
        .await
        .unwrap();
    let policy = Policy::new(Change::None, "");
    let context = policy_context(
        &runtime,
        &generation,
        Some(policy.clone()),
        true,
        CancellationToken::new(),
        None,
    );
    let mut stream = execute_with_context(Account::new(), context, None);
    while let Some(event) = stream.next().await {
        event.unwrap();
    }
    assert_eq!(policy.calls.load(Ordering::SeqCst), 2);
    let requests = server.received_requests().await.unwrap();
    assert_eq!(requests.len(), 2);
    assert!(requests[0].body.is_empty());
    assert_eq!(requests[0].url.path(), "/adapter/upload");
    assert_eq!(requests[0].url.query(), Some("part=1"));
    drop(stream);
    cleanup(&runtime, generation, &cache).await;
}

#[tokio::test]
async fn same_origin_and_purpose_rewrite_preserves_the_final_request() {
    let server = MockServer::start().await;
    Mock::given(method("POST"))
        .and(path("/adapter/alternate"))
        .respond_with(ResponseTemplate::new(200).set_body_string("{}"))
        .expect(1)
        .mount(&server)
        .await;
    let (cache, _, runtime) = setup(configuration(&server.uri(), false)).await;
    let generation = ExtensionPreparationPort::prepare(&runtime, ConfigRevision::new(1).unwrap())
        .await
        .unwrap();
    let policy = Policy::new(
        Change::Rewrite,
        format!("{}/adapter/alternate?source=policy", server.uri()),
    );
    let context = policy_context(
        &runtime,
        &generation,
        Some(policy),
        false,
        CancellationToken::new(),
        None,
    );
    let mut stream = execute_with_context(Account::new(), context, None);
    while let Some(event) = stream.next().await {
        event.unwrap();
    }
    let requests = server.received_requests().await.unwrap();
    assert_eq!(requests.len(), 1);
    assert_eq!(requests[0].url.query(), Some("source=policy"));
    drop(stream);
    cleanup(&runtime, generation, &cache).await;
}

#[derive(Debug)]
struct CancellingPrivacy(CancellationToken);

impl CompiledPrivacyPolicy for CancellingPrivacy {
    fn apply(
        &self,
        _: &mut Value,
        _: &mut ::http::HeaderMap,
        _: &mut Option<String>,
        _: &dyn Fn() -> bool,
    ) -> Result<Vec<PrivacyRuleOutcome>, PrivacyError> {
        self.0.cancel();
        Ok(Vec::new())
    }
}

#[tokio::test]
async fn diagnostic_privacy_cancellation_cannot_reach_the_host_send() {
    let server = MockServer::start().await;
    let (cache, _, runtime) = setup(configuration(&server.uri(), false)).await;
    let generation = ExtensionPreparationPort::prepare(&runtime, ConfigRevision::new(1).unwrap())
        .await
        .unwrap();
    let cancellation = CancellationToken::new();
    let request = RequestAttemptContext::new(
        ModelRequestId::new("req_diagnostic_policy").unwrap(),
        ClientApiKeyId::new("key-one").unwrap(),
    )
    .with_upstream_adapters(runtime.execution_registry().upstream_adapters(&generation))
    .with_request_body_limit(8_192)
    .with_privacy(Some(Arc::new(CancellingPrivacy(cancellation.clone()))));
    let account = Account::new();
    let context = AttemptContext::new(
        request,
        NonZeroU32::MIN,
        Deadline::default(),
        AccountSelectionPolicy::new(
            ovload_core::account::RotationStrategy::RoundRobin,
            NonZeroU32::MIN,
        ),
        AccountAttemptContext::diagnostic(Default::default(), account.id.clone(), None),
        None,
        cancellation,
    );
    let failure = collect_failure(execute_with_context(account, context, None)).await;
    assert_eq!(failure.kind(), ProviderErrorKind::Cancelled);
    assert_eq!(failure.send_state(), UpstreamSendState::NotSent);
    assert!(server.received_requests().await.unwrap().is_empty());
    cleanup(&runtime, generation, &cache).await;
}
