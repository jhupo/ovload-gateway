// Modified for Ovload on 2026-10-27: workspace integration.

//! 验证账号分组聚合、Key 绑定与分组策略的持久化

use std::{collections::BTreeMap, time::Duration};

use ovload_admin::{
    model::{
        MutationActor, MutationContext, PageSize,
        account_groups::{
            AccountGroupColor, AccountGroupListQuery, DeleteAccountGroup, NewAccountGroup,
        },
    },
    ports::store::{AccountGroupStore, AdminStoreErrorKind, ClientKeyStore},
};
use ovload_core::{account::FastMode, policy::ClientApiKeyId, routing::AccountGroupId};
use ovload_store::postgres::{
    ObservabilityQueryBudget, PgAccountGroupRepository, PgAdminClientKeyStore,
};

use super::TestDatabase;

const MIXED_GROUP: &str = "grp_00000000000000000000000000000001";
const EMPTY_GROUP: &str = "grp_00000000000000000000000000000002";

async fn current_group_revision(pool: &sqlx::PgPool) -> ovload_admin::model::Revision {
    let revision: i64 =
        sqlx::query_scalar("select config_revision from runtime_settings where id=1")
            .fetch_one(pool)
            .await
            .unwrap();
    ovload_admin::model::Revision::new(u64::try_from(revision).unwrap()).unwrap()
}

