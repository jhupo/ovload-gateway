//! Codex account scheduling and one-shot dispatch planning.

use super::execution::RawJsonEndpointRequest;
use super::live::LIVE_CALLS_ENDPOINT;
use super::*;
use crate::credential::CodexSelectionModel;
use ovload_core::operation::{ProviderHttpMethod, ProviderHttpRequest};

pub(super) struct CodexAccountScheduler {
    provider: Arc<CodexProvider>,
    selector: Arc<CodexCredentialSelector>,
}

impl CodexAccountScheduler {
    pub(super) fn new(provider: Arc<CodexProvider>) -> Self {
        Self {
            selector: Arc::clone(&provider.selector),
            provider,
        }
    }
}

#[async_trait]
impl AccountScheduler for CodexAccountScheduler {
    async fn schedule(
        self: Arc<Self>,
        request: ProviderRequest,
        context: AttemptContext,
    ) -> Result<ScheduledProviderAttempt, ProviderError> {
        if request.candidate().provider().as_str() != PROVIDER_NAME {
            return Err(provider_error(
                ProviderErrorKind::InvalidRequest,
                UpstreamSendState::NotSent,
            ));
        }
        let candidate = request.candidate();
        if context.cancellation().is_cancelled() {
            return Err(provider_error(
                ProviderErrorKind::Cancelled,
                UpstreamSendState::NotSent,
            ));
        }
        if context.deadline().is_elapsed() {
            return Err(provider_error(
                ProviderErrorKind::Timeout,
                UpstreamSendState::NotSent,
            ));
        }
        if let Operation::GenerateImage(image) = request.operation() {
            return self.schedule_image(image, candidate, context).await;
        }
        if let Operation::Search(search) = request.operation() {
            return self.schedule_search(search, candidate, context).await;
        }
        if let Operation::ProviderHttp(request) = request.operation() {
            return self
                .schedule_live_call(request.clone(), candidate.upstream_model(), context)
                .await;
        }
        let Operation::Generate(generate) = request.operation() else {
            return Err(provider_error(
                ProviderErrorKind::Unsupported,
                UpstreamSendState::NotSent,
            ));
        };
        let Some(upstream_model) = candidate.upstream_model() else {
            return Err(provider_error(
                ProviderErrorKind::Protocol,
                UpstreamSendState::NotSent,
            ));
        };
        // 请求设置先形成原生正文基线；attempt 的显式改写进入终端后不再次被覆盖
        let mut operation = Operation::Generate(generate.clone());
        if context.fast_mode() != ovload_core::account::FastMode::Default
            && let Operation::Generate(generate) = &operation
            && generate.protocol_payload().protocol() == PROVIDER_NAME
        {
            let mut request =
                CodexResponsesRequest::from_body(generate.protocol_payload().body().clone());
            let supports_priority = candidate.model_presentation().is_some_and(|model| {
                model
                    .service_tiers()
                    .iter()
                    .any(|tier| tier.id() == "priority")
            });
            if request.apply_fast_policy(context.fast_mode(), supports_priority) {
                let body = serde_json::to_vec(request.body()).map_err(|_| {
                    provider_error(
                        ProviderErrorKind::InvalidRequest,
                        UpstreamSendState::NotSent,
                    )
                })?;
                operation = operation
                    .replace_middleware_wire(PROVIDER_NAME, body.into())
                    .map_err(|_| {
                        provider_error(
                            ProviderErrorKind::InvalidRequest,
                            UpstreamSendState::NotSent,
                        )
                    })?;
            }
        }
        let Operation::Generate(generate) = &operation else {
            unreachable!("generate settings keep the operation kind")
        };
        let adapter = context.upstream_adapter(candidate.provider(), upstream_model)?;
        let adapted = matches!(adapter, UpstreamAdapterSelection::Adapter(_));
        if !adapted
            && generate
                .provider_session_state(PROVIDER_NAME)
                .is_some_and(|state| state.extension_owner().is_some())
        {
            return Err(continuation_replay_required_error("scope_unavailable"));
        }
        // 其他协议必须先取得真实账号，再按固定 attempt 阶段调用转换器；选号前不能
        // 把未知正文当成 OpenAI wire 解释会话、亲和或传输字段
        let upstream = (generate.protocol_payload().protocol() == PROVIDER_NAME)
            .then(|| encode_generate_request(generate, upstream_model.as_str(), None))
            .transpose()
            .map_err(map_request_error)?;
        // 固定调度约束：Guardian 分类先于选号，不能随原生/适配器发送路径改变
        // 复用编码器的权威 metadata 解析，但只为原生路径准备续接与传输状态
        let guardian = upstream
            .as_ref()
            .is_some_and(CodexResponsesRequest::is_guardian);
        let adapter_affinity = upstream.as_ref().filter(|_| adapted).map(|request| {
            (
                derive_codex_session_affinity(request, context.client_api_key_ref()),
                derive_codex_cyber_policy_session_key(request, context.client_api_key_ref()),
                false,
            )
        });
        let preselection = upstream.filter(|_| !adapted).map(|upstream| {
            self.provider
                .prepare_generate_request(generate, upstream, &context)
        });
        if let Some(prepared) = preselection.as_ref() {
            prepared.checked_native_continuation_scope(&context)?;
        }
        let (selection_session_affinity, selection_cyber_policy_key, requires_websocket) =
            preselection.map_or(adapter_affinity.unwrap_or((None, None, false)), |prepared| {
                let requires_websocket =
                    transport_requirement(&prepared.upstream).requires_websocket()
                        || (context.continuation_attempt() == ContinuationAttempt::Native
                            && (prepared.previous_session.as_ref().is_some_and(|state| {
                                state.continuation_scope
                                    == OpenAiContinuationScope::ConnectionLocal
                            }) || matches!(context.continuation(), Some(ContinuationBinding::Pinned(binding))
                                    if binding.scope() == NativeContinuationScope::ConnectionLocal)));
                (
                    prepared.session_affinity,
                    prepared.cyber_policy_session_key,
                    requires_websocket,
                )
            });
        let selection_started_at = Instant::now();
        let selection = async {
            self.selector
                .select_with_cyber_policy(
                    &SelectCodexCredential {
                        upstream_model: upstream_model.as_str(),
                        request_url: &self.provider.responses_url,
                        attempt: &context,
                        session_affinity_key: selection_session_affinity
                            .as_ref()
                            .map(|affinity| affinity.key()),
                    },
                    selection_cyber_policy_key.as_ref(),
                    selection_session_affinity.as_ref(),
                    requires_websocket,
                    guardian,
                )
                .await
                .map_err(map_selection_error)
        };
        // 恢复期间排队也消耗启动窗口；只包住选账号，不限制业务响应时长
        let lease = if let Some(remaining) = context.connection_budget().startup_remaining() {
            tokio::time::timeout(remaining, selection)
                .await
                .map_err(|_| {
                    provider_error(ProviderErrorKind::Timeout, UpstreamSendState::NotSent)
                })??
        } else {
            selection.await?
        };
        context.revalidate_model_key().await?;
        let account_selection_wait_ms =
            u64::try_from(selection_started_at.elapsed().as_millis()).unwrap_or(u64::MAX);
        let adapter = context.upstream_adapter_for_account(
            candidate.provider(),
            upstream_model,
            lease.account_id(),
        )?;
        if adapter.is_some() {
            // 适配器自行解释业务改写，宿主轮次关联只使用本次选号已确认的会话
            self.provider
                .remember_generate_turn(
                    generate,
                    &[],
                    &context,
                    selection_session_affinity.as_ref(),
                )
                .await?;
        }
        let provider_kind = ProviderKind::new(PROVIDER_NAME)
            .map_err(|_| provider_error(ProviderErrorKind::Protocol, UpstreamSendState::NotSent))?;
        let account_id = lease.account_id().clone();
        let frozen_requirements = Operation::Generate(generate.clone()).capability_requirements();
        let provider = Arc::clone(&self.provider);
        let terminal_context = context.clone();
        let terminal_model = upstream_model.clone();
        let middleware_model = upstream_model.as_str().to_owned();
        let operation = Operation::Generate(generate.clone());
        Ok(ScheduledProviderAttempt::new(
            provider_kind.clone(),
            account_id.clone(),
            Box::pin(async move {
                context
                    .execute_middleware(
                        operation,
                        provider_kind,
                        Some(middleware_model),
                        account_id,
                        Box::new(move |operation, middleware_headers| {
                            Box::pin(async move {
                                if let Some(adapter) = adapter {
                                    return provider.execute_upstream_adapter(
                                        operation,
                                        middleware_headers,
                                        terminal_model,
                                        terminal_context,
                                        lease,
                                        account_selection_wait_ms,
                                        frozen_requirements,
                                        adapter,
                                    );
                                }
                                provider
                                    .execute_selected_generate(
                                        operation,
                                        middleware_headers,
                                        terminal_model,
                                        terminal_context,
                                        SelectedGenerate {
                                            lease,
                                            account_selection_wait_ms,
                                            frozen_requirements,
                                        },
                                    )
                                    .await
                            })
                        }),
                    )
                    .await
            }),
        ))
    }
}

