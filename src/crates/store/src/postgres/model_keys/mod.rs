//! Durable credential ownership, authorization and atomic lifecycle transactions.

mod assignment;
mod authority;
mod grants;
mod lifecycle;

pub(crate) use authority::lock_model_key_authority;

use chrono::{DateTime, Utc};
use ovload_admin::{
    model::{
        Revision,
        identity::IdentityStatus,
        identity_access::{
            IdentityError, IdentityManagementActor, IdentityOwner, IdentityResult, IdentitySession,
        },
        model_keys::*,
    },
    ports::model_keys::ModelKeyStore,
};
use ovload_core::{
    access::{Permission, TenantId, UserId},
    policy::{ClientApiKeyId, RateLimits},
    routing::AccountGroupId,
};
use sqlx::{PgPool, Postgres, Row, Transaction, postgres::PgRow};
use uuid::Uuid;

use super::identity::{access, db_error};

#[derive(Clone)]
pub struct PgModelKeyStore {
    pool: PgPool,
}

impl PgModelKeyStore {
    #[must_use]
    pub const fn new(pool: PgPool) -> Self {
        Self { pool }
    }

    async fn begin(&self) -> IdentityResult<Transaction<'_, Postgres>> {
        let mut tx = self.pool.begin().await.map_err(db_error)?;
        sqlx::query("set local statement_timeout = '5s'")
            .execute(&mut *tx)
            .await
            .map_err(db_error)?;
        Ok(tx)
    }
}

#[async_trait::async_trait]
impl ModelKeyStore for PgModelKeyStore {
    async fn list(
        &self,
        actor: &IdentitySession,
        owner: ModelKeyOwner,
        cursor: Option<ClientApiKeyId>,
        limit: u16,
    ) -> IdentityResult<ModelKeyPage> {
        lifecycle::list(self, actor, owner, cursor, limit).await
    }
    async fn get(
        &self,
        actor: &IdentitySession,
        owner: ModelKeyOwner,
        id: &ClientApiKeyId,
    ) -> IdentityResult<ModelKeyRecord> {
        lifecycle::get(self, actor, owner, id).await
    }
    async fn create(
        &self,
        actor: &IdentitySession,
        owner: ModelKeyOwner,
        command: NewModelKey,
    ) -> IdentityResult<ModelKeyWrite> {
        lifecycle::create(self, actor, owner, command).await
    }
    async fn update(
        &self,
        actor: &IdentitySession,
        owner: ModelKeyOwner,
        command: UpdateModelKey,
    ) -> IdentityResult<ModelKeyRecord> {
        lifecycle::update(self, actor, owner, command).await
    }
    async fn revoke(
        &self,
        actor: &IdentitySession,
        owner: ModelKeyOwner,
        command: RevokeModelKey,
    ) -> IdentityResult<ModelKeyRecord> {
        lifecycle::revoke(self, actor, owner, command).await
    }
    async fn rotate(
        &self,
        actor: &IdentitySession,
        owner: ModelKeyOwner,
        command: RotateModelKey,
    ) -> IdentityResult<ModelKeyWrite> {
        lifecycle::rotate(self, actor, owner, command).await
    }
    async fn group_grants(
        &self,
        actor: &IdentitySession,
        owner: ModelKeyOwner,
    ) -> IdentityResult<Vec<ModelKeyGroup>> {
        grants::list(self, actor, owner).await
    }
    async fn set_group_grant(
        &self,
        actor: &IdentitySession,
        owner: ModelKeyOwner,
        command: SetModelKeyGroupGrant,
    ) -> IdentityResult<Revision> {
        grants::set(self, actor, owner, command).await
    }
    async fn pending(
        &self,
        actor: &IdentitySession,
        cursor: Option<ClientApiKeyId>,
        limit: u16,
    ) -> IdentityResult<PendingModelKeyPage> {
        assignment::pending(self, actor, cursor, limit).await
    }
    async fn assign_pending(
        &self,
        actor: &IdentitySession,
        owner: ModelKeyOwner,
        command: AssignPendingModelKey,
    ) -> IdentityResult<ModelKeyRecord> {
        assignment::assign(self, actor, owner, command).await
    }
}

