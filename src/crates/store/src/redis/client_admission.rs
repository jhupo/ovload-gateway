// Modified for Ovload on 2026-10-27: workspace integration.

//! Client API Key 的 Redis RPM/并发原子准入与热状态恢复

use std::{collections::HashSet, time::Duration};

use async_trait::async_trait;
use chrono::{DateTime, Utc};
use ovload_core::engine::admission::{
    ClientAdmissionDecision as CoreAdmissionDecision, ClientAdmissionError as CoreAdmissionError,
    ClientAdmissionPort, ClientAdmissionRecovery as CoreAdmissionRecovery,
    ClientAdmissionRejection as CoreAdmissionRejection,
    ClientAdmissionRequest as CoreAdmissionRequest,
    ClientAdmissionRestoreResult as CoreAdmissionRestoreResult, ClientAdmissionScope,
    ModelKeyAdmissionLimits,
};
use ovload_core::policy::RateLimits;
use redis::{Script, aio::ConnectionManager};

use crate::{StoreAdmissionConfig, StoreError, StoreResult, redis_unavailable, require_nonempty};

use super::{MAX_REDIS_EXACT_INTEGER, namespace, resource_fingerprint};

mod scripts;

#[derive(Debug, Clone, PartialEq, Eq)]
pub struct ClientAdmissionRequest {
    pub model_request_id: String,
    pub scope: ClientAdmissionScope,
    pub lease_ttl: Duration,
    pub allow_concurrency_acquire: bool,
    pub limits: ModelKeyAdmissionLimits,
}

impl ClientAdmissionRequest {
    pub fn validate(&self) -> StoreResult<()> {
        require_nonempty(
            "client admission",
            "model_request_id",
            &self.model_request_id,
        )?;
        validate_scope(&self.scope)?;
        if self.lease_ttl.is_zero() || self.lease_ttl > ovload_core::lifecycle::REQUEST_LEASE_TTL {
            return Err(invalid(
                "lease TTL must be positive and within the execution lease bound",
            ));
        }
        redis_duration_millis(self.lease_ttl)?;
        for limits in [self.limits.tenant, self.limits.user, self.limits.key] {
            validate_limits(limits)?;
        }
        if self.limits.group_requests_per_minute > 1_000_000 {
            return Err(invalid("invalid group RPM"));
        }
        Ok(())
    }
}

#[derive(Debug, Clone, PartialEq, Eq)]
pub struct ClientAdmissionRecentRequest {
    pub model_request_id: String,
    pub started_at: DateTime<Utc>,
}

#[derive(Debug, Clone, PartialEq, Eq)]
pub struct ClientAdmissionRunningRequest {
    pub model_request_id: String,
    pub expires_at: DateTime<Utc>,
}

#[derive(Debug, Clone, PartialEq, Eq)]
pub struct ClientAdmissionRestore {
    pub scope: ClientAdmissionScope,
    pub recent_requests: Vec<ClientAdmissionRecentRequest>,
    pub running_requests: Vec<ClientAdmissionRunningRequest>,
}

impl ClientAdmissionRestore {
    pub fn validate(&self) -> StoreResult<()> {
        validate_scope(&self.scope)?;
        redis_len(self.recent_requests.len(), "recent request count")?;
        redis_len(self.running_requests.len(), "running request count")?;
        if self.recent_requests.len() > 1_024 || self.running_requests.len() > 1_024 {
            return Err(invalid(
                "recovery batches are limited to 1024 facts per kind",
            ));
        }

        let mut recent_ids = HashSet::with_capacity(self.recent_requests.len());
        for request in &self.recent_requests {
            validate_recovery_request_id(&request.model_request_id)?;
            redis_timestamp_millis(request.started_at, "request start time")?;
            if !recent_ids.insert(request.model_request_id.as_str()) {
                return Err(invalid("recent request IDs must be unique"));
            }
        }

        let mut running_ids = HashSet::with_capacity(self.running_requests.len());
        for request in &self.running_requests {
            validate_recovery_request_id(&request.model_request_id)?;
            redis_timestamp_millis(request.expires_at, "request expiry time")?;
            if !running_ids.insert(request.model_request_id.as_str()) {
                return Err(invalid("running request IDs must be unique"));
            }
        }
        Ok(())
    }
}

