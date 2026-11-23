//! 唯一执行服务的认证、准入、路由与调用编排

use super::failure::{authentication_gateway_error, gateway_error_from_engine, map_routing_error};

use super::admission::{AdmissionLease, settle_budget};
use super::contract::{
    AuthenticatedClient, ClientApiKeyUsageSink, ClientAuthenticationError, ClientKeyVerifier,
    ClientTransport, ExecutionRequestMetadata, ExecutionService, PreparedExecutionRequest,
    PreparedRootExecution, StartExecution, StartProviderExecution, StartedExecution, duration_ms,
    new_request_id,
};
use super::probe_store::ProbeObservation;
use super::scope::{
    ActiveRequestAuthority, ActiveRequestLease, ActiveRequestRegistry, AuthorizedExecution,
    BoundExecutionFacts, ExecutionStartGuard, ExecutionTarget, NestedExecutionFacts,
    NestedExecutionGraph, PendingStartExecution, PreparedExecutionStart,
};
use super::{COORDINATION_TIMEOUT, DIAGNOSTIC_TIMEOUT};
use super::{scope::ExecutionAdmission, session::DefaultExecutionSession};
use crate::{
    concurrency::{CapacityWait, ConcurrencyWaitBudget, ConcurrencyWaitQueue},
    engine::{
        AttemptCoordinator, EngineError, ExecutionStore, GatewayEngine, ModelRequestId,
        NewModelRequest, ProbeFailure, ProviderAccountId, UpstreamSendState,
        admission::{
            ClientAdmissionDecision, ClientAdmissionPort, ClientAdmissionRejection,
            ClientAdmissionRequest, ClientAdmissionScope,
        },
        authentication::{
            ClientAuthenticationRequest, ClientIdentityPort, FrontendAuthenticationDecision,
            FrontendAuthenticationExtensionIndex, ModelKeyAuthority, ModelKeyAuthorityError,
            ModelKeyExecutionGuard, ModelKeyIdentity, model_key_digest,
        },
        budget::{ClientBudgetCharge, ClientBudgetPort},
        continuation::{
            ContinuationBinding, NativeContinuationPin, NativeContinuationPort,
            NativeContinuationStoreErrorKind,
        },
        coordinator::CoordinationExtensions,
        extensions::{ExecutionExtensionIndex, ExtensionCallScope},
        middleware::FrozenMiddlewarePlan,
        nested::{
            AffinityLookupPort, AffinityLookupRequest, AffinityLookupResult,
            BoundModelExecutionRequest, ExecutionEffects, NestedModelExecutionPort,
            NestedModelExecutionRequest,
        },
        observation::{
            FrozenRequestObservationContext, RequestObservationDispatch, RequestObservationScope,
            RequestObserverExtensionIndex,
        },
        policy::{ModelRouteDecision, RequestPolicyContext, RequestPolicyExtensionIndex},
        probe::{
            AccountProbe, AccountProbeError, AccountProbeErrorSource, AccountProbeRequest,
            AccountProbeResult, AccountProbeUpstreamResponse,
        },
        provider::ProviderRegistry,
    },
    error::{GatewayError, GatewayErrorKind},
    event::GatewayEvent,
    identity::ProviderKind,
    lifecycle::{CancellationToken, Deadline, REQUEST_LEASE_TTL},
    operation::Operation,
    policy::ClientApiKeyId,
    provider_ports::{ProviderSessionAffinityPort, ProviderStoreErrorKind},
    routing::{
        FrozenAccountScope, ProviderCatalogUnavailable, PublicModelDescriptor, PublicModelId,
        RoutingContext, UpstreamModelId, request_settings::RequestSettings,
    },
    runtime::{RuntimeSnapshotHandle, RuntimeSnapshotPublisher},
};
use futures::{FutureExt as _, future::BoxFuture, pin_mut, select_biased};
use futures_timer::Delay;
use std::{
    collections::BTreeSet,
    sync::{Arc, Weak},
    time::{Instant, SystemTime},
};

pub struct DefaultExecutionService {
    content_audit: Option<Arc<dyn crate::content_audit::ContentAudit>>,
    snapshots: RuntimeSnapshotHandle,
    model_key_authority: Arc<dyn ModelKeyAuthority>,
    /// probe 自身走 transient store，探测失败仍写入持久 store 的 ops_events
    observations: Arc<dyn ExecutionStore>,
    diagnostics: Arc<dyn crate::diagnostics::OperationalDiagnostics>,
    providers: ProviderRegistry,
    admissions: Arc<dyn ClientAdmissionPort>,
    admission_waiting: ConcurrencyWaitQueue<ClientApiKeyId>,
    continuation: Arc<dyn NativeContinuationPort>,
    client_api_key_usage: Arc<dyn ClientApiKeyUsageSink>,
    budget: Option<Arc<dyn ClientBudgetPort>>,
    request_observers: Option<RequestObserverExtensionIndex>,
    request_policies: Option<RequestPolicyExtensionIndex>,
    execution_extensions: Option<ExecutionExtensionIndex>,
    frontend_authentication: Option<FrontendAuthenticationExtensionIndex>,
    session_affinity: Option<Arc<dyn ProviderSessionAffinityPort>>,
    client_retry: Option<Arc<dyn crate::engine::client_retry::ClientRetryStore>>,
    snapshot_refresh: Option<Arc<RuntimeSnapshotPublisher>>,
    active_requests: ActiveRequestRegistry,
}

impl DefaultExecutionService {
    pub fn with_content_audit(mut self, port: Arc<dyn crate::content_audit::ContentAudit>) -> Self {
        self.content_audit = Some(port);
        self
    }
    #[must_use]
    pub fn new(
        snapshots: RuntimeSnapshotHandle,
        (model_key_authority, client_api_key_usage): (
            Arc<dyn ModelKeyAuthority>,
            Arc<dyn ClientApiKeyUsageSink>,
        ),
        execution: Arc<dyn ExecutionStore>,
        providers: ProviderRegistry,
        admissions: Arc<dyn ClientAdmissionPort>,
        continuation: Arc<dyn NativeContinuationPort>,
        diagnostics: Arc<dyn crate::diagnostics::OperationalDiagnostics>,
    ) -> Self {
        Self {
            content_audit: None,
            snapshots,
            model_key_authority,
            observations: execution,
            diagnostics,
            providers,
            admissions,
            admission_waiting: ConcurrencyWaitQueue::default(),
            continuation,
            client_api_key_usage,
            budget: None,
            request_observers: None,
            request_policies: None,
            execution_extensions: None,
            frontend_authentication: None,
            session_affinity: None,
            client_retry: None,
            snapshot_refresh: None,
            active_requests: Arc::default(),
        }
    }

    #[must_use]
    pub fn with_budget(mut self, budget: Arc<dyn ClientBudgetPort>) -> Self {
        self.budget = Some(budget);
        self
    }

    #[must_use]
    pub fn with_client_retry_store(
        mut self,
        store: Arc<dyn crate::engine::client_retry::ClientRetryStore>,
    ) -> Self {
        self.client_retry = Some(store);
        self
    }

    #[must_use]
    pub fn with_request_observers(mut self, observers: RequestObserverExtensionIndex) -> Self {
        self.request_observers = Some(observers);
        self
    }

    #[must_use]
    pub fn with_request_policies(mut self, policies: RequestPolicyExtensionIndex) -> Self {
        self.request_policies = Some(policies);
        self
    }

    #[must_use]
    pub fn with_execution_extensions(
        mut self,
        execution_extensions: ExecutionExtensionIndex,
    ) -> Self {
        self.execution_extensions = Some(execution_extensions);
        self
    }

    #[must_use]
    pub fn with_frontend_authentication(
        mut self,
        authentication: FrontendAuthenticationExtensionIndex,
    ) -> Self {
        self.frontend_authentication = Some(authentication);
        self
    }

    #[must_use]
    pub fn with_session_affinity(
        mut self,
        session_affinity: Arc<dyn ProviderSessionAffinityPort>,
    ) -> Self {
        self.session_affinity = Some(session_affinity);
        self
    }

    /// CLI command-plane 没有后台订阅；每次绑定显式身份前主动编译最新事实
    #[must_use]
    pub fn with_snapshot_refresh(mut self, refresh: Arc<RuntimeSnapshotPublisher>) -> Self {
        self.snapshot_refresh = Some(refresh);
        self
    }

    async fn authenticate_native(
        &self,
        plaintext: &str,
    ) -> Result<ModelKeyIdentity, ClientAuthenticationError> {
        self.model_key_authority
            .authenticate(model_key_digest(plaintext))
            .await
            .map_err(authority_authentication_error)
    }

    async fn revalidate_client(&self, client: &AuthenticatedClient) -> Result<(), GatewayError> {
        self.model_key_authority
            .revalidate(&client.identity)
            .await
            .map_err(|error| authentication_gateway_error(authority_authentication_error(error)))
    }

