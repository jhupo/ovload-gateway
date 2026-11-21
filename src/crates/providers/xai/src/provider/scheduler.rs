//! Grok account scheduling separated from selected-account dispatch.

use super::*;

pub(super) struct GrokAccountScheduler {
    provider: Arc<GrokBuildProvider>,
    selector: Arc<dyn GrokSessionSelector>,
}

impl GrokAccountScheduler {
    pub(super) fn new(provider: Arc<GrokBuildProvider>) -> Self {
        Self {
            selector: Arc::clone(&provider.selector),
            provider,
        }
    }
}

#[async_trait]
impl AccountScheduler for GrokAccountScheduler {
    async fn schedule(
        self: Arc<Self>,
        request: ProviderRequest,
        context: AttemptContext,
    ) -> Result<ScheduledProviderAttempt, ProviderError> {
        let candidate = request.candidate();
        if candidate.provider().as_str() != XAI_PROVIDER_NAME {
            return Err(provider_error(
                ProviderErrorKind::InvalidRequest,
                UpstreamSendState::NotSent,
            ));
        }
        preflight_context(&context)?;

        match request.operation() {
            Operation::Generate(generate) => {
                self.schedule_generate(generate, candidate, context).await
            }
            _ => Err(provider_error(
                ProviderErrorKind::Unsupported,
                UpstreamSendState::NotSent,
            )),
        }
    }
}

impl GrokAccountScheduler {
    async fn schedule_generate(
        self: Arc<Self>,
        generate: &GenerateRequest,
        candidate: &ProviderCandidate,
        context: AttemptContext,
    ) -> Result<ScheduledProviderAttempt, ProviderError> {
        let adapter =
            context.upstream_adapter(candidate.provider(), candidate_upstream_model(candidate)?)?;
        if !matches!(adapter, UpstreamAdapterSelection::Adapter(_))
            && generate
                .provider_session_state(XAI_PROVIDER_NAME)
                .is_some_and(|state| state.extension_owner().is_some())
        {
            return Err(invalid_continuation());
        }
        let selected = self
            .select_grok_attempt(generate, candidate, context, adapter)
            .await?;
        let provider_kind =
            ProviderKind::new(XAI_PROVIDER_NAME).map_err(|_| protocol_not_sent())?;
        let account_id = selected.selected.account_id().clone();
        let adapter = selected.context.upstream_adapter_for_account(
            candidate.provider(),
            &selected.upstream_model,
            &account_id,
        )?;
        let model = selected.upstream_model.as_str().to_owned();
        let middleware_context = selected.context.clone();
        let provider = Arc::clone(&self.provider);
        let operation = Operation::Generate(generate.clone());
        Ok(ScheduledProviderAttempt::new(
            provider_kind.clone(),
            account_id.clone(),
            Box::pin(async move {
                middleware_context
                    .execute_middleware(
                        operation,
                        provider_kind,
                        Some(model),
                        account_id,
                        Box::new(move |operation, middleware_headers| {
                            Box::pin(async move {
                                if let Some(adapter) = adapter {
                                    return provider.execute_upstream_adapter(
                                        operation,
                                        middleware_headers,
                                        selected,
                                        adapter,
                                    );
                                }
                                provider
                                    .execute_selected_grok(operation, middleware_headers, selected)
                                    .await
                            })
                        }),
                    )
                    .await
            }),
        ))
    }

    async fn select_grok_attempt(
        &self,
        generate: &GenerateRequest,
        candidate: &ProviderCandidate,
        context: AttemptContext,
        adapter: UpstreamAdapterSelection,
    ) -> Result<SelectedGrokAttempt, ProviderError> {
        let upstream_model = candidate_upstream_model(candidate)?;
        let (facts, native_error) = match grok_selection_facts(
            generate,
            upstream_model,
            &context,
            matches!(adapter, UpstreamAdapterSelection::Adapter(_)),
        ) {
            Ok(facts) => (facts, None),
            Err(error) if matches!(adapter, UpstreamAdapterSelection::PendingAccount) => {
                // 原生编码失败只排除原生候选，插件仍拥有自身协议；Core 的账号 owner 继续生效
                (
                    grok_selection_facts(generate, upstream_model, &context, true)?,
                    Some(error),
                )
            }
            Err(error) => return Err(error),
        };
        let selection_started_at = Instant::now();
        let selected = select_grok_session(
            self.selector.as_ref(),
            candidate,
            &facts.model,
            &context,
            facts.account,
            facts.affinity,
            native_error.is_some(),
        )
        .await
        .map_err(|error| {
            if error.kind() == ProviderErrorKind::NoEligibleAccount {
                native_error.unwrap_or(error)
            } else {
                error
            }
        })?;
        context.revalidate_model_key().await?;
        let account_selection_wait_ms =
            u64::try_from(selection_started_at.elapsed().as_millis()).unwrap_or(u64::MAX);
        Ok(SelectedGrokAttempt {
            upstream_model: upstream_model.clone(),
            selected,
            account_selection_wait_ms,
            context,
            frozen_requirements: Operation::Generate(generate.clone()).capability_requirements(),
        })
    }
}

