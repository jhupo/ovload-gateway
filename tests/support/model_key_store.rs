//! Fail-closed model-key storage for unrelated imported control-plane fixtures.

use async_trait::async_trait;
use ovload_admin::{
    model::{
        identity_access::{IdentityError, IdentityResult, IdentitySession},
        model_keys::*,
    },
    ports::model_keys::ModelKeyStore,
};
use ovload_core::policy::ClientApiKeyId;

pub struct UnavailableModelKeyStore;

#[async_trait]
impl ModelKeyStore for UnavailableModelKeyStore {
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
        _: &IdentitySession,
        _: ModelKeyOwner,
        _: NewModelKey,
    ) -> IdentityResult<ModelKeyWrite> {
        Err(IdentityError::Unavailable)
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
    ) -> IdentityResult<ovload_admin::model::Revision> {
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
