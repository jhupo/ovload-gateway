//! Credential issuance and validation; the store owns transactional authorization.

use std::sync::Arc;

use base64::{Engine as _, engine::general_purpose::URL_SAFE_NO_PAD};
use chrono::{DateTime, Utc};
use ovload_core::{
    policy::{ClientApiKeyId, RateLimits},
    runtime::SnapshotControl,
};
use rand_core::{OsRng, RngCore as _};
use secrecy::SecretString;
use sha2::{Digest as _, Sha256};
use uuid::Uuid;

use crate::{
    model::{
        identity_access::{IdentityError, IdentityOwner, IdentityResult, IdentitySession},
        model_keys::*,
    },
    ports::model_keys::ModelKeyStore,
};

pub struct ModelKeyService {
    store: Arc<dyn ModelKeyStore>,
    snapshots: Arc<dyn SnapshotControl>,
}

impl ModelKeyService {
    pub fn new(store: Arc<dyn ModelKeyStore>, snapshots: Arc<dyn SnapshotControl>) -> Self {
        Self { store, snapshots }
    }

    pub fn owner(
        actor: &IdentitySession,
        requested: Option<ModelKeyOwner>,
    ) -> IdentityResult<ModelKeyOwner> {
        match (actor.owner, requested) {
            (IdentityOwner::Customer { tenant_id, user_id }, None) => {
                Ok(ModelKeyOwner { tenant_id, user_id })
            }
            (IdentityOwner::Management(_), Some(owner)) => Ok(owner),
            _ => Err(IdentityError::Forbidden),
        }
    }

    pub async fn list(
        &self,
        actor: &IdentitySession,
        owner: ModelKeyOwner,
        cursor: Option<ClientApiKeyId>,
        limit: u16,
    ) -> IdentityResult<ModelKeyPage> {
        validate_limit(limit)?;
        self.store.list(actor, owner, cursor, limit).await
    }

    pub async fn get(
        &self,
        actor: &IdentitySession,
        owner: ModelKeyOwner,
        id: &ClientApiKeyId,
    ) -> IdentityResult<ModelKeyRecord> {
        self.store.get(actor, owner, id).await
    }

    pub async fn create(
        &self,
        actor: &IdentitySession,
        owner: ModelKeyOwner,
        command: CreateModelKey,
    ) -> IdentityResult<IssuedModelKey> {
        validate_name(&command.name)?;
        validate_limits(command.limits)?;
        validate_idempotency(&command.idempotency_key)?;
        validate_reason(&command.reason)?;
        let fingerprint = fingerprint(&serde_json::json!({
            "group": command.group_id.as_str(), "name": command.name,
            "limits": command.limits, "expires_at": command.expires_at,
            "reason": command.reason,
        }))?;
        let (secret, digest, prefix) = generate_secret()?;
        let result = self
            .store
            .create(
                actor,
                owner,
                NewModelKey {
                    id: new_id()?,
                    group_id: command.group_id,
                    name: command.name,
                    limits: command.limits,
                    expires_at: command.expires_at,
                    digest,
                    prefix,
                    idempotency_key: command.idempotency_key,
                    fingerprint,
                    reason: command.reason,
                },
            )
            .await?;
        self.publish(&result.record).await?;
        Ok(IssuedModelKey {
            record: result.record,
            secret: (!result.replayed).then_some(secret),
            replayed: result.replayed,
        })
    }

    pub async fn update(
        &self,
        actor: &IdentitySession,
        owner: ModelKeyOwner,
        command: UpdateModelKey,
    ) -> IdentityResult<ModelKeyRecord> {
        validate_name(&command.name)?;
        validate_limits(command.limits)?;
        validate_expiry(command.expires_at)?;
        validate_reason(&command.reason)?;
        validate_revision(command.expected_revision)?;
        let record = self.store.update(actor, owner, command).await?;
        self.publish(&record).await?;
        Ok(record)
    }

    pub async fn revoke(
        &self,
        actor: &IdentitySession,
        owner: ModelKeyOwner,
        command: RevokeModelKey,
    ) -> IdentityResult<ModelKeyRecord> {
        validate_reason(&command.reason)?;
        validate_revision(command.expected_revision)?;
        let record = self.store.revoke(actor, owner, command).await?;
        self.publish(&record).await?;
        Ok(record)
    }

    pub async fn rotate(
        &self,
        actor: &IdentitySession,
        owner: ModelKeyOwner,
        id: ClientApiKeyId,
        revision: u64,
        idempotency_key: String,
        reason: String,
    ) -> IdentityResult<IssuedModelKey> {
        validate_revision(revision)?;
        validate_idempotency(&idempotency_key)?;
        validate_reason(&reason)?;
        let fingerprint = fingerprint(
            &serde_json::json!({ "id": id.as_str(), "revision": revision, "reason": reason }),
        )?;
        let (secret, digest, prefix) = generate_secret()?;
        let result = self
            .store
            .rotate(
                actor,
                owner,
                RotateModelKey {
                    id,
                    expected_revision: revision,
                    replacement_id: new_id()?,
                    digest,
                    prefix,
                    idempotency_key,
                    fingerprint,
                    reason,
                },
            )
            .await?;
        self.publish(&result.record).await?;
        Ok(IssuedModelKey {
            record: result.record,
            secret: (!result.replayed).then_some(secret),
            replayed: result.replayed,
        })
    }

