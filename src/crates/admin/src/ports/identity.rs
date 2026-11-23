//! Durable operations own authorization and revocation ordering in one transaction.

use async_trait::async_trait;
use ovload_core::access::{ManagementPrincipalId, TenantId, UserId};
use secrecy::SecretString;
use std::net::IpAddr;

use crate::model::{
    identity::CustomerUserRecord,
    identity_access::{
        CustomerDirectoryQuery, CustomerIdentityPage, IdentityAudience, IdentityCredential,
        IdentityManagementActor, IdentityOwner, IdentityResult, IdentitySession,
        NewCustomerIdentity, NewIdentitySession, SetCustomerActive,
    },
};

#[async_trait]
pub trait IdentityStore: Send + Sync {
    async fn security_policy(
        &self,
    ) -> IdentityResult<crate::model::identity_security::SecurityPolicy> {
        Ok(Default::default())
    }
    async fn authentication_result(
        &self,
        _source: IpAddr,
        _account: [u8; 32],
        _success: bool,
    ) -> IdentityResult<()> {
        Ok(())
    }
    async fn step_up(&self, _session: &IdentitySession, _verified: bool) -> IdentityResult<bool> {
        Ok(true)
    }
    async fn rotate_admin_key(
        &self,
        _s: &IdentitySession,
        _c: NewIdentitySession,
    ) -> IdentityResult<()> {
        Err(crate::model::identity_access::IdentityError::Unavailable)
    }
    async fn admin_key_status(
        &self,
        _session: &IdentitySession,
    ) -> IdentityResult<crate::model::identity_security::AdminKeyStatus> {
        Err(crate::model::identity_access::IdentityError::Unavailable)
    }
    async fn revoke_admin_key(&self, _session: &IdentitySession) -> IdentityResult<()> {
        Err(crate::model::identity_access::IdentityError::Unavailable)
    }
    /// Exactly one explicit first-owner bootstrap; never overwrite an owner.
    async fn bootstrap_owner(
        &self,
        username: &str,
        password_hash: SecretString,
    ) -> IdentityResult<ManagementPrincipalId>;
    /// All three durable fixed-minute budgets are consumed before credential lookup.
    async fn consume_auth_attempt(
        &self,
        source: IpAddr,
        account_digest: [u8; 32],
    ) -> IdentityResult<()>;
    async fn login_credential(
        &self,
        audience: IdentityAudience,
        login: &str,
    ) -> IdentityResult<Option<IdentityCredential>>;
    async fn record_authentication_failure(
        &self,
        owner: Option<IdentityOwner>,
    ) -> IdentityResult<()>;
    /// Lock and revalidate the owner before inserting. Customer browsers have a ten-session cap.
    async fn create_session(&self, command: NewIdentitySession) -> IdentityResult<()>;
    /// Revalidate owner/tenant status and authority generation, never use a snapshot.
    async fn session(
        &self,
        audience: IdentityAudience,
        access_digest: [u8; 32],
    ) -> IdentityResult<Option<IdentitySession>>;
    /// Logout revokes only the authenticated current session.
    async fn revoke_session(&self, current: &IdentitySession) -> IdentityResult<()>;
    async fn customer_profile(
        &self,
        current: &IdentitySession,
    ) -> IdentityResult<CustomerUserRecord>;
    /// Permission, explicit tenant scope, generation and status are checked in the transaction.
    async fn provision_customer(
        &self,
        actor: IdentityManagementActor,
        command: NewCustomerIdentity,
    ) -> IdentityResult<CustomerUserRecord>;
    async fn customer(
        &self,
        actor: IdentityManagementActor,
        tenant_id: TenantId,
        user_id: UserId,
    ) -> IdentityResult<CustomerUserRecord>;
    async fn customers(
        &self,
        actor: IdentityManagementActor,
        query: CustomerDirectoryQuery,
    ) -> IdentityResult<CustomerIdentityPage>;
    /// Suspension and session revocation commit together, serialized with login.
    async fn set_customer_active(
        &self,
        actor: IdentityManagementActor,
        command: SetCustomerActive,
    ) -> IdentityResult<CustomerUserRecord>;
}
