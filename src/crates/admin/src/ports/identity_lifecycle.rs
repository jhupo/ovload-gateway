//! Transaction authority for independent registration and identity mutation.

use async_trait::async_trait;
use ovload_core::access::{TenantId, UserId};
use secrecy::SecretString;

use crate::model::{
    identity_access::{
        IdentityCredential, IdentityError, IdentityManagementActor, IdentityResult, IdentitySession,
    },
    identity_lifecycle::*,
};

#[async_trait]
pub trait IdentityLifecycleStore: Send + Sync {
    async fn verify_human(
        &self,
        _secret: &str,
        _token: &str,
        _hostname: &str,
    ) -> IdentityResult<()> {
        Err(IdentityError::Unavailable)
    }
    async fn security_document(
        &self,
        session: Option<&IdentitySession>,
    ) -> IdentityResult<crate::model::identity_security::SecurityDocument> {
        if session.is_some() {
            return Err(IdentityError::Unavailable);
        }
        Ok(crate::model::identity_security::SecurityDocument {
            revision: 1,
            policy: Default::default(),
            encrypted: Vec::new(),
        })
    }
    async fn save_security(
        &self,
        _session: &IdentitySession,
        _document: crate::model::identity_security::SecurityDocument,
    ) -> IdentityResult<()> {
        Err(IdentityError::Unavailable)
    }
    async fn claim_audit_notification(
        &self,
    ) -> IdentityResult<Option<(uuid::Uuid, String, String)>> {
        Ok(None)
    }
    async fn finish_audit_notification(&self, _id: uuid::Uuid) -> IdentityResult<()> {
        Ok(())
    }
    async fn save_oauth(&self, attempt: OAuthAttempt) -> IdentityResult<()>;
    async fn take_oauth(&self, state: [u8; 32], browser: [u8; 32]) -> IdentityResult<Vec<u8>>;
    async fn external_credential(
        &self,
        provider: &str,
        subject: &str,
    ) -> IdentityResult<Option<IdentityCredential>>;
    async fn claim_notification(&self) -> IdentityResult<Option<PendingIdentityNotification>>;
    async fn finish_notification(
        &self,
        id: uuid::Uuid,
        lease: uuid::Uuid,
        delivered: bool,
    ) -> IdentityResult<()>;
    async fn registration_policy(&self) -> IdentityResult<RegistrationPolicy>;
    async fn management_policy(
        &self,
        actor: IdentityManagementActor,
    ) -> IdentityResult<RegistrationPolicy>;
    async fn update_policy(
        &self,
        actor: IdentityManagementActor,
        policy: RegistrationPolicy,
    ) -> IdentityResult<RegistrationPolicy>;
    async fn register(
        &self,
        registration: PreparedRegistration,
        challenge: Option<LifecycleChallenge>,
    ) -> IdentityResult<()>;
    async fn request_password_reset(
        &self,
        email: String,
        challenge: LifecycleChallenge,
    ) -> IdentityResult<()>;
    async fn challenge(
        &self,
        purpose: ChallengePurpose,
        digest: [u8; 32],
    ) -> IdentityResult<ChallengeRecord>;
    async fn consume_registration(
        &self,
        challenge: ChallengeRecord,
        registration: PreparedRegistration,
    ) -> IdentityResult<()>;
    async fn consume_password_reset(
        &self,
        challenge: ChallengeRecord,
        password_hash: SecretString,
    ) -> IdentityResult<()>;
    async fn credential(&self, current: &IdentitySession) -> IdentityResult<LifecycleCredential>;
    async fn change_password(
        &self,
        current: &IdentitySession,
        expected_revision: u64,
        verified_hash: SecretString,
        new_hash: SecretString,
    ) -> IdentityResult<()>;
    async fn update_profile(
        &self,
        current: &IdentitySession,
        command: UpdateOwnProfile,
    ) -> IdentityResult<CustomerAccountRecord>;
    async fn update_customer(
        &self,
        actor: IdentityManagementActor,
        command: PreparedCustomerAccountUpdate,
    ) -> IdentityResult<CustomerAccountRecord>;
    async fn profile(&self, current: &IdentitySession) -> IdentityResult<CustomerAccountRecord>;
    async fn customer(
        &self,
        actor: IdentityManagementActor,
        tenant: TenantId,
        user: UserId,
    ) -> IdentityResult<CustomerAccountRecord>;
}