    async fn revalidate_execution_client(
        &self,
        client: &AuthenticatedClient,
        cancellation: &CancellationToken,
        deadline: Deadline,
    ) -> Result<(), GatewayError> {
        let validation = self.revalidate_client(client).fuse();
        let cancelled = cancellation.cancelled().fuse();
        let timeout = deadline.wait().fuse();
        pin_mut!(validation, cancelled, timeout);
        select_biased! {
            () = cancelled => Err(GatewayError::new(GatewayErrorKind::Cancelled, "client validation was cancelled")),
            () = timeout => Err(GatewayError::new(GatewayErrorKind::Timeout, "request deadline elapsed")),
            result = validation => result,
        }
    }

    async fn authenticate_request_without_usage(
        &self,
        mut authentication: ClientAuthenticationRequest,
    ) -> Result<AuthenticatedClient, ClientAuthenticationError> {
        let snapshot = match authentication.settings() {
            Some(settings) => settings.snapshot(),
            None => self
                .snapshots
                .acquire()
                .map_err(|_| ClientAuthenticationError::SnapshotUnavailable)?,
        };
        let frontend = self
            .frontend_authentication
            .as_ref()
            .and_then(|index| snapshot.extensions().and_then(|set| index.resolve(set)));
        let identity = if let Some(frontend) = frontend {
            match frontend
                .authenticate(&authentication)
                .await
                .map_err(|_| ClientAuthenticationError::ProviderUnavailable)?
            {
                FrontendAuthenticationDecision::Authenticated { principal } => {
                    let id = frontend
                        .client_key_id(&principal)
                        .ok_or(ClientAuthenticationError::InvalidKey)?;
                    self.model_key_authority
                        .resolve(&id)
                        .await
                        .map_err(authority_authentication_error)?
                }
                FrontendAuthenticationDecision::Rejected => {
                    return Err(ClientAuthenticationError::InvalidKey);
                }
                FrontendAuthenticationDecision::NotMatched if frontend.exclusive() => {
                    return Err(ClientAuthenticationError::InvalidKey);
                }
                FrontendAuthenticationDecision::NotMatched => {
                    self.authenticate_native(native_bearer(&authentication)?)
                        .await?
                }
            }
        } else {
            self.authenticate_native(native_bearer(&authentication)?)
                .await?
        };
        let policy = snapshot
            .client_policy(&identity.key_id)
            .cloned()
            .ok_or(ClientAuthenticationError::InvalidKey)?;
        if policy.key_generation() != identity.key_generation {
            return Err(ClientAuthenticationError::SnapshotUnavailable);
        }
        policy
            .authorize()
            .map_err(|_| ClientAuthenticationError::InvalidKey)?;
        let policy = match authentication.settings() {
            Some(settings) => settings.apply_policy(policy),
            None => RequestSettings::new(snapshot.clone()).apply_policy(policy),
        };
        let model_key_execution_guard =
            ModelKeyExecutionGuard::new(self.model_key_authority.clone(), identity.clone());
        Ok(AuthenticatedClient {
            identity,
            model_key_execution_guard,
            settings: authentication.take_settings(),
            snapshot,
            policy,
            authentication: Some(authentication),
        })
    }

    async fn start_inner(&self, request: StartExecution) -> Result<StartedExecution, GatewayError> {
        let StartExecution {
            client,
            public_model,
            operation,
            metadata,
        } = request;
        let prepared = self.prepare_root_execution_inner(client).await?;
        self.start_prepared_with_target(
            prepared,
            ExecutionTarget::Model(public_model),
            operation,
            metadata,
        )
        .await
    }

    async fn start_provider_endpoint_inner(
        &self,
        request: StartProviderExecution,
    ) -> Result<StartedExecution, GatewayError> {
        let StartProviderExecution {
            client,
            provider,
            upstream_model,
            operation,
            metadata,
        } = request;
        let prepared = self.prepare_root_execution_inner(client).await?;
        self.start_prepared_with_target(
            prepared,
            ExecutionTarget::ProviderEndpoint {
                provider,
                upstream_model,
            },
            operation,
            metadata,
        )
        .await
    }

    async fn prepare_root_execution_inner(
        &self,
        mut client: AuthenticatedClient,
    ) -> Result<PreparedRootExecution, GatewayError> {
        // 长连接每次执行都重新鉴权并冻结当前策略，确保限额和授权变更对新请求生效
        self.revalidate_client(&client).await?;
        let expected_identity = client.identity.clone();
        let authentication = client.authentication.clone().ok_or_else(|| {
            GatewayError::new(
                GatewayErrorKind::Internal,
                "bound execution identity cannot enter the public start path",
            )
        })?;
        let authentication = match client.settings.clone() {
            Some(settings) => authentication.with_settings(settings),
            None => authentication,
        };
        client = self
            .authenticate_request_without_usage(authentication)
            .await
            .and_then(|client| {
                (client.identity == expected_identity)
                    .then_some(client)
                    .ok_or(ClientAuthenticationError::InvalidKey)
            })
            .map_err(authentication_gateway_error)?;
        self.client_api_key_usage
            .record_used(client.policy().key_id());
        PreparedRootExecution::new(client)
    }

    async fn start_prepared_with_target(
        &self,
        prepared: PreparedRootExecution,
        target: ExecutionTarget,
        operation: Operation,
        metadata: ExecutionRequestMetadata,
    ) -> Result<StartedExecution, GatewayError> {
        let PreparedRootExecution {
            extension_scope,
            client,
            response_control,
            request_id,
            started_at,
            deadline_at,
            cancellation,
            execution_effects,
            execution_effects_baseline,
        } = prepared;
        let authorization = AuthorizedExecution {
            response_control: Some(response_control),
            account_scope: Arc::new(
                client
                    .policy
                    .account_scope()
                    .for_user(client.identity.tenant_id, client.identity.user_id),
            ),
            deadline_at,
            cancellation,
            extension_scope,
            required_provider: None,
            required_account: None,
            nested: None,
            bound: None,
            graph: client
                .snapshot
                .extensions()
                .map(|_| Arc::new(NestedExecutionGraph::new(execution_effects))),
            execution_effects_baseline,
            nested_permit: None,
        };
        self.start_authorized(
            PendingStartExecution {
                client,
                target,
                operation,
                metadata,
            },
            authorization,
            started_at,
            Some(request_id),
        )
        .await
    }

