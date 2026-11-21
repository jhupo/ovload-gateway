//! Chat boundary projection; execution and finalization remain in Responses delivery.

mod validation;
pub(crate) use validation::{ChatDeliveryFacts, validate_response};

use std::collections::VecDeque;

use bytes::Bytes;
use futures::future::BoxFuture;
use ovload_core::{
    diagnostics::TraceContext,
    engine::middleware::{
        MiddlewareBody, MiddlewareError, MiddlewareFrame, MiddlewareFraming, MiddlewareResponse,
    },
    error::{GatewayError, GatewayErrorKind},
};
use ovload_protocol::openai::chat::{ChatStreamConverter, convert_response};

pub(crate) fn project_response(
    response: MiddlewareResponse,
    model: String,
    stream: bool,
    include_usage: bool,
    trace: TraceContext,
    facts: ChatDeliveryFacts,
) -> MiddlewareResponse {
    facts.executing(trace.clone());
    let (_, status, headers, body, envelope) = response.into_parts();
    let mut response = MiddlewareResponse::new(
        "chat_completions".to_owned(),
        status,
        headers,
        Box::new(ChatBody {
            inner: Some(body),
            model,
            stream,
            converter: None,
            include_usage,
            pending: VecDeque::new(),
            committed: false,
            finished: false,
            successful: (200..300).contains(&status),
            trace,
            facts,
        }),
    );
    if let Some(envelope) = envelope {
        response = response.with_envelope(envelope);
    }
    response
}

struct ChatBody {
    inner: Option<Box<dyn MiddlewareBody>>,
    model: String,
    stream: bool,
    converter: Option<ChatStreamConverter>,
    include_usage: bool,
    pending: VecDeque<MiddlewareFrame>,
    committed: bool,
    finished: bool,
    successful: bool,
    trace: TraceContext,
    facts: ChatDeliveryFacts,
}

impl ChatBody {
    fn invalid() -> MiddlewareError {
        MiddlewareError::Gateway(GatewayError::new(
            GatewayErrorKind::Internal,
            "upstream output cannot be represented as Chat Completions",
        ))
    }

    async fn fail_stream(&mut self) -> Result<Option<MiddlewareFrame>, MiddlewareError> {
        self.record_failure();
        self.facts.failed();
        if !self.committed {
            return Err(Self::invalid());
        }
        if let Some(inner) = self.inner.take() {
            inner.close().await;
        }
        self.finished = true;
        self.pending.push_back(MiddlewareFrame::new(Bytes::from_static(b"data: {\"error\":{\"type\":\"server_error\",\"code\":\"invalid_upstream_response\",\"message\":\"Upstream response could not be converted.\"}}\n\n"),MiddlewareFraming::SseEvent,false));
        self.pending.push_back(MiddlewareFrame::new(
            Bytes::from_static(b"data: [DONE]\n\n"),
            MiddlewareFraming::SseEvent,
            true,
        ));
        Ok(self.pending.pop_front())
    }

    fn record_failure(&self) {
        self.trace.record(
            "protocol.conversion.failed",
            serde_json::json!({
                "source": "openai", "target": "chat_completions",
                "stream": self.stream, "client_committed": self.committed,
                "execution_finalized": self.inner.as_ref().is_none_or(|inner| inner.is_finalized()),
            }),
        );
    }
}

impl MiddlewareBody for ChatBody {
    fn next_frame(&mut self) -> BoxFuture<'_, Result<Option<MiddlewareFrame>, MiddlewareError>> {
        Box::pin(async move {
            if let Some(frame) = self.pending.pop_front() {
                return Ok(Some(frame));
            }
            if self.finished {
                return Ok(None);
            }
            loop {
                let Some(inner) = self.inner.as_mut() else {
                    return Ok(None);
                };
                let frame = match inner.next_frame().await {
                    Ok(frame) => frame,
                    Err(_) if self.stream => return self.fail_stream().await,
                    Err(error) => return Err(error),
                };
                let Some(frame) = frame else {
                    self.finished = true;
                    if self.stream
                        && self.successful
                        && self.converter.as_ref().is_none_or(|c| c.finish().is_err())
                    {
                        return self.fail_stream().await;
                    }
                    return Ok(None);
                };
                if !self.successful {
                    return Ok(Some(frame));
                }
                let transformed = frame.transformed();
                if self.stream {
                    if frame.framing() != MiddlewareFraming::SseEvent {
                        return self.fail_stream().await;
                    }
                    let converter = self.converter.get_or_insert_with(|| {
                        ChatStreamConverter::new(self.model.clone(), self.include_usage)
                    });
                    let frames = match converter.push(frame.bytes()) {
                        Ok(frames) => frames,
                        Err(_) => return self.fail_stream().await,
                    };
                    for bytes in frames {
                        self.facts.observe_sse(&bytes);
                        let terminal = bytes == b"data: [DONE]\n\n";
                        self.pending.push_back(
                            MiddlewareFrame::new(
                                Bytes::from(bytes),
                                MiddlewareFraming::SseEvent,
                                terminal,
                            )
                            .with_transformed(transformed),
                        );
                    }
                    if let Some(frame) = self.pending.pop_front() {
                        return Ok(Some(frame));
                    }
                } else {
                    if frame.framing() != MiddlewareFraming::JsonDocument || !frame.terminal() {
                        self.record_failure();
                        return Err(Self::invalid());
                    }
                    let value = serde_json::from_slice(frame.bytes()).map_err(|_| {
                        self.record_failure();
                        Self::invalid()
                    })?;
                    let result = convert_response(&value, &self.model).map_err(|_| {
                        self.record_failure();
                        Self::invalid()
                    })?;
                    self.facts.observe_json(&result);
                    let bytes = serde_json::to_vec(&result).map_err(|_| Self::invalid())?;
                    return Ok(Some(
                        MiddlewareFrame::new(
                            Bytes::from(bytes),
                            MiddlewareFraming::JsonDocument,
                            true,
                        )
                        .with_transformed(transformed),
                    ));
                }
            }
        })
    }

    fn commit_downstream(
        &mut self,
        status: Option<u16>,
    ) -> BoxFuture<'_, Result<(), MiddlewareError>> {
        Box::pin(async move {
            self.inner
                .as_mut()
                .ok_or(MiddlewareError::InvalidState)?
                .commit_downstream(status)
                .await?;
            self.committed = true;
            Ok(())
        })
    }
    fn record_client_status(&mut self, status: u16) -> BoxFuture<'_, Result<(), MiddlewareError>> {
        Box::pin(async move {
            if let Some(inner) = self.inner.as_mut() {
                inner.record_client_status(status).await?;
            }
            Ok(())
        })
    }
    fn is_finalized(&self) -> bool {
        self.inner.as_ref().is_none_or(|inner| inner.is_finalized())
    }
    fn close(mut self: Box<Self>) -> BoxFuture<'static, ()> {
        Box::pin(async move {
            if let Some(inner) = self.inner.take() {
                inner.close().await;
            }
        })
    }
}
