//! Live joins are the authority; runtime snapshots cannot extend credentials.

use ovload_core::engine::authentication::{
    ModelKeyAuthority, ModelKeyAuthorityError, ModelKeyIdentity,
};
use ovload_core::{engine::admission::ModelKeyAdmissionLimits, policy::RateLimits};

use super::*;

impl PgModelKeyStore {
    async fn identity(
        &self,
        digest: Option<[u8; 32]>,
        id: Option<&ClientApiKeyId>,
    ) -> Result<ModelKeyIdentity, ModelKeyAuthorityError> {
        let mut tx = self
            .begin()
            .await
            .map_err(|_| ModelKeyAuthorityError::Unavailable)?;
        let (identity, _) = lock_identity(&mut tx, digest, id).await?;
        tx.commit()
            .await
            .map_err(|_| ModelKeyAuthorityError::Unavailable)?;
        Ok(identity)
    }
}

/// Holds live credential authority locks until the caller's transaction ends.
pub(crate) async fn lock_model_key_authority(
    tx: &mut Transaction<'_, Postgres>,
    expected: &ModelKeyIdentity,
    expected_group: &AccountGroupId,
) -> Result<(), ModelKeyAuthorityError> {
    let (current, group) = lock_identity(tx, None, Some(&expected.key_id)).await?;
    if current != *expected || group != *expected_group {
        return Err(ModelKeyAuthorityError::InvalidKey);
    }
    Ok(())
}

async fn lock_identity(
    tx: &mut Transaction<'_, Postgres>,
    digest: Option<[u8; 32]>,
    id: Option<&ClientApiKeyId>,
) -> Result<(ModelKeyIdentity, AccountGroupId), ModelKeyAuthorityError> {
    let unavailable = |_| ModelKeyAuthorityError::Unavailable;
    let candidate = sqlx::query("select id,tenant_id,user_id,account_group_id from client_api_keys where tenant_id is not null and (($1::bytea is not null and key_digest=$1) or ($2::text is not null and id=$2))")
            .bind(digest.map(|v|v.to_vec())).bind(id.map(ClientApiKeyId::as_str)).fetch_optional(&mut **tx).await
            .map_err(unavailable)?.ok_or(ModelKeyAuthorityError::InvalidKey)?;
    let tenant: Uuid = candidate.try_get("tenant_id").map_err(unavailable)?;
    let user: Uuid = candidate.try_get("user_id").map_err(unavailable)?;
    let group: String = candidate.try_get("account_group_id").map_err(unavailable)?;
    let key: String = candidate.try_get("id").map_err(unavailable)?;
    // Mutation owners lock these same rows before publishing a new authority.
    let tenant_active: Option<bool> =
        sqlx::query_scalar("select status='active' from identity_tenants where id=$1 for share")
            .bind(tenant)
            .fetch_optional(&mut **tx)
            .await
            .map_err(unavailable)?;
    let user_active: Option<bool> = sqlx::query_scalar(
        "select status='active' from identity_users where tenant_id=$1 and id=$2 for share",
    )
    .bind(tenant)
    .bind(user)
    .fetch_optional(&mut **tx)
    .await
    .map_err(unavailable)?;
    let group_policy: Option<(bool, String)> =
        sqlx::query_as("select enabled,visibility from account_groups where id=$1 for share")
            .bind(&group)
            .fetch_optional(&mut **tx)
            .await
            .map_err(unavailable)?;
    let granted:Option<bool>=sqlx::query_scalar("select granted from model_key_group_grants where tenant_id=$1 and user_id=$2 and account_group_id=$3 for share")
            .bind(tenant).bind(user).bind(&group).fetch_optional(&mut **tx).await.map_err(unavailable)?;
    if tenant_active != Some(true)
        || user_active != Some(true)
        || !group_policy.as_ref().is_some_and(|(enabled, _)| *enabled)
        || !granted.unwrap_or_else(|| {
            group_policy
                .as_ref()
                .is_some_and(|(_, visibility)| visibility == "public")
        })
    {
        return Err(ModelKeyAuthorityError::InvalidKey);
    }
    sqlx::query("select id from client_api_keys where id=$1 for share")
        .bind(&key)
        .fetch_one(&mut **tx)
        .await
        .map_err(unavailable)?;
    let row = sqlx::query(
            "select k.id,k.tenant_id,k.user_id,k.authority_generation as key_generation,
                    u.authority_generation+u.limits_revision as user_generation,t.revision as tenant_generation
             from client_api_keys k
             join identity_users u on u.tenant_id=k.tenant_id and u.id=k.user_id and u.status='active'
             join identity_tenants t on t.id=k.tenant_id and t.status='active'
             join identity_tenant_wallets w on w.tenant_id=k.wallet_tenant_id and w.tenant_id=k.tenant_id
             join account_groups g on g.id=k.account_group_id and g.enabled
             left join model_key_group_grants grants on grants.tenant_id=k.tenant_id and grants.user_id=k.user_id
               and grants.account_group_id=k.account_group_id
             where (($1::bytea is not null and k.key_digest=$1) or ($2::text is not null and k.id=$2))
               and k.enabled and k.revoked_at is null and k.quarantined_at is null
               and coalesce(grants.granted,g.visibility='public')
               and (k.expires_at is null or k.expires_at>clock_timestamp())",
        ).bind(digest.map(|value|value.to_vec())).bind(id.map(ClientApiKeyId::as_str)).fetch_optional(&mut **tx).await
            .map_err(|_|ModelKeyAuthorityError::Unavailable)?.ok_or(ModelKeyAuthorityError::InvalidKey)?;
    let decode = || -> IdentityResult<ModelKeyIdentity> {
        Ok(ModelKeyIdentity {
            key_id: key_id(row.try_get("id").map_err(db_error)?)?,
            tenant_id: TenantId::new(row.try_get("tenant_id").map_err(db_error)?),
            user_id: UserId::new(row.try_get("user_id").map_err(db_error)?),
            key_generation: positive(row.try_get("key_generation").map_err(db_error)?)?,
            user_generation: positive(row.try_get("user_generation").map_err(db_error)?)?,
            tenant_generation: positive(row.try_get("tenant_generation").map_err(db_error)?)?,
        })
    };
    let identity = decode().map_err(|_| ModelKeyAuthorityError::Unavailable)?;
    let group = AccountGroupId::new(group).map_err(|_| ModelKeyAuthorityError::Unavailable)?;
    Ok((identity, group))
}