#[derive(Debug, Clone, Copy, PartialEq, Eq)]
pub struct ClientAdmissionRestoreResult {
    pub restored_recent_requests: u64,
    pub restored_running_requests: u64,
}

#[derive(Debug, Clone, Copy, PartialEq, Eq)]
pub enum ClientAdmissionRejection {
    RateLimited,
    ConcurrencyLimited,
}

#[derive(Debug, Clone, Copy, PartialEq, Eq)]
pub enum ClientAdmissionDecision {
    Granted,
    Rejected(ClientAdmissionRejection),
}

#[async_trait]
pub trait ClientAdmissionRepository: Send + Sync {
    async fn admit_client_request(
        &self,
        request: &ClientAdmissionRequest,
    ) -> StoreResult<ClientAdmissionDecision>;
    async fn release_client_request(
        &self,
        scope: &ClientAdmissionScope,
        model_request_id: &str,
    ) -> StoreResult<bool>;
    async fn restore_client_admission(
        &self,
        recovery: &ClientAdmissionRestore,
    ) -> StoreResult<ClientAdmissionRestoreResult>;
    async fn clear_client_admission(&self, scope: &ClientAdmissionScope) -> StoreResult<()>;
}

#[derive(Clone)]
pub struct RedisClientAdmissionRepository {
    connection: ConnectionManager,
    namespace: String,
    global: RateLimits,
}

impl RedisClientAdmissionRepository {
    pub fn new(
        connection: ConnectionManager,
        key_namespace: &str,
        global: StoreAdmissionConfig,
    ) -> StoreResult<Self> {
        global.validate()?;
        Ok(Self {
            connection,
            namespace: namespace(key_namespace)?,
            global: RateLimits {
                max_concurrency: global.max_concurrency,
                requests_per_minute: global.requests_per_minute,
            },
        })
    }

    fn keys(&self, scope: &ClientAdmissionScope) -> StoreResult<Vec<String>> {
        validate_scope(scope)?;
        let key = resource_fingerprint("client admission", scope.client_api_key_id.as_str())?;
        let mut scopes = vec![
            "global".to_owned(),
            format!("tenant:{}", scope.tenant_id),
            format!("user:{}:{}", scope.tenant_id, scope.user_id),
            format!("key:{key}"),
        ];
        if let Some(group) = &scope.group_id {
            scopes.push(format!(
                "user-group:{}:{}:{}",
                scope.tenant_id,
                scope.user_id,
                group.as_str()
            ));
        }
        Ok(scopes
            .into_iter()
            .flat_map(|scope| {
                [
                    format!("{}:{{admission}}:{scope}:active", self.namespace),
                    format!("{}:{{admission}}:{scope}:requests", self.namespace),
                ]
            })
            .collect())
    }
}