    async fn start_authorized(
        &self,
        mut request: PendingStartExecution,
        mut authorization: AuthorizedExecution,
        started_at: SystemTime,
        request_id: Option<ModelRequestId>,
    ) -> Result<StartedExecution, GatewayError> {
        self.revalidate_execution_client(
            &request.client,
            &authorization.cancellation,
            authorization.deadline_at,
        )
        .await?;
        if !authorization.account_scope.allows_live()
            && matches!(&request.operation, Operation::ProviderHttp(http) if http.endpoint()=="realtime-calls")
        {
            return Err(GatewayError::new(
                GatewayErrorKind::PolicyDenied,
                "Live calls are disabled for this group",
            )
            .with_client_code("live_disabled"));
        }
        crate::engine::image_generation::check_image_generation(
            authorization.account_scope.allows_image_generation(),
            &request.operation,
        )?;
        let request_id = request_id.map_or_else(new_request_id, Ok)?;
        if authorization.cancellation.is_cancelled() {
            return Err(GatewayError::new(
                GatewayErrorKind::Cancelled,
                "parent request was cancelled",
            ));
        }
        if authorization.deadline_at.is_elapsed() {
            return Err(GatewayError::new(
                GatewayErrorKind::Timeout,
                "request deadline elapsed",
            ));
        }
        let account_group_ids = authorization
            .account_scope
            .routing_snapshot()
            .groups_snapshot()
            .iter()
            .map(|group| group.id().clone())
            .collect::<Vec<_>>();
        let audit_plan = if let Some(port) = &self.content_audit {
            let body = request.operation.middleware_body().map_err(|_| {
                GatewayError::new(GatewayErrorKind::InvalidRequest, "audit input is invalid")
            })?;
            let value: serde_json::Value = serde_json::from_slice(&body).unwrap_or_default();
            let mut text = String::new();
            crate::content_audit::append_text(&value, &mut text, 1000000);
            port.prepare(
                crate::content_audit::AuditContext {
                    request_id: request_id.as_str().to_owned(),
                    identity: request.client.identity.clone(),
                    groups: account_group_ids
                        .iter()
                        .map(|id| id.as_str().to_owned())
                        .collect(),
                    endpoint: request.metadata.endpoint.clone(),
                    model: value["model"].as_str().unwrap_or_default().to_owned(),
                    key_name: request
                        .client
                        .policy
                        .name_snapshot()
                        .unwrap_or_default()
                        .to_owned(),
                },
                text,
            )
            .await?
        } else {
            None
        };
        let upstream_adapters = request
            .client
            .snapshot
            .extensions()
            .and_then(|set| self.execution_extensions.as_ref()?.upstream_adapters(set));
        let middleware = self
            .execution_extensions
            .as_ref()
            .and_then(|execution_extensions| {
                let generation = request.client.snapshot.extensions()?.clone();
                execution_extensions.middleware(&generation)
            });
        let request_policy = self.request_policies.as_ref().and_then(|policies| {
            let generation = request.client.snapshot.extensions()?.clone();
            let plan = policies.resolve(&generation)?;
            Some(
                RequestPolicyContext::new(
                    plan,
                    generation,
                    request_id.clone(),
                    request.client.policy.key_id().clone(),
                    account_group_ids.clone(),
                )
                .with_extension_scope(authorization.extension_scope.clone())
                .with_request_body_limit(
                    request
                        .client
                        .snapshot
                        .responses_max_decompressed_body_bytes(),
                )
                .with_execution_effects(Arc::clone(&authorization.graph.as_ref()?.effects)),
            )
        });
        // 路由插件可以调用 host.model/host.affinity；仅这条扩展路径必须在首次 RPC
        // 前取得父 Key 准入
        // 无策略的原生路由仍保持“先路由、后准入”的既有顺序
        let mut start_guard = None;
        let request_observation = self.request_observers.as_ref().and_then(|observers| {
            let generation = request.client.snapshot.extensions()?.clone();
            let plan = observers.resolve(&generation)?;
            Some(RequestObservationDispatch::new(
                plan,
                generation,
                FrozenRequestObservationContext::new(
                    request_id.clone(),
                    request.client.snapshot.revision(),
                    RequestObservationScope::new(
                        request.client.policy.key_id().clone(),
                        account_group_ids.clone(),
                    ),
                    request.operation.kind(),
                    request.target.public_model().cloned(),
                    authorization.extension_scope.clone(),
                ),
            ))
        });
        let budget_key_id = request.client.policy.key_id().clone();
        let mut entered_execution = false;
        let result = async {
            if request_policy.is_some() {
                start_guard = Some(self.prepare_execution_start(&request, &request_id, &mut authorization).await?);
            }
            let mut routing_context = RoutingContext::default();
            if let Some(provider) = authorization.required_provider.clone() {
                if !authorization.account_scope.provider_kinds().contains(&provider) {
                    return Err(GatewayError::new(
                        GatewayErrorKind::PolicyDenied,
                        "nested provider is outside the frozen account scope",
                    ));
                }
                routing_context.required_provider = Some(provider);
            }
            let account_scope = Arc::clone(&authorization.account_scope);
            let plan = match &request.target {
                ExecutionTarget::ProviderEndpoint {
                    provider,
                    upstream_model,
                } => request.client.snapshot.plan_provider_endpoint(
                    provider,
                    upstream_model.as_ref(),
                    &request.operation,
                    account_scope,
                    &routing_context,
                ),
                ExecutionTarget::Model(public_model) => {
                    let mut target_model = public_model.clone();
                    let mut target_context = routing_context.clone();
                    if let Some(policy) = &request_policy {
                        let available = request
                            .client
                            .snapshot
                            .available_providers(&account_scope, &routing_context);
                        match policy
                            .route_model(request.operation.clone(), public_model.clone(), available)
                            .await
                            .map_err(|_| {
                                GatewayError::new(
                                    GatewayErrorKind::Internal,
                                    "model routing policy failed",
                                )
                            })? {
                            ModelRouteDecision::Unhandled => {}
                            ModelRouteDecision::Reject => {
                                return Err(GatewayError::new(
                                    GatewayErrorKind::PolicyDenied,
                                    "model routing policy rejected the request",
                                ));
                            }
                            ModelRouteDecision::Route { provider, model } => {
                                if provider.is_none() && model.is_none() {
                                    return Err(GatewayError::new(
                                        GatewayErrorKind::Internal,
                                        "model routing policy returned an empty target",
                                    ));
                                }
                                if let Some(provider) = provider {
                                    if authorization
                                        .required_provider
                                        .as_ref()
                                        .is_some_and(|required| required != &provider)
                                        || !authorization
                                            .account_scope
                                            .provider_kinds()
                                            .contains(&provider)
                                    {
                                        return Err(GatewayError::new(
                                            GatewayErrorKind::PolicyDenied,
                                            "model routing policy exceeded the frozen provider scope",
                                        ));
                                    }
                                    target_context.required_provider = Some(provider);
                                }
                                if let Some(model) = model {
                                    target_model = model;
                                }
                            }
                        }
                    }
                    request.client.snapshot.plan(
                        &target_model,
                        &request.operation,
                        account_scope,
                        &target_context,
                    )
                }
            }
            .map_err(map_routing_error)?;
            let continuation = match request.metadata.previous_response_id.as_ref() {
                Some(previous) => {
                    let resolve = self
                        .continuation
                        .resolve(request.client.policy.key_id(), previous)
                        .fuse();
                    let timeout = Delay::new(COORDINATION_TIMEOUT).fuse();
                    pin_mut!(resolve, timeout);
                    let pin = select_biased! {
                        result = resolve => match result {
                            Ok(pin) => pin,
                            Err(error)
                                if error.kind() == NativeContinuationStoreErrorKind::Unavailable =>
                            {
                                tracing::debug!(request_id = request_id.as_str(), %error, "Continuation affinity 查询失败，退化为外部续接");
                                None
                            }
                            Err(error)
                                if error.kind() == NativeContinuationStoreErrorKind::OwnershipMismatch =>
                            {
                                return Err(GatewayError::new(GatewayErrorKind::PolicyDenied, "continuation does not belong to this client API key"));
                            }
                            Err(error) => {
                                tracing::warn!(request_id = request_id.as_str(), %error, "Continuation affinity 记录无效，已拒绝续接");
                                return Err(GatewayError::new(GatewayErrorKind::Internal, "continuation state is invalid"));
                            }
                        },
                        _ = timeout => None,
                    };
                    Some(match pin {
                        Some(pin) if !pin.matches_identity(&request.client.identity) => {
                            return Err(GatewayError::new(GatewayErrorKind::PolicyDenied, "continuation does not belong to this client API key"));
                        }
                        Some(pin) if !authorization.account_scope.allows(pin.account()) => {
                            return Err(GatewayError::new(GatewayErrorKind::PolicyDenied, "continuation account is outside the client account scope"));
                        }
                        Some(pin)
                            if !plan.candidates().iter().any(|candidate| candidate.provider() == pin.provider()) =>
                        {
                            return Err(GatewayError::new(GatewayErrorKind::NoAvailableProvider, "continuation provider is not available"));
                        }
                        Some(pin) => {
                            attach_continuation_session_state(&mut request.operation, &pin);
                            ContinuationBinding::Pinned(pin)
                        }
                        None => ContinuationBinding::External(previous.clone()),
                    })
                }
                None => None,
            };
            if start_guard.is_none() {
                start_guard = Some(
                    self.prepare_execution_start(&request, &request_id, &mut authorization)
                        .await?,
                );
            }
            let execution_effects = authorization
                .graph
                .as_ref()
                .map(|graph| Arc::clone(&graph.effects));
            let extensions =
                CoordinationExtensions::new(continuation, request_observation.clone())
                    .with_model_key_authority(ModelKeyExecutionGuard::new(self.model_key_authority.clone(), request.client.identity.clone()))
                    .with_response_control(authorization.response_control.clone())
                    .with_request_policy(request_policy)
                    .with_upstream_adapters(upstream_adapters)
                    .with_execution_effects(
                        execution_effects,
                        authorization.execution_effects_baseline,
                    )
                    .with_middleware(
                        middleware,
                        Arc::from(account_group_ids.clone()),
                        request.metadata.endpoint.clone(),
                        request.metadata.transport,
                    )
                    .with_extension_scope(authorization.extension_scope.clone());
            entered_execution = true;
            self.start_without_continuation(
                request,
                PreparedExecutionStart {
                    request_id: request_id.clone(),
                    started_at,
                    plan,
                    extensions,
                    authorization,
                    guard: start_guard
                        .take()
                        .expect("execution start guard was prepared"),
                },
            )
            .await
        }
        .await;
        if !entered_execution && let Err(error) = &result {
            tracing::warn!(
                request_id = request_id.as_str(),
                key_id = budget_key_id.as_str(),
                failure_kind = error.kind().as_str(),
                "请求在路由或准入阶段被拒绝"
            );
            let rejection = crate::engine::EntryRejection {
                request_id: request_id.clone(),
                client_key_id: budget_key_id.clone(),
                error: error.clone(),
                latency: started_at.elapsed().unwrap_or_default(),
            };
            let write = self.observations.record_entry_rejection(rejection).fuse();
            let timeout = Delay::new(COORDINATION_TIMEOUT).fuse();
            pin_mut!(write, timeout);
            select_biased! {
                result = write => {
                    if let Err(error) = result {
                        tracing::warn!(request_id = request_id.as_str(), operation = "record_entry_rejection", error_kind = ?error.kind(), "入口拒绝观测写入失败");
                    }
                },
                _ = timeout => tracing::warn!(request_id = request_id.as_str(), operation = "record_entry_rejection", "入口拒绝观测写入超时"),
            }
        }
        if let (Some(observation), Err(error)) = (&request_observation, &result) {
            observation.reject(error);
        }
        if result.is_err()
            && let Some(guard) = start_guard.take()
        {
            guard
                .release_failed(
                    self.budget.as_deref(),
                    request_id,
                    budget_key_id,
                    self.diagnostics.as_ref(),
                )
                .await;
        }
        result.map(|mut started| {
            if let (Some(plan), Some(port)) = (audit_plan, self.content_audit.clone())
                && plan.config["content"]["enabled"] == true
            {
                started.session = Box::new(crate::content_audit::AuditedSession::new(
                    started.session,
                    port,
                    plan,
                ));
            }
            started
        })
    }

