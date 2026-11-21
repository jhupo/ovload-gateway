//! Explicit browser-management authority for imported resource fixtures.

use async_trait::async_trait;
use chrono::{Duration, Utc};
use ovload_admin::{
    model::{identity_access::*, management_security::*},
    ports::management_security::ManagementSecurityStore,
};
use ovload_core::access::{AccessSessionId, ManagementPrincipalId, Permission};
use secrecy::SecretString;
use uuid::Uuid;

use super::plugins::TestPluginPorts;

#[derive(Default)]
pub(crate) struct TestManagementAuthority {
    pub credential: Option<IdentityCredential>,
    pub sessions: std::collections::BTreeMap<AccessSessionId, NewIdentitySession>,
    pub seed: Option<IdentitySession>,
    pub denied: bool,
    pub fail_writes: bool,
}
impl TestManagementAuthority {
    pub fn live(&self, current: &IdentitySession) -> bool {
        self.credential.as_ref().is_some_and(|c| {
            c.owner == current.owner && c.authority_generation == current.authority_generation
        }) && current.expires_at > Utc::now()
            && (self.sessions.get(&current.id).is_some_and(|s| {
                s.session.owner == current.owner
                    && s.session.authority_generation == current.authority_generation
                    && s.session.expires_at > Utc::now()
            }) || self.seed.as_ref().is_some_and(|s| {
                s.id == current.id
                    && s.owner == current.owner
                    && s.authority_generation == current.authority_generation
                    && s.expires_at > Utc::now()
            }))
    }
}

pub(crate) const ORIGIN: &str = "https://gateway.example.test";
pub(crate) const TOKEN: &str = "AAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAA";
pub(crate) const COOKIE: &str =
    "__Host-ovload_management=AAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAA";

pub(crate) fn csrf() -> String {
    ovload_admin::IdentityService::csrf_token(TOKEN).expect("fixture token is canonical")
}
pub(super) fn session() -> IdentitySession {
    IdentitySession {
        id: AccessSessionId::new(Uuid::from_u128(2)),
        owner: IdentityOwner::Management(ManagementPrincipalId::new(Uuid::from_u128(1))),
        authority_generation: 1,
        expires_at: Utc::now() + Duration::hours(1),
    }
}

pub(crate) trait TestBrowserRouter {
    fn with_browser_policy(self) -> Self;
}
impl<S: Clone + Send + Sync + 'static> TestBrowserRouter for axum::Router<S> {
    fn with_browser_policy(self) -> Self {
        ovload_api::admin::browser_router(self, ORIGIN.to_owned())
    }
}

#[async_trait]
impl ManagementSecurityStore for TestPluginPorts {
    async fn authorize(
        &self,
        actor: IdentityManagementActor,
        _: Permission,
        scope: SecurityScope,
    ) -> IdentityResult<()> {
        let state = self
            .management_authority
            .lock()
            .expect("management authority");
        let current = state
            .sessions
            .get(&actor.session_id)
            .map(|s| &s.session)
            .or(state.seed.as_ref())
            .ok_or(IdentityError::Unauthorized)?;
        if current.id != actor.session_id
            || current.owner != IdentityOwner::Management(actor.principal_id)
            || current.authority_generation != actor.authority_generation
            || !state.live(current)
        {
            return Err(IdentityError::Unauthorized);
        }
        if state.denied || !matches!(scope, SecurityScope::Platform) {
            return Err(IdentityError::Forbidden);
        }
        Ok(())
    }
    async fn own_profile(&self, actor: IdentityManagementActor) -> IdentityResult<PrincipalRecord> {
        let state = self
            .management_authority
            .lock()
            .expect("management authority");
        let current = state
            .sessions
            .get(&actor.session_id)
            .map(|s| &s.session)
            .or(state.seed.as_ref())
            .ok_or(IdentityError::Unauthorized)?;
        if current.id != actor.session_id
            || current.owner != IdentityOwner::Management(actor.principal_id)
            || !state.live(current)
        {
            return Err(IdentityError::Unauthorized);
        }
        Ok(PrincipalRecord {
            id: actor.principal_id,
            username: "admin_1".to_owned(),
            status: "active".to_owned(),
            revision: current.authority_generation,
            created_at: chrono::DateTime::UNIX_EPOCH,
            updated_at: chrono::DateTime::UNIX_EPOCH,
        })
    }
    async fn provision_operator(
        &self,
        _: String,
        _: SecretString,
    ) -> IdentityResult<PrincipalRecord> {
        Err(IdentityError::Unavailable)
    }
    async fn effective_grants(
        &self,
        _: IdentityManagementActor,
    ) -> IdentityResult<Vec<GrantRecord>> {
        Err(IdentityError::Unavailable)
    }
}
