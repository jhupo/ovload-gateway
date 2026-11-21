// Modified for Ovload on 2026-10-27: workspace integration.

//! 验证插件 Key 事实查询读取当前分组且不暴露密钥

use ovload_admin::{
    model::plugins::management::PluginManagementRequest, ports::plugin_management::PluginManagement,
};
use ovload_core::policy::RateLimits;
use serde_json::{Value, json};

#[tokio::test]
async fn key_facts_read_current_database_groups_without_secrets() {
    let Some(environment) = crate::support::environment::Environment::create().await else {
        eprintln!("SKIP: plugin integration environment absent");
        return;
    };
    let account = environment.account(None).await;
    let group = environment.account_group_with_account(&account).await;
    let id = "key_facts_fixture";
    environment
        .client_key_with_limits_and_groups(
            id,
            "sk-test-key-facts-secret",
            RateLimits::unlimited(),
            vec![group.clone()],
        )
        .await;
    let (runtime, core) = environment.plugin(json!({
        "management_registration":{"routes":[{"method":"GET","path":"facts","request_content_types":[],"response_content_types":["application/json"]}]},
        "data_queries":[
            {"method":"host.data.keys.get","query":{"client_key_id":id}},
            {"method":"host.data.keys.get","query":{"client_key_id":"key_missing"}},
            {"method":"host.data.keys.get","query":{"client_key_id":id,"secret":true}}
        ]
    })).await;
    let access = ovload_admin::initialize_plugin_client_keys(
        environment.store.admin_ports().client_keys(),
        core.snapshot_control(),
    );
    runtime.bind_client_key_ports(&access).unwrap();
    let generation = core
        .snapshots()
        .acquire()
        .unwrap()
        .extensions()
        .unwrap()
        .clone();
    let view = runtime.views(&generation).await.unwrap().remove(0);
    for (group_enabled, enabled) in [(true, true), (false, true), (true, false), (true, true)] {
        environment
            .set_account_group_enabled(group.clone(), group_enabled)
            .await;
        environment.set_client_key_enabled(id, enabled).await;
        let response = runtime
            .handle(
                &generation,
                &view.target,
                PluginManagementRequest {
                    request_context: None,
                    headers: Vec::new(),
                    method: "GET".into(),
                    path: "facts".into(),
                    query: String::new(),
                    content_type: None,
                    body: vec![],
                    request_id: "key-facts".into(),
                },
            )
            .await
            .unwrap();
        let result: Value = serde_json::from_slice(&response.body).unwrap();
        assert_eq!(
            result[0],
            json!({"schema_version":1,"client_key_id":id,"enabled":enabled,
            "group_ids":[group.as_str()] })
        );
        assert_eq!(result[1]["error"], "rejected");
        assert_eq!(result[2]["error"], "invalid_input");
        assert_eq!(
            core.client_key_verifier()
                .verify_client_key("sk-test-key-facts-secret")
                .await
                .is_ok(),
            enabled && group_enabled,
        );
    }
    drop(generation);
    environment.release_plugin_accounts(&runtime);
    runtime.shutdown().await;
    drop(core);
    drop(access);
    drop(runtime);
    environment.close().await;
}
