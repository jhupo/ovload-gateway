//! Authoritative identity transactions; customer state never comes from Redis.

pub(crate) mod access;
mod authentication;
mod customers;
pub(crate) mod security;
mod sessions;

use chrono::{DateTime, Utc};
use ovload_admin::model::{
    identity::{CustomerUserRecord, IdentityStatus},
    identity_access::{
        CustomerDirectoryQuery, CustomerIdentityPage, IdentityAudience, IdentityCredential,
        IdentityError, IdentityManagementActor, IdentityOwner, IdentityResult, IdentitySession,
        NewCustomerIdentity, NewIdentitySession, SetCustomerActive,
    },
};
use ovload_admin::ports::identity::IdentityStore;
use ovload_core::access::{AccessSessionId, ManagementPrincipalId, TenantId, UserId};
use secrecy::SecretString;
use sqlx::{PgPool, Postgres, Row, Transaction, postgres::PgRow};
use uuid::Uuid;

/// The PostgreSQL adapter owns row-lock ordering and mutation/audit atomicity.
#[derive(Clone)]
pub struct PgIdentityStore {
    pool: PgPool,
}

impl PgIdentityStore {
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
impl IdentityStore for PgIdentityStore {
    async fn security_policy(
        &self,
    ) -> IdentityResult<ovload_admin::model::identity_security::SecurityPolicy> {
        security::policy(&self.pool).await
    }
    async fn authentication_result(
        &self,
        source: std::net::IpAddr,
        _account: [u8; 32],
        success: bool,
    ) -> IdentityResult<()> {
        security::outcome(&self.pool, source, success).await
    }
    async fn step_up(&self, s: &IdentitySession, verified: bool) -> IdentityResult<bool> {
        security::step_up(&self.pool, s, verified).await
    }
    async fn rotate_admin_key(
        &self,
        s: &IdentitySession,
        c: NewIdentitySession,
    ) -> IdentityResult<()> {
        security::rotate_key(self, s, c).await
    }
    async fn admin_key_status(
        &self,
        session: &IdentitySession,
    ) -> IdentityResult<ovload_admin::model::identity_security::AdminKeyStatus> {
        security::key_status(&self.pool, session).await
    }
    async fn revoke_admin_key(&self, session: &IdentitySession) -> IdentityResult<()> {
        security::revoke_key(&self.pool, session).await
    }

    async fn bootstrap_owner(
        &self,
        username: &str,
        password_hash: SecretString,
    ) -> IdentityResult<ManagementPrincipalId> {
        authentication::bootstrap_owner(self, username, password_hash).await
    }

    async fn consume_auth_attempt(
        &self,
        source: std::net::IpAddr,
        account_digest: [u8; 32],
    ) -> IdentityResult<()> {
        authentication::consume_auth_attempt(self, source, account_digest).await
    }

    async fn login_credential(
        &self,
        audience: IdentityAudience,
        login: &str,
    ) -> IdentityResult<Option<IdentityCredential>> {
        authentication::login_credential(self, audience, login).await
    }

    async fn record_authentication_failure(
        &self,
        owner: Option<IdentityOwner>,
    ) -> IdentityResult<()> {
        authentication::record_authentication_failure(self, owner).await
    }

    async fn create_session(&self, command: NewIdentitySession) -> IdentityResult<()> {
        sessions::create_session(self, command).await
    }

    async fn session(
        &self,
        audience: IdentityAudience,
        access_digest: [u8; 32],
    ) -> IdentityResult<Option<IdentitySession>> {
        sessions::session(self, audience, access_digest).await
    }

    async fn revoke_session(&self, current: &IdentitySession) -> IdentityResult<()> {
        sessions::revoke_session(self, current).await
    }

    async fn customer_profile(
        &self,
        current: &IdentitySession,
    ) -> IdentityResult<CustomerUserRecord> {
        customers::customer_profile(self, current).await
    }

    async fn provision_customer(
        &self,
        actor: IdentityManagementActor,
        command: NewCustomerIdentity,
    ) -> IdentityResult<CustomerUserRecord> {
        customers::provision_customer(self, actor, command).await
    }

    async fn customer(
        &self,
        actor: IdentityManagementActor,
        tenant_id: TenantId,
        user_id: UserId,
    ) -> IdentityResult<CustomerUserRecord> {
        customers::customer(self, actor, tenant_id, user_id).await
    }

    async fn customers(
        &self,
        actor: IdentityManagementActor,
        query: CustomerDirectoryQuery,
    ) -> IdentityResult<CustomerIdentityPage> {
        customers::customers(self, actor, query).await
    }