    async fn prepare_execution_start(
        &self,
        request: &PendingStartExecution,
        request_id: &ModelRequestId,
        authorization: &mut AuthorizedExecution,
    ) -> Result<ExecutionStartGuard, GatewayError> {
        let concurrency_wait_budget = ConcurrencyWaitBudget::default();
        let (admission, admission_decision_ms) = if authorization.nested.is_some() {
            let permit = authorization.nested_permit.take().ok_or_else(|| {
                GatewayError::new(
                    GatewayErrorKind::Internal,
                    "nested execution admission is unavailable",
                )
            })?;
            (ExecutionAdmission::Nested(permit), None)
        } else {
            let admission_started_at = Instant::now();
            let admission = self
                .acquire_client_admission(
                    &request.client,
                    request_id,
                    authorization.deadline_at,
                    authorization.cancellation.clone(),
                    &concurrency_wait_budget,
                )
                .await?;
            let admission = if let Some(permit) = authorization.nested_permit.take() {
                ExecutionAdmission::Bound(admission, permit)
            } else {
                ExecutionAdmission::Client(admission)
            };
            (admission, Some(duration_ms(admission_started_at.elapsed())))
        };
        if let Some(budget) = &self.budget
            && let Err(error) = budget.admit(request.client.policy.key_id().clone()).await
        {
            admission.release().await;
            return Err(error);
        }
        let active_request = authorization.graph.as_ref().map(|graph| {
            self.register_active_request(
                request_id.clone(),
                ActiveRequestAuthority {
                    client: request.client.clone(),
                    account_scope: Arc::clone(&authorization.account_scope),
                    deadline_at: authorization.deadline_at,
                    // 回收嵌套调用权限只取消子作用域，父请求仍需完成响应流终态加工
                    cancellation: authorization.cancellation.child_token(),
                    extension_scope: authorization.extension_scope.clone(),
                    graph: Arc::clone(graph),
                },
            )
        });
        Ok(ExecutionStartGuard {
            admission,
            active_request,
            concurrency_wait_budget,
            admission_decision_ms,
        })
    }

    async fn start_without_continuation(
        &self,
        request: PendingStartExecution,
        prepared: PreparedExecutionStart,
    ) -> Result<StartedExecution, GatewayError> {
        let PreparedExecutionStart {
            request_id,
            started_at,
            plan,
            extensions,
            authorization,
            guard: start_guard,
        } = prepared;
        let PendingStartExecution {
            client,
            target,
            operation,
            metadata,
        } = request;
        let providers = self.providers.clone();
        let ExecutionStartGuard {
            admission,
            active_request,
            concurrency_wait_budget,
            admission_decision_ms,
        } = start_guard;
        let observation = plan
            .candidates()
            .first()
            .map_or_else(Default::default, |candidate| {
                providers.request_observation(
                    candidate.provider(),
                    &operation,
                    client.policy.key_id(),
                )
            });
        let (request_kind, subagent_kind) = if let Some(nested) = authorization.nested.as_ref() {
            (
                Some("plugin_child_model".to_owned()),
                Some(nested.initiating_plugin_instance_id.clone()),
            )
        } else if let Some(bound) = authorization.bound.as_ref() {
            (
                Some("plugin_bound_model".to_owned()),
                Some(bound.initiating_plugin_instance_id.clone()),
            )
        } else {
            (observation.request_kind, observation.subagent_kind)
        };
        if let Some(nested) = authorization.nested.as_ref() {
            tracing::debug!(
                parent_request_id = nested.parent_request_id.as_str(),
                child_request_id = request_id.as_str(),
                plugin_instance_id = nested.initiating_plugin_instance_id,
                depth = authorization.extension_scope.len(),
                "插件子模型请求已继承父请求身份与 deadline"
            );
        }
        let new_request = NewModelRequest {
            model_key_identity: Some(client.identity.clone()),
            id: request_id.clone(),
            client_api_key_name_snapshot: client.policy.name_snapshot().map(str::to_owned),
            client_api_key_ref: client.policy.key_id().clone(),
            config_revision: plan.config_revision(),
            routing: authorization.account_scope.routing_snapshot(),
            protocol: metadata.protocol,
            operation: operation.kind(),
            endpoint: metadata.endpoint,
            client_transport: metadata.transport.as_str().to_owned(),
            requested_model: target.into_public_model().or(observation.requested_model),
            client_ip: metadata.client_ip,
            user_agent: metadata.user_agent,
            reasoning_effort: observation.reasoning_effort,
            reasoning_preset: observation.reasoning_preset,
            request_kind,
            subagent_kind,
            compact: observation.compact,
            continuation: observation.continuation,
            image_generation_requested: operation.image_generation_requested(),
            admission_decision_ms,
            started_at,
            deadline_at: authorization.deadline_at,
        };
        let mut engine = GatewayEngine::new(self.observations.clone(), providers);
        // 插件内部调用不共享外部客户端的失败轮次，探测另走 transient engine
        if authorization.nested.is_none()
            && authorization.bound.is_none()
            && let Some(store) = &self.client_retry
        {
            engine = engine.with_client_retry_store(Arc::clone(store));
        }
        let coordinator = AttemptCoordinator::new(engine);
        let core = match coordinator
            .start_observed(
                new_request,
                operation,
                plan,
                authorization.required_account,
                extensions,
                authorization.cancellation,
            )
            .await
        {
            Ok(core) => core.with_concurrency_wait_budget(concurrency_wait_budget),
            Err(error) => {
                if let Some(budget) = &self.budget {
                    settle_budget(
                        budget.as_ref(),
                        ClientBudgetCharge {
                            key_id: client.policy.key_id().clone(),
                            request_id: request_id.clone(),
                            amount_usd: crate::metering::Decimal::ZERO,
                            completed_at: SystemTime::now(),
                        },
                        self.diagnostics.as_ref(),
                    )
                    .await;
                }
                if let Some(active_request) = active_request {
                    active_request.release();
                }
                admission.release().await;
                return Err(gateway_error_from_engine(&error));
            }
        };
        Ok(StartedExecution {
            request_id,
            created_at: started_at,
            stream: metadata.stream,
            session: Box::new(DefaultExecutionSession::new(
                core,
                admission,
                active_request,
                Arc::clone(&self.continuation),
                self.budget.clone(),
                self.diagnostics.clone(),
            )),
        })
    }

    fn register_active_request(
        &self,
        request_id: ModelRequestId,
        authority: ActiveRequestAuthority,
    ) -> ActiveRequestLease {
        let authority = Arc::new(authority);
        let mut active = self
            .active_requests
            .lock()
            .unwrap_or_else(std::sync::PoisonError::into_inner);
        let previous = active.insert(request_id.clone(), Arc::downgrade(&authority));
        debug_assert!(previous.is_none(), "model request IDs must be unique");
        drop(active);
        ActiveRequestLease {
            registry: Arc::clone(&self.active_requests),
            request_id,
            authority,
        }
    }

    fn active_request(
        &self,
        request_id: &ModelRequestId,
    ) -> Result<Arc<ActiveRequestAuthority>, GatewayError> {
        let authority = self
            .active_requests
            .lock()
            .unwrap_or_else(std::sync::PoisonError::into_inner)
            .get(request_id)
            .and_then(Weak::upgrade)
            .ok_or_else(|| {
                GatewayError::new(
                    GatewayErrorKind::PolicyDenied,
                    "parent model request is not active",
                )
            })?;
        if authority.cancellation.is_cancelled() {
            return Err(GatewayError::new(
                GatewayErrorKind::Cancelled,
                "parent request was cancelled",
            ));
        }
        if authority.deadline_at.is_elapsed() {
            return Err(GatewayError::new(
                GatewayErrorKind::Timeout,
                "parent request deadline elapsed",
            ));
        }
        Ok(authority)
    }