struct GrokSelectionFacts {
    model: UpstreamModelId,
    account: Option<ProviderAccountId>,
    affinity: Option<GrokSessionAffinityKey>,
}

fn grok_selection_facts(
    generate: &GenerateRequest,
    upstream_model: &UpstreamModelId,
    context: &AttemptContext,
    adapted: bool,
) -> Result<GrokSelectionFacts, ProviderError> {
    let previous_session = if adapted {
        None
    } else {
        decode_xai_session_state(generate)?
    };
    let native_source = !adapted && generate.protocol_payload().protocol() == "openai";
    let native_compaction =
        native_source && crate::transport::compaction::has_terminal_compaction_trigger(generate);
    let (selection_model, operation_account, affinity) = if native_compaction {
        validate_compaction_context(context)?;
        let operation_account = previous_session_account(previous_session.as_ref())?;
        let request = GrokCompactionRequest::encode(
            generate,
            upstream_model.as_str(),
            context.client_api_key_ref(),
        )
        .map_err(map_request_error)?;
        let selection_model = request
            .upstream_model()
            .ok_or_else(protocol_not_sent)?
            .to_owned();
        (
            selection_model,
            merge_frozen_account_owner(context, operation_account)?,
            request.affinity().cloned(),
        )
    } else if native_source {
        let operation_account = continuation_account(context, previous_session.as_ref())?;
        let request = GrokResponsesRequest::encode(
            generate,
            upstream_model.as_str(),
            context.client_api_key_ref(),
        )
        .map_err(map_request_error)?;
        let selection_model = request
            .upstream_model()
            .ok_or_else(protocol_not_sent)?
            .to_owned();
        (
            selection_model,
            merge_frozen_account_owner(context, operation_account)?,
            request.affinity().cloned(),
        )
    } else {
        // 源协议由转换插件拥有；这里只使用冻结的候选模型与 Core 账号 owner，
        // 不把未知 JSON 中的同名字段解释为 xAI 会话或亲和事实
        let operation_account = continuation_account(context, previous_session.as_ref())?;
        (
            upstream_model.as_str().to_owned(),
            merge_frozen_account_owner(context, operation_account)?,
            None,
        )
    };
    Ok(GrokSelectionFacts {
        model: UpstreamModelId::new(selection_model).map_err(|_| protocol_not_sent())?,
        account: operation_account,
        affinity,
    })
}

async fn select_grok_session(
    selector: &dyn GrokSessionSelector,
    candidate: &ProviderCandidate,
    wire_upstream_model: &UpstreamModelId,
    context: &AttemptContext,
    operation_account: Option<ProviderAccountId>,
    affinity: Option<GrokSessionAffinityKey>,
    adapter_required: bool,
) -> Result<SelectedGrokSession, ProviderError> {
    let required_account = context.required_account().cloned().or(operation_account);
    let mut selection = GrokSessionSelection::new(
        wire_upstream_model.clone(),
        context.excluded_accounts().clone(),
        required_account.clone(),
        context.account_selection_policy(),
        context.deadline(),
        Arc::clone(candidate.account_scope()),
        context.client_api_key_ref().clone(),
    )
    .with_lease_metadata(context.lease_metadata())
    .with_cancellation(context.cancellation().clone())
    .with_concurrency_wait_budget(context.concurrency_wait_budget().clone())
    .with_request_policy(
        context.request_policy_context().cloned(),
        context.attempt_index(),
    )
    .with_eligibility_policy(if context.is_diagnostic_required_account() {
        AccountEligibilityPolicy::BypassForDiagnostic
    } else {
        AccountEligibilityPolicy::Enforce
    })
    .with_affinity(affinity);
    selection.upstream_context = Some(context.clone());
    selection.adapter_required = adapter_required;
    if context.deadline().is_elapsed() {
        return Err(provider_error(
            ProviderErrorKind::Timeout,
            UpstreamSendState::NotSent,
        ));
    }
    let cancellation = context.cancellation().clone();
    let selected = tokio::select! {
        biased;
        _ = cancellation.cancelled() => Err(provider_error(
            ProviderErrorKind::Cancelled,
            UpstreamSendState::NotSent,
        )),
        _ = context.deadline().wait() => Err(provider_error(
            ProviderErrorKind::Timeout,
            UpstreamSendState::NotSent,
        )),
        selected = selector.select(selection) => selected.map_err(map_selection_error),
    }?;
    if context.excluded_accounts().contains(selected.account_id())
        || required_account
            .as_ref()
            .is_some_and(|required| required != selected.account_id())
    {
        return Err(provider_error(
            ProviderErrorKind::Protocol,
            UpstreamSendState::NotSent,
        ));
    }
    Ok(selected)
}
