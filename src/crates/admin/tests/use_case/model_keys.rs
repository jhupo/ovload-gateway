//! Issuance passes only a verifier to persistence and never recovers a secret.

use std::sync::{Arc, Mutex};

use async_trait::async_trait;
use base64::{Engine as _, engine::general_purpose::URL_SAFE_NO_PAD};
use chrono::{DateTime, Duration, Utc};
use ovload_admin::{
    ModelKeyService,
    model::{
        Revision,
        identity_access::{IdentityError, IdentityOwner, IdentityResult, IdentitySession},
        model_keys::*,
    },
    ports::model_keys::ModelKeyStore,
};
use ovload_core::{
    access::{AccessSessionId, TenantId, UserId},
    engine::authentication::model_key_digest,
    policy::{ClientApiKeyId, RateLimits},
    routing::AccountGroupId,
};
use secrecy::ExposeSecret as _;

struct IssuanceStore {
    receipt: Mutex<Option<([u8; 32], ModelKeyRecord)>>,
    command: Mutex<Option<NewModelKey>>,
    now: Mutex<DateTime<Utc>>,
}

impl Default for IssuanceStore {
    fn default() -> Self {
        Self {
            receipt: Mutex::new(None),
            command: Mutex::new(None),
            now: Mutex::new(Utc::now()),
        }
    }
}

#[async_trait]
impl ModelKeyStore for IssuanceStore {
    async fn list(
        &self,
        _: &IdentitySession,
        _: ModelKeyOwner,
        _: Option<ClientApiKeyId>,
        _: u16,
    ) -> IdentityResult<ModelKeyPage> {
        Err(IdentityError::Unavailable)
    }
    async fn get(
        &self,
        _: &IdentitySession,
        _: ModelKeyOwner,
        _: &ClientApiKeyId,
    ) -> IdentityResult<ModelKeyRecord> {
        Err(IdentityError::Unavailable)
    }
    async fn create(
        &self,
        actor: &IdentitySession,
        owner: ModelKeyOwner,
        command: NewModelKey,
    ) -> IdentityResult<ModelKeyWrite> {
        assert_eq!(
            actor.owner,
            IdentityOwner::Customer {
                tenant_id: owner.tenant_id,
                user_id: owner.user_id
            }
        );
        let mut receipt = self.receipt.lock().unwrap();
        if let Some((fingerprint, record)) = receipt.as_ref() {
            return if fingerprint == &command.fingerprint {
                Ok(ModelKeyWrite {
                    record: record.clone(),
                    replayed: true,
                })
            } else {
                Err(IdentityError::Conflict)
            };
        }
        let now = *self.now.lock().unwrap();
        if command.expires_at.is_some_and(|expiry| expiry <= now) {
            return Err(IdentityError::Invalid);
        }
        let record = ModelKeyRecord {
            config_revision: Revision::new(1).unwrap(),
            id: command.id.clone(),
            owner,
            group_id: command.group_id.clone(),
            name: command.name.clone(),
            prefix: command.prefix.clone(),
            enabled: true,
            limits: command.limits,
            expires_at: command.expires_at,
            revoked_at: None,
            revision: 1,
            created_at: now,
            updated_at: now,
            supersedes_key_id: None,
        };
        *receipt = Some((command.fingerprint, record.clone()));
        *self.command.lock().unwrap() = Some(command);
        Ok(ModelKeyWrite {
            record,
            replayed: false,
        })
    }
    async fn update(
        &self,
        _: &IdentitySession,
        _: ModelKeyOwner,
        _: UpdateModelKey,
    ) -> IdentityResult<ModelKeyRecord> {
        Err(IdentityError::Unavailable)
    }
    async fn revoke(
        &self,
        _: &IdentitySession,
        _: ModelKeyOwner,
        _: RevokeModelKey,
    ) -> IdentityResult<ModelKeyRecord> {
        Err(IdentityError::Unavailable)
    }
    async fn rotate(
        &self,
        _: &IdentitySession,
        _: ModelKeyOwner,
        _: RotateModelKey,
    ) -> IdentityResult<ModelKeyWrite> {
        Err(IdentityError::Unavailable)
    }
    async fn group_grants(
        &self,
        _: &IdentitySession,
        _: ModelKeyOwner,
    ) -> IdentityResult<Vec<ModelKeyGroup>> {
        Err(IdentityError::Unavailable)
    }
    async fn set_group_grant(
        &self,
        _: &IdentitySession,
        _: ModelKeyOwner,
        _: SetModelKeyGroupGrant,
    ) -> IdentityResult<Revision> {
        Err(IdentityError::Unavailable)
    }
    async fn pending(
        &self,
        _: &IdentitySession,
        _: Option<ClientApiKeyId>,
        _: u16,
    ) -> IdentityResult<PendingModelKeyPage> {
        Err(IdentityError::Unavailable)
    }
    async fn assign_pending(
        &self,
        _: &IdentitySession,
        _: ModelKeyOwner,
        _: AssignPendingModelKey,
    ) -> IdentityResult<ModelKeyRecord> {
        Err(IdentityError::Unavailable)
    }
}