    async fn start_nested_inner(
        &self,
        request: NestedModelExecutionRequest,
    ) -> Result<StartedExecution, GatewayError> {
        let NestedModelExecutionRequest {
            parent_request_id,
            initiating_plugin_instance_id,
            public_model,
            operation,
            mut metadata,
            provider,
            account,
            parent_account,
        } = request;
        let parent = self.active_request(&parent_request_id)?;
        if parent.extension_scope.len() >= ExtensionCallScope::MAXIMUM_DEPTH {
            return Err(GatewayError::new(
                GatewayErrorKind::PolicyDenied,
                "nested model execution depth is exhausted",
            ));
        }
        let extension_scope = parent
            .extension_scope
            .extending(initiating_plugin_instance_id.clone())
            .ok_or_else(|| {
                GatewayError::new(
                    GatewayErrorKind::PolicyDenied,
                    "recursive plugin model execution is not allowed",
                )
            })?;
        let (account_scope, required_provider) = restrict_model_execution_scope(
            parent.account_scope.as_ref(),
            provider,
            account.as_ref(),
            parent_account.as_ref(),
        )?;
        let nested_permit = parent.graph.acquire()?;
        // Core.start 之后的路由/Provider 可以继续调用外部系统；在进入子执行前即按
        // 可能已出站记水位，不能让父 attempt 随后的 `not_sent` 触发重放
        parent.graph.effects.observe();
        let execution_effects_baseline = parent.graph.effects.epoch();
        metadata.endpoint = "host.model".to_owned();
        metadata.transport = ClientTransport::InternalPlugin;
        metadata.inherit_request_origin(&extension_scope);
        let authorization = AuthorizedExecution {
            account_scope,
            response_control: None,
            deadline_at: parent.deadline_at,
            cancellation: parent.cancellation.child_token(),
            extension_scope,
            required_provider,
            required_account: account,
            nested: Some(NestedExecutionFacts {
                parent_request_id,
                initiating_plugin_instance_id,
            }),
            bound: None,
            graph: Some(Arc::clone(&parent.graph)),
            execution_effects_baseline,
            nested_permit: Some(nested_permit),
        };
        self.start_authorized(
            PendingStartExecution {
                client: parent.client.clone(),
                target: ExecutionTarget::Model(public_model),
                operation,
                metadata,
            },
            authorization,
            SystemTime::now(),
            None,
        )
        .await
    }

    async fn client_for_identity(
        &self,
        identity: &ModelKeyIdentity,
        settings: Option<RequestSettings>,
    ) -> Result<AuthenticatedClient, GatewayError> {
        if settings.is_none()
            && let Some(refresh) = &self.snapshot_refresh
        {
            refresh.refresh().await.map_err(|_| {
                GatewayError::new(
                    GatewayErrorKind::Internal,
                    "current runtime snapshot is unavailable",
                )
            })?;
        }
        let snapshot = settings
            .as_ref()
            .map(|settings| settings.snapshot())
            .map_or_else(|| self.snapshots.acquire(), Ok)
            .map_err(|_| {
                GatewayError::new(
                    GatewayErrorKind::Internal,
                    "current runtime snapshot is unavailable",
                )
            })?;
        self.model_key_authority
            .revalidate(identity)
            .await
            .map_err(|error| authentication_gateway_error(authority_authentication_error(error)))?;
        let policy = snapshot
            .client_policy(&identity.key_id)
            .cloned()
            .ok_or_else(|| {
                GatewayError::new(
                    GatewayErrorKind::Unauthorized,
                    "client API key no longer exists",
                )
            })?;
        if policy.key_generation() != identity.key_generation {
            return Err(authentication_gateway_error(
                ClientAuthenticationError::SnapshotUnavailable,
            ));
        }
        policy.authorize().map_err(|_| {
            GatewayError::new(GatewayErrorKind::PolicyDenied, "client API key is disabled")
        })?;
        let model_key_execution_guard =
            ModelKeyExecutionGuard::new(self.model_key_authority.clone(), identity.clone());
        Ok(AuthenticatedClient {
            identity: identity.clone(),
            model_key_execution_guard,
            policy: match &settings {
                Some(settings) => settings.apply_policy(policy),
                None => RequestSettings::new(snapshot.clone()).apply_policy(policy),
            },
            settings,
            snapshot,
            authentication: None,
        })
    }

    async fn start_bound_model_inner(
        &self,
        request: BoundModelExecutionRequest,
    ) -> Result<StartedExecution, GatewayError> {
        let BoundModelExecutionRequest {
            client,
            initiating_plugin_instance_id,
            cancellation,
            extension_scope,
            public_model,
            operation,
            mut metadata,
            provider,
            account,
        } = request;
        if cancellation.is_cancelled() {
            return Err(GatewayError::new(
                GatewayErrorKind::Cancelled,
                "bound plugin invocation was cancelled",
            ));
        }
        if extension_scope.len() >= ExtensionCallScope::MAXIMUM_DEPTH {
            return Err(GatewayError::new(
                GatewayErrorKind::PolicyDenied,
                "plugin model execution depth exceeded",
            ));
        }
        let extension_scope = extension_scope
            .extending(initiating_plugin_instance_id.clone())
            .ok_or_else(|| {
                GatewayError::new(
                    GatewayErrorKind::PolicyDenied,
                    "plugin model execution scope is recursive",
                )
            })?;
        let now = SystemTime::now();
        let deadline_at =
            Deadline::from_timeout(now, client.execution_timeout()).ok_or_else(|| {
                GatewayError::new(GatewayErrorKind::Internal, "system clock is invalid")
            })?;
        let (account_scope, required_provider) = restrict_model_execution_scope(
            &client
                .policy
                .account_scope()
                .for_user(client.identity.tenant_id, client.identity.user_id),
            provider,
            account.as_ref(),
            None,
        )?;
        // 连接承载多个独立执行；递归预算和副作用只在本次执行的子调用图内共享
        // 父调用的取消继续向子执行传播，不能因新建执行丢失扩展调用链
        let graph = Arc::new(NestedExecutionGraph::new(Arc::new(
            ExecutionEffects::default(),
        )));
        let permit = graph.acquire()?;
        let execution_effects_baseline = graph.effects.epoch();
        metadata.endpoint = "host.model".to_owned();
        metadata.transport = ClientTransport::InternalPlugin;
        metadata.inherit_request_origin(&extension_scope);
        self.client_api_key_usage
            .record_used(client.policy.key_id());
        self.start_authorized(
            PendingStartExecution {
                client,
                target: ExecutionTarget::Model(public_model),
                operation,
                metadata,
            },
            AuthorizedExecution {
                account_scope,
                response_control: None,
                deadline_at,
                cancellation: cancellation.child_token(),
                extension_scope,
                required_provider,
                required_account: account,
                nested: None,
                bound: Some(BoundExecutionFacts {
                    initiating_plugin_instance_id,
                }),
                graph: Some(graph),
                execution_effects_baseline,
                nested_permit: Some(permit),
            },
            now,
            None,
        )
        .await
    }

    async fn lookup_affinity_inner(
        &self,
        request: AffinityLookupRequest,
    ) -> Result<Option<AffinityLookupResult>, GatewayError> {
        let AffinityLookupRequest {
            parent_request_id,
            provider,
            key,
        } = request;
        let parent = self.active_request(&parent_request_id)?;
        self.revalidate_client(&parent.client).await?;
        if !parent.account_scope.provider_kinds().contains(&provider) {
            return Err(GatewayError::new(
                GatewayErrorKind::PolicyDenied,
                "affinity provider is outside the frozen authorization scope",
            ));
        }
        let affinity = self.session_affinity.as_ref().ok_or_else(|| {
            GatewayError::new(
                GatewayErrorKind::PolicyDenied,
                "provider session affinity is unavailable",
            )
        })?;
        let account = {
            let load = affinity.load(&provider, &key).fuse();
            let timeout = Delay::new(COORDINATION_TIMEOUT).fuse();
            pin_mut!(load, timeout);
            select_biased! {
                result = load => result.map_err(|error| match error.kind() {
                    ProviderStoreErrorKind::Unavailable => GatewayError::new(
                        GatewayErrorKind::ProviderInfrastructureUnavailable,
                        "provider session affinity is temporarily unavailable",
                    ),
                    ProviderStoreErrorKind::InvalidData | ProviderStoreErrorKind::Conflict => {
                        GatewayError::new(GatewayErrorKind::Internal, "provider session affinity is invalid")
                    }
                })?,
                _ = timeout => return Err(GatewayError::new(
                    GatewayErrorKind::ProviderInfrastructureUnavailable,
                    "provider session affinity lookup timed out",
                )),
            }
        };
        let Some(binding) = account else {
            return Ok(None);
        };
        let account = binding.account_id().clone();
        if !parent.account_scope.allows(&account)
            || parent.account_scope.account_provider(&account) != Some(&provider)
        {
            return Ok(None);
        }
        Ok(Some(AffinityLookupResult::new(provider, account)))
    }

