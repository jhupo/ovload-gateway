// Modified for Ovload on 2026-10-27: workspace integration.

//! Nonsecret key catalogs, stable pagination and buffered usage facts.

use std::{collections::BTreeMap, sync::Arc, time::Duration};

use chrono::{TimeZone as _, Utc};
use ovload_admin::{
    model::client_keys::{
        ClientKeyListQuery as AdminClientKeyListQuery, ClientKeyPageSize,
        ClientKeySort as AdminClientKeySort, ClientKeySortField as AdminClientKeySortField,
        SortDirection as AdminSortDirection,
    },
    ports::store::ClientKeyStore as _,
};
use ovload_core::{
    engine::execution::ClientApiKeyUsageSink as _,
    lifecycle::CancellationToken,
    policy::ClientApiKeyId,
    task::{DaemonTask as _, WorkerDaemonContext},
};
use ovload_store::postgres::{
    ClientApiKeyCursor, ClientApiKeyCursorValue, ClientApiKeyListQuery, ClientApiKeyRepository,
    ClientApiKeySort, ClientApiKeySortDirection, ClientApiKeySortField, PgAdminClientKeyStore,
    PgClientApiKeyRepository, PgClientApiKeyUsageSink,
};

use super::{TestDatabase, model_keys::fixture::seed_key};

