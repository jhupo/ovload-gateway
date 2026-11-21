//! Credential authority, isolation, idempotency and retained-history contracts.

pub(crate) mod fixture;

use super::TestDatabase;
use fixture::KeyFixture;
use ovload_admin::{
    model::{
        identity_access::IdentityError,
        model_keys::{NewModelKey, RevokeModelKey, RotateModelKey},
    },
    ports::model_keys::ModelKeyStore as _,
};
use ovload_core::{
    engine::authentication::{ModelKeyAuthority as _, ModelKeyAuthorityError, model_key_digest},
    policy::{ClientApiKeyId, RateLimits},
};
use ovload_store::postgres::PgModelKeyStore;

fn create(fixture: &KeyFixture, id: &str, secret: &str) -> NewModelKey {
    NewModelKey {
        id: ClientApiKeyId::new(id).unwrap(),
        group_id: fixture.group.clone(),
        name: "Customer key".into(),
        limits: RateLimits {
            max_concurrency: 4,
            requests_per_minute: 60,
        },
        expires_at: None,
        digest: model_key_digest(secret),
        prefix: "sk_fixture".into(),
        idempotency_key: "create-fixture".into(),
        fingerprint: [1; 32],
        reason: "fixture creation".into(),
    }
}

#[tokio::test]
async fn issuance_replay_is_owner_scoped_and_persists_only_verifiers() {
    let Some(database) = TestDatabase::create("model_key_issue").await else {
        return;
    };
    let fixture = KeyFixture::new(&database.pool).await;
    let other = KeyFixture::new(&database.pool).await;
    let store = PgModelKeyStore::new(database.pool.clone());
    let first = store
        .create(
            &fixture.session,
            fixture.owner,
            create(&fixture, "key_issue", "fixture secret"),
        )
        .await
        .unwrap();
    assert!(!first.replayed);
    let replay = store
        .create(
            &fixture.session,
            fixture.owner,
            create(&fixture, "key_ignored", "different random secret"),
        )
        .await
        .unwrap();
    assert!(replay.replayed);
    assert_eq!(first.record.id, replay.record.id);
    let mut changed = create(&fixture, "key_changed", "secret");
    changed.fingerprint = [2; 32];
    assert!(matches!(
        store.create(&fixture.session, fixture.owner, changed).await,
        Err(IdentityError::Conflict)
    ));
    assert!(matches!(
        store
            .get(&other.session, fixture.owner, &first.record.id)
            .await,
        Err(IdentityError::NotFound)
    ));
    let identity = store
        .authenticate(model_key_digest("fixture secret"))
        .await
        .unwrap();
    assert_eq!(identity.tenant_id, fixture.owner.tenant_id);
    assert_eq!(identity.user_id, fixture.owner.user_id);
    let plaintext_columns:i64=sqlx::query_scalar("select count(*) from information_schema.columns where table_schema=current_schema() and table_name='client_api_keys' and column_name='key'")
        .fetch_one(&database.pool).await.unwrap();
    assert_eq!(plaintext_columns, 0);
    let count: i64 = sqlx::query_scalar("select count(*) from client_api_keys")
        .fetch_one(&database.pool)
        .await
        .unwrap();
    assert_eq!(count, 1);
    database.close().await;
}

#[tokio::test]
async fn concurrent_rotation_has_one_replacement_and_revocation_keeps_old_row() {
    let Some(database) = TestDatabase::create("model_key_rotate").await else {
        return;
    };
    let fixture = KeyFixture::new(&database.pool).await;
    let store = PgModelKeyStore::new(database.pool.clone());
    let first = store
        .create(
            &fixture.session,
            fixture.owner,
            create(&fixture, "key_old", "old secret"),
        )
        .await
        .unwrap();
    let old_identity = store
        .authenticate(model_key_digest("old secret"))
        .await
        .unwrap();
    let command = |replacement: &str| RotateModelKey {
        id: first.record.id.clone(),
        expected_revision: 1,
        replacement_id: ClientApiKeyId::new(replacement).unwrap(),
        digest: model_key_digest(replacement),
        prefix: "sk_fixture".into(),
        idempotency_key: "rotate-fixture".into(),
        fingerprint: [3; 32],
        reason: "fixture rotation".into(),
    };
    let (left, right) = tokio::join!(
        store.rotate(&fixture.session, fixture.owner, command("key_left")),
        store.rotate(&fixture.session, fixture.owner, command("key_right"))
    );
    let left = left.unwrap();
    let right = right.unwrap();
    assert_ne!(left.replayed, right.replayed);
    assert_eq!(left.record.id, right.record.id);
    assert!(matches!(
        store.revalidate(&old_identity).await,
        Err(ModelKeyAuthorityError::InvalidKey)
    ));
    let revoked = store
        .revoke(
            &fixture.session,
            fixture.owner,
            RevokeModelKey {
                id: left.record.id.clone(),
                expected_revision: left.record.revision,
                reason: "fixture revocation".into(),
            },
        )
        .await
        .unwrap();
    assert!(revoked.revoked_at.is_some());
    assert!(matches!(
        store.resolve(&revoked.id).await,
        Err(ModelKeyAuthorityError::InvalidKey)
    ));
    let rows: i64 = sqlx::query_scalar("select count(*) from client_api_keys")
        .fetch_one(&database.pool)
        .await
        .unwrap();
    assert_eq!(rows, 2);
    assert!(
        sqlx::query("delete from client_api_keys where id=$1")
            .bind(first.record.id.as_str())
            .execute(&database.pool)
            .await
            .is_err()
    );
    database.close().await;
}

#[tokio::test]
async fn pinned_identity_cannot_outlive_user_suspension_or_generation_change() {
    let Some(database) = TestDatabase::create("model_key_generation").await else {
        return;
    };
    let fixture = KeyFixture::new(&database.pool).await;
    fixture
        .insert_key(&database.pool, "key_generation", "generation secret", true)
        .await;
    let store = PgModelKeyStore::new(database.pool.clone());
    let identity = store
        .authenticate(model_key_digest("generation secret"))
        .await
        .unwrap();
    sqlx::query("update identity_users set status='suspended',revision=revision+1 where id=$1")
        .bind(fixture.owner.user_id.as_uuid())
        .execute(&database.pool)
        .await
        .unwrap();
    assert!(matches!(
        store.revalidate(&identity).await,
        Err(ModelKeyAuthorityError::InvalidKey)
    ));
    sqlx::query("update identity_users set status='active',revision=revision+1 where id=$1")
        .bind(fixture.owner.user_id.as_uuid())
        .execute(&database.pool)
        .await
        .unwrap();
    assert!(matches!(
        store.revalidate(&identity).await,
        Err(ModelKeyAuthorityError::InvalidKey)
    ));
    let current = store
        .authenticate(model_key_digest("generation secret"))
        .await
        .unwrap();
    assert_ne!(identity.user_generation, current.user_generation);
    database.close().await;
}