    async fn acquire_client_admission(
        &self,
        client: &AuthenticatedClient,
        request_id: &ModelRequestId,
        deadline_at: Deadline,
        cancellation: CancellationToken,
        budget: &ConcurrencyWaitBudget,
    ) -> Result<AdmissionLease, GatewayError> {
        let policy = client.snapshot.client_queue_policy();
        let key = client.policy.key_id();
        let mut scope = ClientAdmissionScope::from(&client.identity);
        scope.group_id = client
            .policy
            .account_scope()
            .routing_snapshot()
            .groups_snapshot()
            .first()
            .map(|g| g.id().clone());
        let mut waiting =
            CapacityWait::new(&self.admission_waiting, policy, deadline_at.at(), budget)
            .with_monitoring(request_id.to_string(),serde_json::json!({"layer":"client","userId":client.identity.user_id.to_string(),"groups":client.policy.account_scope().routing_snapshot().groups_snapshot().iter().map(|g|g.id().to_string()).collect::<Vec<_>>()}));
        let mut admission = AdmissionLease {
            port: Arc::clone(&self.admissions),
            diagnostics: self.diagnostics.clone(),
            scope: scope.clone(),
            model_request_id: request_id.clone(),
            armed: false,
            renewal: None,
        };
        loop {
            let remaining = deadline_at.bounded(REQUEST_LEASE_TTL);
            if remaining.is_zero() {
                return Err(GatewayError::new(
                    GatewayErrorKind::Timeout,
                    "request deadline elapsed",
                ));
            }
            // 在发送原子准入之前接管取消清理，覆盖 Redis 已取得租约但返回尚未被观察的窗口
            admission.armed = true;
            let allow_concurrency_acquire = waiting.can_try(key);
            let acquire = async {
                let mut limits = self
                    .model_key_authority
                    .admission_limits(&client.identity)
                    .await
                    .map_err(|error| {
                        authentication_gateway_error(authority_authentication_error(error))
                    })?;
                let requested = client.policy.limits();
                if requested.max_concurrency > 0 {
                    limits.key.max_concurrency =
                        limits.key.max_concurrency.min(requested.max_concurrency);
                }
                if requested.requests_per_minute > 0 {
                    limits.key.requests_per_minute = limits
                        .key
                        .requests_per_minute
                        .min(requested.requests_per_minute);
                }
                self.admissions
                    .admit(ClientAdmissionRequest {
                        model_request_id: request_id.clone(),
                        scope: scope.clone(),
                        lease_ttl: remaining,
                        allow_concurrency_acquire,
                        limits,
                    })
                    .await
                    .map_err(|source| {
                        GatewayError::new(
                            GatewayErrorKind::NoAvailableProvider,
                            "request admission is temporarily unavailable",
                        )
                        .with_source(source)
                    })
            }
            .fuse();
            let timeout = deadline_at.wait().fuse();
            let cancelled = cancellation.cancelled().fuse();
            pin_mut!(acquire, timeout, cancelled);
            let decision = select_biased! {
                () = cancelled => return Err(GatewayError::new(GatewayErrorKind::Cancelled, "request admission was cancelled")),
                result = acquire => result?,
                _ = timeout => return Err(GatewayError::new(GatewayErrorKind::Timeout, "request deadline elapsed")),
            };
            match decision {
                ClientAdmissionDecision::Granted => {
                    if let Err(error) = self
                        .revalidate_execution_client(client, &cancellation, deadline_at)
                        .await
                    {
                        admission.release().await;
                        return Err(error);
                    }
                    admission.renewal = Some(self.admissions.maintain(
                        &scope,
                        request_id,
                        deadline_at,
                        cancellation.clone(),
                    ));
                    if !waiting.elapsed().is_zero() {
                        tracing::info!(
                            request_id = request_id.as_str(),
                            queue_layer = "client_key",
                            queue_wait_ms = duration_ms(waiting.elapsed()),
                            "排队请求已取得 Key 并发槽位"
                        );
                    }
                    return Ok(admission);
                }
                ClientAdmissionDecision::Rejected(reason) => {
                    admission.armed = false;
                    if reason == ClientAdmissionRejection::RateLimited || policy.max_waiting == 0 {
                        return Err(GatewayError::new(
                            GatewayErrorKind::RateLimited,
                            "request exceeds platform or customer execution limits",
                        ));
                    }
                    if waiting.elapsed().is_zero()
                        && let Some(budget) = &self.budget
                    {
                        budget.admit(key.clone()).await?;
                    }
                    waiting.wait(std::slice::from_ref(key)).await.map_err(|error| {
                        tracing::info!(request_id = request_id.as_str(), queue_layer = "client_key", queue_wait_ms = duration_ms(waiting.elapsed()), reason = %error, "Key 排队请求被拒绝");
                        error.gateway_error()
                    })?;
                }
            }
        }
    }

    async fn probe_inner(
        &self,
        request: AccountProbeRequest,
        frozen: Option<Arc<crate::routing::RuntimeSnapshot>>,
    ) -> Result<AccountProbeResult, AccountProbeError> {
        let AccountProbeRequest {
            account_id,
            provider_kind,
            upstream_model,
            operation,
        } = request;
        let observed = ProbeObservation {
            provider_kind: provider_kind.clone(),
            account_id: account_id.clone(),
            upstream_model: upstream_model.clone(),
        };
        let snapshot = frozen
            .map_or_else(|| self.snapshots.acquire(), Ok)
            .map_err(|_| {
                GatewayError::new(
                    GatewayErrorKind::Internal,
                    "runtime snapshot is unavailable",
                )
            })?;
        let public_model =
            PublicModelId::new(upstream_model.as_str().to_owned()).map_err(|_| {
                GatewayError::new(GatewayErrorKind::Unsupported, "requested model is invalid")
            })?;
        let routing_context = RoutingContext {
            required_provider: Some(provider_kind.clone()),
            ..RoutingContext::default()
        };
        let plan = if matches!(operation, crate::operation::Operation::GenerateImage(_)) {
            snapshot.plan_provider_endpoint(
                &provider_kind,
                None,
                &operation,
                snapshot.all_account_scope(),
                &routing_context,
            )
        } else {
            snapshot.plan_diagnostic(&public_model, &operation, &routing_context)
        }
        .map_err(map_routing_error)?;
        let started_at = SystemTime::now();
        let deadline_at = started_at.checked_add(DIAGNOSTIC_TIMEOUT).ok_or_else(|| {
            GatewayError::new(GatewayErrorKind::Internal, "system clock is invalid")
        })?;
        let request_id = new_request_id()?;
        let actor = ClientApiKeyId::new("admin_connection_test")
            .map_err(|_| GatewayError::new(GatewayErrorKind::Internal, "invalid admin actor"))?;
        let new_request = NewModelRequest {
            id: request_id,
            model_key_identity: None,
            client_api_key_name_snapshot: None,
            client_api_key_ref: actor,
            config_revision: plan.config_revision(),
            routing: crate::routing::AccountRoutingSnapshot::all(),
            protocol: "admin_connection_test".to_owned(),
            operation: operation.kind(),
            endpoint: "/api/admin/accounts/connection-test".to_owned(),
            client_transport: ClientTransport::InternalProbe.as_str().to_owned(),
            requested_model: Some(public_model),
            client_ip: None,
            user_agent: None,
            reasoning_effort: None,
            reasoning_preset: None,
            request_kind: Some("account_connection_test".to_owned()),
            subagent_kind: None,
            compact: false,
            continuation: Default::default(),
            image_generation_requested: operation.image_generation_requested(),
            admission_decision_ms: None,
            started_at,
            deadline_at: deadline_at.into(),
        };
        let providers = self.providers.clone();
        // Connection tests are real model requests. Reuse the service execution store so
        // successful probes produce the same usage/request records as normal traffic.
        let coordinator = AttemptCoordinator::new(GatewayEngine::new(
            Arc::clone(&self.observations),
            providers,
        ));
        let mut session = match coordinator
            .start_diagnostic(
                new_request,
                operation,
                plan,
                account_id,
                None,
                CancellationToken::new(),
            )
            .await
        {
            Ok(session) => session,
            Err(error) => {
                return Err(self
                    .observe_probe_failure(&observed, started_at, &error)
                    .await);
            }
        };
        let events = session.collect_uncommitted_bounded(24 * 1024 * 1024).await;
        let events = match events {
            Ok(events) => events,
            Err(error) => {
                return Err(self
                    .observe_probe_failure(&observed, started_at, &error)
                    .await);
            }
        };
        if let Err(error) = session.commit_downstream(Some(200)).await {
            return Err(self
                .observe_probe_failure(&observed, started_at, &error)
                .await);
        }
        let mut result = AccountProbeResult {
            text: Vec::new(),
            wire: Vec::new(),
        };
        for event in events {
            let (facts, wire) = event.into_parts();
            for fact in facts {
                if let GatewayEvent::TextDelta(delta) = fact {
                    result.text.push(delta.text);
                }
            }
            if let Some(wire) = wire {
                result.wire.push(wire);
            }
        }
        Ok(result)
    }

