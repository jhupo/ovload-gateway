//! Run only against an isolated, disposable PostgreSQL database.
use ovload_server::storage;

#[tokio::test]
#[ignore = "requires OVLOAD_TEST_DATABASE_URL pointing at an empty disposable database"]
async fn migration_lifecycle_and_history_guards() {
    let url = std::env::var("OVLOAD_TEST_DATABASE_URL").expect("test database URL");
    let pool = storage::connect(&url).await.expect("connect");
    storage::migrate(&pool).await.expect("fresh migration");
    storage::migrate(&pool).await.expect("idempotent migration");
    let (first, second) = tokio::time::timeout(std::time::Duration::from_secs(15), async {
        tokio::join!(storage::migrate(&pool), storage::migrate(&pool))
    })
    .await
    .expect("concurrent migrators must not deadlock");
    first.expect("first concurrent migrator");
    second.expect("second concurrent migrator");
    assert!(storage::revert(&pool, 2).await.is_err());
    storage::revert(&pool, 0).await.expect("revert baseline");
    let table: Option<String> =
        sqlx::query_scalar("SELECT to_regclass('public.gateway_metadata')::text")
            .fetch_one(&pool)
            .await
            .unwrap();
    assert!(table.is_none());
    storage::migrate(&pool).await.expect("reapply");
    sqlx::query("UPDATE _sqlx_migrations SET checksum = decode('00', 'hex') WHERE version = 1")
        .execute(&pool)
        .await
        .unwrap();
    assert!(storage::migrate(&pool).await.is_err());
    assert!(storage::revert(&pool, 0).await.is_err());
    let checksum = storage::MIGRATOR
        .iter()
        .find(|m| m.version == 1 && m.migration_type.is_up_migration())
        .unwrap()
        .checksum
        .as_ref();
    sqlx::query("UPDATE _sqlx_migrations SET checksum = $1 WHERE version = 1")
        .bind(checksum)
        .execute(&pool)
        .await
        .unwrap();
    sqlx::query("INSERT INTO _sqlx_migrations (version, description, success, checksum, execution_time) VALUES (999, 'unknown', true, decode('00', 'hex'), 0)").execute(&pool).await.unwrap();
    assert!(storage::migrate(&pool).await.is_err());
    assert!(storage::revert(&pool, 0).await.is_err());
    sqlx::query("DELETE FROM _sqlx_migrations WHERE version = 999")
        .execute(&pool)
        .await
        .unwrap();
    storage::revert(&pool, 0).await.expect("cleanup baseline");
}