// Owner/session locks serialize all lifecycle changes with customer suspension.
async fn authorize(
    tx: &mut Transaction<'_, Postgres>,
    actor: &IdentitySession,
    owner: ModelKeyOwner,
    write: bool,
    active: bool,
) -> IdentityResult<()> {
    match actor.owner {
        IdentityOwner::Customer { tenant_id, user_id }
            if tenant_id == owner.tenant_id && user_id == owner.user_id =>
        {
            access::lock_session(tx, actor).await?;
        }
        IdentityOwner::Customer { .. } => return Err(IdentityError::NotFound),
        IdentityOwner::Management(_) => {
            access::authorize(
                tx,
                management(actor)?,
                if write {
                    Permission::IdentityKeysManage
                } else {
                    Permission::IdentityKeysRead
                },
                Some(owner.tenant_id),
            )
            .await?;
        }
    }
    let user = access::lock_target(tx, owner.tenant_id, owner.user_id).await?;
    if active {
        let tenant_active: bool =
            sqlx::query_scalar("select status='active' from identity_tenants where id=$1")
                .bind(owner.tenant_id.as_uuid())
                .fetch_one(&mut **tx)
                .await
                .map_err(db_error)?;
        if user.status != IdentityStatus::Active || !tenant_active {
            return Err(IdentityError::Conflict);
        }
    }
    Ok(())
}

fn management(actor: &IdentitySession) -> IdentityResult<IdentityManagementActor> {
    let IdentityOwner::Management(principal_id) = actor.owner else {
        return Err(IdentityError::Forbidden);
    };
    Ok(IdentityManagementActor {
        principal_id,
        session_id: actor.id,
        authority_generation: actor.authority_generation,
    })
}

async fn current_revision(tx: &mut Transaction<'_, Postgres>) -> IdentityResult<Revision> {
    let value: i64 = sqlx::query_scalar("select config_revision from runtime_settings where id=1")
        .fetch_one(&mut **tx)
        .await
        .map_err(db_error)?;
    Revision::new(positive(value)?).map_err(|_| IdentityError::Unavailable)
}

async fn bump_revision(tx: &mut Transaction<'_, Postgres>) -> IdentityResult<Revision> {
    let revision = super::bump_config_revision_in_transaction(tx)
        .await
        .map_err(|_| IdentityError::Unavailable)?;
    Revision::new(revision.get()).map_err(|_| IdentityError::Unavailable)
}

async fn load(
    tx: &mut Transaction<'_, Postgres>,
    owner: ModelKeyOwner,
    id: &ClientApiKeyId,
    lock: bool,
) -> IdentityResult<ModelKeyRecord> {
    let query = if lock {
        "select * from client_api_keys where tenant_id=$1 and user_id=$2 and id=$3 for update"
    } else {
        "select * from client_api_keys where tenant_id=$1 and user_id=$2 and id=$3"
    };
    let row = sqlx::query(query)
        .bind(owner.tenant_id.as_uuid())
        .bind(owner.user_id.as_uuid())
        .bind(id.as_str())
        .fetch_optional(&mut **tx)
        .await
        .map_err(db_error)?
        .ok_or(IdentityError::NotFound)?;
    record(&row, current_revision(tx).await?)
}

fn record(row: &PgRow, config_revision: Revision) -> IdentityResult<ModelKeyRecord> {
    Ok(ModelKeyRecord {
        config_revision,
        id: key_id(row.try_get("id").map_err(db_error)?)?,
        owner: ModelKeyOwner {
            tenant_id: TenantId::new(row.try_get("tenant_id").map_err(db_error)?),
            user_id: UserId::new(row.try_get("user_id").map_err(db_error)?),
        },
        group_id: AccountGroupId::new(
            row.try_get::<String, _>("account_group_id")
                .map_err(db_error)?,
        )
        .map_err(|_| IdentityError::Unavailable)?,
        name: row.try_get("name").map_err(db_error)?,
        prefix: row.try_get("key_prefix").map_err(db_error)?,
        enabled: row.try_get("enabled").map_err(db_error)?,
        limits: RateLimits {
            max_concurrency: nonnegative(row.try_get("max_concurrency").map_err(db_error)?)?,
            requests_per_minute: nonnegative(
                row.try_get("requests_per_minute").map_err(db_error)?,
            )?,
        },
        expires_at: row.try_get("expires_at").map_err(db_error)?,
        revoked_at: row.try_get("revoked_at").map_err(db_error)?,
        revision: positive(row.try_get("revision").map_err(db_error)?)?,
        created_at: row.try_get("created_at").map_err(db_error)?,
        updated_at: row.try_get("updated_at").map_err(db_error)?,
        supersedes_key_id: row
            .try_get::<Option<String>, _>("supersedes_key_id")
            .map_err(db_error)?
            .map(key_id)
            .transpose()?,
    })
}

