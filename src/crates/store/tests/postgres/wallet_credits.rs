//! Durable operator funding history, pagination, and live tenant authorization.

use std::str::FromStr as _;

use chrono::{Duration, Utc};
use ovload_admin::{
    model::{
        billing::CreditTenantWallet,
        identity_access::{IdentityError, IdentityManagementActor},
    },
    ports::billing::BillingStore as _,
};
use ovload_core::{
    access::{AccessSessionId, ManagementPrincipalId, TenantId},
    engine::authentication::model_key_digest,
    metering::Decimal,
};
use ovload_store::postgres::PgBillingStore;
use sqlx::PgPool;
use uuid::Uuid;

use super::TestDatabase;

async fn tenant(pool: &PgPool) -> TenantId {
    let id = Uuid::now_v7();
    sqlx::query(
        "insert into identity_tenants(id,slug,display_name) values($1,$2,'Wallet fixture')",
    )
    .bind(id)
    .bind(format!("wallet-{}", id.simple()))
    .execute(pool)
    .await
    .expect("seed tenant");
    sqlx::query("insert into identity_tenant_wallets(tenant_id) values($1)")
        .bind(id)
        .execute(pool)
        .await
        .expect("seed empty wallet");
    TenantId::new(id)
}

async fn operator(
    pool: &PgPool,
    tenant: Option<TenantId>,
    permissions: Vec<&str>,
) -> (IdentityManagementActor, Uuid) {
    let principal = Uuid::now_v7();
    let session = Uuid::now_v7();
    let grant = Uuid::now_v7();
    sqlx::query("insert into identity_management_principals(id,username,password_hash) values($1,$2,'synthetic-fixture-hash')")
        .bind(principal)
        .bind(format!("wallet_{}", principal.simple()))
        .execute(pool)
        .await
        .expect("seed operator");
    sqlx::query("insert into identity_sessions(id,access_digest,csrf_digest,audience,principal_id,authority_generation,expires_at) values($1,$2,$3,'management',$4,1,$5)")
        .bind(session)
        .bind(model_key_digest(&format!("synthetic-access-{session}")).to_vec())
        .bind(model_key_digest(&format!("synthetic-csrf-{session}")).to_vec())
        .bind(principal)
        .bind(Utc::now() + Duration::hours(1))
        .execute(pool)
        .await
        .expect("seed operator session");
    sqlx::query(
        "insert into identity_grants(id,principal_id,tenant_id,permissions) values($1,$2,$3,$4)",
    )
    .bind(grant)
    .bind(principal)
    .bind(tenant.map(TenantId::as_uuid))
    .bind(permissions)
    .execute(pool)
    .await
    .expect("seed scoped billing grant");
    (
        IdentityManagementActor {
            session_id: AccessSessionId::new(session),
            principal_id: ManagementPrincipalId::new(principal),
            authority_generation: 1,
        },
        grant,
    )
}

fn credit(tenant: TenantId, amount: &str, key: &str) -> CreditTenantWallet {
    CreditTenantWallet::new(
        tenant,
        Decimal::from_str(amount).expect("exact fixture USD"),
        format!("Synthetic operator credit {key}"),
        key.to_owned(),
    )
    .expect("valid operator funding")
}

#[tokio::test]
async fn credits_are_exact_paginated_and_isolated_from_foreign_cursors_and_revoked_grants() {
    let Some(database) = TestDatabase::create("wallet_credit_history").await else {
        return;
    };
    let first = tenant(&database.pool).await;
    let other = tenant(&database.pool).await;
    let empty = tenant(&database.pool).await;
    let (administrator, _) =
        operator(&database.pool, None, vec!["billing.read", "billing.manage"]).await;
    let (reader, grant) = operator(&database.pool, Some(first), vec!["billing.read"]).await;
    let store = PgBillingStore::new(database.pool.clone());
    let initial = store
        .credit_tenant_wallet(administrator, credit(first, "1.0000000001", "first"))
        .await
        .expect("first committed credit");
    let replay = store
        .credit_tenant_wallet(administrator, credit(first, "1.0000000001", "first"))
        .await
        .expect("same original receipt");
    assert_eq!(initial, replay);
    let second = store
        .credit_tenant_wallet(administrator, credit(first, "2.0000000002", "second"))
        .await
        .expect("second committed credit");
    let foreign = store
        .credit_tenant_wallet(administrator, credit(other, "99", "foreign"))
        .await
        .expect("foreign committed credit");

    let page = store
        .management_wallet_credits(reader, first, None, 1)
        .await
        .expect("first scoped history page");
    assert_eq!(page.items.len(), 1);
    assert_eq!(page.items[0].tenant_id, first);
    assert_eq!(page.items[0].principal_id, administrator.principal_id);
    assert_eq!(page.items[0].ledger_entry_id, second.ledger_entry_id());
    assert_eq!(page.next_cursor, Some(second.ledger_entry_id()));
    assert_eq!(
        Decimal::from_str(&page.total_credited_usd)
            .unwrap()
            .canonical(),
        "3.0000000003"
    );
    let next = store
        .management_wallet_credits(reader, first, page.next_cursor, 1)
        .await
        .expect("exclusive next history page");
    assert_eq!(next.items.len(), 1);
    assert_eq!(next.items[0].ledger_entry_id, initial.ledger_entry_id());
    assert_eq!(next.items[0].amount_usd.canonical(), "1.0000000001");
    assert_eq!(next.total_credited_usd, page.total_credited_usd);
    assert!(next.next_cursor.is_none());

    for cursor in [Uuid::now_v7(), foreign.ledger_entry_id()] {
        assert!(matches!(
            store
                .management_wallet_credits(reader, first, Some(cursor), 50)
                .await,
            Err(IdentityError::Invalid)
        ));
    }
    for limit in [0, 101] {
        assert!(matches!(
            store
                .management_wallet_credits(reader, first, None, limit)
                .await,
            Err(IdentityError::Invalid)
        ));
    }
    assert!(matches!(
        store
            .management_wallet_credits(reader, other, None, 50)
            .await,
        Err(IdentityError::Forbidden)
    ));
    let empty_page = store
        .management_wallet_credits(administrator, empty, None, 50)
        .await
        .expect("real empty history");
    assert!(empty_page.items.is_empty());
    assert!(empty_page.next_cursor.is_none());
    assert_eq!(empty_page.total_credited_usd, "0");

    sqlx::query("update identity_grants set status='revoked',authority_generation=authority_generation+1 where id=$1")
        .bind(grant)
        .execute(&database.pool)
        .await
        .expect("revoke read grant");
    assert!(matches!(
        store
            .management_wallet_credits(reader, first, None, 50)
            .await,
        Err(IdentityError::Forbidden)
    ));
    database.close().await;
}