#[tokio::test]
async fn groups_aggregate_cross_provider_members_and_key_bindings_without_multiplication() {
    let Some(database) = TestDatabase::create("account_group_aggregate").await else {
        return;
    };
    // 显式固定继承上限，让分组聚合断言不依赖安装时的初始设置
    sqlx::query("update runtime_settings set max_concurrent_per_account = 3 where id = 1")
        .execute(&database.pool)
        .await
        .expect("set inherited account concurrency");
    seed_account(
        &database.pool,
        "acct_group_openai",
        "openai",
        "OpenAI Account",
    )
    .await;
    seed_account(&database.pool, "acct_group_xai", "xai", "xAI Account").await;
    sqlx::query(
        "update provider_accounts set concurrency_limit = 4 where id = 'acct_group_openai'",
    )
    .execute(&database.pool)
    .await
    .expect("set account concurrency override");

    let groups = PgAccountGroupRepository::new(
        database.pool.clone(),
        ObservabilityQueryBudget::try_new(4, Duration::from_secs(10), Duration::from_secs(10))
            .unwrap(),
    );
    let keys = PgAdminClientKeyStore::new(database.pool.clone());
    let mixed_group = group_id(MIXED_GROUP);
    let empty_group = group_id(EMPTY_GROUP);
    groups
        .create_account_group(
            NewAccountGroup {
                policy: Default::default(),
                allow_image_generation: true,
                fast_mode: FastMode::Default,
                id: mixed_group.clone(),
                name: "Mixed Production".to_owned(),
                description: Some("cross-provider".to_owned()),
                color: group_color("#2563EBFF"),
            },
            &context("create-mixed"),
        )
        .await
        .expect("create mixed account group");
    groups
        .create_account_group(
            NewAccountGroup {
                policy: Default::default(),
                allow_image_generation: true,
                fast_mode: FastMode::Default,
                id: empty_group.clone(),
                name: "Empty Pool".to_owned(),
                description: None,
                color: group_color("#06B6D4CC"),
            },
            &context("create-empty"),
        )
        .await
        .expect("create empty account group");
    assign_accounts(
        &database.pool,
        MIXED_GROUP,
        &["acct_group_openai", "acct_group_xai"],
    )
    .await;

    for (id, group) in [
        ("key_group_one", MIXED_GROUP),
        ("key_group_two", MIXED_GROUP),
        ("key_empty_pool", EMPTY_GROUP),
    ] {
        let fixture =
            super::model_keys::fixture::KeyFixture::with_group(&database.pool, group).await;
        fixture
            .insert_key(&database.pool, id, &format!("fixture-{id}"), true)
            .await;
    }
    // 旧请求保留冻结的分组归属；账号后来所属分组不重写历史归属。
    seed_group_cost_snapshot(
        &database.pool,
        "req_dual_group_key",
        "acct_group_openai",
        &[MIXED_GROUP, EMPTY_GROUP],
        "1.5",
    )
    .await;
    // 单分组请求只计入请求冻结的分组，不能改记到账号当前所在分组。
    seed_group_cost_snapshot(
        &database.pool,
        "req_account_attribution",
        "acct_group_xai",
        &[EMPTY_GROUP],
        "2.25",
    )
    .await;

    let page = groups
        .list_account_groups(AccountGroupListQuery {
            platforms: vec![],
            visibilities: vec![],
            sort_by_name: false,
            descending: true,
            page: 1,
            page_size: PageSize::new(20).expect("page size"),
            search: None,
            enabled: None,
        })
        .await
        .expect("list account groups");
    let members = groups
        .load_account_group_members(std::slice::from_ref(&mixed_group))
        .await
        .expect("load current-page group members");
    assert_eq!(members.len(), 2);
    assert_eq!(
        members
            .iter()
            .map(|member| member.total_slots)
            .sum::<Option<u64>>(),
        Some(7)
    );
    assert_eq!(page.total, 2);
    let by_id = page
        .items
        .into_iter()
        .map(|group| (group.id.to_string(), group))
        .collect::<BTreeMap<_, _>>();
    let mixed = by_id.get(MIXED_GROUP).expect("mixed group");
    assert_eq!(mixed.member_count, 2);
    assert_eq!(
        mixed.provider_counts,
        BTreeMap::from([("openai".to_owned(), 1), ("xai".to_owned(), 1)])
    );
    assert_eq!(mixed.client_key_count, 2);
    // PostgreSQL 返回持久页与 member facts；实时状态/容量由 Admin query service 投影
    assert_eq!(mixed.account_summary.available, 0);
    assert_eq!(mixed.account_summary.limited, 0);
    assert_eq!(mixed.account_summary.total, 0);
    assert_eq!(mixed.capacity.used_slots, None);
    assert_eq!(mixed.capacity.total_slots, Some(0));
    assert_eq!(mixed.usage.today_usd.as_str(), "1.5");
    assert_eq!(mixed.usage.retained_total_usd.as_str(), "1.5");
    let empty = by_id.get(EMPTY_GROUP).expect("empty group");
    assert_eq!(empty.member_count, 0);
    assert!(empty.provider_counts.is_empty());
    assert_eq!(empty.client_key_count, 1);
    assert_eq!(empty.usage.today_usd.as_str(), "3.75");
    assert_eq!(empty.usage.retained_total_usd.as_str(), "3.75");

    let empty_pool_key = keys
        .get_client_key(&client_key_id("key_empty_pool"))
        .await
        .unwrap()
        .unwrap();
    assert_eq!(empty_pool_key.groups.len(), 1);
    assert!(empty_pool_key.provider_kinds.is_empty());
    assert!(
        sqlx::query("update client_api_keys set account_group_id=$2 where id=$1")
            .bind("key_group_one")
            .bind(EMPTY_GROUP)
            .execute(&database.pool)
            .await
            .is_err()
    );
    let immutable_group: String =
        sqlx::query_scalar("select account_group_id from client_api_keys where id='key_group_one'")
            .fetch_one(&database.pool)
            .await
            .unwrap();
    assert_eq!(immutable_group, MIXED_GROUP);

    let revision_before_delete = current_revision(&database.pool).await;
    let audit_before_delete = audit_count(&database.pool).await;
    let error = groups
        .delete_account_group(
            DeleteAccountGroup { id: mixed_group },
            &context("delete-referenced"),
        )
        .await
        .expect_err("referenced group must not be deleted");
    assert_eq!(error.kind(), AdminStoreErrorKind::Conflict);
    assert_eq!(
        current_revision(&database.pool).await,
        revision_before_delete
    );
    assert_eq!(audit_count(&database.pool).await, audit_before_delete);

    database.close().await;
}

