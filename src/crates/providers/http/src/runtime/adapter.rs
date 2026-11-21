//! Managed adapters receive only the account selected and leased for this attempt.

use super::{PublicApiProvider, error, pricing, scheduler::SelectedAccount};
use bytes::Bytes;
use futures::{StreamExt, future::BoxFuture};
use ovload_core::{
    account::{CredentialRevision, OutboundProxy, ProviderAccountId},
    engine::{
        AttemptContext,
        middleware::MiddlewareHeader,
        provider::{ProviderCallMetadata, ProviderStream},
        upstream_adapter::{UpstreamAccountConnection, UpstreamAdapter, UpstreamAdapterInvocation},
    },
    error::{ProviderError, ProviderErrorKind},
    event::GatewayEvent,
    metering::{CalculatedCost, Usage},
    operation::Operation,
    routing::UpstreamModelId,
    upstream::{UpstreamSendState, UpstreamTransport},
};
use std::sync::Arc;

struct Connection {
    provider: Arc<PublicApiProvider>,
    selected: Arc<SelectedAccount>,
    context: AttemptContext,
    model: UpstreamModelId,
    requested_service_tier: Option<String>,
}

pub(super) fn stream(
    provider: Arc<PublicApiProvider>,
    selected: Arc<SelectedAccount>,
    model: UpstreamModelId,
    context: AttemptContext,
    operation: Operation,
    headers: Vec<MiddlewareHeader>,
    adapter: Arc<dyn UpstreamAdapter>,
) -> Result<ProviderStream, ProviderError> {
    if !adapter.supports_authentication(selected.account.authentication_kind()) {
        return Err(
            error(ProviderErrorKind::Unsupported, UpstreamSendState::NotSent)
                .with_retry_prohibited(),
        );
    }
    let metadata = ProviderCallMetadata::new(
        provider.kind.clone(),
        model.clone(),
        selected.account.id().clone(),
        UpstreamTransport::new(adapter.transport())
            .map_err(|_| error(ProviderErrorKind::Protocol, UpstreamSendState::NotSent))?,
    )
    .with_account_snapshot(Some(
        ovload_core::account::AccountHistorySnapshot::from_account(&selected.account),
    ));
    let requested_service_tier = match &operation {
        Operation::Generate(generate) => generate
            .protocol_payload()
            .body()
            .get("service_tier")
            .and_then(serde_json::Value::as_str)
            .map(str::to_owned),
        _ => None,
    };
    let connection = Arc::new(Connection {
        provider: Arc::clone(&provider),
        selected: Arc::clone(&selected),
        context: context.clone(),
        model,
        requested_service_tier,
    });
    let mut upstream = adapter.execute(UpstreamAdapterInvocation {
        operation,
        headers,
        context: context.clone(),
        metadata: metadata.clone(),
        account: connection,
    });
    let feedback = provider.ports.account_feedback();
    let lease = Arc::clone(&selected);
    let events = async_stream::try_stream! {
        if context.cancellation().is_cancelled() { Err(error(ProviderErrorKind::Cancelled, UpstreamSendState::NotSent))?; }
        if context.deadline().is_elapsed() { Err(error(ProviderErrorKind::Timeout, UpstreamSendState::NotSent))?; }
        loop {
            let next = tokio::select! {
                biased;
                _ = context.cancellation().cancelled() => Err(error(ProviderErrorKind::Cancelled, UpstreamSendState::Ambiguous)),
                _ = context.deadline().wait() => Err(error(ProviderErrorKind::Timeout, UpstreamSendState::Ambiguous)),
                next = upstream.next() => Ok(next),
            }?;
            let Some(event) = next else { break; };
            match event {
                Ok(event) => {
                    let completed = event.canonical_facts().iter().any(|fact| matches!(fact, GatewayEvent::Completed(_)));
                    if completed { provider.record_success(&selected.account, context.is_diagnostic_required_account()).await; }
                    yield event;
                    if completed { break; }
                }
                // The adapter runtime records failures through the selected connection.
                Err(failure) => { Err(failure)?; }
            }
        }
    };
    Ok(ProviderStream::new(metadata, events, lease).with_account_feedback(feedback))
}

impl UpstreamAccountConnection for Connection {
    fn account_id(&self) -> &ProviderAccountId {
        self.selected.account.id()
    }
    fn credential_revision(&self) -> CredentialRevision {
        self.selected.account.revision()
    }
    fn authentication_kind(&self) -> &str {
        self.selected.account.authentication_kind()
    }
    fn outbound_proxy(&self) -> Option<&OutboundProxy> {
        self.selected.account.outbound_proxy()
    }
    fn authorization(&self) -> Result<Vec<MiddlewareHeader>, ProviderError> {
        if self.provider.adapter.is_native() {
            let mut headers =
                super::native::headers(self.provider.kind.as_str(), &self.selected.credential)?;
            if self.selected.credential.oauth.is_some() {
                super::native::profile::apply(
                    self.provider.kind.as_str(),
                    self.context.request_profile(),
                    &mut headers,
                )?;
                if self.provider.adapter.is_gemini() {
                    let value = headers
                        .get("user-agent")
                        .and_then(|value| value.to_str().ok())
                        .ok_or_else(super::native::invalid)?
                        .replace("{model}", self.model.as_str());
                    headers.insert(
                        "user-agent",
                        reqwest::header::HeaderValue::from_str(&value)
                            .map_err(|_| super::native::invalid())?,
                    );
                }
            }
            return Ok(headers
                .iter()
                .map(|(name, value)| {
                    MiddlewareHeader::new(name.as_str(), Bytes::copy_from_slice(value.as_bytes()))
                })
                .collect());
        }
        Ok(vec![MiddlewareHeader::new(
            "authorization",
            Bytes::from(format!("Bearer {}", self.selected.credential.api_key)),
        )])
    }
    fn calculate_cost(&self, service_tier: Option<&str>, usage: &Usage) -> Option<CalculatedCost> {
        pricing::evaluate(
            usage,
            service_tier.or(self.requested_service_tier.as_deref()),
            self.context
                .pricing()
                .get(self.provider.kind.as_str())
                .and_then(|models| models.get(self.model.as_str())),
        )
        .map(|breakdown| breakdown.calculated_cost())
    }
    fn record_failure(&self, failure: ProviderError) -> BoxFuture<'_, ProviderError> {
        Box::pin(async move {
            self.provider
                .record_failure(&self.selected.account, &failure)
                .await;
            failure
        })
    }
}
