//! Unavailable identity adapters for unrelated service fixtures.
use async_trait::async_trait;
use ovload_admin::{
    model::{identity_access::*, identity_lifecycle::*, management_security::*},
    ports::{
        identity_lifecycle::IdentityLifecycleStore, management_security::ManagementSecurityStore,
    },
};
use ovload_core::access::Permission;
use secrecy::SecretString;

pub struct UnavailableIdentityStores;

#[async_trait]
impl ovload_admin::ports::profile_avatar::ProfileAvatarStore for UnavailableIdentityStores {
    async fn read(
        &self,
        _: &IdentitySession,
    ) -> IdentityResult<ovload_admin::model::profile_avatar::ProfileAvatar> {
        Err(IdentityError::Unavailable)
    }

    async fn replace(
        &self,
        _: &IdentitySession,
        _: u64,
        _: Option<ovload_admin::model::image_asset::ImageAsset>,
    ) -> IdentityResult<ovload_admin::model::profile_avatar::ProfileAvatar> {
        Err(IdentityError::Unavailable)
    }
}

#[async_trait]
impl ovload_admin::ports::site_settings::SiteSettingsStore for UnavailableIdentityStores {
    async fn public_get(&self) -> IdentityResult<ovload_admin::model::site_settings::SiteSettings> {
        Err(IdentityError::Unavailable)
    }

    async fn get(
        &self,
        _: IdentityManagementActor,
    ) -> IdentityResult<ovload_admin::model::site_settings::SiteSettings> {
        Err(IdentityError::Unavailable)
    }

    async fn update(
        &self,
        _: IdentityManagementActor,
        _: u64,
        _: ovload_admin::model::site_settings::UpdateSiteSettings,
    ) -> IdentityResult<ovload_admin::model::site_settings::SiteSettings> {
        Err(IdentityError::Unavailable)
    }

    async fn replace_logo(
        &self,
        _: IdentityManagementActor,
        _: u64,
        _: Option<ovload_admin::model::image_asset::ImageAsset>,
    ) -> IdentityResult<ovload_admin::model::site_settings::SiteSettings> {
        Err(IdentityError::Unavailable)
    }
}

#[async_trait]
impl ovload_admin::ports::customer_usage::CustomerUsageStore for UnavailableIdentityStores {
    async fn list(
        &self,
        _: &IdentitySession,
        _: &ovload_admin::model::customer_usage::CustomerUsageFilter,
        _: Option<ovload_core::engine::ModelRequestId>,
        _: u16,
    ) -> IdentityResult<ovload_admin::model::customer_usage::CustomerUsagePage> {
        Err(IdentityError::Unavailable)
    }
    async fn get(
        &self,
        _: &IdentitySession,
        _: &ovload_core::engine::ModelRequestId,
    ) -> IdentityResult<ovload_admin::model::customer_usage::CustomerUsageRecord> {
        Err(IdentityError::Unavailable)
    }
    async fn summary(
        &self,
        _: &IdentitySession,
        _: &ovload_admin::model::customer_usage::CustomerUsageFilter,
    ) -> IdentityResult<ovload_admin::model::customer_usage::CustomerUsageSummary> {
        Err(IdentityError::Unavailable)
    }
    async fn trend(
        &self,
        _: &IdentitySession,
        _: &ovload_admin::model::customer_usage::CustomerUsageFilter,
    ) -> IdentityResult<Vec<ovload_admin::model::customer_usage::CustomerUsageDay>> {
        Err(IdentityError::Unavailable)
    }
    async fn export(
        &self,
        _: &IdentitySession,
        _: &ovload_admin::model::customer_usage::CustomerUsageFilter,
    ) -> IdentityResult<Vec<ovload_admin::model::customer_usage::CustomerUsageRecord>> {
        Err(IdentityError::Unavailable)
    }
}

#[async_trait]
impl ManagementSecurityStore for UnavailableIdentityStores {
    async fn own_profile(&self, _: IdentityManagementActor) -> IdentityResult<PrincipalRecord> {
        Err(IdentityError::Unavailable)
    }
    async fn provision_operator(
        &self,
        _: String,
        _: SecretString,
    ) -> IdentityResult<PrincipalRecord> {
        Err(IdentityError::Unavailable)
    }
    async fn authorize(
        &self,
        _: IdentityManagementActor,
        _: Permission,
        _: SecurityScope,
    ) -> IdentityResult<()> {
        Err(IdentityError::Unavailable)
    }
    async fn effective_grants(
        &self,
        _: IdentityManagementActor,
    ) -> IdentityResult<Vec<GrantRecord>> {
        Err(IdentityError::Unavailable)
    }
}

#[async_trait]
impl IdentityLifecycleStore for UnavailableIdentityStores {
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
        Err(IdentityError::Unavailable)
    }
    async fn claim_notification(&self) -> IdentityResult<Option<PendingIdentityNotification>> {
        Err(IdentityError::Unavailable)
    }
    async fn finish_notification(
        &self,
        _: uuid::Uuid,
        _: uuid::Uuid,
        _: bool,
    ) -> IdentityResult<()> {
        Err(IdentityError::Unavailable)
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
    async fn customer(
        &self,
        _: IdentityManagementActor,
        _: ovload_core::access::TenantId,
        _: ovload_core::access::UserId,
    ) -> IdentityResult<CustomerAccountRecord> {
        Err(IdentityError::Unavailable)
    }

    async fn registration_policy(&self) -> IdentityResult<RegistrationPolicy> {
        Err(IdentityError::Unavailable)
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
    async fn credential(&self, _: &IdentitySession) -> IdentityResult<LifecycleCredential> {
        Err(IdentityError::Unavailable)
    }
    async fn change_password(
        &self,
        _: &IdentitySession,
        _: u64,
        _: SecretString,
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
}
