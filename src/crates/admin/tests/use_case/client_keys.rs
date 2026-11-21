// Modified for Ovload on 2026-10-27: workspace integration.

//! Client Key 管理、预算变更与存储调用的用例测试

use std::sync::{Arc, Mutex};

use async_trait::async_trait;
use chrono::Utc;
use ovload_core::policy::{ClientApiKeyId, RateLimits};

use ovload_admin::{
    model::{
        AdminErrorKind, MutationActor, MutationContext, PageSize, Revision,
        client_keys::{
            ClientKeyCursor, ClientKeyCursorValue, ClientKeyListQuery, ClientKeyPage,
            ClientKeyPageSize, ClientKeyRecord, ClientKeySort, ClientKeySortField, SortDirection,
        },
        plugin_client_keys::{
            PluginClientKey, PluginClientKeyCursor, PluginClientKeyListQuery, PluginClientKeyPage,
        },
    },
    ports::store::{AdminStoreError, AdminStoreErrorKind, AdminStoreResult, ClientKeyStore},
};

#[derive(Default)]
struct TestClientKeyStore {
    list_queries: Mutex<Vec<ClientKeyListQuery>>,
    list_response: Mutex<Option<ClientKeyPage>>,
    resets: Mutex<Vec<ovload_admin::model::client_keys::ResetClientKeyBudget>>,
}

#[async_trait]
impl ClientKeyStore for TestClientKeyStore {
    async fn update_client_key_budget_limits(
        &self,
        _: ovload_admin::model::client_keys::UpdateClientKeyBudgetLimits,
        _: ovload_admin::model::client_keys::ClientKeyBudgetMutationOrigin,
        _: &MutationContext,
    ) -> AdminStoreResult<Option<Revision>> {
        Err(unused())
    }

    async fn reset_client_key_budget(
        &self,
        command: ovload_admin::model::client_keys::ResetClientKeyBudget,
        _: ovload_admin::model::client_keys::ClientKeyBudgetMutationOrigin,
        _: &MutationContext,
    ) -> AdminStoreResult<()> {
        self.resets.lock().unwrap().push(command);
        Ok(())
    }

    async fn get_client_key(
        &self,
        _: &ClientApiKeyId,
    ) -> AdminStoreResult<Option<ClientKeyRecord>> {
        Err(unused())
    }

    async fn list_client_keys(&self, query: ClientKeyListQuery) -> AdminStoreResult<ClientKeyPage> {
        self.list_queries.lock().unwrap().push(query.clone());
        if let Some(page) = self.list_response.lock().unwrap().clone() {
            return Ok(page);
        }
        assert_eq!(query.page_size.get(), u16::MAX);
        Ok(ClientKeyPage {
            config_revision: Revision::new(1).expect("revision"),
            items: Vec::new(),
            total: 0,
            next_cursor: None,
        })
    }
}

#[tokio::test]
async fn reset_budget_forwards_scope_and_returns_only_key_identity() {
    use ovload_admin::model::client_keys::{ClientKeyBudgetPeriod, ResetClientKeyBudget};
    let store = Arc::new(TestClientKeyStore::default());
    let services = super::AdminHarness::new()
        .client_keys(store.clone())
        .build()
        .await;
    let command = ResetClientKeyBudget {
        id: ClientApiKeyId::new("key_reset").unwrap(),
        period: ClientKeyBudgetPeriod::Weekly,
    };
    let result = services
        .client_keys()
        .reset_budget(
            &mutation_context(),
            command.clone(),
            ovload_admin::model::client_keys::ClientKeyBudgetMutationOrigin::Admin,
        )
        .await
        .unwrap();
    assert_eq!(result, command.id);
    assert_eq!(*store.resets.lock().unwrap(), vec![command]);
}

