//! Shared HTTP upstream provider for OpenAI-compatible accounts.

mod adapter;
mod admin;
mod execution;
mod health;
mod metering;
mod native;
mod network;
mod outbound;
mod pricing;
mod provider_adapter;
mod request;
mod scheduler;

use async_trait::async_trait;
use futures::{StreamExt, TryStreamExt};
use ovload_admin::ports::provider::ProviderAdmin;
use ovload_core::{
    account::{OpaqueProviderData, ProviderAccount, ProviderAccountId},
    engine::provider::{AccountScheduler, Provider},
    error::{ProviderError, ProviderErrorKind},
    operation::OperationKind,
    provider_ports::ProviderStorePorts,
    routing::{
        ModelCapabilities, ProviderCatalogGeneration, ProviderKind, ProviderModelCapabilities,
        UpstreamModelId,
    },
    upstream::UpstreamSendState,
};
use serde::{Deserialize, Serialize};
use serde_json::{Map, Value};
use std::{
    collections::BTreeMap,
    sync::{
        Arc,
        atomic::{AtomicU64, Ordering},
    },
};
use tokio::sync::{Mutex, Semaphore};

use provider_adapter::ProviderAdapter;

const MAX_CACHED_CATALOGS: usize = 2_048;
const MAX_MODELS: usize = 2_048;

pub struct HttpProviderBundle {
    provider: Arc<PublicApiProvider>,
}

impl HttpProviderBundle {
    #[must_use]
    pub fn core_provider(&self) -> Arc<dyn Provider> {
        self.provider.clone()
    }

    #[must_use]
    pub fn admin_provider(&self) -> Arc<dyn ProviderAdmin> {
        self.provider.clone()
    }
}

#[derive(Debug, thiserror::Error)]
#[error("invalid HTTP provider registration")]
pub struct HttpProviderInitializeError;

/// Native Claude/Gemini accounts share scheduling, encrypted storage and billing.
pub fn initialize_http_provider(
    provider: &str,
    ports: ProviderStorePorts,
) -> Result<HttpProviderBundle, HttpProviderInitializeError> {
    let adapter = ProviderAdapter::parse(provider).ok_or(HttpProviderInitializeError)?;
    let kind = adapter.provider_kind();
    Ok(HttpProviderBundle {
        provider: Arc::new(PublicApiProvider {
            adapter,
            kind,
            ports,
            generation: AtomicU64::new(1),
            catalogs: Mutex::new(BTreeMap::new()),
            network_capacity: Arc::new(Semaphore::new(128)),
            catalog_capacity: Semaphore::new(4),
            waiting: ovload_core::concurrency::ConcurrencyWaitQueue::default(),
        }),
    })
}

struct PublicApiProvider {
    adapter: ProviderAdapter,
    kind: ProviderKind,
    ports: ProviderStorePorts,
    generation: AtomicU64,
    catalogs: Mutex<BTreeMap<ProviderAccountId, Catalog>>,
    network_capacity: Arc<Semaphore>,
    catalog_capacity: Semaphore,
    waiting: ovload_core::concurrency::ConcurrencyWaitQueue<ProviderAccountId>,
}

#[derive(Clone)]
struct Catalog {
    revision: ovload_core::account::CredentialRevision,
    egress: String,
    models: Vec<UpstreamModelId>,
    observed_at: chrono::DateTime<chrono::Utc>,
    expires_at: std::time::Instant,
}

#[derive(Deserialize, Serialize)]
#[serde(deny_unknown_fields)]
struct Credential {
    schema_version: u32,
    api_key: String,
    base_url: String,
    #[serde(default, skip_serializing_if = "Option::is_none")]
    oauth: Option<native::oauth::Tokens>,
}

impl Credential {
    fn decode(fields: &Map<String, Value>) -> Result<Self, ProviderError> {
        let material: Self =
            serde_json::from_value(Value::Object(fields.clone())).map_err(|_| {
                error(
                    ProviderErrorKind::ProviderInfrastructureUnavailable,
                    UpstreamSendState::NotSent,
                )
            })?;
        material.validate().map_err(|_| {
            error(
                ProviderErrorKind::ProviderInfrastructureUnavailable,
                UpstreamSendState::NotSent,
            )
        })?;
        Ok(material)
    }