#[tokio::test]
async fn group_options_should_avoid_aggregate_tables_and_page_filtered_empty_groups() {
    let Some(database) = TestDatabase::create("account_group_options").await else {
        return;
    };
    for (id, name, enabled, created_at) in [
        (MIXED_GROUP, "Production Pool", true, "2026-01-01T00:00:00Z"),
        (EMPTY_GROUP, "Disabled Pool", false, "2026-01-02T00:00:00Z"),
        (
            "grp_00000000000000000000000000000003",
            "Unrelated",
            true,
            "2026-01-03T00:00:00Z",
        ),
    ] {
        sqlx::query(
            "insert into account_groups (id, name, color, enabled, created_at, updated_at)
             values ($1, $2, '#2563EBFF', $3, $4::text::timestamptz, $4::text::timestamptz)",
        )
        .bind(id)
        .bind(name)
        .bind(enabled)
        .bind(created_at)
        .execute(&database.pool)
        .await
        .expect("seed account group option");
    }
    let groups = PgAccountGroupRepository::new(
        database.pool.clone(),
        ObservabilityQueryBudget::try_new(4, Duration::from_secs(10), Duration::from_secs(10))
            .unwrap(),
    );

    let mut locked_tables = database.pool.begin().await.expect("begin table lock");
    sqlx::query(
        "lock table account_group_accounts, client_api_keys, model_requests
         in access exclusive mode",
    )
    .execute(&mut *locked_tables)
    .await
    .expect("lock aggregate source tables");

    let first = tokio::time::timeout(
        Duration::from_secs(1),
        groups.list_account_group_options(AccountGroupListQuery {
            platforms: vec![],
            visibilities: vec![],
            sort_by_name: false,
            descending: true,
            page: 1,
            page_size: PageSize::new(1).expect("page size"),
            search: Some("pool".to_owned()),
            enabled: None,
        }),
    )
    .await
    .expect("options query must not wait for aggregate source tables")
    .expect("list first account group option page");
    assert_eq!(first.total, 2);
    assert_eq!(first.items[0].id.as_str(), EMPTY_GROUP);
    assert!(!first.items[0].enabled);

    let second = groups
        .list_account_group_options(AccountGroupListQuery {
            platforms: vec![],
            visibilities: vec![],
            sort_by_name: false,
            descending: true,
            page: 2,
            page_size: PageSize::new(1).expect("page size"),
            search: Some("POOL".to_owned()),
            enabled: None,
        })
        .await
        .expect("list second account group option page");
    assert_eq!(second.items[0].id.as_str(), MIXED_GROUP);

    let disabled = groups
        .list_account_group_options(AccountGroupListQuery {
            platforms: vec![],
            visibilities: vec![],
            sort_by_name: false,
            descending: true,
            page: 1,
            page_size: PageSize::new(20).expect("page size"),
            search: None,
            enabled: Some(false),
        })
        .await
        .expect("list disabled account group options");
    assert_eq!(disabled.total, 1);
    assert_eq!(disabled.items[0].id.as_str(), EMPTY_GROUP);

    locked_tables.rollback().await.expect("release table locks");

    database.close().await;
}

#[tokio::test]
async fn group_costs_should_include_statusless_websocket_but_reject_statusless_http() {
    let Some(database) = TestDatabase::create("account_group_statusless_websocket_cost").await
    else {
        return;
    };
    seed_account(
        &database.pool,
        "acct_group_statusless",
        "openai",
        "Statusless Account",
    )
    .await;
    let groups = PgAccountGroupRepository::new(
        database.pool.clone(),
        ObservabilityQueryBudget::try_new(4, Duration::from_secs(10), Duration::from_secs(10))
            .unwrap(),
    );
    groups
        .create_account_group(
            NewAccountGroup {
                policy: Default::default(),
                allow_image_generation: true,
                fast_mode: FastMode::Default,
                id: group_id(EMPTY_GROUP),
                name: "Statusless Costs".to_owned(),
                description: None,
                color: group_color("#06B6D4CC"),
            },
            &context("create-statusless-cost-group"),
        )
        .await
        .expect("create statusless cost group");
    assign_accounts(&database.pool, EMPTY_GROUP, &["acct_group_statusless"]).await;
    for (request_id, cost_amount) in [
        ("req_group_http_success", "1.5"),
        ("req_group_statusless_websocket", "2"),
        ("req_group_statusless_http", "4"),
    ] {
        seed_group_cost_snapshot(
            &database.pool,
            request_id,
            "acct_group_statusless",
            &[EMPTY_GROUP],
            cost_amount,
        )
        .await;
    }
    sqlx::query(
        "update model_requests
         set client_transport = case id
               when 'req_group_statusless_websocket' then 'websocket'
               else 'http_sse'
             end,
             client_status_code = null
         where id in ('req_group_statusless_websocket', 'req_group_statusless_http')",
    )
    .execute(&database.pool)
    .await
    .expect("make account group requests statusless");

    let page = groups
        .list_account_groups(AccountGroupListQuery {
            platforms: vec![],
            visibilities: vec![],
            sort_by_name: false,
            descending: true,
            page: 1,
            page_size: PageSize::new(20).expect("page size"),
            search: None,
            enabled: None,
        })
        .await
        .expect("list statusless cost group");

    assert_eq!(
        (
            page.items[0].usage.today_usd.as_str(),
            page.items[0].usage.retained_total_usd.as_str(),
        ),
        ("3.5", "3.5"),
    );

    database.close().await;
}

