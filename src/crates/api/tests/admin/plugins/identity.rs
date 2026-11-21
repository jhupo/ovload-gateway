//! Management-only identity authority for browser resource fixtures.

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
        Ok(())
    }
    async fn login_credential(
        &self,
        audience: IdentityAudience,
        login: &str,
    ) -> IdentityResult<Option<IdentityCredential>> {
        if audience != IdentityAudience::Management || login != "admin_1" {
            return Ok(None);
        }
        Ok(self
            .management_authority
            .lock()
            .expect("management authority")
            .credential
            .clone())
    }
    async fn record_authentication_failure(&self, _: Option<IdentityOwner>) -> IdentityResult<()> {
        Ok(())
    }
    async fn create_session(&self, command: NewIdentitySession) -> IdentityResult<()> {
        use ovload_admin::model::identity_access::IdentityError;
        let mut state = self
            .management_authority
            .lock()
            .expect("management authority");
        if state.fail_writes {
            return Err(IdentityError::Unavailable);
        }
        if !state.credential.as_ref().is_some_and(|c| {
            c.owner == command.session.owner
                && c.authority_generation == command.session.authority_generation
        }) {
            return Err(IdentityError::Unauthorized);
        }
        if let Some(previous) = command.previous_session {
            state.sessions.remove(&previous);
        }
        if state.sessions.len() >= 10 {
            return Err(IdentityError::RateLimited);
        }
        state.sessions.insert(command.session.id, command);
        Ok(())
    }
    async fn session(
        &self,
        audience: IdentityAudience,
        digest: [u8; 32],
    ) -> IdentityResult<Option<IdentitySession>> {
        use sha2::{Digest as _, Sha256};
        if audience != IdentityAudience::Management {
            return Ok(None);
        }
        let state = self
            .management_authority
            .lock()
            .expect("management authority");
        if digest
            == <[u8; 32]>::from(Sha256::digest(
                super::super::identity_authority::TOKEN.as_bytes(),
            ))
        {
            return Ok(state.seed.as_ref().filter(|s| state.live(s)).cloned());
        }
        Ok(state
            .sessions
            .values()
            .find(|s| s.access_digest == digest && state.live(&s.session))
            .map(|s| s.session.clone()))
    }
    async fn revoke_session(&self, current: &IdentitySession) -> IdentityResult<()> {
        use ovload_admin::model::identity_access::IdentityError;
        let mut state = self
            .management_authority
            .lock()
            .expect("management authority");
        if !state.live(current) {
            return Err(IdentityError::Unauthorized);
        }
        state.sessions.remove(&current.id);
        if state.seed.as_ref().is_some_and(|s| s.id == current.id) {
            state.seed = None;
        }
        Ok(())
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
