//! Atomic credential authority operations, each authorized against a live session.

use async_trait::async_trait;
use ovload_core::policy::ClientApiKeyId;

use crate::model::{
    identity_access::{IdentityResult, IdentitySession},
    model_keys::{
        AssignPendingModelKey, ModelKeyGroup, ModelKeyOwner, ModelKeyPage, ModelKeyRecord,
        ModelKeyWrite, NewModelKey, PendingModelKeyPage, RevokeModelKey, RotateModelKey,
        SetModelKeyGroupGrant, UpdateModelKey,
    },
};

#[async_trait]
pub trait ModelKeyStore: Send + Sync {
    async fn list(
        &self,
        actor: &IdentitySession,
        owner: ModelKeyOwner,
        cursor: Option<ClientApiKeyId>,
        limit: u16,
    ) -> IdentityResult<ModelKeyPage>;
    async fn get(
        &self,
        actor: &IdentitySession,
        owner: ModelKeyOwner,
        id: &ClientApiKeyId,
    ) -> IdentityResult<ModelKeyRecord>;
    async fn create(
        &self,
        actor: &IdentitySession,
        owner: ModelKeyOwner,
        command: NewModelKey,
    ) -> IdentityResult<ModelKeyWrite>;
    async fn update(
        &self,
        actor: &IdentitySession,
        owner: ModelKeyOwner,
        command: UpdateModelKey,
    ) -> IdentityResult<ModelKeyRecord>;
    async fn revoke(
        &self,
        actor: &IdentitySession,
        owner: ModelKeyOwner,
        command: RevokeModelKey,
    ) -> IdentityResult<ModelKeyRecord>;
    /// The old row is revoked in the same transaction as the replacement and receipt.
    async fn rotate(
        &self,
        actor: &IdentitySession,
        owner: ModelKeyOwner,
        command: RotateModelKey,
    ) -> IdentityResult<ModelKeyWrite>;
    async fn group_grants(
        &self,
        actor: &IdentitySession,
        owner: ModelKeyOwner,
    ) -> IdentityResult<Vec<ModelKeyGroup>>;
    /// Removing a grant revokes every key bound to that owner and group atomically.
    async fn set_group_grant(
        &self,
        actor: &IdentitySession,
        owner: ModelKeyOwner,
        command: SetModelKeyGroupGrant,
    ) -> IdentityResult<crate::model::Revision>;
    /// Platform management permission is required; quarantined keys never authenticate.
    async fn pending(
        &self,
        actor: &IdentitySession,
        cursor: Option<ClientApiKeyId>,
        limit: u16,
    ) -> IdentityResult<PendingModelKeyPage>;
    async fn assign_pending(
        &self,
        actor: &IdentitySession,
        owner: ModelKeyOwner,
        command: AssignPendingModelKey,
    ) -> IdentityResult<ModelKeyRecord>;
}