fn group_id(value: &str) -> AccountGroupId {
    AccountGroupId::new(value).expect("valid account group ID")
}

fn group_color(value: &str) -> AccountGroupColor {
    AccountGroupColor::parse(value).expect("valid account group color")
}

fn client_key_id(value: &str) -> ClientApiKeyId {
    ClientApiKeyId::new(value).expect("valid client key ID")
}

fn context(request_id: &str) -> MutationContext {
    MutationContext {
        actor: MutationActor::System,
        request_id: request_id.to_owned(),
    }
}

async fn seed_account(pool: &sqlx::PgPool, id: &str, provider: &str, name: &str) {
    sqlx::query(
        "insert into provider_accounts (
           id, provider_kind, name, email, upstream_user_id, upstream_account_id,
           plan_type, authentication_kind, provider_credentials_json, credential_revision,
           has_refresh_token, access_token_expires_at, next_refresh_at, enabled,
           credential_state, credential_observed_at, created_at, updated_at
         ) values (
           $1, $2, $3, null, $1 || '-user', null, null, 'oauth', $4, 1,
           false, null, null, true, 'ready', now(), now(), now()
         )",
    )
    .bind(id)
    .bind(provider)
    .bind(name)
    .bind(crate::postgres::empty_credentials(id))
    .execute(pool)
    .await
    .expect("seed provider account");
}

async fn assign_accounts(pool: &sqlx::PgPool, group_id: &str, account_ids: &[&str]) {
    for account_id in account_ids {
        sqlx::query(
            "insert into account_group_accounts (
               account_group_id, provider_account_id, created_at
             )
             values ($1, $2, now())",
        )
        .bind(group_id)
        .bind(account_id)
        .execute(pool)
        .await
        .expect("seed account group membership");
    }
}

async fn seed_group_cost_snapshot(
    pool: &sqlx::PgPool,
    request_id: &str,
    account_id: &str,
    routing_group_ids: &[&str],
    cost_amount: &str,
) {
    let routing_group_refs: Vec<String> = routing_group_ids
        .iter()
        .map(|id| (*id).to_owned())
        .collect();
    sqlx::query(
        "insert into model_requests (
           id, client_api_key_ref, operation, client_transport, requested_model_id, provider_kind, provider_account_ref, upstream_model_id, upstream_transport, attempt_count, upstream_send_state, downstream_committed_at, outcome, client_status_code, upstream_status_code, total_tokens, cost_source, cost_amount, cost_currency, started_at, recovery_lease_expires_at, completed_at, request_observation_json
         ) values (
           $1, 'key-group-history', 'responses', 'http_sse', 'gpt-group', 'openai', $2, 'gpt-group', 'http_sse', 1, 'sent', now(), 'succeeded', 200, 200, 10, 'provider_reported', $4::numeric, 'USD', now() - interval '1 minute', now() + interval '5 minutes', now(),
           jsonb_strip_nulls(jsonb_build_object(
           'request', jsonb_build_object(
             'configRevision', 1,
             'protocol', 'openai',
             'endpoint', '/v1/responses',
             'compact', false),
           'routing', jsonb_build_object(
             'scope', 'groups',
             'groupRefs', $3::text[],
             'groupNamesSnapshot', to_jsonb($3::text[]))))
         )",
    )
    .bind(request_id)
    .bind(account_id)
    .bind(routing_group_refs)
    .bind(cost_amount)
    .execute(pool)
    .await
    .expect("seed group cost snapshot");
}

