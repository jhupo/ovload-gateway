//! Bootstrap and fixed-minute attempts use PostgreSQL as the single authority.

use std::net::IpAddr;

use ovload_admin::model::identity_access::IdentityCredential;
use ovload_core::access::Permission;
use secrecy::{ExposeSecret as _, SecretString};
use sha2::{Digest as _, Sha256};

use super::*;

pub(super) async fn bootstrap_owner(
    store: &PgIdentityStore,
    username: &str,
    password_hash: SecretString,
) -> IdentityResult<ManagementPrincipalId> {
    if !password_hash.expose_secret().starts_with("$argon2id$") {
        return Err(IdentityError::Invalid);
    }
    let mut tx = store.begin().await?;
    sqlx::query("lock table identity_management_principals in exclusive mode")
        .execute(&mut *tx)
        .await
        .map_err(db_error)?;
    let occupied: bool =
        sqlx::query_scalar("select exists(select 1 from identity_management_principals)")
            .fetch_one(&mut *tx)
            .await
            .map_err(db_error)?;
    if occupied {
        return Err(IdentityError::Conflict);
    }
    let id = ManagementPrincipalId::new(Uuid::now_v7());
    sqlx::query(
        "insert into identity_management_principals (id, username, password_hash)
         values ($1,$2,$3)",
    )
    .bind(id.as_uuid())
    .bind(username)
    .bind(password_hash.expose_secret())
    .execute(&mut *tx)
    .await
    .map_err(db_error)?;
    let permissions: Vec<&str> = [
        Permission::IdentityUsersRead,
        Permission::IdentityUsersManage,
        Permission::IdentityKeysRead,
        Permission::IdentityKeysManage,
        Permission::SecuritySettingsManage,
        Permission::ProviderAccountsRead,
        Permission::ProviderAccountsManage,
        Permission::ModelsExecute,
        Permission::UsageRead,
        Permission::BillingRead,
        Permission::BillingManage,
        Permission::PluginsManage,
    ]
    .into_iter()
    .map(Permission::as_str)
    .collect();
    sqlx::query("insert into identity_grants (id, principal_id, permissions) values ($1,$2,$3)")
        .bind(Uuid::now_v7())
        .bind(id.as_uuid())
        .bind(permissions)
        .execute(&mut *tx)
        .await
        .map_err(db_error)?;
    audit(
        &mut tx,
        AuditEvent {
            owner: None,
            session_id: None,
            tenant_id: None,
            action: "identity.owner_bootstrapped",
            target_kind: "management_principal",
            target_id: id.as_uuid(),
            reason: Some("explicit operator bootstrap"),
        },
    )
    .await?;
    commit(tx).await?;
    Ok(id)
}