    async fn set_customer_active(
        &self,
        actor: IdentityManagementActor,
        command: SetCustomerActive,
    ) -> IdentityResult<CustomerUserRecord> {
        customers::set_customer_active(self, actor, command).await
    }
}

async fn commit(tx: Transaction<'_, Postgres>) -> IdentityResult<()> {
    tx.commit().await.map_err(db_error)
}

pub(crate) fn db_error(error: sqlx::Error) -> IdentityError {
    let code = error.as_database_error().and_then(|error| error.code());
    match code.as_deref() {
        Some("23505" | "40001" | "40P01") => IdentityError::Conflict,
        Some(code) if code.starts_with("22") || code.starts_with("23") => IdentityError::Invalid,
        _ => IdentityError::Unavailable,
    }
}

fn positive(value: i64) -> IdentityResult<u64> {
    u64::try_from(value)
        .ok()
        .filter(|value| *value > 0)
        .ok_or(IdentityError::Unavailable)
}

fn generation(value: u64) -> IdentityResult<i64> {
    i64::try_from(value)
        .ok()
        .filter(|value| *value > 0)
        .ok_or(IdentityError::Invalid)
}

pub(crate) fn customer_record(row: &PgRow) -> IdentityResult<CustomerUserRecord> {
    let status: String = row.try_get("status").map_err(db_error)?;
    Ok(CustomerUserRecord {
        id: UserId::new(row.try_get("id").map_err(db_error)?),
        tenant_id: TenantId::new(row.try_get("tenant_id").map_err(db_error)?),
        email: row.try_get("email").map_err(db_error)?,
        display_name: row.try_get("display_name").map_err(db_error)?,
        status: match status.as_str() {
            "active" => IdentityStatus::Active,
            "suspended" => IdentityStatus::Suspended,
            "revoked" => IdentityStatus::Revoked,
            _ => return Err(IdentityError::Unavailable),
        },
        revision: positive(row.try_get("revision").map_err(db_error)?)?,
        created_at: row.try_get("created_at").map_err(db_error)?,
        updated_at: row.try_get("updated_at").map_err(db_error)?,
    })
}

fn session_record(row: &PgRow, audience: IdentityAudience) -> IdentityResult<IdentitySession> {
    let owner = match audience {
        IdentityAudience::Customer => IdentityOwner::Customer {
            tenant_id: TenantId::new(row.try_get("tenant_id").map_err(db_error)?),
            user_id: UserId::new(row.try_get("user_id").map_err(db_error)?),
        },
        IdentityAudience::Management => IdentityOwner::Management(ManagementPrincipalId::new(
            row.try_get("principal_id").map_err(db_error)?,
        )),
    };
    Ok(IdentitySession {
        id: AccessSessionId::new(row.try_get("id").map_err(db_error)?),
        owner,
        authority_generation: positive(row.try_get("authority_generation").map_err(db_error)?)?,
        expires_at: row.try_get("expires_at").map_err(db_error)?,
    })
}

const fn audience(owner: IdentityOwner) -> IdentityAudience {
    match owner {
        IdentityOwner::Customer { .. } => IdentityAudience::Customer,
        IdentityOwner::Management(_) => IdentityAudience::Management,
    }
}

fn owner_columns(owner: IdentityOwner) -> (Option<Uuid>, Option<Uuid>, Option<Uuid>) {
    match owner {
        IdentityOwner::Customer { tenant_id, user_id } => {
            (Some(tenant_id.as_uuid()), Some(user_id.as_uuid()), None)
        }
        IdentityOwner::Management(principal_id) => (None, None, Some(principal_id.as_uuid())),
    }
}

struct AuditEvent<'a> {
    owner: Option<IdentityOwner>,
    session_id: Option<AccessSessionId>,
    tenant_id: Option<TenantId>,
    action: &'static str,
    target_kind: &'static str,
    target_id: Uuid,
    reason: Option<&'a str>,
}

async fn audit(tx: &mut Transaction<'_, Postgres>, event: AuditEvent<'_>) -> IdentityResult<()> {
    let (kind, tenant_id, actor_id) = match event.owner {
        Some(IdentityOwner::Customer { tenant_id, user_id }) => (
            "customer_user",
            Some(tenant_id.as_uuid()),
            Some(user_id.as_uuid()),
        ),
        Some(IdentityOwner::Management(principal_id)) => {
            ("management_principal", None, Some(principal_id.as_uuid()))
        }
        None => ("system", None, None),
    };
    sqlx::query(
        "insert into identity_audit_events
         (id, tenant_id, actor_kind, actor_id, session_id, action, target_kind, target_id, reason)
         values ($1,$2,$3,$4,$5,$6,$7,$8,$9)",
    )
    .bind(Uuid::now_v7())
    .bind(event.tenant_id.map(TenantId::as_uuid).or(tenant_id))
    .bind(kind)
    .bind(actor_id)
    .bind(event.session_id.map(|id| id.to_string()))
    .bind(event.action)
    .bind(event.target_kind)
    .bind(event.target_id)
    .bind(event.reason)
    .execute(&mut **tx)
    .await
    .map_err(db_error)?;
    Ok(())
}