#[async_trait]
impl ClientAdmissionRepository for RedisClientAdmissionRepository {
    async fn admit_client_request(
        &self,
        request: &ClientAdmissionRequest,
    ) -> StoreResult<ClientAdmissionDecision> {
        request.validate()?;
        let keys = self.keys(&request.scope)?;
        let lease_ttl_ms = u64::try_from(request.lease_ttl.as_millis())
            .map_err(|source| invalid("lease TTL is too large").with_source(source))?;
        let mut connection = self.connection.clone();
        let script = Script::new(scripts::ADMIT);
        let mut invocation = script.prepare_invoke();
        for key in &keys {
            invocation.key(key);
        }
        invocation
            .arg(&request.model_request_id)
            .arg(lease_ttl_ms)
            .arg(MAX_REDIS_EXACT_INTEGER)
            .arg(u8::from(request.allow_concurrency_acquire));
        for limits in [
            self.global,
            request.limits.tenant,
            request.limits.user,
            request.limits.key,
        ] {
            invocation
                .arg(limits.max_concurrency)
                .arg(limits.requests_per_minute);
        }
        if request.scope.group_id.is_some() {
            invocation.arg(MAX_REDIS_EXACT_INTEGER).arg(
                if request.limits.group_requests_per_minute == 0 {
                    MAX_REDIS_EXACT_INTEGER
                } else {
                    u64::from(request.limits.group_requests_per_minute)
                },
            );
        }
        let code = invocation
            .invoke_async::<i64>(&mut connection)
            .await
            .map_err(|source| redis_unavailable("admit client request", source))?;
        match code {
            0 => Ok(ClientAdmissionDecision::Granted),
            1 => Ok(ClientAdmissionDecision::Rejected(
                ClientAdmissionRejection::RateLimited,
            )),
            2 => Ok(ClientAdmissionDecision::Rejected(
                ClientAdmissionRejection::ConcurrencyLimited,
            )),
            3 => Err(invalid("lease expiry is outside the supported range")),
            4 => Err(invalid(
                "request admission is incomplete or already released",
            )),
            _ => Err(invalid("Redis returned an unknown admission decision")),
        }
    }

    async fn release_client_request(
        &self,
        scope: &ClientAdmissionScope,
        model_request_id: &str,
    ) -> StoreResult<bool> {
        require_nonempty("client admission", "model_request_id", model_request_id)?;
        let keys = self.keys(scope)?;
        let mut connection = self.connection.clone();
        let script = Script::new(scripts::RELEASE);
        let mut invocation = script.prepare_invoke();
        for key in &keys {
            invocation.key(key);
        }
        let removed = invocation
            .arg(model_request_id)
            .invoke_async::<i64>(&mut connection)
            .await
            .map_err(|source| redis_unavailable("release client request", source))?;
        Ok(removed > 0)
    }

    async fn restore_client_admission(
        &self,
        recovery: &ClientAdmissionRestore,
    ) -> StoreResult<ClientAdmissionRestoreResult> {
        recovery.validate()?;
        let keys = self.keys(&recovery.scope)?;
        let script = Script::new(scripts::RESTORE);
        let mut invocation = script.prepare_invoke();
        for key in &keys {
            invocation.key(key);
        }
        invocation.arg(redis_len(
            recovery.recent_requests.len(),
            "recent request count",
        )?);
        for request in &recovery.recent_requests {
            invocation
                .arg(&request.model_request_id)
                .arg(redis_timestamp_millis(
                    request.started_at,
                    "request start time",
                )?);
        }
        invocation.arg(redis_len(
            recovery.running_requests.len(),
            "running request count",
        )?);
        for request in &recovery.running_requests {
            invocation
                .arg(&request.model_request_id)
                .arg(redis_timestamp_millis(
                    request.expires_at,
                    "request expiry time",
                )?);
        }

        let mut connection = self.connection.clone();
        let (code, restored_recent_requests, restored_running_requests) = invocation
            .invoke_async::<(i64, u64, u64)>(&mut connection)
            .await
            .map_err(|source| redis_unavailable("restore client admission", source))?;
        if code == -1 {
            return Err(invalid("request start time is after Redis server time"));
        }
        if code != 0 {
            return Err(invalid("Redis returned an unknown recovery decision"));
        }
        Ok(ClientAdmissionRestoreResult {
            restored_recent_requests,
            restored_running_requests,
        })
    }

    async fn clear_client_admission(&self, scope: &ClientAdmissionScope) -> StoreResult<()> {
        let keys = self.keys(scope)?;
        let script = Script::new(scripts::CLEAR);
        for _ in 0..1_024 {
            let mut invocation = script.prepare_invoke();
            for key in &keys {
                invocation.key(key);
            }
            let mut connection = self.connection.clone();
            let removed = invocation
                .invoke_async::<i64>(&mut connection)
                .await
                .map_err(|source| redis_unavailable("clear client admission", source))?;
            if removed == 0 {
                return Ok(());
            }
        }
        Err(invalid("clear admission exceeded its bounded batch count"))
    }
}