impl CodexAccountScheduler {
    pub(super) async fn schedule_image(
        self: Arc<Self>,
        image: &ImageRequest,
        candidate: &ProviderCandidate,
        context: AttemptContext,
    ) -> Result<ScheduledProviderAttempt, ProviderError> {
        if image.payload().protocol() != PROVIDER_NAME || candidate.upstream_model().is_some() {
            return Err(provider_error(
                ProviderErrorKind::InvalidRequest,
                UpstreamSendState::NotSent,
            ));
        }
        let (endpoint_path, response_origin) = match image.kind() {
            ImageRequestKind::Generation => (
                CODEX_IMAGE_GENERATIONS_PATH,
                self.provider.image_generations_url.clone(),
            ),
            ImageRequestKind::Edit => (
                CODEX_IMAGE_EDITS_PATH,
                self.provider.image_edits_url.clone(),
            ),
        };
        let image_turn_id = image
            .payload()
            .context()
            .get("image_turn_id")
            .and_then(Value::as_str)
            .map(str::to_owned);
        let session_affinity = self
            .provider
            .image_session_affinity(image.payload(), &[], &context)
            .await?;
        self.schedule_raw_json_endpoint(
            context,
            RawJsonEndpointRequest {
                operation: Operation::GenerateImage(image.clone()),
                response_origin,
                endpoint_path,
                body: image.payload().body().clone(),
                image_turn_id,
                session_affinity,
            },
        )
        .await
    }