    fn validate(&self) -> Result<(), ()> {
        if self.schema_version != 1
            || self.api_key.is_empty()
            || self.api_key.len() > 16_384
            || self.api_key.trim() != self.api_key
            || !self.api_key.is_ascii()
            || self.api_key.chars().any(char::is_control)
            || reqwest::header::HeaderValue::from_str(&format!("Bearer {}", self.api_key)).is_err()
        {
            return Err(());
        }
        network::base_url(&self.base_url).map(|_| ())
    }

    fn document(
        &self,
    ) -> Result<
        ovload_admin::model::provider_credentials::ProviderDocument,
        ovload_admin::ports::provider::ProviderAdminError,
    > {
        let fields = serde_json::to_value(self)
            .ok()
            .and_then(|value| value.as_object().cloned())
            .ok_or_else(|| {
                admin::admin_error(ovload_admin::ports::provider::ProviderAdminErrorKind::Internal)
            })?;
        Ok(
            ovload_admin::model::provider_credentials::ProviderDocument::new(
                OpaqueProviderData::new(fields),
            ),
        )
    }
}

fn error(kind: ProviderErrorKind, state: UpstreamSendState) -> ProviderError {
    ProviderError::new(kind, state)
}

impl PublicApiProvider {
    async fn account(&self, id: &ProviderAccountId) -> Result<ProviderAccount, ProviderError> {
        self.ports
            .accounts()
            .get_account(id)
            .await
            .map_err(|_| {
                error(
                    ProviderErrorKind::ProviderInfrastructureUnavailable,
                    UpstreamSendState::NotSent,
                )
            })?
            .filter(|account| account.provider() == &self.kind)
            .ok_or_else(|| {
                error(
                    ProviderErrorKind::NoEligibleAccount,
                    UpstreamSendState::NotSent,
                )
            })
    }

    async fn accounts(
        &self,
        account_ids: Option<&[ProviderAccountId]>,
    ) -> Result<Vec<ProviderAccount>, ProviderError> {
        self.ports
            .accounts()
            .list_for_provider(&self.kind, account_ids)
            .await
            .map_err(|_| {
                error(
                    ProviderErrorKind::ProviderInfrastructureUnavailable,
                    UpstreamSendState::NotSent,
                )
            })
    }

    async fn catalog(
        &self,
        account: &ProviderAccount,
        refresh: bool,
    ) -> Result<Catalog, ProviderError> {
        if !refresh {
            let cached = self.catalogs.lock().await.get(account.id()).cloned();
            if let Some(cached) = cached.filter(|entry| {
                entry.revision == account.revision()
                    && entry.egress == network::egress_fingerprint(account)
                    && entry.expires_at > std::time::Instant::now()
            }) {
                return Ok(cached);
            }
        }
        let _slot = self.catalog_capacity.try_acquire().map_err(|_| {
            error(
                ProviderErrorKind::AccountCapacityUnavailable,
                UpstreamSendState::NotSent,
            )
        })?;
        let loaded = self
            .ports
            .accounts()
            .load_credential(account.id(), account.revision())
            .await
            .map_err(|_| {
                error(
                    ProviderErrorKind::ProviderInfrastructureUnavailable,
                    UpstreamSendState::NotSent,
                )
            })?;
        let credential = Credential::decode(loaded.credential.expose_to_provider())?;
        let models = tokio::time::timeout(std::time::Duration::from_secs(30), async {
            if native::is_native(self.kind.as_str()) {
                native::models(self, account, &credential).await
            } else {
                network::models(account, &credential).await
            }
        })
        .await
        .map_err(|_| error(ProviderErrorKind::Timeout, UpstreamSendState::NotSent))?;
        let models = match models {
            Ok(models) => models,
            Err(failure) => {
                self.record_failure(account, &failure).await;
                return Err(failure);
            }
        };
        let catalog = Catalog {
            revision: account.revision(),
            egress: network::egress_fingerprint(account),
            models,
            observed_at: chrono::Utc::now(),
            expires_at: std::time::Instant::now() + std::time::Duration::from_secs(300),
        };
        let mut catalogs = self.catalogs.lock().await;
        if catalogs.len() >= MAX_CACHED_CATALOGS && !catalogs.contains_key(account.id()) {
            let now = std::time::Instant::now();
            catalogs.retain(|_, item| item.expires_at > now);
            if catalogs.len() >= MAX_CACHED_CATALOGS
                && let Some(evict) = catalogs
                    .iter()
                    .min_by_key(|(_, item)| item.expires_at)
                    .map(|(id, _)| id.clone())
            {
                catalogs.remove(&evict);
            }
        }
        let changed = catalogs
            .get(account.id())
            .is_none_or(|previous| previous.models != catalog.models);
        catalogs.insert(account.id().clone(), catalog.clone());
        if changed {
            self.generation.fetch_add(1, Ordering::Relaxed);
        }
        Ok(catalog)
    }
}

