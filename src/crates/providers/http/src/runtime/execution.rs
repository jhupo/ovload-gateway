//! Cold native HTTP execution for one concrete account lease.

use super::{
    PublicApiProvider, error, metering::NativeMetering, network, outbound,
    scheduler::SelectedAccount,
};
use futures::StreamExt;
use ovload_core::{
    account::AccountHistorySnapshot,
    engine::{
        AttemptContext,
        middleware::MiddlewareHeader,
        provider::{ProviderCallMetadata, ProviderStream},
    },
    error::{ProviderError, ProviderErrorKind},
    event::{GatewayEvent, ProviderEvent},
    routing::UpstreamModelId,
    upstream::{UpstreamSendState, UpstreamTransport},
};
use provider_openai::transport::canonical::{
    CodexCanonicalDecoder, CodexCanonicalError, CodexCanonicalOutcome,
};
use serde_json::{Map, Value};
use std::{sync::Arc, time::Duration};

pub(super) fn stream(
    provider: Arc<PublicApiProvider>,
    selected: Arc<SelectedAccount>,
    model: UpstreamModelId,
    context: AttemptContext,
    body: Map<String, Value>,
    headers: Vec<MiddlewareHeader>,
) -> Result<ProviderStream, ProviderError> {
    let metadata = ProviderCallMetadata::new(
        provider.kind.clone(),
        model.clone(),
        selected.account.id().clone(),
        UpstreamTransport::new("http")
            .map_err(|_| error(ProviderErrorKind::Protocol, UpstreamSendState::NotSent))?,
    )
    .with_account_snapshot(Some(AccountHistorySnapshot::from_account(
        &selected.account,
    )));
    let lease = Arc::clone(&selected);
    let feedback = provider.ports.account_feedback();
    let events = async_stream::try_stream! {
        let _capacity = provider.network_capacity.clone().try_acquire_owned().map_err(|_| error(ProviderErrorKind::AccountCapacityUnavailable, UpstreamSendState::NotSent))?;
        let send_started = std::sync::atomic::AtomicBool::new(false);
        let send = async {
            let prepared = outbound::prepare(&provider, &selected, &context, &model, &body, &headers).await?;
            let original = serde_json::to_vec(&body).map_err(|_| super::native::invalid())?;
            let metering = NativeMetering::new(if provider.adapter.is_native() { Some(&original) } else { prepared.request.body().and_then(reqwest::Body::as_bytes) }, provider.adapter);
            context.revalidate_model_key().await?;
            if context.cancellation().is_cancelled() { return Err(error(ProviderErrorKind::Cancelled, UpstreamSendState::NotSent)); }
            send_started.store(true, std::sync::atomic::Ordering::Relaxed);
            let response = prepared.client.execute(prepared.request).await.map_err(|failure| error(
                if failure.is_timeout() { ProviderErrorKind::Timeout } else { ProviderErrorKind::Transport },
                if failure.is_connect() { UpstreamSendState::NotSent } else { UpstreamSendState::Ambiguous },
            ))?;
            Ok((response, prepared.service_tier, metering))
        };
        let (response, requested_service_tier, mut metering) = tokio::select! {
            biased;
            _ = context.cancellation().cancelled() => Err(error(ProviderErrorKind::Cancelled, send_state(&send_started))),
            _ = context.deadline().wait() => Err(error(ProviderErrorKind::Timeout, send_state(&send_started))),
            response = send => response,
        }?;
        if !response.status().is_success() {
            let mut failure = network::status_error(response.status());
            if let Some(delay) = network::retry_after(response.headers()) { failure = failure.with_retry_after(delay); }
            provider.record_failure(&selected.account, &failure).await;
            Err(failure)?;
        }
        let is_sse = response.headers().get(reqwest::header::CONTENT_TYPE).and_then(|value| value.to_str().ok())
            .is_some_and(|value| value.split(';').next().is_some_and(|mime| mime.trim().eq_ignore_ascii_case("text/event-stream")));
        if !is_sse { Err(error(ProviderErrorKind::Protocol, UpstreamSendState::Sent))?; }
        let mut decoder = CodexCanonicalDecoder::new(model.as_str()).with_raw_sse_passthrough();
        let mut native_decoder = provider.adapter.is_native().then(|| super::native::Decoder::new(provider.kind.as_str(), model.as_str()));
        let mut bytes = response.bytes_stream();
        loop {
            let next = tokio::select! {
                biased;
                _ = context.cancellation().cancelled() => Err(error(ProviderErrorKind::Cancelled, UpstreamSendState::Sent)),
                _ = context.deadline().wait() => Err(error(ProviderErrorKind::Timeout, UpstreamSendState::Sent)),
                next = tokio::time::timeout(Duration::from_secs(300), bytes.next()) => next.map_err(|_| error(ProviderErrorKind::Timeout, UpstreamSendState::Sent)),
            }?;
            let eof = next.is_none();
            let (events, failure) = match next {
                Some(chunk) => {
                    let chunk = chunk.map_err(|_| error(ProviderErrorKind::Transport, UpstreamSendState::Sent))?;
                    if let Some(native) = &mut native_decoder { outcome(decoder.push(&native.push(&chunk)?)) } else { outcome(decoder.push(&chunk)) }
                },
                None => {
                    let final_wire = if let Some(native) = &mut native_decoder { native.finish()? } else { Vec::new() };
                    if final_wire.is_empty() { outcome(decoder.finish()) } else { outcome(decoder.push(&final_wire)) }
                },
            };
            let completed = events.iter().any(|event| event.canonical_facts().iter().any(|fact| matches!(fact, GatewayEvent::Completed(_))));
            if completed { provider.record_success(&selected.account, context.is_diagnostic_required_account()).await; }
            if let Some(failure) = failure.as_ref() { provider.record_failure(&selected.account, failure).await; }
            let explicit_pricing = context.pricing().get(provider.kind.as_str()).and_then(|models| models.get(model.as_str()));
            for event in events.into_iter().filter_map(|event| metering.project(event, requested_service_tier.as_deref(), explicit_pricing)) { yield event; }
            if let Some(failure) = failure { Err(failure)?; }
            if eof && !completed { Err(error(ProviderErrorKind::Protocol, UpstreamSendState::Sent))?; }
            if eof || completed { break; }
        }
    };
    Ok(ProviderStream::new(metadata, events, lease).with_account_feedback(feedback))
}

fn send_state(started: &std::sync::atomic::AtomicBool) -> UpstreamSendState {
    if started.load(std::sync::atomic::Ordering::Relaxed) {
        UpstreamSendState::Ambiguous
    } else {
        UpstreamSendState::NotSent
    }
}

fn outcome(outcome: CodexCanonicalOutcome) -> (Vec<ProviderEvent>, Option<ProviderError>) {
    match outcome {
        CodexCanonicalOutcome::Events(events) => (events, None),
        CodexCanonicalOutcome::Failed(failure) => {
            let (events, failure, _) = failure.into_parts();
            let failure = match failure {
                CodexCanonicalError::Protocol(failure) => failure,
                CodexCanonicalError::Upstream(failure) => {
                    let mut mapped = failure
                        .explicit_status_code
                        .and_then(|status| reqwest::StatusCode::from_u16(status).ok())
                        .map_or_else(
                            || error(ProviderErrorKind::Unavailable, UpstreamSendState::Sent),
                            network::status_error,
                        );
                    if let Some(seconds) = failure.retry_after_seconds {
                        mapped = mapped.with_retry_after(Duration::from_secs(seconds.min(3_600)));
                    }
                    mapped
                }
            };
            (events, Some(failure))
        }
    }
}
