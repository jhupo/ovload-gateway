//! Read-only procurement-budget access after durable credential authentication.

use std::sync::Arc;

use async_trait::async_trait;
use ovload_core::{
    engine::{
        budget::ClientBudgetStatus,
        execution::{ClientAuthenticationError, ClientKeyVerifier},
    },
    policy::ClientApiKeyId,
};

use crate::{
    model::{AdminError, AdminErrorKind},
    ports::store::ClientKeyStore,
};

#[async_trait]
pub trait KeyUsageService: Send + Sync {
    async fn budget(&self, plaintext: &str) -> Result<Option<ClientBudgetStatus>, AdminError>;
    async fn budget_for_client(
        &self,
        id: &ClientApiKeyId,
    ) -> Result<Option<ClientBudgetStatus>, AdminError>;
}

pub(crate) struct DefaultKeyUsageService {
    verifier: Arc<dyn ClientKeyVerifier>,
    keys: Arc<dyn ClientKeyStore>,
}

impl DefaultKeyUsageService {
    pub(crate) fn new(verifier: Arc<dyn ClientKeyVerifier>, keys: Arc<dyn ClientKeyStore>) -> Self {
        Self { verifier, keys }
    }
}

#[async_trait]
impl KeyUsageService for DefaultKeyUsageService {
    async fn budget(&self, plaintext: &str) -> Result<Option<ClientBudgetStatus>, AdminError> {
        let id = match self.verifier.verify_client_key(plaintext).await {
            Ok(id) => id,
            Err(ClientAuthenticationError::InvalidKey) => return Ok(None),
            Err(
                ClientAuthenticationError::SnapshotUnavailable
                | ClientAuthenticationError::ProviderUnavailable
                | ClientAuthenticationError::AuthorityUnavailable,
            ) => {
                return Err(AdminError::new(
                    AdminErrorKind::Unavailable,
                    "Key authority is unavailable",
                ));
            }
        };
        self.budget_for_client(&id).await
    }

    async fn budget_for_client(
        &self,
        id: &ClientApiKeyId,
    ) -> Result<Option<ClientBudgetStatus>, AdminError> {
        self.keys
            .get_client_key(id)
            .await
            .map(|key| key.filter(|key| key.enabled).map(|key| key.budget))
            .map_err(|error| super::map_store_error(error, "key usage budget"))
    }
}
