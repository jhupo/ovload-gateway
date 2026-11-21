//! Runtime snapshots contain policy facts and no credential material.

use super::{TestDatabase, model_keys::fixture::KeyFixture};
use ovload_store::postgres::{PgRuntimeSnapshotRepository, RuntimeSnapshotRepository};

#[tokio::test]
async fn runtime_snapshot_contains_owned_group_policy_without_credentials() {
    let Some(database) = TestDatabase::create("client_snapshot").await else {
        return;
    };
    let fixture = KeyFixture::new(&database.pool).await;
    let secret = "sk_snapshot_secret";
    fixture
        .insert_key(&database.pool, "key_snapshot", secret, true)
        .await;
    sqlx::query("update client_api_keys set max_concurrency=2,requests_per_minute=60,authority_generation=authority_generation+1 where id='key_snapshot'")
        .execute(&database.pool).await.unwrap();
    let snapshot = PgRuntimeSnapshotRepository::new(database.pool.clone())
        .load_runtime_snapshot()
        .await
        .unwrap();
    assert_eq!(snapshot.client_api_keys.len(), 1);
    let key = &snapshot.client_api_keys[0];
    assert_eq!(key.key_generation, 2);
    assert_eq!(key.group_ids, vec![fixture.group]);
    assert_eq!(key.limits.max_concurrency, 2);
    assert_eq!(key.limits.requests_per_minute, 60);
    assert!(!format!("{snapshot:?}").contains(secret));
    assert!(!format!("{snapshot:?}").contains("key_digest"));
    database.close().await;
}