    pub(super) async fn schedule_search(
        self: Arc<Self>,
        search: &StandaloneSearchRequest,
        candidate: &ProviderCandidate,
        context: AttemptContext,
    ) -> Result<ScheduledProviderAttempt, ProviderError> {
        if search.payload().protocol() != PROVIDER_NAME || candidate.upstream_model().is_some() {
            return Err(provider_error(
                ProviderErrorKind::InvalidRequest,
                UpstreamSendState::NotSent,
            ));
        }
        let session_affinity = derive_codex_endpoint_session_affinity(
            search.payload(),
            context.client_api_key_ref(),
            "id",
        );
        let response_origin = self.provider.search_url.clone();
        self.schedule_raw_json_endpoint(
            context,
            RawJsonEndpointRequest {
                operation: Operation::Search(search.clone()),
                response_origin,
                endpoint_path: CODEX_ALPHA_SEARCH_PATH,
                body: search.payload().body().clone(),
                image_turn_id: None,
                session_affinity,
            },
        )
        .await
    }

    async fn schedule_raw_json_endpoint(
        self: Arc<Self>,
        context: AttemptContext,
        request: RawJsonEndpointRequest,
    ) -> Result<ScheduledProviderAttempt, ProviderError> {
        let requested_model = match &request.operation {
            Operation::GenerateImage(image) => endpoint_requested_model(image.payload()),
            Operation::Search(search) => endpoint_requested_model(search.payload()),
            _ => None,
        };
        let model = if matches!(&request.operation, Operation::GenerateImage(_)) {
            CodexSelectionModel::Image(requested_model.as_ref().map(|model| model.as_str()))
        } else {
            CodexSelectionModel::Search(requested_model.as_ref().map(|model| model.as_str()))
        };
        let selection_started_at = Instant::now();
        let lease = self
            .selector
            .select_for_provider_endpoint(&SelectCodexProviderEndpointCredential {
                request_url: &request.response_origin,
                attempt: &context,
                session_affinity: request.session_affinity.as_ref(),
                model,
                requires_oauth: false,
            })
            .await
            .map_err(map_selection_error)?;
        context.revalidate_model_key().await?;
        let account_selection_wait_ms =
            u64::try_from(selection_started_at.elapsed().as_millis()).unwrap_or(u64::MAX);
        let operation = request.operation.clone();
        let provider_kind = ProviderKind::new(PROVIDER_NAME)
            .map_err(|_| provider_error(ProviderErrorKind::Protocol, UpstreamSendState::NotSent))?;
        let account_id = lease.account_id().clone();
        let provider = Arc::clone(&self.provider);
        let terminal_context = context.clone();
        Ok(ScheduledProviderAttempt::new(
            provider_kind.clone(),
            account_id.clone(),
            Box::pin(async move {
                context
                    .execute_middleware(
                        operation,
                        provider_kind,
                        requested_model.map(|model| model.as_str().to_owned()),
                        account_id,
                        Box::new(move |operation, middleware_headers| {
                            Box::pin(async move {
                                provider
                                    .execute_selected_raw_json_endpoint(
                                        terminal_context,
                                        operation,
                                        middleware_headers,
                                        request,
                                        lease,
                                        account_selection_wait_ms,
                                    )
                                    .await
                            })
                        }),
                    )
                    .await
            }),
        ))
    }