impl ClientAdmissionPort for RedisClientAdmissionRepository {
    fn maintain(
        &self,
        scope: &ClientAdmissionScope,
        request: &ovload_core::engine::ModelRequestId,
        deadline: ovload_core::lifecycle::Deadline,
        cancellation: ovload_core::lifecycle::CancellationToken,
    ) -> Box<dyn ovload_core::lifecycle::LeaseGuard> {
        let repository = self.clone();
        let scope = scope.clone();
        let request = request.as_str().to_owned();
        Box::new(crate::lease_renewal::LeaseRenewal::spawn(
            deadline,
            Some((
                cancellation,
                ovload_core::lifecycle::RequestLeaseKind::ClientAdmission,
            )),
            move |ttl| {
                let repository = repository.clone();
                let scope = scope.clone();
                let request = request.clone();
                Box::pin(async move {
                    let keys = repository.keys(&scope)?;
                    let mut connection = repository.connection.clone();
                    let script = Script::new(scripts::RENEW);
                    let mut invocation = script.prepare_invoke();
                    for key in &keys {
                        invocation.key(key);
                    }
                    let renewed = invocation
                        .arg(request)
                        .arg(redis_duration_millis(ttl)?)
                        .arg(MAX_REDIS_EXACT_INTEGER)
                        .invoke_async::<i64>(&mut connection)
                        .await
                        .map_err(|source| redis_unavailable("renew client request", source))?;
                    Ok(renewed == 1)
                })
            },
        ))
    }

    fn abandon(&self, scope: &ClientAdmissionScope, request: &ovload_core::engine::ModelRequestId) {
        let repository = self.clone();
        let scope = scope.clone();
        let request = request.clone();
        if let Ok(runtime) = tokio::runtime::Handle::try_current() {
            drop(runtime.spawn(async move {
                if let Err(error) = repository.release(&scope, &request).await {
                    tracing::warn!(%error, "已取消准入的租约释放失败，依赖 TTL 收敛");
                }
            }));
        }
    }

    fn admit(
        &self,
        request: CoreAdmissionRequest,
    ) -> futures::future::BoxFuture<'_, Result<CoreAdmissionDecision, CoreAdmissionError>> {
        Box::pin(async move {
            self.admit_client_request(&ClientAdmissionRequest {
                model_request_id: request.model_request_id.as_str().to_owned(),
                scope: request.scope,
                lease_ttl: request.lease_ttl,
                allow_concurrency_acquire: request.allow_concurrency_acquire,
                limits: request.limits,
            })
            .await
            .map(|decision| match decision {
                ClientAdmissionDecision::Granted => CoreAdmissionDecision::Granted,
                ClientAdmissionDecision::Rejected(ClientAdmissionRejection::RateLimited) => {
                    CoreAdmissionDecision::Rejected(CoreAdmissionRejection::RateLimited)
                }
                ClientAdmissionDecision::Rejected(ClientAdmissionRejection::ConcurrencyLimited) => {
                    CoreAdmissionDecision::Rejected(CoreAdmissionRejection::ConcurrencyLimited)
                }
            })
            .map_err(|source| CoreAdmissionError(Some(source.into())))
        })
    }

    fn release<'a>(
        &'a self,
        scope: &'a ClientAdmissionScope,
        model_request_id: &'a ovload_core::engine::ModelRequestId,
    ) -> futures::future::BoxFuture<'a, Result<bool, CoreAdmissionError>> {
        Box::pin(async move {
            self.release_client_request(scope, model_request_id.as_str())
                .await
                .map_err(|source| CoreAdmissionError(Some(source.into())))
        })
    }

    fn restore(
        &self,
        recovery: CoreAdmissionRecovery,
    ) -> futures::future::BoxFuture<'_, Result<CoreAdmissionRestoreResult, CoreAdmissionError>>
    {
        Box::pin(async move {
            let recovery = ClientAdmissionRestore {
                scope: recovery.scope,
                recent_requests: recovery
                    .recent_requests
                    .into_iter()
                    .map(|request| ClientAdmissionRecentRequest {
                        model_request_id: request.model_request_id.as_str().to_owned(),
                        started_at: DateTime::<Utc>::from(request.started_at),
                    })
                    .collect(),
                running_requests: recovery
                    .running_requests
                    .into_iter()
                    .map(|request| ClientAdmissionRunningRequest {
                        model_request_id: request.model_request_id.as_str().to_owned(),
                        expires_at: DateTime::<Utc>::from(request.expires_at),
                    })
                    .collect(),
            };
            let mut result = CoreAdmissionRestoreResult::default();
            let count = recovery
                .recent_requests
                .len()
                .max(recovery.running_requests.len())
                .div_ceil(1_024);
            for index in 0..count {
                let offset = index * 1_024;
                let recent_end = (offset + 1_024).min(recovery.recent_requests.len());
                let running_end = (offset + 1_024).min(recovery.running_requests.len());
                let batch = ClientAdmissionRestore {
                    scope: recovery.scope.clone(),
                    recent_requests: recovery
                        .recent_requests
                        .get(offset..recent_end)
                        .unwrap_or(&[])
                        .to_vec(),
                    running_requests: recovery
                        .running_requests
                        .get(offset..running_end)
                        .unwrap_or(&[])
                        .to_vec(),
                };
                let restored = self
                    .restore_client_admission(&batch)
                    .await
                    .map_err(|source| CoreAdmissionError(Some(source.into())))?;
                result.restored_recent_requests += restored.restored_recent_requests;
                result.restored_running_requests += restored.restored_running_requests;
            }
            Ok(result)
        })
    }
}

