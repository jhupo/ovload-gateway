//! Live management authority and explicit offline operator provisioning.

use async_trait::async_trait;
use ovload_core::access::Permission;
use secrecy::SecretString;

use crate::model::{
    identity_access::{IdentityManagementActor, IdentityResult},
    management_security::{GrantRecord, PrincipalRecord, SecurityScope},
};

#[async_trait]
pub trait ManagementSecurityStore: Send + Sync {
    async fn own_profile(&self, actor: IdentityManagementActor) -> IdentityResult<PrincipalRecord>;
    /// Requires an existing first owner and is never HTTP-accessible.
    async fn provision_operator(
        &self,
        username: String,
        password_hash: SecretString,
    ) -> IdentityResult<PrincipalRecord>;
    async fn authorize(
        &self,
        actor: IdentityManagementActor,
        permission: Permission,
        scope: SecurityScope,
    ) -> IdentityResult<()>;
    async fn effective_grants(
        &self,
        actor: IdentityManagementActor,
    ) -> IdentityResult<Vec<GrantRecord>>;
}
