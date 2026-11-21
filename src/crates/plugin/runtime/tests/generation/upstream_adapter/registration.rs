//! Real registration keeps public API identity and API-key authentication distinct.

use super::*;

struct ApiKeyAccount {
    id: ProviderAccountId,
    failures: AtomicUsize,
}

impl UpstreamAccountConnection for ApiKeyAccount {
    fn account_id(&self) -> &ProviderAccountId {
        &self.id
    }
    fn credential_revision(&self) -> CredentialRevision {
        CredentialRevision::new(1).unwrap()
    }
    fn authentication_kind(&self) -> &str {
        "api_key"
    }
    fn outbound_proxy(&self) -> Option<&OutboundProxy> {
        None
    }
    fn authorization(&self) -> Result<Vec<MiddlewareHeader>, ProviderError> {
        Ok(vec![MiddlewareHeader::new(
            "authorization",
            Bytes::from_static(b"Bearer fixture-native-token"),
        )])
    }
    fn calculate_cost(&self, _: Option<&str>, _: &Usage) -> Option<CalculatedCost> {
        None
    }
    fn record_failure(&self, error: ProviderError) -> BoxFuture<'_, ProviderError> {
        self.failures.fetch_add(1, Ordering::SeqCst);
        Box::pin(async move { error })
    }
}

#[tokio::test]
async fn public_api_registration_selects_only_its_identity_and_authenticates_http_and_sse() {
    for streaming in [false, true] {
        let server = MockServer::start().await;
        Mock::given(method("POST"))
            .and(path("/adapter/responses"))
            .and(header("authorization", "Bearer fixture-native-token"))
            .respond_with(ResponseTemplate::new(200).set_body_string(if streaming {
                "data: {\"id\":\"response-one\"}\n\n"
            } else {
                "{\"id\":\"response-one\"}"
            }))
            .expect(1)
            .mount(&server)
            .await;
        let mut config = configuration(&server.uri(), streaming);
        config["upstream_registration"]["adapters"][0]["provider"] = json!("openai_api");
        config["upstream_registration"]["adapters"][0]["authentication_kinds"] = json!(["api_key"]);
        let (cache, store, runtime) = setup(config).await;
        store.snapshot.lock().unwrap().instances[0].bindings[0].provider_ids =
            vec!["openai_api".into()];
        let generation =
            ExtensionPreparationPort::prepare(&runtime, ConfigRevision::new(1).unwrap())
                .await
                .expect("public API identity must pass Host registration validation");
        let context = context(&runtime, &generation, "key-public-api");
        let provider = ProviderKind::new("openai_api").unwrap();
        let model = UpstreamModelId::new("native-model").unwrap();
        let account = Arc::new(ApiKeyAccount {
            id: ProviderAccountId::new("acct_public_api").unwrap(),
            failures: AtomicUsize::new(0),
        });
        let adapter = context
            .upstream_adapter_for_account(&provider, &model, &account.id)
            .unwrap()
            .expect("the real public API declaration must be selectable");
        assert!(adapter.supports_authentication("api_key"));
        assert!(!adapter.supports_authentication("oauth"));
        for other in ["openai", "xai"] {
            assert!(
                context
                    .upstream_adapter_for_account(
                        &ProviderKind::new(other).unwrap(),
                        &model,
                        &account.id,
                    )
                    .unwrap()
                    .is_none()
            );
        }
        let metadata = ProviderCallMetadata::new(
            provider,
            model,
            account.id.clone(),
            UpstreamTransport::new(adapter.transport()).unwrap(),
        );
        let operation = Operation::Generate(GenerateRequest::from_protocol_payload(
            ProtocolPayload::json_object(
                "openai",
                json!({"model":"native-model","input":"redacted"})
                    .as_object()
                    .unwrap()
                    .clone(),
            )
            .unwrap(),
        ));
        let mut stream = adapter.execute(UpstreamAdapterInvocation {
            operation,
            headers: vec![],
            context,
            metadata,
            account: account.clone(),
        });
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
        assert_eq!(account.failures.load(Ordering::SeqCst), 0);
        drop(stream);
        drop(generation);
        runtime.shutdown().await;
        super::super::wait_until_empty(cache.path()).await;
    }
}

#[tokio::test]
async fn upstream_registration_rejects_a_public_api_provider_alias_in_bindings() {
    let mut config = configuration("https://example.invalid", false);
    config["upstream_registration"]["adapters"][0]["provider"] = json!("openai_api");
    config["upstream_registration"]["adapters"][0]["authentication_kinds"] = json!(["api_key"]);
    let (cache, store, runtime) = setup(config).await;
    store.snapshot.lock().unwrap().instances[0].bindings[0].provider_ids = vec!["openaiapi".into()];
    assert!(
        ExtensionPreparationPort::prepare(&runtime, ConfigRevision::new(1).unwrap())
            .await
            .is_err()
    );
    runtime.shutdown().await;
    super::super::wait_until_empty(cache.path()).await;
}
