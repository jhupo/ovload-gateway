//! Live platform-operator authority and explicit offline provisioning.

use std::sync::Arc;

use argon2::{Argon2, PasswordHasher as _};
use ovload_core::access::Permission;
use secrecy::{ExposeSecret as _, SecretString};
use tokio::sync::Semaphore;

use crate::{
    model::{
        identity_access::{
            IdentityError, IdentityManagementActor, IdentityOwner, IdentityResult, IdentitySession,
        },
        management_security::{GrantRecord, PrincipalRecord, SecurityScope, validate_text},
    },
    ports::management_security::ManagementSecurityStore,
};

pub struct ManagementSecurityService {
    store: Arc<dyn ManagementSecurityStore>,
    password_capacity: Arc<Semaphore>,
}

impl ManagementSecurityService {
    pub fn new(store: Arc<dyn ManagementSecurityStore>) -> Self {
        Self {
            store,
            password_capacity: Arc::new(Semaphore::new(4)),
        }
    }

    pub async fn provision_operator(
        &self,
        username: String,
        password: SecretString,
    ) -> IdentityResult<PrincipalRecord> {
        validate_text(&username, 128)?;
        let password_hash = self.hash_new_password(password).await?;
        self.store.provision_operator(username, password_hash).await
    }

    pub async fn authorize_platform(
        &self,
        session: &IdentitySession,
        permission: Permission,
    ) -> IdentityResult<()> {
        self.store
            .authorize(actor(session)?, permission, SecurityScope::Platform)
            .await
    }

    pub async fn permissions(&self, session: &IdentitySession) -> IdentityResult<Vec<GrantRecord>> {
        self.store.effective_grants(actor(session)?).await
    }

    pub async fn own_profile(&self, session: &IdentitySession) -> IdentityResult<PrincipalRecord> {
        self.store.own_profile(actor(session)?).await
    }

    async fn hash_new_password(&self, password: SecretString) -> IdentityResult<SecretString> {
        if !(12..=256).contains(&password.expose_secret().len())
            || password.expose_secret().chars().any(char::is_control)
        {
            return Err(IdentityError::Invalid);
        }
        let permit = self
            .password_capacity
            .clone()
            .try_acquire_owned()
            .map_err(|_| IdentityError::RateLimited)?;
        tokio::task::spawn_blocking(move || {
            let _permit = permit;
            Argon2::default()
                .hash_password(password.expose_secret().as_bytes())
                .map(|hash| SecretString::from(hash.to_string()))
                .map_err(|_| IdentityError::Unavailable)
        })
        .await
        .map_err(|_| IdentityError::Unavailable)?
    }
}

fn actor(session: &IdentitySession) -> IdentityResult<IdentityManagementActor> {
    let IdentityOwner::Management(principal_id) = session.owner else {
        return Err(IdentityError::Forbidden);
    };
    Ok(IdentityManagementActor {
        session_id: session.id,
        principal_id,
        authority_generation: session.authority_generation,
    })
}