#[async_trait::async_trait]
impl ModelKeyAuthority for PgModelKeyStore {
    async fn authenticate(
        &self,
        digest: [u8; 32],
    ) -> Result<ModelKeyIdentity, ModelKeyAuthorityError> {
        self.identity(Some(digest), None).await
    }
    async fn resolve(
        &self,
        id: &ClientApiKeyId,
    ) -> Result<ModelKeyIdentity, ModelKeyAuthorityError> {
        self.identity(None, Some(id)).await
    }
    async fn revalidate(&self, identity: &ModelKeyIdentity) -> Result<(), ModelKeyAuthorityError> {
        let current = self.resolve(&identity.key_id).await?;
        if current.tenant_id != identity.tenant_id
            || current.user_id != identity.user_id
            || current.key_generation != identity.key_generation
            || current.user_generation != identity.user_generation
            || current.tenant_generation != identity.tenant_generation
        {
            return Err(ModelKeyAuthorityError::InvalidKey);
        }
        Ok(())
    }

    async fn admission_limits(
        &self,
        identity: &ModelKeyIdentity,
    ) -> Result<ModelKeyAdmissionLimits, ModelKeyAuthorityError> {
        let mut tx = self
            .begin()
            .await
            .map_err(|_| ModelKeyAuthorityError::Unavailable)?;
        let (current, _) = lock_identity(&mut tx, None, Some(&identity.key_id)).await?;
        if current != *identity {
            return Err(ModelKeyAuthorityError::InvalidKey);
        }
        let row = sqlx::query(
            "select t.max_concurrency as tenant_concurrency,t.requests_per_minute as tenant_rpm,
                    u.max_concurrency as user_concurrency,u.requests_per_minute as user_rpm,
                    k.max_concurrency as key_concurrency,k.requests_per_minute as key_rpm, g.controls_json
             from client_api_keys k
             join account_groups g on g.id=k.account_group_id
             join identity_tenants t on t.id=k.tenant_id
             join identity_users u on u.tenant_id=k.tenant_id and u.id=k.user_id
             where k.id=$1",
        )
        .bind(identity.key_id.as_str())
        .fetch_one(&mut *tx)
        .await
        .map_err(|_| ModelKeyAuthorityError::Unavailable)?;
        let read = |concurrency: &str, rpm: &str, max_concurrency: u64, max_rpm: u64| {
            let concurrency: i64 = row
                .try_get(concurrency)
                .map_err(|_| ModelKeyAuthorityError::Unavailable)?;
            let rpm: i64 = row
                .try_get(rpm)
                .map_err(|_| ModelKeyAuthorityError::Unavailable)?;
            let concurrency =
                u64::try_from(concurrency).map_err(|_| ModelKeyAuthorityError::Unavailable)?;
            let rpm = u64::try_from(rpm).map_err(|_| ModelKeyAuthorityError::Unavailable)?;
            if !(1..=max_concurrency).contains(&concurrency) || !(1..=max_rpm).contains(&rpm) {
                return Err(ModelKeyAuthorityError::Unavailable);
            }
            Ok(RateLimits {
                max_concurrency: concurrency,
                requests_per_minute: rpm,
            })
        };
        let controls: sqlx::types::Json<ovload_core::metering::GroupControls> = row
            .try_get("controls_json")
            .map_err(|_| ModelKeyAuthorityError::Unavailable)?;
        let group_rpm = controls
            .0
            .for_user(identity.tenant_id, identity.user_id)
            .requests_per_minute
            .unwrap_or(controls.0.requests_per_minute);
        if group_rpm > 1_000_000 {
            return Err(ModelKeyAuthorityError::Unavailable);
        }
        let limits = ModelKeyAdmissionLimits {
            group_requests_per_minute: group_rpm,
            tenant: read("tenant_concurrency", "tenant_rpm", 100_000, 10_000_000)?,
            user: read("user_concurrency", "user_rpm", 100_000, 10_000_000)?,
            key: read("key_concurrency", "key_rpm", 10_000, 1_000_000)?,
        };
        tx.commit()
            .await
            .map_err(|_| ModelKeyAuthorityError::Unavailable)?;
        Ok(limits)
    }
}