    /// 探测失败先记录脱敏分类事实，再把请求局部的原始上游响应交给认证管理端
    async fn observe_probe_failure(
        &self,
        observed: &ProbeObservation,
        started_at: SystemTime,
        error: &EngineError,
    ) -> AccountProbeError {
        let (source, send_state, upstream_response) = match error {
            EngineError::Provider(provider_error) => {
                let upstream_response = provider_error
                    .client_visible_upstream_response()
                    .map(AccountProbeUpstreamResponse::from_client_response);
                let has_upstream_facts = provider_error.send_state() != UpstreamSendState::NotSent
                    || provider_error.upstream_status().is_some()
                    || provider_error.upstream_code().is_some()
                    || provider_error.client_visible_upstream_error().is_some()
                    || upstream_response.is_some();
                let source = if has_upstream_facts {
                    AccountProbeErrorSource::Upstream
                } else {
                    AccountProbeErrorSource::Provider
                };
                (source, Some(provider_error.send_state()), upstream_response)
            }
            _ => (AccountProbeErrorSource::Gateway, None, None),
        };
        let probe_error = AccountProbeError::new(
            gateway_error_from_engine(error),
            source,
            send_state,
            upstream_response,
        );
        if let EngineError::Provider(provider_error) = error {
            let latency = started_at.elapsed().unwrap_or_default();
            let latency_ms = u64::try_from(latency.as_millis()).unwrap_or(u64::MAX);
            tracing::warn!(
                target: "gateway_probe",
                provider_kind = observed.provider_kind.as_str(),
                account_id = observed.account_id.as_str(),
                upstream_model = observed.upstream_model.as_str(),
                failure_kind = provider_error.kind().as_str(),
                send_state = ?provider_error.send_state(),
                upstream_status = provider_error.upstream_status(),
                diagnostic_stage = ?provider_error.diagnostic().and_then(|diagnostic| diagnostic.stage()),
                diagnostic_code = ?provider_error.diagnostic().and_then(|diagnostic| diagnostic.code()),
                latency_ms,
                "账号连接测试失败"
            );
            if let Err(store_error) = self
                .observations
                .record_probe_failure(ProbeFailure {
                    provider_kind: observed.provider_kind.clone(),
                    account_id: observed.account_id.clone(),
                    upstream_model_id: observed.upstream_model.clone(),
                    error: provider_error.stable_snapshot(),
                    latency,
                })
                .await
            {
                tracing::warn!(
                    operation = "record_probe_failure",
                    provider_kind = observed.provider_kind.as_str(),
                    account_id = observed.account_id.as_str(),
                    error_kind = ?store_error.kind(),
                    "账号连接测试观测写入失败，测试结果不受影响"
                );
            }
            return probe_error.with_upstream_failure(
                provider_error.upstream_status(),
                provider_error.upstream_code().cloned(),
            );
        }
        probe_error
    }
}

impl ExecutionService for DefaultExecutionService {
    fn request_settings(&self) -> Option<RequestSettings> {
        self.snapshots.acquire().ok().map(RequestSettings::new)
    }

    fn authenticate_request(
        &self,
        request: ClientAuthenticationRequest,
    ) -> BoxFuture<'_, Result<AuthenticatedClient, ClientAuthenticationError>> {
        Box::pin(async move {
            let client = self.authenticate_request_without_usage(request).await?;
            self.client_api_key_usage
                .record_used(client.policy().key_id());
            Ok(client)
        })
    }

    fn verify_request(
        &self,
        request: ClientAuthenticationRequest,
    ) -> BoxFuture<'_, Result<AuthenticatedClient, ClientAuthenticationError>> {
        Box::pin(self.authenticate_request_without_usage(request))
    }

    fn public_models(&self, client: &AuthenticatedClient) -> Vec<PublicModelId> {
        client
            .snapshot
            .public_models_for_scope(client.policy.account_scope())
    }

    fn client_model_catalog<'a>(
        &'a self,
        client: &'a AuthenticatedClient,
        protocol: &'a str,
        client_version: &'a str,
    ) -> BoxFuture<'a, Result<Vec<PublicModelDescriptor>, ProviderCatalogUnavailable>> {
        Box::pin(async move {
            let scope = client.policy.account_scope();
            let providers = &self.providers;
            let mut result = Vec::new();
            let mut seen = BTreeSet::new();
            for kind in scope.provider_kinds() {
                let provider = providers.get(kind).ok_or(ProviderCatalogUnavailable)?;
                let Some(models) = provider
                    .query_client_model_catalog(scope, protocol, client_version)
                    .await?
                else {
                    for profile in client.snapshot.profiles_for_provider_scope(kind, scope) {
                        if seen.insert(profile.model().clone()) {
                            result.push(PublicModelDescriptor::Adapted(profile));
                        }
                    }
                    continue;
                };
                // 保留上游顺序；映射只选择完整的目标对象，不能跨账号/模型混拼字段
                let by_id = models
                    .iter()
                    .map(|entry| (entry.model.as_str(), entry))
                    .collect::<std::collections::BTreeMap<_, _>>();
                for entry in &models {
                    let Some(target) = client
                        .snapshot
                        .mapped_model_for_scope(entry.model.as_str(), scope)
                    else {
                        continue;
                    };
                    if !scope.allows_provider_model(kind, &target) {
                        continue;
                    }
                    let Some(source) = by_id.get(target.as_str()) else {
                        continue;
                    };
                    let model = PublicModelId::new(entry.model.as_str().to_owned())
                        .map_err(|_| ProviderCatalogUnavailable)?;
                    // 原生目录可能比路由快照更新，不能向客户端公布当前已知不可路由的模型
                    if !client
                        .snapshot
                        .contains_public_model_for_provider_scope(&model, kind, scope)
                    {
                        continue;
                    }
                    if seen.insert(model.clone()) {
                        result.push(source.content.for_public_model(model));
                    }
                }
                for model in client.snapshot.public_models_for_scope(scope) {
                    let Some(target) = client
                        .snapshot
                        .mapped_model_for_scope(model.as_str(), scope)
                    else {
                        continue;
                    };
                    if !scope.allows_provider_model(kind, &target) {
                        continue;
                    }
                    if target == model.as_str() || seen.contains(&model) {
                        continue;
                    }
                    if !client
                        .snapshot
                        .contains_public_model_for_provider_scope(&model, kind, scope)
                    {
                        continue;
                    }
                    if let Some(source) = by_id.get(target.as_str()) {
                        seen.insert(model.clone());
                        result.push(source.content.for_public_model(model));
                    }
                }
                // 原生完整对象优先；只补入当前授权账号实际提供的独立适配画像
                for profile in client.snapshot.contributed_profiles_for_scope(kind, scope) {
                    if seen.insert(profile.model().clone()) {
                        result.push(PublicModelDescriptor::Adapted(profile));
                    }
                }
            }
            Ok(result)
        })
    }

    fn contains_public_model(&self, client: &AuthenticatedClient, model: &PublicModelId) -> bool {
        client
            .snapshot
            .contains_public_model_for_scope(model, client.policy.account_scope())
    }

    fn prepare_execution(
        &self,
        client: AuthenticatedClient,
    ) -> BoxFuture<'_, Result<PreparedRootExecution, GatewayError>> {
        Box::pin(async move { self.prepare_root_execution_inner(client).await })
    }

    fn middleware_plan(&self, prepared: &PreparedRootExecution) -> Option<FrozenMiddlewarePlan> {
        let generation = prepared.client.snapshot.extensions()?.clone();
        self.execution_extensions.as_ref()?.middleware(&generation)
    }

    fn prepare_plugin_execution(
        &self,
        identity: &ModelKeyIdentity,
    ) -> BoxFuture<'_, Result<PreparedRootExecution, GatewayError>> {
        let identity = identity.clone();
        Box::pin(async move {
            let client = self.client_for_identity(&identity, None).await?;
            self.client_api_key_usage
                .record_used(client.policy.key_id());
            PreparedRootExecution::new(client)
        })
    }

    fn start_prepared(
        &self,
        prepared: PreparedRootExecution,
        request: PreparedExecutionRequest,
    ) -> BoxFuture<'_, Result<StartedExecution, GatewayError>> {
        Box::pin(async move {
            self.start_prepared_with_target(
                prepared,
                ExecutionTarget::Model(request.public_model),
                request.operation,
                request.metadata,
            )
            .await
        })
    }

    fn start_prepared_provider_endpoint(
        &self,
        prepared: PreparedRootExecution,
        provider: ProviderKind,
        upstream_model: Option<UpstreamModelId>,
        operation: Operation,
        metadata: ExecutionRequestMetadata,
    ) -> BoxFuture<'_, Result<StartedExecution, GatewayError>> {
        Box::pin(async move {
            self.start_prepared_with_target(
                prepared,
                ExecutionTarget::ProviderEndpoint {
                    provider,
                    upstream_model,
                },
                operation,
                metadata,
            )
            .await
        })
    }

    fn start(
        &self,
        request: StartExecution,
    ) -> BoxFuture<'_, Result<StartedExecution, GatewayError>> {
        Box::pin(async move { self.start_inner(request).await })
    }

    fn start_provider_endpoint(
        &self,
        request: StartProviderExecution,
    ) -> BoxFuture<'_, Result<StartedExecution, GatewayError>> {
        Box::pin(async move { self.start_provider_endpoint_inner(request).await })
    }

    fn live_gateway(&self) -> Option<Arc<dyn crate::live::LiveGateway>> {
        self.providers
            .iter()
            .find_map(|provider| provider.live_gateway())
    }
}