    pub(super) async fn schedule_live_call(
        self: Arc<Self>,
        request: ProviderHttpRequest,
        upstream_model: Option<&UpstreamModelId>,
        context: AttemptContext,
    ) -> Result<ScheduledProviderAttempt, ProviderError> {
        if request.method() != ProviderHttpMethod::Post || request.endpoint() != LIVE_CALLS_ENDPOINT
        {
            return Err(provider_error(
                ProviderErrorKind::Unsupported,
                UpstreamSendState::NotSent,
            ));
        }
        let upstream_model = upstream_model.cloned().ok_or_else(|| {
            provider_error(
                ProviderErrorKind::InvalidRequest,
                UpstreamSendState::NotSent,
            )
        })?;
        let session_affinity =
            derive_live_session_affinity(&request, &[], context.client_api_key_ref());
        let selection_started_at = Instant::now();
        let lease = self
            .selector
            .select_for_provider_endpoint(&SelectCodexProviderEndpointCredential {
                request_url: &self.provider.live_calls_url,
                attempt: &context,
                session_affinity: session_affinity.as_ref(),
                model: CodexSelectionModel::Requested(upstream_model.as_str()),
                // realtime calls 端点绑定 ChatGPT OAuth 身份；在候选阶段就排除
                // API Key 账号，避免混合账号池选中不支持语音的账号后必然失败。
                requires_oauth: true,
            })
            .await
            .map_err(map_selection_error)?;
        if lease.authentication().oauth().is_none() {
            // 诊断等旁路仍可能到达非 OAuth 租约；此处兜底拒绝。
            return Err(provider_error(
                ProviderErrorKind::Unsupported,
                UpstreamSendState::NotSent,
            ));
        }
        let account_selection_wait_ms =
            u64::try_from(selection_started_at.elapsed().as_millis()).unwrap_or(u64::MAX);
        let operation = Operation::ProviderHttp(request);
        let provider_kind = ProviderKind::new(PROVIDER_NAME)
            .map_err(|_| provider_error(ProviderErrorKind::Protocol, UpstreamSendState::NotSent))?;
        let account_id = lease.account_id().clone();
        let provider = Arc::clone(&self.provider);
        let terminal_context = context.clone();
        Ok(ScheduledProviderAttempt::new(
            provider_kind.clone(),
            account_id.clone(),
            Box::pin(async move {
                context
                    .execute_middleware(
                        operation,
                        provider_kind,
                        Some(upstream_model.as_str().to_owned()),
                        account_id,
                        Box::new(move |operation, middleware_headers| {
                            Box::pin(async move {
                                provider
                                    .execute_selected_live_call(
                                        terminal_context,
                                        operation,
                                        upstream_model,
                                        middleware_headers,
                                        lease,
                                        account_selection_wait_ms,
                                    )
                                    .await
                            })
                        }),
                    )
                    .await
            }),
        ))
    }
}