async fn current_revision(pool: &sqlx::PgPool) -> u64 {
    let value =
        sqlx::query_scalar::<_, i64>("select config_revision from runtime_settings where id = 1")
            .fetch_one(pool)
            .await
            .expect("load config revision");
    u64::try_from(value).expect("positive config revision")
}

async fn audit_count(pool: &sqlx::PgPool) -> u64 {
    let value = sqlx::query_scalar::<_, i64>("select count(*) from admin_audit_events")
        .fetch_one(pool)
        .await
        .expect("count audit rows");
    u64::try_from(value).expect("non-negative audit count")
}

#[tokio::test]
async fn fast_mode_group_updates_preserve_omitted_values_and_publish_snapshot_facts() {
    use ovload_admin::model::account_groups::UpdateAccountGroup;
    use ovload_store::postgres::{PgRuntimeSnapshotRepository, RuntimeSnapshotRepository};
    let Some(database) = TestDatabase::create("fast_mode_group").await else {
        return;
    };
    let repository = PgAccountGroupRepository::new(
        database.pool.clone(),
        ObservabilityQueryBudget::try_new(4, Duration::from_secs(10), Duration::from_secs(10))
            .unwrap(),
    );
    let id = group_id(MIXED_GROUP);
    repository
        .create_account_group(
            NewAccountGroup {
                policy: Default::default(),
                allow_image_generation: true,
                id: id.clone(),
                name: "Fast policy".to_owned(),
                description: None,
                color: group_color("#2563EBFF"),
                fast_mode: FastMode::Disabled,
            },
            &context("create-fast"),
        )
        .await
        .unwrap();
    for (value, expected) in [
        (None, FastMode::Disabled),
        (Some(FastMode::Enabled), FastMode::Enabled),
        (None, FastMode::Enabled),
        (Some(FastMode::Default), FastMode::Default),
        (Some(FastMode::Disabled), FastMode::Disabled),
    ] {
        let mutation = repository
            .update_account_group(
                UpdateAccountGroup {
                    policy: Default::default(),
                    expected_revision: current_group_revision(&database.pool).await,
                    allow_image_generation: None,
                    id: id.clone(),
                    name: "Renamed policy".to_owned(),
                    description: None,
                    color: group_color("#2563EBFF"),
                    fast_mode: value,
                },
                &context("update-fast"),
            )
            .await
            .unwrap();
        assert_eq!(mutation.record.unwrap().fast_mode, expected);
        let snapshot = PgRuntimeSnapshotRepository::new(database.pool.clone())
            .load_runtime_snapshot()
            .await
            .unwrap();
        assert_eq!(
            snapshot.config_revision.get(),
            mutation.config_revision.get()
        );
        assert_eq!(
            snapshot
                .account_groups
                .iter()
                .find(|group| group.id == id)
                .unwrap()
                .fast_mode,
            expected
        );
    }
    database.close().await;
}

