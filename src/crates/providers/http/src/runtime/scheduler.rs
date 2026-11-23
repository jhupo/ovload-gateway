//! Scoped account selection, fair bounded waiting and one-shot middleware dispatch.

use super::{Credential, PublicApiProvider, adapter, error, execution, request};
use async_trait::async_trait;
use ovload_core::{
    account::{
        AccountCandidate, AccountEligibilityPolicy, AccountRuntimeSignals, AccountSelectionContext,
        AccountSelector, CredentialState, ProviderAccount,
    },
    concurrency::CapacityWait,
    engine::{
        AttemptContext,
        provider::{AccountScheduler, ProviderRequest, ScheduledProviderAttempt},
        upstream_adapter::UpstreamAdapterSelection,
    },
    error::{ProviderError, ProviderErrorKind},
    operation::Operation,
    provider_ports::{
        ProviderConcurrencyPool, ProviderLeaseAcquisition, ProviderLeaseGuard,
        ProviderLeaseRequest, ProviderSchedulingLeaseRequest,
    },
    routing::UpstreamModelId,
    upstream::UpstreamSendState,
};
use std::{collections::BTreeSet, sync::Arc, time::SystemTime};

pub(super) struct PublicApiAccountScheduler {
    pub(super) provider: Arc<PublicApiProvider>,
}

pub(super) struct SelectedAccount {
    pub(super) account: ProviderAccount,
    pub(super) credential: Credential,
    pub(super) _guard: Box<dyn ProviderLeaseGuard>,
}

#[async_trait]
impl AccountScheduler for PublicApiAccountScheduler {
    async fn schedule(
        self: Arc<Self>,
        request: ProviderRequest,
        context: AttemptContext,
    ) -> Result<ScheduledProviderAttempt, ProviderError> {
        if request.candidate().provider() != &self.provider.kind
            || !matches!(request.operation(), Operation::Generate(_))
        {
            return Err(denied());
        }
        let model = request
            .candidate()
            .upstream_model()
            .cloned()
            .ok_or_else(denied)?;
        if matches!(
            context.upstream_adapter(&self.provider.kind, &model)?,
            UpstreamAdapterSelection::Native
        ) {
            request::encode(&request)?;
        }
        let select = self.select(&request, &context, &model);
        let selected = tokio::select! {
            biased;
            _ = context.cancellation().cancelled() => return Err(error(ProviderErrorKind::Cancelled, UpstreamSendState::NotSent)),
            _ = context.deadline().wait() => return Err(error(ProviderErrorKind::Timeout, UpstreamSendState::NotSent)),
            selected = select => selected?,
        };
        let account_id = selected.account.id().clone();
        let adapter =
            context.upstream_adapter_for_account(&self.provider.kind, &model, &account_id)?;
        let selected = Arc::new(selected);
        let provider = Arc::clone(&self.provider);
        let kind = provider.kind.clone();
        let operation = request.operation().clone();
        let candidate = request.candidate().clone();
        let requirements = operation.capability_requirements();
        let terminal_context = context.clone();
        let middleware_model = model.as_str().to_owned();
        Ok(ScheduledProviderAttempt::new(
            kind.clone(),
            account_id.clone(),
            Box::pin(async move {
                context
                    .execute_middleware(
                        operation,
                        kind,
                        Some(middleware_model),
                        account_id,
                        Box::new(move |operation, headers| {
                            Box::pin(async move {
                                if operation.capability_requirements() != requirements {
                                    return Err(denied());
                                }
                                if let Some(adapter) = adapter {
                                    return adapter::stream(
                                        provider,
                                        selected,
                                        model,
                                        terminal_context,
                                        operation,
                                        headers,
                                        adapter,
                                    );
                                }
                                let body =
                                    request::encode(&ProviderRequest::new(operation, candidate))?;
                                execution::stream(
                                    provider,
                                    selected,
                                    model,
                                    terminal_context,
                                    body,
                                    headers,
                                )
                            })
                        }),
                    )
                    .await
            }),
        ))
    }
}

