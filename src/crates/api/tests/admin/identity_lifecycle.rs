//! Atomic credential mutation fixture for the mounted browser identity API.

use async_trait::async_trait;
use ovload_admin::{
    model::{identity_access::*, identity_lifecycle::*},
    ports::identity_lifecycle::IdentityLifecycleStore,
};
use ovload_core::access::{TenantId, UserId};
use secrecy::{ExposeSecret as _, SecretString};

#[async_trait]
impl IdentityLifecycleStore for super::plugins::TestPluginPorts {
    async fn save_oauth(&self, _: OAuthAttempt) -> IdentityResult<()> {
        Err(IdentityError::Unavailable)
    }
    async fn take_oauth(&self, _: [u8; 32], _: [u8; 32]) -> IdentityResult<Vec<u8>> {
        Err(IdentityError::Unavailable)
    }
    async fn external_credential(
        &self,
        _: &str,
        _: &str,
    ) -> IdentityResult<Option<IdentityCredential>> {
        Ok(None)
    }
    async fn claim_notification(&self) -> IdentityResult<Option<PendingIdentityNotification>> {
        Ok(None)
    }
    async fn finish_notification(
        &self,
        _: uuid::Uuid,
        _: uuid::Uuid,
        _: bool,
    ) -> IdentityResult<()> {
        Ok(())
    }
    async fn registration_policy(&self) -> IdentityResult<RegistrationPolicy> {
        Ok(RegistrationPolicy {
            revision: 1,
            agreement: LoginAgreement {
                mode: "modal".into(),
                ..LoginAgreement::default()
            },
            gift_usd: "0".into(),
            enabled_providers: vec![],
            registration_enabled: false,
            verification_required: false,
            recovery_enabled: false,
            allowed_domains: vec![],
            default_user_concurrency: 20,
            default_user_rpm: 1200,
            default_customer_concurrency: 100,
            default_customer_rpm: 6000,
        })
    }
    async fn management_policy(
        &self,
        _: IdentityManagementActor,
    ) -> IdentityResult<RegistrationPolicy> {
        Err(IdentityError::Unavailable)
    }
    async fn update_policy(
        &self,
        _: IdentityManagementActor,
        _: RegistrationPolicy,
    ) -> IdentityResult<RegistrationPolicy> {
        Err(IdentityError::Unavailable)
    }
    async fn credential(&self, current: &IdentitySession) -> IdentityResult<LifecycleCredential> {
        let state = self
            .management_authority
            .lock()
            .expect("management authority");
        if !state.live(current) {
            return Err(IdentityError::Unauthorized);
        }
        let credential = state
            .credential
            .clone()
            .ok_or(IdentityError::Unauthorized)?;
        Ok(LifecycleCredential {
            revision: credential.authority_generation,
            credential,
        })
    }
    async fn change_password(
        &self,
        current: &IdentitySession,
        expected: u64,
        verified: SecretString,
        new_hash: SecretString,
    ) -> IdentityResult<()> {
        let mut state = self
            .management_authority
            .lock()
            .expect("management authority");
        if !state.live(current) {
            return Err(IdentityError::Unauthorized);
        }
        if state.fail_writes {
            return Err(IdentityError::Unavailable);
        }
        let credential = state
            .credential
            .as_mut()
            .ok_or(IdentityError::Unauthorized)?;
        if credential.authority_generation != expected
            || credential.password_hash.expose_secret() != verified.expose_secret()
        {
            return Err(IdentityError::Conflict);
        }
        credential.password_hash = new_hash;
        credential.authority_generation += 1;
        state.sessions.clear();
        state.seed = None;
        Ok(())
    }
    async fn register(
        &self,
        _: PreparedRegistration,
        _: Option<LifecycleChallenge>,
    ) -> IdentityResult<()> {
        Err(IdentityError::Unavailable)
    }
    async fn request_password_reset(&self, _: String, _: LifecycleChallenge) -> IdentityResult<()> {
        Err(IdentityError::Unavailable)
    }
    async fn challenge(&self, _: ChallengePurpose, _: [u8; 32]) -> IdentityResult<ChallengeRecord> {
        Err(IdentityError::Unavailable)
    }
    async fn consume_registration(
        &self,
        _: ChallengeRecord,
        _: PreparedRegistration,
    ) -> IdentityResult<()> {
        Err(IdentityError::Unavailable)
    }
    async fn consume_password_reset(
        &self,
        _: ChallengeRecord,
        _: SecretString,
    ) -> IdentityResult<()> {
        Err(IdentityError::Unavailable)
    }
    async fn update_profile(
        &self,
        _: &IdentitySession,
        _: UpdateOwnProfile,
    ) -> IdentityResult<CustomerAccountRecord> {
        Err(IdentityError::Unavailable)
    }
    async fn update_customer(
        &self,
        _: IdentityManagementActor,
        _: PreparedCustomerAccountUpdate,
    ) -> IdentityResult<CustomerAccountRecord> {
        Err(IdentityError::Unavailable)
    }
    async fn profile(&self, _: &IdentitySession) -> IdentityResult<CustomerAccountRecord> {
        Err(IdentityError::Unavailable)
    }
    async fn customer(
        &self,
        _: IdentityManagementActor,
        _: TenantId,
        _: UserId,
    ) -> IdentityResult<CustomerAccountRecord> {
        Err(IdentityError::Unavailable)
    }
}