fn key_id(value: String) -> IdentityResult<ClientApiKeyId> {
    ClientApiKeyId::new(value).map_err(|_| IdentityError::Unavailable)
}
fn positive(value: i64) -> IdentityResult<u64> {
    u64::try_from(value)
        .ok()
        .filter(|value| *value > 0)
        .ok_or(IdentityError::Unavailable)
}
fn nonnegative(value: i64) -> IdentityResult<u64> {
    u64::try_from(value).map_err(|_| IdentityError::Unavailable)
}
fn integer(value: u64) -> IdentityResult<i64> {
    i64::try_from(value).map_err(|_| IdentityError::Invalid)
}
fn validate_limits(limits: RateLimits) -> IdentityResult<()> {
    if !(1..=10_000).contains(&limits.max_concurrency)
        || !(1..=1_000_000).contains(&limits.requests_per_minute)
    {
        Err(IdentityError::Invalid)
    } else {
        Ok(())
    }
}
fn text(value: &str, maximum: usize) -> IdentityResult<()> {
    if value.is_empty()
        || value.len() > maximum
        || value.trim() != value
        || value.chars().any(char::is_control)
    {
        Err(IdentityError::Invalid)
    } else {
        Ok(())
    }
}
fn page_limit(limit: u16) -> IdentityResult<()> {
    if !(1..=100).contains(&limit) {
        Err(IdentityError::Invalid)
    } else {
        Ok(())
    }
}
fn reason(value: &str) -> IdentityResult<()> {
    if value.trim().is_empty() || value.len() > 512 || value.chars().any(char::is_control) {
        Err(IdentityError::Invalid)
    } else {
        Ok(())
    }
}
fn idempotency(value: &str) -> IdentityResult<()> {
    if !(8..=128).contains(&value.len())
        || !value
            .bytes()
            .all(|byte| byte.is_ascii_alphanumeric() || b"-_.:".contains(&byte))
    {
        Err(IdentityError::Invalid)
    } else {
        Ok(())
    }
}

async fn audit(
    tx: &mut Transaction<'_, Postgres>,
    actor: &IdentitySession,
    owner: Option<ModelKeyOwner>,
    action: &str,
    key: Option<&ClientApiKeyId>,
    group: Option<&AccountGroupId>,
    reason: &str,
) -> IdentityResult<()> {
    let (actor_kind, actor_id) = actor_columns(actor);
    sqlx::query("insert into model_key_audit_events(tenant_id,user_id,actor_kind,actor_id,session_id,action,key_id,account_group_id,reason) values($1,$2,$3,$4,$5,$6,$7,$8,$9)")
        .bind(owner.map(|v|v.tenant_id.as_uuid())).bind(owner.map(|v|v.user_id.as_uuid())).bind(actor_kind).bind(actor_id).bind(actor.id.as_uuid())
        .bind(action).bind(key.map(ClientApiKeyId::as_str)).bind(group.map(AccountGroupId::as_str)).bind(reason)
        .execute(&mut **tx).await.map_err(db_error)?;
    Ok(())
}

fn actor_columns(actor: &IdentitySession) -> (&'static str, Uuid) {
    match actor.owner {
        IdentityOwner::Customer { user_id, .. } => ("customer_user", user_id.as_uuid()),
        IdentityOwner::Management(id) => ("management_principal", id.as_uuid()),
    }
}
