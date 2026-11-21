//! Live scoped authority and explicit offline operator provisioning.

mod commands;
mod read;

use chrono::Utc;
use ovload_admin::{
    model::{
        identity_access::{
            IdentityError, IdentityManagementActor, IdentityOwner, IdentityResult, IdentitySession,
        },
        management_security::*,
    },
    ports::management_security::ManagementSecurityStore,
};
use ovload_core::access::{ManagementPrincipalId, Permission, TenantId};
use secrecy::{ExposeSecret as _, SecretString};
use sqlx::{PgPool, Postgres, Row, Transaction, postgres::PgRow};
use uuid::Uuid;

use super::identity::access;

#[derive(Clone)]
pub struct PgManagementSecurityStore {
    pool: PgPool,
}

impl PgManagementSecurityStore {
    pub const fn new(pool: PgPool) -> Self {
        Self { pool }
    }

    async fn begin(&self) -> IdentityResult<Transaction<'_, Postgres>> {
        let mut tx = self.pool.begin().await.map_err(db_error)?;
        sqlx::query("set local statement_timeout='5s'")
            .execute(&mut *tx)
            .await
            .map_err(db_error)?;
        Ok(tx)
    }
}

#[async_trait::async_trait]
impl ManagementSecurityStore for PgManagementSecurityStore {
    async fn own_profile(&self, actor: IdentityManagementActor) -> IdentityResult<PrincipalRecord> {
        let mut tx = self.begin().await?;
        live(&mut tx, actor).await?;
        let row = sqlx::query("select id,username,status,revision,created_at,updated_at from identity_management_principals where id=$1")
            .bind(actor.principal_id.as_uuid()).fetch_one(&mut *tx).await.map_err(db_error)?;
        let result = read::principal_row(&row)?;
        tx.commit().await.map_err(db_error)?;
        Ok(result)
    }

    async fn provision_operator(
        &self,
        username: String,
        password_hash: SecretString,
    ) -> IdentityResult<PrincipalRecord> {
        commands::provision_operator(self, username, password_hash).await
    }

    async fn reset_password(
        &self,
        username: String,
        password_hash: SecretString,
    ) -> IdentityResult<PrincipalRecord> {
        commands::reset_password(self, username, password_hash).await
    }

    async fn authorize(
        &self,
        actor: IdentityManagementActor,
        permission: Permission,
        scope: SecurityScope,
    ) -> IdentityResult<()> {
        let mut tx = self.begin().await?;
        access::authorize(&mut tx, actor, permission, scope.tenant_id()).await?;
        tx.commit().await.map_err(db_error)
    }

    async fn effective_grants(
        &self,
        actor: IdentityManagementActor,
    ) -> IdentityResult<Vec<GrantRecord>> {
        let mut tx = self.begin().await?;
        live(&mut tx, actor).await?;
        let rows=sqlx::query("select * from identity_grants where principal_id=$1 and status='active' and (expires_at is null or expires_at>clock_timestamp()) order by id limit 1001")
            .bind(actor.principal_id.as_uuid()).fetch_all(&mut *tx).await.map_err(db_error)?;
        if rows.len() > 1000 {
            return Err(IdentityError::Unavailable);
        }
        let result = rows
            .iter()
            .map(read::grant)
            .collect::<IdentityResult<Vec<_>>>()?;
        tx.commit().await.map_err(db_error)?;
        Ok(result)
    }
}

async fn live(
    tx: &mut Transaction<'_, Postgres>,
    actor: IdentityManagementActor,
) -> IdentityResult<()> {
    access::lock_session(
        tx,
        &IdentitySession {
            id: actor.session_id,
            owner: IdentityOwner::Management(actor.principal_id),
            authority_generation: actor.authority_generation,
            expires_at: Utc::now(),
        },
    )
    .await?;
    Ok(())
}

fn db_error(error: sqlx::Error) -> IdentityError {
    if error.as_database_error().is_some_and(|db| {
        db.is_unique_violation()
            || db
                .code()
                .is_some_and(|code| code == "40001" || code == "40P01")
    }) {
        IdentityError::Conflict
    } else {
        IdentityError::Unavailable
    }
}

fn version(value: i64) -> IdentityResult<u64> {
    u64::try_from(value)
        .ok()
        .filter(|value| *value > 0)
        .ok_or(IdentityError::Unavailable)
}

fn permissions(row: &PgRow) -> IdentityResult<Vec<Permission>> {
    row.try_get::<Vec<String>, _>("permissions")
        .map_err(db_error)?
        .iter()
        .map(|value| Permission::parse(value).map_err(|_| IdentityError::Unavailable))
        .collect()
}

fn scope(row: &PgRow) -> IdentityResult<SecurityScope> {
    Ok(row
        .try_get::<Option<Uuid>, _>("tenant_id")
        .map_err(db_error)?
        .map_or(SecurityScope::Platform, |id| {
            SecurityScope::Customer(TenantId::new(id))
        }))
}

async fn audit(
    tx: &mut Transaction<'_, Postgres>,
    actor: Option<IdentityManagementActor>,
    scope: SecurityScope,
    action: &str,
    target: Uuid,
    reason: &str,
) -> IdentityResult<()> {
    sqlx::query("insert into identity_audit_events(tenant_id,actor_kind,actor_id,session_id,action,target_kind,target_id,reason) values($1,$2,$3,$4,$5,'management_security',$6,$7)")
      .bind(scope.tenant_id().map(TenantId::as_uuid)).bind(if actor.is_some(){"management_principal"}else{"system"})
      .bind(actor.map(|a|a.principal_id.as_uuid())).bind(actor.map(|a|a.session_id.to_string())).bind(action).bind(target).bind(reason)
      .execute(&mut **tx).await.map_err(db_error)?;
    Ok(())
}