fn invalid(message: &str) -> StoreError {
    StoreError::InvalidData {
        source: None,
        entity: "client admission",
        message: message.to_owned(),
    }
}

fn validate_scope(scope: &ClientAdmissionScope) -> StoreResult<()> {
    require_nonempty(
        "client admission",
        "client_api_key_ref",
        scope.client_api_key_id.as_str(),
    )?;
    if scope.tenant_id.as_uuid().is_nil() || scope.user_id.as_uuid().is_nil() {
        return Err(invalid("customer and user IDs must be nonnil"));
    }
    Ok(())
}

fn validate_limits(limits: RateLimits) -> StoreResult<()> {
    if !(1..=100_000).contains(&limits.max_concurrency)
        || !(1..=10_000_000).contains(&limits.requests_per_minute)
    {
        return Err(invalid(
            "customer and key limits must be positive and bounded",
        ));
    }
    Ok(())
}

fn validate_recovery_request_id(model_request_id: &str) -> StoreResult<()> {
    require_nonempty("client admission", "model_request_id", model_request_id)
}

fn redis_duration_millis(duration: Duration) -> StoreResult<u64> {
    let milliseconds = u64::try_from(duration.as_millis())
        .map_err(|source| invalid("lease TTL is too large").with_source(source))?;
    if milliseconds == 0 {
        return Err(invalid("lease TTL must be at least one millisecond"));
    }
    redis_integer(milliseconds, "lease TTL")
}

fn redis_timestamp_millis(timestamp: DateTime<Utc>, field: &str) -> StoreResult<u64> {
    let milliseconds = u64::try_from(timestamp.timestamp_millis())
        .map_err(|source| invalid(field).with_source(source))?;
    redis_integer(milliseconds, field)
}

fn redis_len(length: usize, field: &str) -> StoreResult<u64> {
    let value = u64::try_from(length).map_err(|source| invalid(field).with_source(source))?;
    redis_integer(value, field)
}

fn redis_integer(value: u64, field: &str) -> StoreResult<u64> {
    if value > MAX_REDIS_EXACT_INTEGER {
        return Err(invalid(&format!(
            "{field} is outside Redis' exact integer range"
        )));
    }
    Ok(value)
}
