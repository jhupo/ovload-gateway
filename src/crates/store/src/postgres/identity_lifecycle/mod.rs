//! Independent customer transactions and encrypted single-use challenge storage.

mod challenges;
mod notifications;
mod oauth;
mod passwords;
mod policy;
mod profiles;
mod registration;

use chrono::Utc;
use ovload_admin::{
    model::{
        identity_access::{
            IdentityCredential, IdentityError, IdentityManagementActor, IdentityOwner,
            IdentityResult, IdentitySession,
        },
        identity_lifecycle::*,
    },
    ports::identity_lifecycle::IdentityLifecycleStore,
};
use ovload_core::access::{Permission, TenantId, UserId};
use secrecy::{ExposeSecret as _, SecretString};
use sqlx::{PgPool, Postgres, Row, Transaction, postgres::PgRow};
use uuid::Uuid;

use super::identity::{access, db_error};

#[derive(Clone)]
pub struct PgIdentityLifecycleStore {
    pool: PgPool,
}

impl PgIdentityLifecycleStore {
    #[must_use]
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
impl IdentityLifecycleStore for PgIdentityLifecycleStore {
    async fn verify_human(&self, secret: &str, token: &str, hostname: &str) -> IdentityResult<()> {
        let client = reqwest::Client::builder()
            .no_proxy()
            .redirect(reqwest::redirect::Policy::none())
            .timeout(std::time::Duration::from_secs(8))
            .build()
            .map_err(|_| IdentityError::Unavailable)?;
        let mut response = client
            .post("https://challenges.cloudflare.com/turnstile/v0/siteverify")
            .form(&[("secret", secret), ("response", token)])
            .send()
            .await
            .map_err(|_| IdentityError::Unavailable)?;
        if !response.status().is_success() {
            return Err(IdentityError::Unavailable);
        }
        let mut body = Vec::new();
        while let Some(c) = response
            .chunk()
            .await
            .map_err(|_| IdentityError::Unavailable)?
        {
            if body.len() + c.len() > 16384 {
                return Err(IdentityError::Unavailable);
            }
            body.extend_from_slice(&c);
        }
        let value: serde_json::Value =
            serde_json::from_slice(&body).map_err(|_| IdentityError::Unavailable)?;
        if value["success"] != true || value["hostname"].as_str() != Some(hostname) {
            return Err(IdentityError::Forbidden);
        }
        Ok(())
    }
    async fn security_document(
        &self,
        s: Option<&IdentitySession>,
    ) -> IdentityResult<ovload_admin::model::identity_security::SecurityDocument> {
        super::identity::security::document(&self.pool, s).await
    }
    async fn save_security(
        &self,
        s: &IdentitySession,
        d: ovload_admin::model::identity_security::SecurityDocument,
    ) -> IdentityResult<()> {
        super::identity::security::save(&self.pool, s, d).await
    }