impl PublicApiAccountScheduler {
    async fn select(
        &self,
        request: &ProviderRequest,
        context: &AttemptContext,
        model: &UpstreamModelId,
    ) -> Result<SelectedAccount, ProviderError> {
        let policy = context.account_selection_policy().queue_policy();
        let mut waiting = CapacityWait::new(
            &self.provider.waiting,
            policy,
            context.deadline().at(),
            context.concurrency_wait_budget(),
        )
        .with_monitoring(
            context.request_id().to_string(),
            serde_json::json!({"layer":"account"}),
        );
        let account_ids = match context.required_account() {
            Some(account) => vec![account.clone()],
            None => request
                .candidate()
                .account_scope()
                .account_ids_for_model(&self.provider.kind, model.as_str())
                .cloned()
                .collect(),
        };
        'refresh: loop {
            let mut accounts = Vec::new();
            let mut refresh_failure = None;
            for account in self.provider.accounts(Some(&account_ids)).await? {
                if context
                    .required_account()
                    .is_some_and(|required| required != account.id())
                    || (!context.is_diagnostic_required_account()
                        && !request
                            .candidate()
                            .account_scope()
                            .allows_model(account.id(), model.as_str()))
                    || !account.model_access().allows(model.as_str())
                {
                    continue;
                }
                let account = match self.provider.native_fresh_account(account).await {
                    Ok(account) => account,
                    Err(error) => {
                        refresh_failure = Some(error);
                        continue;
                    }
                };
                let adapter = context.upstream_adapter_for_account(
                    &self.provider.kind,
                    model,
                    account.id(),
                )?;
                if adapter.is_some_and(|adapter| {
                    !adapter.supports_authentication(account.authentication_kind())
                }) {
                    continue;
                }
                accounts.push(account);
            }
            if accounts.is_empty()
                && let Some(error) = refresh_failure
            {
                return Err(error);
            }
            let ids = accounts
                .iter()
                .map(|account| account.id().clone())
                .collect::<Vec<_>>();
            let state = self
                .provider
                .ports
                .leases()
                .load_state(
                    context.client_api_key_ref(),
                    &self.provider.kind,
                    &ids,
                    ProviderConcurrencyPool::Shared,
                )
                .await
                .map_err(|_| infrastructure())?;
            let mut candidates = Vec::with_capacity(accounts.len());
            for account in accounts {
                let cooldown = self
                    .provider
                    .ports
                    .cooldowns()
                    .read(account.id())
                    .await
                    .map_err(|_| infrastructure())?
                    .filter(|cooldown| cooldown.credential_revision() == account.revision())
                    .map(|cooldown| cooldown.scheduling_state());
                let health = self
                    .provider
                    .ports
                    .account_feedback()
                    .scheduling_signals(&self.provider.kind, account.id());
                let signals = state
                    .signals()
                    .get(account.id())
                    .cloned()
                    .unwrap_or(AccountRuntimeSignals {
                        in_flight: 0,
                        last_started_at: None,
                        quota_reset_at: None,
                        quota_remaining_rank: None,
                        cooldown: None,
                        failure_rate_basis_points: None,
                        first_output_latency_ms: None,
                    })
                    .with_rate_limit(cooldown)
                    .with_runtime_health(health.0, health.1);
                candidates.push(AccountCandidate { account, signals });
            }
            let mut selection_context = AccountSelectionContext {
                policy: context.account_selection_policy(),
                now: SystemTime::now(),
                excluded_accounts: context.excluded_accounts().clone(),
                busy_accounts: BTreeSet::new(),
                preferred_account: None,
                preferred_account_overrides_weight: false,
                round_robin_cursor: state.round_robin_cursor(),
                eligibility: if context.is_diagnostic_required_account() {
                    AccountEligibilityPolicy::BypassForDiagnostic
                } else {
                    AccountEligibilityPolicy::Enforce
                },
                account_scope: context.account_scope().cloned(),
                reserved_concurrency: 0,
            };
            for candidate in &candidates {
                if !waiting.can_try(candidate.account.id()) {
                    selection_context
                        .busy_accounts
                        .insert(candidate.account.id().clone());
                }
            }
            loop {
                let selection = match context
                    .select_account(
                        &self.provider.kind,
                        Some(model.as_str()),
                        &candidates,
                        &mut selection_context,
                    )
                    .await
                {
                    Ok(selection) => selection,
                    Err(ovload_core::engine::policy::AccountPolicyError::StaleCandidate) => {
                        continue 'refresh;
                    }
                    Err(ovload_core::engine::policy::AccountPolicyError::Fault) => {
                        return Err(infrastructure());
                    }
                    Err(
                        ovload_core::engine::policy::AccountPolicyError::Filtered
                        | ovload_core::engine::policy::AccountPolicyError::Rejected,
                    ) => return Err(denied()),
                };
                let Some(selection) = selection else {
                    let keys = AccountSelector.wait_candidates(&candidates, &selection_context);
                    if !context.is_diagnostic_required_account()
                        && policy.max_waiting > 0
                        && !keys.is_empty()
                    {
                        AccountSelector
                            .wait_for_capacity(&mut waiting, &keys, &candidates, &selection_context)
                            .await
                            .map_err(|failure| {
                                error(failure.provider_kind(), UpstreamSendState::NotSent)
                            })?;
                        continue 'refresh;
                    }
                    return Err(error(
                        if keys.is_empty() {
                            ProviderErrorKind::NoEligibleAccount
                        } else {
                            ProviderErrorKind::AccountCapacityUnavailable
                        },
                        UpstreamSendState::NotSent,
                    ));
                };
                let account = &selection.candidate().account;
                let lease = ProviderSchedulingLeaseRequest::new(
                    self.provider.kind.clone(),
                    account.id().clone(),
                    account.revision(),
                    selection_context.concurrency_limit(account),
                    context.deadline(),
                )
                .with_cancellation(context.cancellation().clone())
                .with_metadata(context.lease_metadata());
                match self
                    .provider
                    .ports
                    .leases()
                    .try_acquire(ProviderLeaseRequest::Scheduling(lease))
                    .await
                    .map_err(|_| infrastructure())?
                {
                    ProviderLeaseAcquisition::Busy { .. } => {
                        selection_context.busy_accounts.insert(account.id().clone());
                    }
                    ProviderLeaseAcquisition::Acquired(guard) => {
                        let loaded = self
                            .provider
                            .ports
                            .accounts()
                            .load_credential(account.id(), account.revision())
                            .await
                            .map_err(|_| infrastructure())?;
                        if loaded.account.provider() != &self.provider.kind
                            || !loaded.account.model_access().allows(model.as_str())
                        {
                            return Err(denied());
                        }
                        if !context.is_diagnostic_required_account()
                            && (!loaded.account.enabled()
                                || !matches!(
                                    loaded.account.credential_state(),
                                    CredentialState::Unknown | CredentialState::Ready
                                ))
                        {
                            drop(guard);
                            continue 'refresh;
                        }
                        let credential =
                            Credential::decode(loaded.credential.expose_to_provider())?;
                        return Ok(SelectedAccount {
                            account: loaded.account,
                            credential,
                            _guard: guard,
                        });
                    }
                }
            }
        }
    }
}

fn denied() -> ProviderError {
    error(
        ProviderErrorKind::RequestPolicyDenied,
        UpstreamSendState::NotSent,
    )
    .with_retry_prohibited()
}
fn infrastructure() -> ProviderError {
    error(
        ProviderErrorKind::ProviderInfrastructureUnavailable,
        UpstreamSendState::NotSent,
    )
}
