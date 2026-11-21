//! Explicit credentials and owners used by execution contract fixtures.

use std::{
    collections::BTreeMap,
    sync::{Arc, Mutex},
};

use futures::FutureExt as _;
use ovload_core::{
    access::{TenantId, UserId},
    engine::{
        authentication::{
            ClientAuthenticationRequest, ModelKeyAuthority, ModelKeyAuthorityError,
            ModelKeyExecutionGuard, ModelKeyIdentity, model_key_digest,
        },
        execution::{AuthenticatedClient, ClientAuthenticationError, ExecutionService},
    },
    policy::ClientApiKeyId,
};

pub fn identity(key_id: &str) -> ModelKeyIdentity {
    ModelKeyIdentity {
        key_id: ClientApiKeyId::new(key_id).expect("fixture key ID"),
        tenant_id: TenantId::new(uuid::Uuid::from_u128(1)),
        user_id: UserId::new(uuid::Uuid::from_u128(2)),
        key_generation: 1,
        user_generation: 1,
        tenant_generation: 1,
    }
}

pub struct FixtureAuthority {
    keys: Mutex<BTreeMap<ClientApiKeyId, ([u8; 32], ModelKeyIdentity)>>,
    limits: Mutex<BTreeMap<ClientApiKeyId, ovload_core::policy::RateLimits>>,
}

impl Default for FixtureAuthority {
    fn default() -> Self {
        Self::new([
            ("key_start_test", "sk_start_test"),
            ("key_usage_test", "sk_usage_test"),
            ("parent", "sk_parent"),
            ("child", "sk_child"),
        ])
    }
}

impl FixtureAuthority {
    pub fn new<'a>(keys: impl IntoIterator<Item = (&'a str, &'a str)>) -> Self {
        Self {
            limits: Mutex::default(),
            keys: Mutex::new(
                keys.into_iter()
                    .map(|(id, secret)| {
                        let owner = identity(id);
                        (owner.key_id.clone(), (model_key_digest(secret), owner))
                    })
                    .collect(),
            ),
        }
    }

    // This helper is consumed by a subset of the test executables that include this module.
    #[allow(dead_code)]
    pub fn revoke(&self, key_id: &str) {
        self.keys
            .lock()
            .unwrap()
            .remove(&ClientApiKeyId::new(key_id).unwrap());
    }

    #[allow(dead_code)]
    pub fn set_admission_limits(&self, key_id: &str, limits: ovload_core::policy::RateLimits) {
        self.limits
            .lock()
            .unwrap()
            .insert(ClientApiKeyId::new(key_id).unwrap(), limits);
    }

    #[allow(dead_code)]
    pub fn with_admission_limits(
        self,
        key_id: &str,
        limits: ovload_core::policy::RateLimits,
    ) -> Self {
        self.set_admission_limits(key_id, limits);
        self
    }
}

#[async_trait::async_trait]
impl ModelKeyAuthority for FixtureAuthority {
    async fn authenticate(
        &self,
        digest: [u8; 32],
    ) -> Result<ModelKeyIdentity, ModelKeyAuthorityError> {
        self.keys
            .lock()
            .unwrap()
            .values()
            .find(|(stored, _)| stored == &digest)
            .map(|(_, owner)| owner.clone())
            .ok_or(ModelKeyAuthorityError::InvalidKey)
    }

    async fn resolve(
        &self,
        key_id: &ClientApiKeyId,
    ) -> Result<ModelKeyIdentity, ModelKeyAuthorityError> {
        self.keys
            .lock()
            .unwrap()
            .get(key_id)
            .map(|(_, owner)| owner.clone())
            .ok_or(ModelKeyAuthorityError::InvalidKey)
    }

    async fn revalidate(&self, owner: &ModelKeyIdentity) -> Result<(), ModelKeyAuthorityError> {
        match self.keys.lock().unwrap().get(&owner.key_id) {
            Some((_, current)) if current == owner => Ok(()),
            _ => Err(ModelKeyAuthorityError::InvalidKey),
        }
    }

    async fn admission_limits(
        &self,
        owner: &ModelKeyIdentity,
    ) -> Result<ovload_core::engine::admission::ModelKeyAdmissionLimits, ModelKeyAuthorityError>
    {
        self.revalidate(owner).await?;
        let key = self
            .limits
            .lock()
            .unwrap()
            .get(&owner.key_id)
            .copied()
            .unwrap_or(ovload_core::policy::RateLimits {
                max_concurrency: 10_000,
                requests_per_minute: 1_000_000,
            });
        Ok(ovload_core::engine::admission::ModelKeyAdmissionLimits {
            group_requests_per_minute: 0,
            tenant: ovload_core::policy::RateLimits {
                max_concurrency: 100_000,
                requests_per_minute: 10_000_000,
            },
            user: ovload_core::policy::RateLimits {
                max_concurrency: 100_000,
                requests_per_minute: 10_000_000,
            },
            key,
        })
    }
}

// These helpers are consumed by the provider test executables that include this module.
#[allow(dead_code)]
pub fn guard(key_id: &str) -> ModelKeyExecutionGuard {
    ModelKeyExecutionGuard::new(
        Arc::new(FixtureAuthority::new([(key_id, "fixture-secret")])),
        identity(key_id),
    )
}

#[allow(dead_code)]
pub fn authorize_context(
    context: ovload_core::engine::RequestAttemptContext,
) -> ovload_core::engine::RequestAttemptContext {
    let owner = guard(context.client_api_key_ref().as_str());
    context.with_model_key_authority(owner)
}

pub trait FixtureAuthenticate: ExecutionService {
    fn authenticate_fixture(
        &self,
        secret: &str,
    ) -> Result<AuthenticatedClient, ClientAuthenticationError> {
        self.authenticate_request(
            ClientAuthenticationRequest::bearer(secret).expect("fixture bearer"),
        )
        .now_or_never()
        .expect("fixture authentication completes without waiting")
    }
}

impl<T: ExecutionService + ?Sized> FixtureAuthenticate for T {}
