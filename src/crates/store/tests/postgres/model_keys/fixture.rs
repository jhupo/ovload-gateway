//! Explicit customer authority for credential and policy adapter fixtures.

use chrono::{Duration, Utc};
use ovload_admin::model::{
    identity_access::{IdentityOwner, IdentitySession},
    model_keys::ModelKeyOwner,
};
use ovload_core::{
    access::{AccessSessionId, TenantId, UserId},
    engine::authentication::model_key_digest,
    routing::AccountGroupId,
};
use sqlx::PgPool;
use uuid::Uuid;

pub(crate) struct KeyFixture {
    pub owner: ModelKeyOwner,
    pub session: IdentitySession,
    pub group: AccountGroupId,
}

impl KeyFixture {
    pub async fn new(pool: &PgPool) -> Self {
        Self::with_group(pool, &format!("grp_{}", Uuid::now_v7().simple())).await
    }

    pub async fn with_group(pool: &PgPool, group: &str) -> Self {
        let tenant = Uuid::now_v7();
        let user = Uuid::now_v7();
        let session = Uuid::now_v7();
        let group = group.to_owned();
        sqlx::query(
            "insert into identity_tenants(id,slug,display_name) values($1,$2,'Fixture tenant')",
        )
        .bind(tenant)
        .bind(format!("fixture-{}", tenant.simple()))
        .execute(pool)
        .await
        .unwrap();
        sqlx::query("insert into identity_tenant_wallets(tenant_id) values($1)")
            .bind(tenant)
            .execute(pool)
            .await
            .unwrap();
        sqlx::query("insert into identity_users(id,tenant_id,email,password_hash,display_name) values($1,$2,$3,'fixture-hash','Fixture user')")
            .bind(user).bind(tenant).bind(format!("{user}@example.test"))
            .execute(pool).await.unwrap();
        sqlx::query("insert into account_groups(id,name,color,created_at,updated_at) values($1,$1,'#2563EBFF',now(),now()) on conflict(id) do nothing")
            .bind(&group).execute(pool).await.unwrap();
        sqlx::query("insert into model_key_group_grants(tenant_id,user_id,account_group_id,granted) values($1,$2,$3,true)")
            .bind(tenant).bind(user).bind(&group).execute(pool).await.unwrap();
        let expires_at = Utc::now() + Duration::hours(1);
        sqlx::query("insert into identity_sessions(id,access_digest,csrf_digest,audience,tenant_id,user_id,authority_generation,expires_at) values($1,$2,$3,'customer',$4,$5,1,$6)")
            .bind(session).bind(model_key_digest(&format!("access-{session}")).to_vec())
            .bind(model_key_digest(&format!("csrf-{session}")).to_vec())
            .bind(tenant).bind(user).bind(expires_at).execute(pool).await.unwrap();
        Self {
            owner: ModelKeyOwner {
                tenant_id: TenantId::new(tenant),
                user_id: UserId::new(user),
            },
            session: IdentitySession {
                id: AccessSessionId::new(session),
                owner: IdentityOwner::Customer {
                    tenant_id: TenantId::new(tenant),
                    user_id: UserId::new(user),
                },
                authority_generation: 1,
                expires_at,
            },
            group: AccountGroupId::new(group).unwrap(),
        }
    }

    pub async fn insert_key(&self, pool: &PgPool, id: &str, secret: &str, enabled: bool) {
        sqlx::query("insert into client_api_keys(id,name,key_digest,key_prefix,enabled,tenant_id,user_id,account_group_id,wallet_tenant_id,max_concurrency,requests_per_minute,created_at,updated_at) values($1,$1,$2,'sk_fixture', $3,$4,$5,$6,$4,4,60,now(),now())")
            .bind(id).bind(model_key_digest(secret).to_vec()).bind(enabled)
            .bind(self.owner.tenant_id.as_uuid()).bind(self.owner.user_id.as_uuid())
            .bind(self.group.as_str()).execute(pool).await.unwrap();
    }
}

pub(crate) async fn seed_key(pool: &PgPool, id: &str, secret: &str, enabled: bool) {
    KeyFixture::new(pool)
        .await
        .insert_key(pool, id, secret, enabled)
        .await;
}