    async fn claim_audit_notification(&self) -> IdentityResult<Option<(Uuid, String, String)>> {
        super::content_audit::claim_notification(&self.pool).await
    }
    async fn finish_audit_notification(&self, id: Uuid) -> IdentityResult<()> {
        sqlx::query(
            "update content_audit_notifications set delivered_at=clock_timestamp() where id=$1",
        )
        .bind(id)
        .execute(&self.pool)
        .await
        .map_err(db_error)?;
        Ok(())
    }
    async fn save_oauth(&self, attempt: OAuthAttempt) -> IdentityResult<()> {
        oauth::save(self, attempt).await
    }
    async fn take_oauth(&self, state: [u8; 32], browser: [u8; 32]) -> IdentityResult<Vec<u8>> {
        oauth::take(self, state, browser).await
    }
    async fn external_credential(
        &self,
        provider: &str,
        subject: &str,
    ) -> IdentityResult<Option<IdentityCredential>> {
        oauth::credential(self, provider, subject).await
    }
    async fn claim_notification(&self) -> IdentityResult<Option<PendingIdentityNotification>> {
        notifications::claim(self).await
    }
    async fn finish_notification(
        &self,
        id: Uuid,
        lease: Uuid,
        delivered: bool,
    ) -> IdentityResult<()> {
        notifications::finish(self, id, lease, delivered).await
    }
    async fn registration_policy(&self) -> IdentityResult<RegistrationPolicy> {
        policy::read(self).await
    }
    async fn management_policy(
        &self,
        actor: IdentityManagementActor,
    ) -> IdentityResult<RegistrationPolicy> {
        policy::management(self, actor).await
    }
    async fn update_policy(
        &self,
        actor: IdentityManagementActor,
        value: RegistrationPolicy,
    ) -> IdentityResult<RegistrationPolicy> {
        policy::update(self, actor, value).await
    }
    async fn register(
        &self,
        registration: PreparedRegistration,
        challenge: Option<LifecycleChallenge>,
    ) -> IdentityResult<()> {
        registration::register(self, registration, challenge).await
    }
    async fn request_password_reset(
        &self,
        email: String,
        challenge: LifecycleChallenge,
    ) -> IdentityResult<()> {
        challenges::request_reset(self, email, challenge).await
    }
    async fn challenge(
        &self,
        purpose: ChallengePurpose,
        digest: [u8; 32],
    ) -> IdentityResult<ChallengeRecord> {
        challenges::get(self, purpose, digest).await
    }
    async fn consume_registration(
        &self,
        challenge: ChallengeRecord,
        registration: PreparedRegistration,
    ) -> IdentityResult<()> {
        registration::consume(self, challenge, registration).await
    }
    async fn consume_password_reset(
        &self,
        challenge: ChallengeRecord,
        password_hash: SecretString,
    ) -> IdentityResult<()> {
        passwords::reset(self, challenge, password_hash).await
    }
    async fn credential(&self, current: &IdentitySession) -> IdentityResult<LifecycleCredential> {
        passwords::credential(self, current).await
    }
    async fn change_password(
        &self,
        current: &IdentitySession,
        expected_revision: u64,
        verified_hash: SecretString,
        new_hash: SecretString,
    ) -> IdentityResult<()> {
        passwords::change(self, current, expected_revision, verified_hash, new_hash).await
    }
    async fn update_profile(
        &self,
        current: &IdentitySession,
        command: UpdateOwnProfile,
    ) -> IdentityResult<CustomerAccountRecord> {
        profiles::update(self, current, command).await
    }
    async fn update_customer(
        &self,
        actor: IdentityManagementActor,
        command: PreparedCustomerAccountUpdate,
    ) -> IdentityResult<CustomerAccountRecord> {
        profiles::management_update(self, actor, command).await
    }
    async fn profile(&self, current: &IdentitySession) -> IdentityResult<CustomerAccountRecord> {
        profiles::get(self, current).await
    }
    async fn customer(
        &self,
        actor: IdentityManagementActor,
        tenant: TenantId,
        user: UserId,
    ) -> IdentityResult<CustomerAccountRecord> {
        profiles::management_get(self, actor, tenant, user).await
    }
}

async fn commit(tx: Transaction<'_, Postgres>) -> IdentityResult<()> {
    tx.commit().await.map_err(db_error)
}
fn positive(value: i64) -> IdentityResult<u64> {
    u64::try_from(value)
        .ok()
        .filter(|v| *v > 0)
        .ok_or(IdentityError::Unavailable)
}
fn generation(value: u64) -> IdentityResult<i64> {
    version(value)?;
    i64::try_from(value).map_err(|_| IdentityError::Invalid)
}
fn customer(owner: IdentityOwner) -> IdentityResult<(TenantId, UserId)> {
    match owner {
        IdentityOwner::Customer { tenant_id, user_id } => Ok((tenant_id, user_id)),
        IdentityOwner::Management(_) => Err(IdentityError::Forbidden),
    }
}
fn checked_hash(hash: &SecretString) -> IdentityResult<()> {
    if !hash.expose_secret().starts_with("$argon2id$") || hash.expose_secret().len() > 1024 {
        return Err(IdentityError::Invalid);
    }
    Ok(())
}

async fn audit(
    tx: &mut Transaction<'_, Postgres>,
    actor: Option<&IdentitySession>,
    tenant: Option<TenantId>,
    action: &str,
    target: Uuid,
    reason: Option<&str>,
) -> IdentityResult<()> {
    let (kind, id, session) = match actor {
        Some(session) => match session.owner {
            IdentityOwner::Customer { user_id, .. } => (
                "customer_user",
                Some(user_id.as_uuid()),
                Some(session.id.to_string()),
            ),
            IdentityOwner::Management(id) => (
                "management_principal",
                Some(id.as_uuid()),
                Some(session.id.to_string()),
            ),
        },
        None => ("anonymous", None, None),
    };
    sqlx::query("insert into identity_audit_events (id,tenant_id,actor_kind,actor_id,session_id,action,target_kind,target_id,reason) values ($1,$2,$3,$4,$5,$6,'identity',$7,$8)")
        .bind(Uuid::now_v7()).bind(tenant.map(TenantId::as_uuid)).bind(kind).bind(id).bind(session).bind(action).bind(target).bind(reason)
        .execute(&mut **tx).await.map_err(db_error)?;
    Ok(())
}

fn actor_session(actor: IdentityManagementActor) -> IdentitySession {
    IdentitySession {
        id: actor.session_id,
        owner: IdentityOwner::Management(actor.principal_id),
        authority_generation: actor.authority_generation,
        expires_at: Utc::now(),
    }
}

async fn revoke_all(
    tx: &mut Transaction<'_, Postgres>,
    owner: IdentityOwner,
) -> IdentityResult<()> {
    let (tenant, user, principal) = match owner {
        IdentityOwner::Customer { tenant_id, user_id } => {
            (Some(tenant_id.as_uuid()), Some(user_id.as_uuid()), None)
        }
        IdentityOwner::Management(id) => (None, None, Some(id.as_uuid())),
    };
    sqlx::query("update identity_sessions set revoked_at=clock_timestamp() where tenant_id is not distinct from $1 and user_id is not distinct from $2 and principal_id is not distinct from $3 and revoked_at is null")
        .bind(tenant).bind(user).bind(principal).execute(&mut **tx).await.map_err(db_error)?;
    Ok(())
}