#[tokio::test]
async fn group_usage_preserves_request_attribution_and_totals_after_log_retention() {
    let Some(database) = TestDatabase::create("group_cost_current_members").await else {
        return;
    };
    seed_account(
        &database.pool,
        "acct_group_move",
        "openai",
        "Movable Account",
    )
    .await;
    let budget =
        ObservabilityQueryBudget::try_new(4, Duration::from_secs(10), Duration::from_secs(10))
            .unwrap();
    let groups = PgAccountGroupRepository::new(database.pool.clone(), budget.clone());
    for id in [MIXED_GROUP, EMPTY_GROUP] {
        groups
            .create_account_group(
                NewAccountGroup {
                    policy: Default::default(),
                    allow_image_generation: true,
                    fast_mode: FastMode::Default,
                    id: group_id(id),
                    name: id.to_owned(),
                    description: None,
                    color: group_color("#2563EBFF"),
                },
                &context("create-group-move-fixture"),
            )
            .await
            .unwrap();
    }
    assign_accounts(&database.pool, MIXED_GROUP, &["acct_group_move"]).await;
    seed_group_cost_snapshot(
        &database.pool,
        "req_group_move",
        "acct_group_move",
        &[MIXED_GROUP],
        "3.25",
    )
    .await;
    sqlx::query(
        "update model_requests set cost_amount=cost_amount,started_at=now()-interval '2 hours' where id='req_group_move'",
    )
    .execute(&database.pool)
    .await
    .unwrap();
    let worker =
        ovload_store::postgres::PgRequestAnalyticsRepository::new(database.pool.clone(), budget);
    let mut ready = false;
    for _ in 0..100 {
        worker.maintain(1000).await.unwrap();
        let status = worker.status().await.unwrap();
        if !status.building && status.pending_requests == 0 && status.pending_buckets == 0 {
            ready = true;
            break;
        }
    }
    assert!(ready, "group fixture must publish rollups");
    let costs = load_retained_group_costs(&groups).await;
    assert_eq!(costs[MIXED_GROUP], "3.25");
    assert_eq!(costs[EMPTY_GROUP], "0");

    sqlx::query("update account_group_accounts set account_group_id=$1 where provider_account_id='acct_group_move'")
        .bind(EMPTY_GROUP).execute(&database.pool).await.unwrap();
    let costs = load_retained_group_costs(&groups).await;
    assert_eq!(
        costs[MIXED_GROUP], "3.25",
        "moving an account must not reattribute frozen group usage"
    );
    assert_eq!(costs[EMPTY_GROUP], "0");

    // 未再次运行 Worker，当前源费用和模型仍必须原子替换旧汇总贡献
    sqlx::query("update model_requests set cost_amount=7.5,upstream_model_id='updated-model' where id='req_group_move'")
        .execute(&database.pool).await.unwrap();
    let costs = load_retained_group_costs(&groups).await;
    assert_eq!(costs[MIXED_GROUP], "7.5");
    assert_eq!(costs[EMPTY_GROUP], "0");
    sqlx::query("delete from model_requests where id='req_group_move'")
        .execute(&database.pool)
        .await
        .unwrap();
    let costs = load_retained_group_costs(&groups).await;
    assert_eq!(
        costs[MIXED_GROUP], "7.5",
        "request log retention must preserve cumulative group usage"
    );
    database.close().await;
}

async fn load_retained_group_costs(groups: &PgAccountGroupRepository) -> BTreeMap<String, String> {
    groups
        .list_account_groups(AccountGroupListQuery {
            platforms: vec![],
            visibilities: vec![],
            sort_by_name: false,
            descending: true,
            page: 1,
            page_size: PageSize::new(20).unwrap(),
            search: None,
            enabled: None,
        })
        .await
        .unwrap()
        .items
        .into_iter()
        .map(|group| {
            (
                group.id.to_string(),
                group.usage.retained_total_usd.to_string(),
            )
        })
        .collect()
}
#[tokio::test]
async fn image_generation_group_updates_preserve_omitted_values_and_publish_snapshot_facts() {
    use ovload_admin::model::account_groups::UpdateAccountGroup;
    use ovload_store::postgres::{PgRuntimeSnapshotRepository, RuntimeSnapshotRepository};
    let Some(database) = TestDatabase::create("image_generation_group").await else {
        return;
    };
    let repository = PgAccountGroupRepository::new(
        database.pool.clone(),
        ObservabilityQueryBudget::try_new(4, Duration::from_secs(10), Duration::from_secs(10))
            .unwrap(),
    );
    let id = group_id(MIXED_GROUP);
    repository
        .create_account_group(
            NewAccountGroup {
                policy: Default::default(),
                allow_image_generation: false,
                id: id.clone(),
                name: "Fast policy".to_owned(),
                description: None,
                color: group_color("#2563EBFF"),
                fast_mode: FastMode::Disabled,
            },
            &context("create-fast"),
        )
        .await
        .unwrap();
    for (value, expected) in [
        (None, false),
        (Some(true), true),
        (None, true),
        (Some(false), false),
    ] {
        let mutation = repository
            .update_account_group(
                UpdateAccountGroup {
                    policy: Default::default(),
                    expected_revision: current_group_revision(&database.pool).await,
                    allow_image_generation: value,
                    id: id.clone(),
                    name: "Renamed policy".to_owned(),
                    description: None,
                    color: group_color("#2563EBFF"),
                    fast_mode: None,
                },
                &context("update-fast"),
            )
            .await
            .unwrap();
        assert_eq!(mutation.record.unwrap().allow_image_generation, expected);
        let snapshot = PgRuntimeSnapshotRepository::new(database.pool.clone())
            .load_runtime_snapshot()
            .await
            .unwrap();
        assert_eq!(
            snapshot.config_revision.get(),
            mutation.config_revision.get()
        );
        assert_eq!(
            snapshot
                .account_groups
                .iter()
                .find(|group| group.id == id)
                .unwrap()
                .allow_image_generation,
            expected
        );
    }
    database.close().await;
}

