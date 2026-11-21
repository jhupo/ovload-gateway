//! Tenant-owned model credentials. Persistence receives verifiers, never secrets.

use chrono::{DateTime, Utc};
use ovload_core::{
    access::{TenantId, UserId},
    policy::{ClientApiKeyId, RateLimits},
    routing::AccountGroupId,
};
use secrecy::SecretString;

#[derive(Debug, Clone, Copy, PartialEq, Eq)]
pub struct ModelKeyOwner {
    pub tenant_id: TenantId,
    pub user_id: UserId,
}

#[derive(Debug, Clone)]
pub struct ModelKeyRecord {
    pub config_revision: super::Revision,
    pub id: ClientApiKeyId,
    pub owner: ModelKeyOwner,
    pub group_id: AccountGroupId,
    pub name: String,
    pub prefix: String,
    pub enabled: bool,
    pub limits: RateLimits,
    pub expires_at: Option<DateTime<Utc>>,
    pub revoked_at: Option<DateTime<Utc>>,
    pub revision: u64,
    pub created_at: DateTime<Utc>,
    pub updated_at: DateTime<Utc>,
    pub supersedes_key_id: Option<ClientApiKeyId>,
}

#[derive(Debug, Clone)]
pub struct ModelKeyPage {
    pub items: Vec<ModelKeyRecord>,
    pub next_cursor: Option<ClientApiKeyId>,
}

#[derive(Debug)]
pub struct CreateModelKey {
    pub group_id: AccountGroupId,
    pub name: String,
    pub limits: RateLimits,
    pub expires_at: Option<DateTime<Utc>>,
    pub idempotency_key: String,
    pub reason: String,
}

#[derive(Debug, Clone)]
pub struct NewModelKey {
    pub id: ClientApiKeyId,
    pub group_id: AccountGroupId,
    pub name: String,
    pub limits: RateLimits,
    pub expires_at: Option<DateTime<Utc>>,
    pub digest: [u8; 32],
    pub prefix: String,
    pub idempotency_key: String,
    pub fingerprint: [u8; 32],
    pub reason: String,
}

#[derive(Debug, Clone)]
pub struct UpdateModelKey {
    pub id: ClientApiKeyId,
    pub expected_revision: u64,
    pub name: String,
    pub enabled: bool,
    pub limits: RateLimits,
    pub expires_at: Option<DateTime<Utc>>,
    pub reason: String,
}

#[derive(Debug, Clone)]
pub struct RevokeModelKey {
    pub id: ClientApiKeyId,
    pub expected_revision: u64,
    pub reason: String,
}

#[derive(Debug, Clone)]
pub struct RotateModelKey {
    pub id: ClientApiKeyId,
    pub expected_revision: u64,
    pub replacement_id: ClientApiKeyId,
    pub digest: [u8; 32],
    pub prefix: String,
    pub idempotency_key: String,
    pub fingerprint: [u8; 32],
    pub reason: String,
}

#[derive(Debug)]
pub struct ModelKeyWrite {
    pub record: ModelKeyRecord,
    pub replayed: bool,
}

#[derive(Debug)]
pub struct IssuedModelKey {
    pub record: ModelKeyRecord,
    pub secret: Option<SecretString>,
    pub replayed: bool,
}

#[derive(Debug, Clone)]
pub struct ModelKeyGroup {
    pub id: AccountGroupId,
    pub name: String,
}

#[derive(Debug, Clone)]
pub struct SetModelKeyGroupGrant {
    pub group_id: AccountGroupId,
    pub granted: bool,
    pub reason: String,
}

#[derive(Debug, Clone)]
pub struct PendingModelKey {
    pub id: ClientApiKeyId,
    pub name: String,
    pub prefix: String,
    pub former_enabled: bool,
}

#[derive(Debug, Clone)]
pub struct PendingModelKeyPage {
    pub items: Vec<PendingModelKey>,
    pub next_cursor: Option<ClientApiKeyId>,
}

#[derive(Debug, Clone)]
pub struct AssignPendingModelKey {
    pub id: ClientApiKeyId,
    pub name: String,
    pub group_id: AccountGroupId,
    pub enabled: bool,
    pub limits: RateLimits,
    pub reason: String,
}
