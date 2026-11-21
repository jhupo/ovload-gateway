//! Fail-closed identity port for unrelated imported control-plane fixtures.

use async_trait::async_trait;
use ovload_admin::{
    model::{
        identity::CustomerUserRecord,
        identity_access::{
            CustomerDirectoryQuery, CustomerIdentityPage, IdentityAudience, IdentityCredential,
            IdentityManagementActor, IdentityOwner, IdentityResult, IdentitySession,
            NewCustomerIdentity, NewIdentitySession, SetCustomerActive,
        },
    },
    ports::identity::IdentityStore,
};
use ovload_core::access::{ManagementPrincipalId, TenantId, UserId};
use secrecy::SecretString;
use std::net::IpAddr;

#[async_trait]
impl IdentityStore for super::TestPluginPorts {
    async fn bootstrap_owner(
        &self,
        _: &str,
        _: SecretString,
    ) -> IdentityResult<ManagementPrincipalId> {
        Err(ovload_admin::model::identity_access::IdentityError::Unavailable)
    }
    async fn consume_auth_attempt(&self, _: IpAddr, _: [u8; 32]) -> IdentityResult<()> {
        Err(ovload_admin::model::identity_access::IdentityError::Unavailable)
    }
    async fn login_credential(
        &self,
        _: IdentityAudience,
        _: &str,
    ) -> IdentityResult<Option<IdentityCredential>> {
        Err(ovload_admin::model::identity_access::IdentityError::Unavailable)
    }
    async fn record_authentication_failure(&self, _: Option<IdentityOwner>) -> IdentityResult<()> {
        Err(ovload_admin::model::identity_access::IdentityError::Unavailable)
    }
    async fn create_session(&self, _: NewIdentitySession) -> IdentityResult<()> {
        Err(ovload_admin::model::identity_access::IdentityError::Unavailable)
    }
    async fn session(
        &self,
        _: IdentityAudience,
        _: [u8; 32],
    ) -> IdentityResult<Option<IdentitySession>> {
        Err(ovload_admin::model::identity_access::IdentityError::Unavailable)
    }
    async fn revoke_session(&self, _: &IdentitySession) -> IdentityResult<()> {
        Err(ovload_admin::model::identity_access::IdentityError::Unavailable)
    }
    async fn customer_profile(&self, _: &IdentitySession) -> IdentityResult<CustomerUserRecord> {
        Err(ovload_admin::model::identity_access::IdentityError::Unavailable)
    }
    async fn provision_customer(
        &self,
        _: IdentityManagementActor,
        _: NewCustomerIdentity,
    ) -> IdentityResult<CustomerUserRecord> {
        Err(ovload_admin::model::identity_access::IdentityError::Unavailable)
    }
    async fn customer(
        &self,
        _: IdentityManagementActor,
        _: TenantId,
        _: UserId,
    ) -> IdentityResult<CustomerUserRecord> {
        Err(ovload_admin::model::identity_access::IdentityError::Unavailable)
    }
    async fn customers(
        &self,
        _: IdentityManagementActor,
        _: CustomerDirectoryQuery,
    ) -> IdentityResult<CustomerIdentityPage> {
        Err(ovload_admin::model::identity_access::IdentityError::Unavailable)
    }
    async fn set_customer_active(
        &self,
        _: IdentityManagementActor,
        _: SetCustomerActive,
    ) -> IdentityResult<CustomerUserRecord> {
        Err(ovload_admin::model::identity_access::IdentityError::Unavailable)
    }
}
