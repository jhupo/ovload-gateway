// Modified for Ovload on 2026-10-27: workspace integration.

//! 验证上游适配器注册与调用合同

mod codec;

#[test]
fn registration_round_trip_preserves_explicit_account_scopes() {
    use ovload_plugin_sdk::call::upstream_adapter::UpstreamAdapterRegistration;
    use serde_json::json;

    for (provider, authentication) in [
        ("openai", "oauth"),
        ("openai_api", "api_key"),
        ("claude", "oauth"),
        ("gemini", "oauth"),
        ("xai", "oauth"),
        ("xai_api", "api_key"),
    ] {
        for accounts in [json!([]), json!(["acct_one", "acct_two"])] {
            let wire = json!({"adapters":[{
                "id":"example", "provider":provider, "base_url":"https://example.invalid/",
                "paths":[{"path":"responses","purpose":"inference"}],
                "authentication_kinds":[authentication], "transport":"http_sse", "protocol":"openai",
                "account_ids":accounts
            }]});
            let registration: UpstreamAdapterRegistration = serde_json::from_value(wire).unwrap();
            let serialized = serde_json::to_value(registration).unwrap();
            assert_eq!(serialized["adapters"][0]["provider"], provider);
            let round_trip: UpstreamAdapterRegistration =
                serde_json::from_value(serialized).unwrap();
            assert_eq!(round_trip.adapters[0].provider.as_str(), provider);
            assert_eq!(
                serde_json::to_value(&round_trip.adapters[0].account_ids).unwrap(),
                accounts
            );
        }
    }
}

#[test]
fn builtin_provider_identities_are_exact_and_have_no_aliases() {
    use ovload_plugin_sdk::call::upstream_adapter::BuiltinProvider;
    use serde_json::json;

    for (provider, identity) in [
        (BuiltinProvider::OpenAi, "openai"),
        (BuiltinProvider::OpenAiApi, "openai_api"),
        (BuiltinProvider::Claude, "claude"),
        (BuiltinProvider::Gemini, "gemini"),
        (BuiltinProvider::Xai, "xai"),
        (BuiltinProvider::XaiApi, "xai_api"),
    ] {
        assert_eq!(provider.as_str(), identity);
        assert_eq!(serde_json::to_value(provider).unwrap(), json!(identity));
        assert_eq!(
            serde_json::from_value::<BuiltinProvider>(json!(identity)).unwrap(),
            provider
        );
    }
    for identity in ["openaiapi", "OpenAiApi", "OpenAI", "standard", "other"] {
        assert!(serde_json::from_value::<BuiltinProvider>(json!(identity)).is_err());
    }
}