    pub async fn group_grants(
        &self,
        actor: &IdentitySession,
        owner: ModelKeyOwner,
    ) -> IdentityResult<Vec<ModelKeyGroup>> {
        self.store.group_grants(actor, owner).await
    }

    pub async fn set_group_grant(
        &self,
        actor: &IdentitySession,
        owner: ModelKeyOwner,
        command: SetModelKeyGroupGrant,
    ) -> IdentityResult<()> {
        validate_reason(&command.reason)?;
        let revision = self.store.set_group_grant(actor, owner, command).await?;
        let revision = ovload_core::routing::ConfigRevision::new(revision.get())
            .map_err(|_| IdentityError::Unavailable)?;
        self.snapshots.publish_committed(revision).await;
        Ok(())
    }

    pub async fn pending(
        &self,
        actor: &IdentitySession,
        cursor: Option<ClientApiKeyId>,
        limit: u16,
    ) -> IdentityResult<PendingModelKeyPage> {
        validate_limit(limit)?;
        self.store.pending(actor, cursor, limit).await
    }

    pub async fn assign_pending(
        &self,
        actor: &IdentitySession,
        owner: ModelKeyOwner,
        command: AssignPendingModelKey,
    ) -> IdentityResult<ModelKeyRecord> {
        validate_name(&command.name)?;
        validate_reason(&command.reason)?;
        validate_limits(command.limits)?;
        let record = self.store.assign_pending(actor, owner, command).await?;
        self.publish(&record).await?;
        Ok(record)
    }

    async fn publish(&self, record: &ModelKeyRecord) -> IdentityResult<()> {
        let revision = ovload_core::routing::ConfigRevision::new(record.config_revision.get())
            .map_err(|_| IdentityError::Unavailable)?;
        self.snapshots.publish_committed(revision).await;
        Ok(())
    }
}

fn validate_limit(limit: u16) -> IdentityResult<()> {
    if (1..=100).contains(&limit) {
        Ok(())
    } else {
        Err(IdentityError::Invalid)
    }
}

fn validate_revision(revision: u64) -> IdentityResult<()> {
    if revision > 0 && revision <= i64::MAX as u64 {
        Ok(())
    } else {
        Err(IdentityError::Invalid)
    }
}

fn validate_name(name: &str) -> IdentityResult<()> {
    if name.is_empty()
        || name.len() > 128
        || name.trim() != name
        || name.chars().any(char::is_control)
    {
        return Err(IdentityError::Invalid);
    }
    Ok(())
}

fn validate_reason(reason: &str) -> IdentityResult<()> {
    if reason.trim().is_empty() || reason.len() > 512 || reason.chars().any(char::is_control) {
        return Err(IdentityError::Invalid);
    }
    Ok(())
}

fn validate_limits(limits: RateLimits) -> IdentityResult<()> {
    if !(1..=10_000).contains(&limits.max_concurrency)
        || !(1..=1_000_000).contains(&limits.requests_per_minute)
    {
        return Err(IdentityError::Invalid);
    }
    Ok(())
}

fn validate_expiry(expiry: Option<DateTime<Utc>>) -> IdentityResult<()> {
    if expiry.is_some_and(|expiry| expiry <= Utc::now()) {
        return Err(IdentityError::Invalid);
    }
    Ok(())
}

fn validate_idempotency(value: &str) -> IdentityResult<()> {
    if !(8..=128).contains(&value.len())
        || !value
            .bytes()
            .all(|byte| byte.is_ascii_alphanumeric() || b"-_.:".contains(&byte))
    {
        return Err(IdentityError::Invalid);
    }
    Ok(())
}

fn fingerprint(value: &serde_json::Value) -> IdentityResult<[u8; 32]> {
    let bytes = serde_json::to_vec(value).map_err(|_| IdentityError::Invalid)?;
    Ok(Sha256::digest(bytes).into())
}

fn new_id() -> IdentityResult<ClientApiKeyId> {
    ClientApiKeyId::new(format!("key_{}", Uuid::now_v7().simple()))
        .map_err(|_| IdentityError::Unavailable)
}

fn generate_secret() -> IdentityResult<(SecretString, [u8; 32], String)> {
    let mut bytes = [0_u8; 32];
    OsRng
        .try_fill_bytes(&mut bytes)
        .map_err(|_| IdentityError::Unavailable)?;
    let raw = format!("sk_{}", URL_SAFE_NO_PAD.encode(bytes));
    let digest = Sha256::digest(raw.as_bytes()).into();
    let prefix = raw[..11].to_owned();
    Ok((SecretString::from(raw), digest, prefix))
}
