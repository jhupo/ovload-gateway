// Modified for Ovload on 2026-10-27: workspace integration.

//! Redis 丢失后从历史请求与有效运行租约恢复客户端准入热状态

use std::collections::BTreeMap;

use async_trait::async_trait;
use chrono::{DateTime, Utc};
use ovload_core::{
    access::{TenantId, UserId},
    engine::{
        ModelRequestId,
        admission::{
            ClientAdmissionError, ClientAdmissionRecovery as CoreAdmissionRecovery,
            ClientAdmissionRecoveryPort, ClientAdmissionScope, RecentAdmissionFact,
            RunningAdmissionFact,
        },
    },
    policy::ClientApiKeyId,
};
use sqlx::PgPool;
use uuid::Uuid;

use crate::{StoreResult, postgres_unavailable};

#[derive(Debug, Clone, PartialEq, Eq)]
pub struct ClientAdmissionRecentRequest {
    pub model_request_id: String,
    pub started_at: DateTime<Utc>,
}

#[derive(Debug, Clone, PartialEq, Eq)]
pub struct ClientAdmissionRunningRequest {
    pub model_request_id: String,
    pub lease_expires_at: DateTime<Utc>,
}

#[derive(Debug, Clone, PartialEq, Eq)]
pub struct ClientAdmissionRecovery {
    pub scope: ClientAdmissionScope,
    pub recent_requests: Vec<ClientAdmissionRecentRequest>,
    pub running_requests: Vec<ClientAdmissionRunningRequest>,
}

#[async_trait]
pub trait ClientAdmissionRecoveryRepository: Send + Sync {
    async fn load_client_admission_recovery(
        &self,
        window_started_at: DateTime<Utc>,
    ) -> StoreResult<Vec<ClientAdmissionRecovery>>;
}

#[derive(Clone)]
pub struct PgClientAdmissionRecoveryRepository {
    pool: PgPool,
}

impl PgClientAdmissionRecoveryRepository {
    #[must_use]
    pub const fn new(pool: PgPool) -> Self {
        Self { pool }
    }
}

#[async_trait]
impl ClientAdmissionRecoveryRepository for PgClientAdmissionRecoveryRepository {
    async fn load_client_admission_recovery(
        &self,
        window_started_at: DateTime<Utc>,
    ) -> StoreResult<Vec<ClientAdmissionRecovery>> {
        let rows =
            sqlx::query_as::<_, (String, Uuid, Uuid, String, DateTime<Utc>, Option<DateTime<Utc>>, String, Option<String>)>(
                "select request.client_api_key_ref, request.tenant_id, request.user_id, request.id, request.started_at,
                    lease.lease_expires_at, request.outcome, request.request_observation_json #>> '{routing,groupRefs,0}'
             from model_requests request
             left join model_request_leases lease on lease.request_id = request.id
             where request.owns_client_admission
               and (request.started_at >= $1 or request.outcome = 'running')
             order by request.client_api_key_ref, request.started_at, request.id limit 1000001",
            )
            .bind(window_started_at)
            .fetch_all(&self.pool)
            .await
            .map_err(|source| postgres_unavailable("load client admission recovery", source))?;
        if rows.len() > 1_000_000 {
            return Err(crate::StoreError::InvalidData {
                entity: "client admission recovery",
                message: "recovery exceeds one million request facts".to_owned(),
                source: None,
            });
        }
        let mut recoveries = BTreeMap::<String, ClientAdmissionRecovery>::new();
        for (
            client_api_key_ref,
            tenant_id,
            user_id,
            model_request_id,
            started_at,
            lease_expires_at,
            outcome,
            group_id,
        ) in rows
        {
            let scope = ClientAdmissionScope {
                group_id: group_id
                    .map(ovload_core::routing::AccountGroupId::new)
                    .transpose()
                    .map_err(|source| crate::StoreError::InvalidData {
                        entity: "client admission recovery",
                        message: "invalid group".to_owned(),
                        source: Some(source.into()),
                    })?,
                client_api_key_id: ClientApiKeyId::new(client_api_key_ref.clone()).map_err(
                    |source| crate::StoreError::InvalidData {
                        entity: "client admission recovery",
                        message: "invalid key identity".to_owned(),
                        source: Some(source.into()),
                    },
                )?,
                tenant_id: TenantId::new(tenant_id),
                user_id: UserId::new(user_id),
            };
            let recovery = recoveries
                .entry(format!(
                    "{}:{}",
                    client_api_key_ref,
                    scope.group_id.as_ref().map_or("", |g| g.as_str())
                ))
                .or_insert_with(|| ClientAdmissionRecovery {
                    scope: scope.clone(),
                    recent_requests: Vec::new(),
                    running_requests: Vec::new(),
                });
            if recovery.scope != scope {
                return Err(crate::StoreError::InvalidData {
                    entity: "client admission recovery",
                    message: "a key has inconsistent immutable request ownership".to_owned(),
                    source: None,
                });
            }
            if started_at >= window_started_at {
                recovery.recent_requests.push(ClientAdmissionRecentRequest {
                    model_request_id: model_request_id.clone(),
                    started_at,
                });
            }
            // 缺失租约的遗留行由请求恢复 Worker 收敛，不伪造仍占用准入容量的期限
            if outcome == "running"
                && let Some(lease_expires_at) = lease_expires_at
            {
                recovery
                    .running_requests
                    .push(ClientAdmissionRunningRequest {
                        model_request_id,
                        lease_expires_at,
                    });
            }
        }
        Ok(recoveries.into_values().collect())
    }
}

impl ClientAdmissionRecoveryPort for PgClientAdmissionRecoveryRepository {
    fn load_recovery(
        &self,
        since: std::time::SystemTime,
    ) -> futures::future::BoxFuture<'_, Result<Vec<CoreAdmissionRecovery>, ClientAdmissionError>>
    {
        Box::pin(async move {
            self.load_client_admission_recovery(DateTime::<Utc>::from(since))
                .await
                .map_err(|source| ClientAdmissionError(Some(source.into())))?
                .into_iter()
                .map(|recovery| {
                    let recent_requests = recovery
                        .recent_requests
                        .into_iter()
                        .map(|request| {
                            Ok(RecentAdmissionFact {
                                model_request_id: ModelRequestId::new(request.model_request_id)
                                    .map_err(|source| ClientAdmissionError(Some(source.into())))?,
                                started_at: request.started_at.into(),
                            })
                        })
                        .collect::<Result<Vec<_>, ClientAdmissionError>>()?;
                    let running_requests = recovery
                        .running_requests
                        .into_iter()
                        .map(|request| {
                            Ok(RunningAdmissionFact {
                                model_request_id: ModelRequestId::new(request.model_request_id)
                                    .map_err(|source| ClientAdmissionError(Some(source.into())))?,
                                expires_at: request.lease_expires_at.into(),
                            })
                        })
                        .collect::<Result<Vec<_>, ClientAdmissionError>>()?;
                    Ok(CoreAdmissionRecovery {
                        scope: recovery.scope,
                        recent_requests,
                        running_requests,
                    })
                })
                .collect()
        })
    }
}