#[tokio::test]
async fn image_generation_defaults_to_allowed_for_new_groups() {
    let Some(database) = TestDatabase::create("group_image_default").await else {
        return;
    };
    sqlx::query("insert into account_groups (id, name, color, created_at, updated_at) values ($1, $1, '#2563EBFF', now(), now())")
        .bind(EMPTY_GROUP).execute(&database.pool).await.unwrap();
    let allowed = sqlx::query_scalar::<_, bool>(
        "select allow_image_generation from account_groups where id = $1",
    )
    .bind(EMPTY_GROUP)
    .fetch_one(&database.pool)
    .await
    .unwrap();
    assert!(allowed);
    database.close().await;
}

#[tokio::test]
async fn committed_group_mutations_succeed_when_the_usage_query_budget_is_exhausted() {
    let Some(database) = TestDatabase::create("account_group_projection_failure").await else {
        return;
    };
    let budget =
        ObservabilityQueryBudget::try_new(1, Duration::from_millis(1), Duration::from_secs(30))
            .unwrap();
    let held_budget = budget.clone();
    let held_pool = database.pool.clone();
    let (entered, waiting) = tokio::sync::oneshot::channel();
    let (release, released) = tokio::sync::oneshot::channel();
    let holder = tokio::spawn(async move {
        held_budget
            .run(
                &held_pool,
                "hold projection budget",
                |connection| async move {
                    entered.send(()).unwrap();
                    released.await.unwrap();
                    drop(connection);
                    Ok(())
                },
            )
            .await
    });
    waiting.await.unwrap();
    let groups = PgAccountGroupRepository::new(database.pool.clone(), budget);
    let id = AccountGroupId::new(MIXED_GROUP).unwrap();
    let before = current_revision(&database.pool).await;
    let created = groups
        .create_account_group(
            NewAccountGroup {
                id: id.clone(),
                name: "Committed".to_owned(),
                policy: Default::default(),
                description: None,
                color: AccountGroupColor::parse("#2563EBFF").unwrap(),
                fast_mode: FastMode::Default,
                allow_image_generation: true,
            },
            &context("projection-create"),
        )
        .await
        .expect("create commits despite observation failure");
    assert!(created.record.is_none());
    let updated = groups
        .update_account_group(
            ovload_admin::model::account_groups::UpdateAccountGroup {
                policy: Default::default(),
                expected_revision: current_group_revision(&database.pool).await,
                id: id.clone(),
                name: "Updated".to_owned(),
                description: None,
                color: AccountGroupColor::parse("#2563EBFF").unwrap(),
                fast_mode: None,
                allow_image_generation: None,
            },
            &context("projection-update"),
        )
        .await
        .expect("update commits despite observation failure");
    assert!(updated.record.is_none());
    let disabled = groups
        .set_account_group_enabled(
            ovload_admin::model::account_groups::SetAccountGroupEnabled {
                id: id.clone(),
                enabled: false,
            },
            &context("projection-disable"),
        )
        .await
        .expect("disable commits despite observation failure");
    assert!(disabled.record.is_none());
    assert_eq!(current_revision(&database.pool).await, before + 3);
    assert_eq!(audit_count(&database.pool).await, 3);
    let persisted: (String, bool) =
        sqlx::query_as("select name, enabled from account_groups where id = $1")
            .bind(id.as_str())
            .fetch_one(&database.pool)
            .await
            .unwrap();
    assert_eq!(persisted, ("Updated".to_owned(), false));
    release.send(()).unwrap();
    holder.await.unwrap().unwrap();
    database.close().await;
}