#[tokio::test]
async fn client_key_cursor_should_reject_value_that_does_not_match_sort() {
    let services = super::AdminHarness::new()
        .client_keys(Arc::new(TestClientKeyStore::default()))
        .build()
        .await;
    let sort = ClientKeySort {
        field: ClientKeySortField::Name,
        direction: SortDirection::Asc,
    };
    let error = services
        .client_keys()
        .list(ClientKeyListQuery {
            cursor: Some(ClientKeyCursor {
                sort,
                value: ClientKeyCursorValue::Enabled(true),
                id: ClientApiKeyId::new("key_cursor").expect("key ID"),
            }),
            page_size: ClientKeyPageSize::new(50).expect("page size"),
            search: None,
            sort,
        })
        .await
        .expect_err("mismatched cursor must fail");

    assert_eq!(error.kind(), AdminErrorKind::Invalid);
}

#[tokio::test]
async fn client_key_list_should_forward_the_full_nonzero_u16_page_size() {
    let services = super::AdminHarness::new()
        .client_keys(Arc::new(TestClientKeyStore::default()))
        .build()
        .await;
    let page = services
        .client_keys()
        .list(ClientKeyListQuery {
            cursor: None,
            page_size: ClientKeyPageSize::new(u16::MAX).expect("maximum page size"),
            search: None,
            sort: ClientKeySort {
                field: ClientKeySortField::CreatedAt,
                direction: SortDirection::Desc,
            },
        })
        .await
        .expect("maximum page size should reach store");

    assert_eq!(page.total, 0);
}

#[tokio::test]
async fn plugin_client_key_list_projects_only_public_identity_and_uses_stable_name_cursor() {
    let now = Utc::now();
    let key_id = ClientApiKeyId::new("key_public").expect("key ID");
    let next_id = ClientApiKeyId::new("key_next").expect("next key ID");
    let sort = ClientKeySort {
        field: ClientKeySortField::Name,
        direction: SortDirection::Asc,
    };
    let store = Arc::new(TestClientKeyStore {
        list_response: Mutex::new(Some(ClientKeyPage {
            config_revision: Revision::new(7).expect("revision"),
            items: vec![ClientKeyRecord {
                request_profile_overrides: Default::default(),
                id: key_id.clone(),
                name: "Public identity".to_owned(),
                label: Some("private management label".to_owned()),
                groups: Vec::new(),
                provider_kinds: Vec::new(),
                prefix: "sk_must_not_escape".to_owned(),
                enabled: true,
                limits: RateLimits::unlimited(),
                budget: Default::default(),
                last_used_at: Some(now),
                created_at: now,
                updated_at: now,
            }],
            total: 1,
            next_cursor: Some(ClientKeyCursor {
                sort,
                value: ClientKeyCursorValue::Name("Public identity".to_owned()),
                id: next_id.clone(),
            }),
        })),
        ..Default::default()
    });
    let access =
        ovload_admin::initialize_plugin_client_keys(store.clone(), Arc::new(super::NoopSnapshot));
    let input_cursor = PluginClientKeyCursor {
        name: "Before".to_owned(),
        id: ClientApiKeyId::new("key_before").expect("cursor key ID"),
    };

    let page = access
        .list(PluginClientKeyListQuery {
            cursor: Some(input_cursor.clone()),
            limit: PageSize::new(25).expect("page size"),
        })
        .await
        .expect("list plugin client keys");

    assert_eq!(
        page,
        PluginClientKeyPage {
            items: vec![PluginClientKey {
                id: key_id,
                name: "Public identity".to_owned(),
                enabled: true,
            }],
            next_cursor: Some(PluginClientKeyCursor {
                name: "Public identity".to_owned(),
                id: next_id,
            }),
        }
    );
    assert_eq!(
        *store.list_queries.lock().unwrap(),
        vec![ClientKeyListQuery {
            cursor: Some(ClientKeyCursor {
                sort,
                value: ClientKeyCursorValue::Name(input_cursor.name),
                id: input_cursor.id,
            }),
            page_size: ClientKeyPageSize::new(25).expect("page size"),
            search: None,
            sort,
        }]
    );
}

fn mutation_context() -> MutationContext {
    MutationContext {
        actor: MutationActor::System,
        request_id: "custom-key-test".to_owned(),
    }
}

fn unused() -> AdminStoreError {
    AdminStoreError::new(
        AdminStoreErrorKind::Unavailable,
        "client key",
        "unused in this test",
    )
}