pub(super) async fn consume_auth_attempt(
    store: &PgIdentityStore,
    source: IpAddr,
    account_digest: [u8; 32],
) -> IdentityResult<()> {
    let policy = super::security::policy(&store.pool).await?;
    let mut tx = store.begin().await?;
    let source_digest = Sha256::digest(source.to_canonical().to_string().as_bytes());
    if policy.access_block {
        let blocked:bool=sqlx::query_scalar("select exists(select 1 from authentication_failures where source_digest=$1 and blocked_until>clock_timestamp())").bind(source_digest.as_slice()).fetch_one(&mut *tx).await.map_err(db_error)?;
        if blocked {
            return Err(IdentityError::RateLimited);
        }
    }
    let window: DateTime<Utc> =
        sqlx::query_scalar("select date_trunc('minute', clock_timestamp())")
            .fetch_one(&mut *tx)
            .await
            .map_err(db_error)?;
    let global: [u8; 32] = Sha256::digest(b"ovload-identity/global").into();
    let network: [u8; 32] = Sha256::digest(source.to_canonical().to_string().as_bytes()).into();
    let mut allowed = true;
    // Every attempt takes the same global/network/account lock order. Saturate
    // at limit + 1 so rejected attempts cannot overflow counters.
    for (scope, digest, limit) in [
        ("global", global, 1000_i32),
        ("network", network, policy.auth_rate_limit as i32),
        ("account", account_digest, 10_i32),
    ] {
        let count: i32 = sqlx::query_scalar(
            "insert into identity_auth_budgets (scope,bucket_digest,window_start,attempts)
             values ($1,$2,$3,1) on conflict (scope,bucket_digest) do update set
             window_start=greatest(identity_auth_budgets.window_start,excluded.window_start),
             attempts=case when identity_auth_budgets.window_start < excluded.window_start then 1
               else least(identity_auth_budgets.attempts + 1,$4) end returning attempts",
        )
        .bind(scope)
        .bind(digest.as_slice())
        .bind(window)
        .bind(limit + 1)
        .fetch_one(&mut *tx)
        .await
        .map_err(db_error)?;
        if count > limit {
            // A rejected global/network dimension must not allocate arbitrary
            // downstream account buckets, even under sustained invalid traffic.
            allowed = false;
            break;
        }
    }
    sqlx::query(
        "delete from identity_auth_budgets where (scope,bucket_digest) in
         (select scope,bucket_digest from identity_auth_budgets where window_start < $1
          order by window_start,scope,bucket_digest limit 100 for update skip locked)",
    )
    .bind(window)
    .execute(&mut *tx)
    .await
    .map_err(db_error)?;
    commit(tx).await?;
    if allowed {
        Ok(())
    } else {
        Err(IdentityError::RateLimited)
    }
}

pub(super) async fn login_credential(
    store: &PgIdentityStore,
    audience: IdentityAudience,
    login: &str,
) -> IdentityResult<Option<IdentityCredential>> {
    let row = match audience {
        IdentityAudience::Customer => sqlx::query(
            "select u.id,u.tenant_id,u.password_hash,u.authority_generation as revision from identity_users u
             join identity_tenants t on t.id=u.tenant_id
             where u.email=$1 and u.status='active' and t.status='active'",
        )
        .bind(login)
        .fetch_optional(&store.pool)
        .await
        .map_err(db_error)?,
        IdentityAudience::Management => sqlx::query(
            "select id,password_hash,revision from identity_management_principals
             where username=$1 and status='active'",
        )
        .bind(login)
        .fetch_optional(&store.pool)
        .await
        .map_err(db_error)?,
    };
    row.map(|row| {
        let id: Uuid = row.try_get("id").map_err(db_error)?;
        Ok(IdentityCredential {
            owner: match audience {
                IdentityAudience::Customer => IdentityOwner::Customer {
                    tenant_id: TenantId::new(row.try_get("tenant_id").map_err(db_error)?),
                    user_id: UserId::new(id),
                },
                IdentityAudience::Management => {
                    IdentityOwner::Management(ManagementPrincipalId::new(id))
                }
            },
            password_hash: SecretString::from(
                row.try_get::<String, _>("password_hash")
                    .map_err(db_error)?,
            ),
            authority_generation: positive(row.try_get("revision").map_err(db_error)?)?,
        })
    })
    .transpose()
}

pub(super) async fn record_authentication_failure(
    store: &PgIdentityStore,
    owner: Option<IdentityOwner>,
) -> IdentityResult<()> {
    let (kind, tenant, actor) = match owner {
        Some(IdentityOwner::Customer { tenant_id, user_id }) => (
            "customer_user",
            Some(tenant_id.as_uuid()),
            Some(user_id.as_uuid()),
        ),
        Some(IdentityOwner::Management(id)) => ("management_principal", None, Some(id.as_uuid())),
        None => ("anonymous", None, None),
    };
    sqlx::query(
        "insert into identity_audit_events
         (id,tenant_id,actor_kind,actor_id,action,target_kind,reason)
         values ($1,$2,$3,$4,'identity.authentication','identity','rejected')",
    )
    .bind(Uuid::now_v7())
    .bind(tenant)
    .bind(kind)
    .bind(actor)
    .execute(&store.pool)
    .await
    .map_err(db_error)?;
    Ok(())
}