#[async_trait]
impl Provider for PublicApiProvider {
    fn resolve_request_profile(
        &self,
        configuration: &OpaqueProviderData,
    ) -> Result<OpaqueProviderData, ProviderError> {
        if native::is_native(self.kind.as_str()) {
            native::profile::parse(configuration).map_err(|_| native::invalid())?;
        }
        Ok(configuration.clone())
    }

    fn default_request_profile(&self) -> Result<Option<OpaqueProviderData>, ProviderError> {
        Ok(native::is_native(self.kind.as_str()).then(native::profile::defaults))
    }
    fn compile_privacy_policy(
        &self,
        policy: &ovload_core::settings::privacy::CodexPrivacyPolicy,
    ) -> Result<
        Arc<dyn ovload_core::settings::privacy::CompiledPrivacyPolicy>,
        ovload_core::settings::privacy::PrivacyError,
    > {
        provider_openai::transport::privacy::compile(policy)
    }
    fn name(&self) -> &str {
        self.kind.as_str()
    }
    fn catalog_generation(&self) -> ProviderCatalogGeneration {
        ProviderCatalogGeneration::new(self.generation.load(Ordering::Relaxed))
    }
    fn model_catalog_is_exhaustive(&self) -> bool {
        false
    }

    async fn query_model_capabilities(
        &self,
    ) -> Result<Vec<ProviderModelCapabilities>, ProviderError> {
        tokio::time::timeout(
            std::time::Duration::from_secs(30),
            self.model_capabilities(),
        )
        .await
        .map_err(|_| error(ProviderErrorKind::Timeout, UpstreamSendState::NotSent))?
    }

    fn account_scheduler(self: Arc<Self>) -> Arc<dyn AccountScheduler> {
        Arc::new(scheduler::PublicApiAccountScheduler { provider: self })
    }
}

impl PublicApiProvider {
    async fn model_capabilities(&self) -> Result<Vec<ProviderModelCapabilities>, ProviderError> {
        let mut models =
            BTreeMap::<UpstreamModelId, std::collections::BTreeSet<ProviderAccountId>>::new();
        let accounts = self
            .accounts(None)
            .await?
            .into_iter()
            .filter(|account| {
                account.enabled()
                    && matches!(
                        account.credential_state(),
                        ovload_core::account::CredentialState::Unknown
                            | ovload_core::account::CredentialState::Ready
                    )
            })
            .collect::<Vec<_>>();
        let catalogs = futures::stream::iter(accounts)
            .map(|account| async move {
                let account = self.native_fresh_account(account).await?;
                self.catalog(&account, false)
                    .await
                    .map(|catalog| (account.id().clone(), catalog))
            })
            .buffer_unordered(4)
            .try_collect::<Vec<_>>()
            .await?;
        for (account, catalog) in catalogs {
            for model in catalog.models {
                models.entry(model).or_default().insert(account.clone());
                if models.len() > MAX_MODELS {
                    return Err(error(
                        ProviderErrorKind::Protocol,
                        UpstreamSendState::NotSent,
                    ));
                }
            }
        }
        Ok(models
            .into_iter()
            .map(|(model, accounts)| {
                ProviderModelCapabilities::new(
                    model,
                    ModelCapabilities::new([OperationKind::Generate].into(), None)
                        .with_upstream_feature_validation(),
                )
                .with_catalog_accounts(accounts)
            })
            .collect())
    }
}