fn actor() -> IdentitySession {
    IdentitySession {
        id: AccessSessionId::new(uuid::Uuid::from_u128(3)),
        owner: IdentityOwner::Customer {
            tenant_id: TenantId::new(uuid::Uuid::from_u128(1)),
            user_id: UserId::new(uuid::Uuid::from_u128(2)),
        },
        authority_generation: 1,
        expires_at: Utc::now() + Duration::hours(1),
    }
}

fn command() -> CreateModelKey {
    CreateModelKey {
        group_id: AccountGroupId::new("group-key-fixture").unwrap(),
        name: "Owned key".into(),
        limits: RateLimits {
            max_concurrency: 4,
            requests_per_minute: 60,
        },
        expires_at: None,
        idempotency_key: "create-key-fixture".into(),
        reason: "customer_request".into(),
    }
}

#[tokio::test]
async fn issuance_persists_only_verifier_and_replay_never_discloses_a_secret() {
    let store = Arc::new(IssuanceStore::default());
    let service = ModelKeyService::new(store.clone(), Arc::new(super::NoopSnapshot));
    let actor = actor();
    let owner = ModelKeyService::owner(&actor, None).unwrap();
    let first = service.create(&actor, owner, command()).await.unwrap();
    let raw = first.secret.as_ref().unwrap().expose_secret();
    assert_eq!(
        URL_SAFE_NO_PAD
            .decode(raw.strip_prefix("sk_").unwrap())
            .unwrap()
            .len(),
        32
    );
    let persisted = store.command.lock().unwrap().clone().unwrap();
    assert_eq!(persisted.digest, model_key_digest(raw));
    assert!(raw.starts_with(&persisted.prefix));
    assert!(!format!("{persisted:?}").contains(raw));
    assert!(!format!("{first:?}").contains(raw));
    let replay = service.create(&actor, owner, command()).await.unwrap();
    assert_eq!(replay.record.id, first.record.id);
    assert!(replay.replayed);
    assert!(replay.secret.is_none());
    let mut changed = command();
    changed.name = "Changed request".into();
    assert!(matches!(
        service.create(&actor, owner, changed).await,
        Err(IdentityError::Conflict)
    ));
}

#[tokio::test]
async fn replay_is_not_rejected_by_a_later_expiry_clock() {
    let store = Arc::new(IssuanceStore::default());
    let service = ModelKeyService::new(store.clone(), Arc::new(super::NoopSnapshot));
    let actor = actor();
    let owner = ModelKeyService::owner(&actor, None).unwrap();
    let expires_at = Utc::now() - Duration::seconds(1);
    *store.now.lock().unwrap() = expires_at - Duration::seconds(1);
    let mut expired = command();
    expired.expires_at = Some(expires_at);
    // The receipt must be interpreted by persistence before time-sensitive checks.
    let first = service.create(&actor, owner, expired).await.unwrap();
    *store.now.lock().unwrap() = expires_at + Duration::seconds(1);
    let mut replay = command();
    replay.expires_at = first.record.expires_at;
    assert!(
        service
            .create(&actor, owner, replay)
            .await
            .unwrap()
            .secret
            .is_none()
    );
}

#[tokio::test]
async fn invalid_input_never_reaches_persistence_and_customer_cannot_choose_an_owner() {
    let store = Arc::new(IssuanceStore::default());
    let service = ModelKeyService::new(store.clone(), Arc::new(super::NoopSnapshot));
    let actor = actor();
    let owner = ModelKeyService::owner(&actor, None).unwrap();
    assert!(matches!(
        ModelKeyService::owner(&actor, Some(owner)),
        Err(IdentityError::Forbidden)
    ));
    for invalid in ["", "  name", "line\nbreak"] {
        let mut input = command();
        input.name = invalid.into();
        assert!(matches!(
            service.create(&actor, owner, input).await,
            Err(IdentityError::Invalid)
        ));
    }
    for limits in [
        RateLimits {
            max_concurrency: 0,
            requests_per_minute: 60,
        },
        RateLimits {
            max_concurrency: 4,
            requests_per_minute: 0,
        },
        RateLimits {
            max_concurrency: 10_001,
            requests_per_minute: 60,
        },
    ] {
        let mut input = command();
        input.limits = limits;
        assert!(matches!(
            service.create(&actor, owner, input).await,
            Err(IdentityError::Invalid)
        ));
    }
    assert!(store.command.lock().unwrap().is_none());
}