#[tokio::test]
async fn client_key_search_matches_names_and_labels_but_never_credential_values() {
    let Some(database) = TestDatabase::create("key_name_search").await else {
        return;
    };
    let generated = format!("sk_{}", "K".repeat(43));
    for (id, name, key) in [
        ("key_generated", "Production", generated.as_str()),
        ("key_custom", r"生产_%专用\测试", "legacy-token+/123"),
    ] {
        seed_key(&database.pool, id, key, true).await;
        sqlx::query("update client_api_keys set name=$2,label='backend label' where id=$1")
            .bind(id)
            .bind(name)
            .execute(&database.pool)
            .await
            .unwrap();
    }
    let repository = PgClientApiKeyRepository::new(database.pool.clone());
    for (search, expected) in [
        ("PROD", 1),
        ("DUCt", 1),
        ("tion", 1),
        ("生产_%", 1),
        ("_%专", 1),
        ("%", 1),
        ("_", 1),
        (r"\", 1),
        ("生产X", 0),
        ("backend", 2),
        ("END LAB", 2),
        ("label", 2),
        (generated.as_str(), 0),
        (&generated[..10], 0),
        ("legacy-token+/123", 0),
        ("legacy-", 0),
    ] {
        let page = repository
            .list_client_api_keys(ClientApiKeyListQuery {
                cursor: None,
                page_size: 10,
                search: Some(search.to_owned()),
                sort: ClientApiKeySort::default(),
            })
            .await
            .unwrap();
        assert_eq!(page.total, expected, "search: {search}");
        assert_eq!(page.items.len() as u64, expected);
    }
    database.close().await;
}

#[tokio::test]
async fn client_key_list_uses_safe_keyset_search_and_filtered_total() {
    let Some(database) = TestDatabase::create("client_key_page").await else {
        return;
    };
    for (index, label) in ["alpha", "needle", "omega"].into_iter().enumerate() {
        let id = format!("key_page_{index}");
        let key = format!(
            "sk_{}",
            char::from(b'a' + index as u8).to_string().repeat(43)
        );
        seed_key(&database.pool, &id, &key, true).await;
        sqlx::query("update client_api_keys set name=$2,label=$2,created_at=now()-($3::bigint*interval '1 minute') where id=$1")
        .bind(id)
        .bind(label)
        .bind(index as i64)
        .execute(&database.pool)
        .await
        .expect("seed paged client key");
    }
    let repository = PgClientApiKeyRepository::new(database.pool.clone());
    let first = repository
        .list_client_api_keys(ClientApiKeyListQuery {
            cursor: None,
            page_size: 2,
            search: None,
            sort: ClientApiKeySort::default(),
        })
        .await
        .expect("first client key page");
    assert_eq!(first.total, 3);
    assert_eq!(first.items.len(), 2);
    assert!(first.next_cursor.is_some());
    let second = repository
        .list_client_api_keys(ClientApiKeyListQuery {
            cursor: first.next_cursor,
            page_size: 2,
            search: None,
            sort: ClientApiKeySort::default(),
        })
        .await
        .expect("second client key page");
    assert_eq!(second.total, 3);
    assert_eq!(second.items.len(), 1);

    let searched = repository
        .list_client_api_keys(ClientApiKeyListQuery {
            cursor: None,
            page_size: 10,
            search: Some("needle".to_owned()),
            sort: ClientApiKeySort::default(),
        })
        .await
        .expect("searched client key page");
    assert_eq!(searched.total, 1);
    assert_eq!(searched.items[0].label.as_deref(), Some("needle"));
    assert_eq!(searched.items[0].prefix, "sk_fixture");
    database.close().await;
}

#[test]
fn client_key_cursor_is_bound_to_one_sort_contract() {
    let created_sort = ClientApiKeySort::default();
    assert!(
        ClientApiKeyListQuery {
            cursor: None,
            page_size: u16::MAX,
            search: None,
            sort: created_sort,
        }
        .validate()
        .is_ok()
    );
    let cursor = ClientApiKeyCursor::new(
        created_sort,
        ClientApiKeyCursorValue::CreatedAt(chrono::Utc::now()),
        "key-cursor",
    )
    .expect("valid cursor");
    let query = ClientApiKeyListQuery {
        cursor: Some(cursor),
        page_size: 10,
        search: None,
        sort: ClientApiKeySort {
            field: ClientApiKeySortField::Name,
            direction: ClientApiKeySortDirection::Asc,
        },
    };
    assert!(query.validate().is_err());
    assert!(
        ClientApiKeyCursor::new(
            created_sort,
            ClientApiKeyCursorValue::Enabled(true),
            "key-cursor",
        )
        .is_err()
    );
}

#[tokio::test]
async fn admin_client_key_adapter_should_preserve_the_full_nonzero_u16_page_size() {
    let Some(database) = TestDatabase::create("admin_client_key_max_page").await else {
        return;
    };
    let page = PgAdminClientKeyStore::new(database.pool.clone())
        .list_client_keys(AdminClientKeyListQuery {
            cursor: None,
            page_size: ClientKeyPageSize::new(u16::MAX).expect("maximum page size"),
            search: None,
            sort: AdminClientKeySort {
                field: AdminClientKeySortField::CreatedAt,
                direction: AdminSortDirection::Desc,
            },
        })
        .await
        .expect("maximum Client Key page size");

    assert_eq!(page.total, 0);
    assert!(page.items.is_empty());
    database.close().await;
}

#[tokio::test]
async fn client_key_database_sort_is_stable_and_keeps_null_last_used_at_last() {
    let Some(database) = TestDatabase::create("client_key_sort").await else {
        return;
    };
    for (index, (id, name, enabled, created_at, last_used_at)) in [
        ("key_sort_a", "Zulu", false, "2026-01-01T00:00:00Z", None),
        (
            "key_sort_b",
            "alpha",
            true,
            "2026-01-02T00:00:00Z",
            Some("2026-01-03T00:00:00Z"),
        ),
        (
            "key_sort_c",
            "Beta",
            false,
            "2026-01-03T00:00:00Z",
            Some("2026-01-01T00:00:00Z"),
        ),
    ]
    .into_iter()
    .enumerate()
    {
        let secret = format!(
            "sk_{}",
            char::from(b'a' + index as u8).to_string().repeat(43)
        );
        seed_key(&database.pool, id, &secret, enabled).await;
        sqlx::query("update client_api_keys set name=$2,last_used_at=$3::timestamptz,created_at=$4::timestamptz,updated_at=$4::timestamptz where id=$1")
        .bind(id)
        .bind(name)
        .bind(last_used_at)
        .bind(created_at)
        .execute(&database.pool)
        .await
        .expect("seed sorted client key");
    }
    let repository = PgClientApiKeyRepository::new(database.pool.clone());
    for (sort, expected) in [
        (
            ClientApiKeySort {
                field: ClientApiKeySortField::Name,
                direction: ClientApiKeySortDirection::Asc,
            },
            vec!["key_sort_b", "key_sort_c", "key_sort_a"],
        ),
        (
            ClientApiKeySort {
                field: ClientApiKeySortField::Enabled,
                direction: ClientApiKeySortDirection::Desc,
            },
            vec!["key_sort_b", "key_sort_c", "key_sort_a"],
        ),
        (
            ClientApiKeySort {
                field: ClientApiKeySortField::CreatedAt,
                direction: ClientApiKeySortDirection::Desc,
            },
            vec!["key_sort_c", "key_sort_b", "key_sort_a"],
        ),
        (
            ClientApiKeySort {
                field: ClientApiKeySortField::LastUsedAt,
                direction: ClientApiKeySortDirection::Asc,
            },
            vec!["key_sort_c", "key_sort_b", "key_sort_a"],
        ),
        (
            ClientApiKeySort {
                field: ClientApiKeySortField::LastUsedAt,
                direction: ClientApiKeySortDirection::Desc,
            },
            vec!["key_sort_b", "key_sort_c", "key_sort_a"],
        ),
    ] {
        let mut cursor = None;
        let mut ids = Vec::new();
        loop {
            let page = repository
                .list_client_api_keys(ClientApiKeyListQuery {
                    cursor,
                    page_size: 1,
                    search: None,
                    sort,
                })
                .await
                .expect("sorted client key page");
            ids.extend(page.items.into_iter().map(|item| item.id));
            let Some(next) = page.next_cursor else {
                break;
            };
            cursor = Some(next);
        }
        assert_eq!(ids, expected);
    }
    database.close().await;
}

#[tokio::test]
async fn client_key_usage_touch_should_preserve_the_latest_observed_timestamp() {
    let Some(database) = TestDatabase::create("client_key_usage_touch").await else {
        return;
    };
    seed_key(
        &database.pool,
        "key_usage_touch",
        &format!("sk_{}", "t".repeat(43)),
        true,
    )
    .await;
    let repository = PgClientApiKeyRepository::new(database.pool.clone());
    let first = Utc
        .with_ymd_and_hms(2026, 7, 24, 0, 0, 0)
        .single()
        .expect("first timestamp");
    let latest = Utc
        .with_ymd_and_hms(2026, 7, 24, 0, 0, 1)
        .single()
        .expect("latest timestamp");
    repository
        .touch_client_api_keys(&BTreeMap::from([("key_usage_touch".to_owned(), first)]))
        .await
        .expect("record first API Key use");
    repository
        .touch_client_api_keys(&BTreeMap::from([("key_usage_touch".to_owned(), latest)]))
        .await
        .expect("record latest API Key use");

    let record = repository
        .get_client_api_key("key_usage_touch")
        .await
        .expect("load API Key")
        .expect("client key exists");
    assert_eq!(record.last_used_at, Some(latest));
    database.close().await;
}

#[tokio::test]
async fn client_key_usage_daemon_should_flush_pending_touch_on_shutdown() {
    let Some(database) = TestDatabase::create("client_key_usage_daemon").await else {
        return;
    };
    seed_key(
        &database.pool,
        "key_usage_daemon",
        &format!("sk_{}", "u".repeat(43)),
        true,
    )
    .await;

    let (sink, writer) =
        PgClientApiKeyUsageSink::with_flush_delay(database.pool.clone(), Duration::from_secs(60));
    let writer = Arc::new(writer);
    let cancellation = CancellationToken::new();
    let task = {
        let writer = Arc::clone(&writer);
        let cancellation = cancellation.clone();
        tokio::spawn(async move { writer.run(WorkerDaemonContext::new(cancellation)).await })
    };
    sink.record_used(&ClientApiKeyId::new("key_usage_daemon").expect("valid client API Key ID"));
    cancellation.cancel();
    task.await
        .expect("join client key usage daemon")
        .expect("stop client key usage daemon");

    let last_used_at: Option<chrono::DateTime<Utc>> = sqlx::query_scalar(
        "select last_used_at from client_api_keys where id = 'key_usage_daemon'",
    )
    .fetch_one(&database.pool)
    .await
    .expect("load client key last-used timestamp");
    assert!(last_used_at.is_some());
    database.close().await;
}