impl ClientIdentityPort for DefaultExecutionService {
    fn parent_client(
        &self,
        request_id: ModelRequestId,
    ) -> BoxFuture<'_, Result<Option<AuthenticatedClient>, GatewayError>> {
        Box::pin(async move {
            let exists = self
                .active_requests
                .lock()
                .unwrap_or_else(std::sync::PoisonError::into_inner)
                .get(&request_id)
                .and_then(Weak::upgrade)
                .is_some();
            if !exists {
                return Ok(None);
            }
            let parent = self.active_request(&request_id)?;
            self.revalidate_client(&parent.client).await?;
            Ok(Some(parent.client.clone()))
        })
    }

    fn resolve_client(
        &self,
        identity: ModelKeyIdentity,
        settings: Option<RequestSettings>,
    ) -> BoxFuture<'_, Result<AuthenticatedClient, GatewayError>> {
        Box::pin(async move { self.client_for_identity(&identity, settings).await })
    }

    fn verify_client(
        &self,
        request: ClientAuthenticationRequest,
    ) -> BoxFuture<'_, Result<AuthenticatedClient, GatewayError>> {
        Box::pin(async move {
            let cancellation = request
                .invocation()
                .map(|origin| origin.cancellation.clone());
            let verification = self.verify_request(request).fuse();
            pin_mut!(verification);
            match cancellation {
                Some(cancellation) => {
                    let cancelled = cancellation.cancelled().fuse();
                    pin_mut!(cancelled);
                    select_biased! {
                        () = cancelled => Err(GatewayError::new(GatewayErrorKind::Cancelled, "client verification was cancelled")),
                        result = verification => result.map_err(authentication_gateway_error),
                    }
                }
                None => verification.await.map_err(authentication_gateway_error),
            }
        })
    }
}

impl NestedModelExecutionPort for DefaultExecutionService {
    fn models(
        &self,
        client: AuthenticatedClient,
        cancellation: CancellationToken,
        protocol: String,
        client_version: String,
    ) -> BoxFuture<'_, Result<Vec<PublicModelId>, GatewayError>> {
        Box::pin(async move {
            let cancelled = cancellation.cancelled().fuse();
            let timeout = Delay::new(DIAGNOSTIC_TIMEOUT).fuse();
            let catalog = async {
                self.revalidate_client(&client).await?;
                self.client_model_catalog(&client, &protocol, &client_version)
                    .await
                    .map_err(|_| {
                        GatewayError::new(
                            GatewayErrorKind::Internal,
                            "model catalog is unavailable",
                        )
                    })
            }
            .fuse();
            pin_mut!(cancelled, timeout, catalog);
            let models = select_biased! {
                () = cancelled => return Err(GatewayError::new(GatewayErrorKind::Cancelled, "model catalog call was cancelled")),
                () = timeout => return Err(GatewayError::new(GatewayErrorKind::Timeout, "model catalog deadline elapsed")),
                result = catalog => result?,
            };
            Ok(models
                .into_iter()
                .map(|model| match model {
                    PublicModelDescriptor::Native { model, .. } => model,
                    PublicModelDescriptor::Adapted(profile) => profile.model().clone(),
                })
                .collect())
        })
    }

    fn start(
        &self,
        request: NestedModelExecutionRequest,
    ) -> BoxFuture<'_, Result<StartedExecution, GatewayError>> {
        Box::pin(async move { self.start_nested_inner(request).await })
    }

    fn start_bound(
        &self,
        request: BoundModelExecutionRequest,
    ) -> BoxFuture<'_, Result<StartedExecution, GatewayError>> {
        Box::pin(async move { self.start_bound_model_inner(request).await })
    }
}

impl AffinityLookupPort for DefaultExecutionService {
    fn lookup(
        &self,
        request: AffinityLookupRequest,
    ) -> BoxFuture<'_, Result<Option<AffinityLookupResult>, GatewayError>> {
        Box::pin(async move { self.lookup_affinity_inner(request).await })
    }
}

#[async_trait::async_trait]
impl ClientKeyVerifier for DefaultExecutionService {
    async fn verify_client_key(
        &self,
        plaintext: &str,
    ) -> Result<ClientApiKeyId, ClientAuthenticationError> {
        self.authenticate_native(plaintext)
            .await
            .map(|identity| identity.key_id)
    }
}

impl AccountProbe for DefaultExecutionService {
    fn probe(
        &self,
        request: AccountProbeRequest,
        snapshot: Option<Arc<crate::routing::RuntimeSnapshot>>,
    ) -> BoxFuture<'_, Result<AccountProbeResult, AccountProbeError>> {
        Box::pin(async move { self.probe_inner(request, snapshot).await })
    }
}

fn restrict_model_execution_scope(
    parent_scope: &FrozenAccountScope,
    provider: Option<ProviderKind>,
    account: Option<&ProviderAccountId>,
    parent_account: Option<&ProviderAccountId>,
) -> Result<(Arc<FrozenAccountScope>, Option<ProviderKind>), GatewayError> {
    let mut account_scope = parent_scope.clone();
    if let Some(parent_account) = parent_account {
        if !parent_scope.allows(parent_account) {
            return Err(GatewayError::new(
                GatewayErrorKind::PolicyDenied,
                "parent attempt account is outside the frozen account scope",
            ));
        }
        if account == Some(parent_account) {
            return Err(GatewayError::new(
                GatewayErrorKind::PolicyDenied,
                "nested execution cannot wait for the parent attempt account",
            ));
        }
        account_scope = account_scope.excluding_account(parent_account.clone());
    }
    let required_provider = match account {
        Some(account) => {
            if !account_scope.allows(account) {
                return Err(GatewayError::new(
                    GatewayErrorKind::PolicyDenied,
                    "model account is outside the frozen authorization scope",
                ));
            }
            let account_provider = account_scope
                .account_provider(account)
                .cloned()
                .ok_or_else(|| {
                    GatewayError::new(
                        GatewayErrorKind::PolicyDenied,
                        "model account is unavailable in the frozen snapshot",
                    )
                })?;
            if provider
                .as_ref()
                .is_some_and(|provider| provider != &account_provider)
            {
                return Err(GatewayError::new(
                    GatewayErrorKind::PolicyDenied,
                    "model provider and account do not match",
                ));
            }
            Some(account_provider)
        }
        None => provider,
    };
    if required_provider
        .as_ref()
        .is_some_and(|provider| !account_scope.provider_kinds().contains(provider))
        || account_scope.provider_kinds().is_empty()
    {
        return Err(GatewayError::new(
            GatewayErrorKind::PolicyDenied,
            "model provider is outside the frozen authorization scope",
        ));
    }
    Ok((Arc::new(account_scope), required_provider))
}

fn native_bearer(
    authentication: &ClientAuthenticationRequest,
) -> Result<&str, ClientAuthenticationError> {
    Ok(authentication
        .native_bearer()
        .ok_or(ClientAuthenticationError::InvalidKey)?
        .expose_for_auth())
}

fn authority_authentication_error(error: ModelKeyAuthorityError) -> ClientAuthenticationError {
    match error {
        ModelKeyAuthorityError::InvalidKey => ClientAuthenticationError::InvalidKey,
        ModelKeyAuthorityError::Unavailable => ClientAuthenticationError::AuthorityUnavailable,
    }
}

fn attach_continuation_session_state(operation: &mut Operation, pin: &NativeContinuationPin) {
    let Some(state) = pin.session_state() else {
        return;
    };
    if state.provider() != pin.provider().as_str()
        || operation.provider_session_state(state.provider()).is_some()
    {
        return;
    }
    operation.set_provider_session_state(state.clone());
}
