//! Recheck Chat payloads after response middleware without trusting rewritten accounting.

use std::{
    collections::{BTreeMap, VecDeque},
    sync::{Arc, Mutex},
};

use bytes::Bytes;
use futures::future::BoxFuture;
use ovload_core::{
    diagnostics::TraceContext,
    engine::middleware::{
        MiddlewareBody, MiddlewareError, MiddlewareFrame, MiddlewareFraming, MiddlewareResponse,
    },
};
use ovload_protocol::openai::sse::{parse_sse_events, sse_frame_end, sse_frame_is_done};
use serde_json::{Value, json};

#[derive(Clone, Default)]
pub(crate) struct ChatDeliveryFacts(Arc<Mutex<Expected>>);

#[derive(Clone, Default)]
struct Expected {
    executing: bool,
    identity: Option<Value>,
    finish: Option<Value>,
    usage: Option<Value>,
    done: bool,
    trace: TraceContext,
}

impl ChatDeliveryFacts {
    pub(super) fn executing(&self, trace: TraceContext) {
        let mut expected = self
            .0
            .lock()
            .unwrap_or_else(std::sync::PoisonError::into_inner);
        expected.executing = true;
        expected.trace = trace;
    }

    pub(super) fn failed(&self) {
        self.0
            .lock()
            .unwrap_or_else(std::sync::PoisonError::into_inner)
            .done = true;
    }

    pub(super) fn observe_json(&self, value: &Value) {
        let mut expected = self
            .0
            .lock()
            .unwrap_or_else(std::sync::PoisonError::into_inner);
        expected.identity = Some(identity(value));
        expected.finish = value.pointer("/choices/0/finish_reason").cloned();
        expected.usage = Some(value.get("usage").cloned().unwrap_or(Value::Null));
        expected.done = true;
    }

    pub(super) fn observe_sse(&self, bytes: &[u8]) {
        let Ok(text) = std::str::from_utf8(bytes) else {
            return;
        };
        let Ok(events) = parse_sse_events(text) else {
            return;
        };
        let mut expected = self
            .0
            .lock()
            .unwrap_or_else(std::sync::PoisonError::into_inner);
        // The shared SSE parser intentionally omits the DONE control frame.
        if sse_frame_end(bytes) == Some(bytes.len()) && sse_frame_is_done(text) {
            expected.done = true;
        }
        for event in events {
            if event.data == "[DONE]" {
                expected.done = true;
                continue;
            }
            let Ok(value) = serde_json::from_str::<Value>(&event.data) else {
                continue;
            };
            if value.get("object").and_then(Value::as_str) == Some("chat.completion.chunk") {
                expected.identity.get_or_insert_with(|| identity(&value));
                if let Some(reason) = value
                    .pointer("/choices/0/finish_reason")
                    .filter(|reason| !reason.is_null())
                {
                    expected.finish = Some(reason.clone());
                }
                if let Some(usage) = value.get("usage").filter(|usage| !usage.is_null()) {
                    expected.usage = Some(usage.clone());
                }
            }
        }
    }

    fn snapshot(&self) -> Expected {
        self.0
            .lock()
            .unwrap_or_else(std::sync::PoisonError::into_inner)
            .clone()
    }
}

pub(crate) fn validate_response(
    response: MiddlewareResponse,
    facts: ChatDeliveryFacts,
    streaming: bool,
) -> MiddlewareResponse {
    if !(200..300).contains(&response.status_code()) {
        return response;
    }
    let (protocol, status, headers, body, envelope) = response.into_parts();
    let mut response = MiddlewareResponse::new(
        protocol,
        status,
        headers,
        Box::new(ValidatedChatBody {
            inner: Some(body),
            facts,
            streaming,
            state: DeliveryState::default(),
            committed: false,
            pending: VecDeque::new(),
            failed: false,
        }),
    );
    if let Some(envelope) = envelope {
        response = response.with_envelope(envelope);
    }
    response
}

#[derive(Default)]
struct DeliveryState {
    identity: Option<Value>,
    finished: bool,
    error: bool,
    usage: bool,
    done: bool,
    calls: BTreeMap<u64, (String, String)>,
}

impl DeliveryState {
    fn json(&mut self, value: &Value, expected: &Expected) -> Result<(), MiddlewareError> {
        if value.get("object").and_then(Value::as_str) != Some("chat.completion") {
            return Err(MiddlewareError::InvalidState);
        }
        self.check_identity(value, expected)?;
        let choices = value
            .get("choices")
            .and_then(Value::as_array)
            .filter(|choices| choices.len() == 1)
            .ok_or(MiddlewareError::InvalidState)?;
        let choice = &choices[0];
        self.check_finish(choice, expected)?;
        let message = choice.get("message").ok_or(MiddlewareError::InvalidState)?;
        if message.get("role").and_then(Value::as_str) != Some("assistant")
            || message
                .get("content")
                .is_none_or(|v| !(v.is_string() || v.is_null()))
            || message
                .get("refusal")
                .is_some_and(|v| !(v.is_string() || v.is_null()))
        {
            return Err(MiddlewareError::InvalidState);
        }
        if let Some(calls) = message.get("tool_calls") {
            let calls = calls
                .as_array()
                .filter(|calls| calls.len() <= 128)
                .ok_or(MiddlewareError::InvalidState)?;
            for (index, call) in calls.iter().enumerate() {
                let mut call = call.clone();
                call["index"] = json!(index);
                self.check_call(&call)?;
            }
        }
        let usage = value.get("usage").cloned().unwrap_or(Value::Null);
        valid_usage(&usage)?;
        if expected.executing && expected.usage.as_ref() != Some(&usage) {
            return Err(MiddlewareError::InvalidState);
        }
        self.done = true;
        Ok(())
    }

    fn sse(
        &mut self,
        bytes: &[u8],
        terminal: bool,
        expected: &Expected,
    ) -> Result<(), MiddlewareError> {
        if bytes.len() > 4 * 1024 * 1024 || self.done {
            return Err(MiddlewareError::InvalidState);
        }
        let text = std::str::from_utf8(bytes).map_err(|_| MiddlewareError::InvalidState)?;
        if sse_frame_end(bytes) != Some(bytes.len()) {
            return Err(MiddlewareError::InvalidState);
        }
        if sse_frame_is_done(text) {
            if !terminal
                || text.lines().any(|line| line.starts_with("event:"))
                || (!self.finished && !self.error)
                || (!self.error
                    && expected.executing
                    && (!expected.done || (expected.usage.is_some() && !self.usage)))
            {
                return Err(MiddlewareError::InvalidState);
            }
            self.done = true;
            return Ok(());
        }
        let events = parse_sse_events(text).map_err(|_| MiddlewareError::InvalidState)?;
        if events.is_empty() && !terminal {
            return Ok(());
        }
        if events.len() != 1 || events[0].event.is_some() {
            return Err(MiddlewareError::InvalidState);
        }
        let event = &events[0];
        if terminal {
            return Err(MiddlewareError::InvalidState);
        }
        let value: Value =
            serde_json::from_str(&event.data).map_err(|_| MiddlewareError::InvalidState)?;
        if value.get("error").is_some_and(Value::is_object) {
            if self.error {
                return Err(MiddlewareError::InvalidState);
            }
            self.error = true;
            return Ok(());
        }
        if self.error
            || value.get("object").and_then(Value::as_str) != Some("chat.completion.chunk")
        {
            return Err(MiddlewareError::InvalidState);
        }
        self.check_identity(&value, expected)?;
        let choices = value
            .get("choices")
            .and_then(Value::as_array)
            .ok_or(MiddlewareError::InvalidState)?;
        if choices.is_empty() {
            let usage = value
                .get("usage")
                .filter(|usage| !usage.is_null())
                .ok_or(MiddlewareError::InvalidState)?;
            valid_usage(usage)?;
            if !self.finished
                || self.usage
                || (expected.executing && expected.usage.as_ref() != Some(usage))
            {
                return Err(MiddlewareError::InvalidState);
            }
            self.usage = true;
            return Ok(());
        }
        if choices.len() != 1
            || self.finished
            || value.get("usage").is_some_and(|usage| !usage.is_null())
        {
            return Err(MiddlewareError::InvalidState);
        }
        let choice = &choices[0];
        if choice.get("index").and_then(Value::as_u64) != Some(0) {
            return Err(MiddlewareError::InvalidState);
        }
        let delta = choice
            .get("delta")
            .and_then(Value::as_object)
            .ok_or(MiddlewareError::InvalidState)?;
        if delta
            .keys()
            .any(|key| !matches!(key.as_str(), "role" | "content" | "refusal" | "tool_calls"))
            || delta
                .get("role")
                .is_some_and(|role| role.as_str() != Some("assistant"))
            || ["content", "refusal"]
                .iter()
                .any(|key| delta.get(*key).is_some_and(|value| !value.is_string()))
        {
            return Err(MiddlewareError::InvalidState);
        }
        if let Some(calls) = delta.get("tool_calls") {
            for call in calls
                .as_array()
                .filter(|calls| calls.len() <= 128)
                .ok_or(MiddlewareError::InvalidState)?
            {
                self.check_call(call)?;
            }
        }
        if choice
            .get("finish_reason")
            .is_some_and(|reason| !reason.is_null())
        {
            if !delta.is_empty() {
                return Err(MiddlewareError::InvalidState);
            }
            self.check_finish(choice, expected)?;
            self.finished = true;
        }
        Ok(())
    }

    fn check_identity(
        &mut self,
        value: &Value,
        expected: &Expected,
    ) -> Result<(), MiddlewareError> {
        let actual = identity(value);
        if value
            .get("id")
            .and_then(Value::as_str)
            .is_none_or(|id| id.is_empty() || id.len() > 512)
            || value
                .get("model")
                .and_then(Value::as_str)
                .is_none_or(|model| model.is_empty() || model.len() > 256)
            || value.get("created").and_then(Value::as_u64).is_none()
            || self
                .identity
                .as_ref()
                .is_some_and(|identity| identity != &actual)
            || (expected.executing && expected.identity.as_ref() != Some(&actual))
        {
            return Err(MiddlewareError::InvalidState);
        }
        self.identity.get_or_insert(actual);
        Ok(())
    }

    fn check_finish(&self, choice: &Value, expected: &Expected) -> Result<(), MiddlewareError> {
        let reason = choice
            .get("finish_reason")
            .ok_or(MiddlewareError::InvalidState)?;
        if choice.get("index").and_then(Value::as_u64) != Some(0)
            || !matches!(
                reason.as_str(),
                Some("stop" | "length" | "content_filter" | "tool_calls")
            )
            || (expected.executing && (!expected.done || expected.finish.as_ref() != Some(reason)))
        {
            return Err(MiddlewareError::InvalidState);
        }
        Ok(())
    }

    fn check_call(&mut self, call: &Value) -> Result<(), MiddlewareError> {
        let index = call
            .get("index")
            .and_then(Value::as_u64)
            .filter(|index| *index < 128)
            .ok_or(MiddlewareError::InvalidState)?;
        let function = call
            .get("function")
            .and_then(Value::as_object)
            .ok_or(MiddlewareError::InvalidState)?;
        if function
            .keys()
            .any(|key| !matches!(key.as_str(), "name" | "arguments"))
            || function
                .get("arguments")
                .is_some_and(|args| !args.is_string())
        {
            return Err(MiddlewareError::InvalidState);
        }
        if let Some((id, name)) = self.calls.get(&index) {
            if call
                .get("id")
                .is_some_and(|value| value.as_str() != Some(id.as_str()))
                || function
                    .get("name")
                    .is_some_and(|value| value.as_str() != Some(name.as_str()))
            {
                return Err(MiddlewareError::InvalidState);
            }
        } else {
            let id = call
                .get("id")
                .and_then(Value::as_str)
                .filter(|id| ovload_protocol::openai::chat::valid_tool_call_id(id))
                .ok_or(MiddlewareError::InvalidState)?;
            let name = function
                .get("name")
                .and_then(Value::as_str)
                .filter(|name| !name.is_empty() && name.len() <= 64)
                .ok_or(MiddlewareError::InvalidState)?;
            if call.get("type").and_then(Value::as_str) != Some("function")
                || self.calls.values().any(|(other, _)| other == id)
            {
                return Err(MiddlewareError::InvalidState);
            }
            self.calls.insert(index, (id.to_owned(), name.to_owned()));
        }
        Ok(())
    }
}

struct ValidatedChatBody {
    inner: Option<Box<dyn MiddlewareBody>>,
    facts: ChatDeliveryFacts,
    streaming: bool,
    state: DeliveryState,
    committed: bool,
    pending: VecDeque<MiddlewareFrame>,
    failed: bool,
}

impl ValidatedChatBody {
    async fn fail(&mut self) -> Result<Option<MiddlewareFrame>, MiddlewareError> {
        self.facts.snapshot().trace.record("protocol.delivery.rejected", json!({"protocol":"chat_completions","stream":self.streaming,"client_committed":self.committed}));
        if !self.streaming || !self.committed {
            return Err(MiddlewareError::InvalidState);
        }
        if let Some(inner) = self.inner.take() {
            inner.close().await;
        }
        self.failed = true;
        self.pending.push_back(MiddlewareFrame::new(
            Bytes::from_static(b"data: [DONE]\n\n"),
            MiddlewareFraming::SseEvent,
            true,
        ));
        Ok(Some(MiddlewareFrame::new(Bytes::from_static(b"data: {\"error\":{\"type\":\"server_error\",\"code\":\"middleware_failed\",\"message\":\"Response middleware returned an invalid Chat stream.\"}}\n\n"), MiddlewareFraming::SseEvent, false)))
    }
}

impl MiddlewareBody for ValidatedChatBody {
    fn next_frame(&mut self) -> BoxFuture<'_, Result<Option<MiddlewareFrame>, MiddlewareError>> {
        Box::pin(async move {
            if let Some(frame) = self.pending.pop_front() {
                return Ok(Some(frame));
            }
            if self.failed {
                return Ok(None);
            }
            let Some(inner) = self.inner.as_mut() else {
                return Ok(None);
            };
            let frame = match inner.next_frame().await {
                Ok(frame) => frame,
                Err(_) => return self.fail().await,
            };
            let Some(frame) = frame else {
                if !self.state.done {
                    return self.fail().await;
                }
                return Ok(None);
            };
            let expected = self.facts.snapshot();
            let valid = if self.streaming && frame.framing() == MiddlewareFraming::SseEvent {
                self.state.sse(frame.bytes(), frame.terminal(), &expected)
            } else if !self.streaming
                && frame.framing() == MiddlewareFraming::JsonDocument
                && frame.terminal()
            {
                serde_json::from_slice(frame.bytes())
                    .map_err(|_| MiddlewareError::InvalidState)
                    .and_then(|value| self.state.json(&value, &expected))
            } else {
                Err(MiddlewareError::InvalidState)
            };
            if valid.is_err() {
                return self.fail().await;
            }
            Ok(Some(frame))
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

fn identity(value: &Value) -> Value {
    json!({"id":value.get("id"),"created":value.get("created"),"model":value.get("model")})
}

fn valid_usage(value: &Value) -> Result<(), MiddlewareError> {
    if value.is_null() {
        return Ok(());
    }
    let input = value
        .get("prompt_tokens")
        .and_then(Value::as_u64)
        .ok_or(MiddlewareError::InvalidState)?;
    let output = value
        .get("completion_tokens")
        .and_then(Value::as_u64)
        .ok_or(MiddlewareError::InvalidState)?;
    if input.checked_add(output) != value.get("total_tokens").and_then(Value::as_u64)
        || value
            .pointer("/prompt_tokens_details/cached_tokens")
            .is_some_and(|v| v.as_u64().is_none_or(|v| v > input))
        || value
            .pointer("/completion_tokens_details/reasoning_tokens")
            .is_some_and(|v| v.as_u64().is_none_or(|v| v > output))
    {
        return Err(MiddlewareError::InvalidState);
    }
    Ok(())
}

#[cfg(test)]
mod tests {
    use super::*;

    fn frame(value: Value) -> Vec<u8> {
        format!("data: {value}\n\n").into_bytes()
    }

    #[test]
    fn chat_done_control_frame_preserves_valid_completion_with_or_without_usage() {
        for include_usage in [false, true] {
            let facts = ChatDeliveryFacts::default();
            facts.executing(TraceContext::default());
            let mut state = DeliveryState::default();
            let mut chunk = json!({"id":"chatcmpl-test","object":"chat.completion.chunk","created":1,"model":"test","choices":[{"index":0,"delta":{"role":"assistant","content":"OK"},"finish_reason":null}]});
            let first = frame(chunk.clone());
            facts.observe_sse(&first);
            state.sse(&first, false, &facts.snapshot()).unwrap();
            chunk["choices"][0]["delta"] = json!({});
            chunk["choices"][0]["finish_reason"] = json!("stop");
            let finish = frame(chunk.clone());
            facts.observe_sse(&finish);
            let usage = frame(json!({"id":"chatcmpl-test","object":"chat.completion.chunk","created":1,"model":"test","choices":[],"usage":{"prompt_tokens":1,"completion_tokens":1,"total_tokens":2}}));
            if include_usage {
                facts.observe_sse(&usage);
            }
            let done = b"data: [DONE]\n\n";
            facts.observe_sse(done);
            assert!(facts.snapshot().done);
            state.sse(&finish, false, &facts.snapshot()).unwrap();
            if include_usage {
                state.sse(&usage, false, &facts.snapshot()).unwrap();
            }
            state.sse(done, true, &facts.snapshot()).unwrap();
            assert!(state.done);
            assert!(state.sse(done, true, &facts.snapshot()).is_err());
        }
    }

    #[test]
    fn chat_done_rejects_premature_nonterminal_and_combined_frames() {
        let expected = Expected { done: true, ..Expected::default() };
        assert!(DeliveryState::default().sse(b"data: [DONE]\n\n", true, &expected).is_err());
        for (bytes, terminal) in [
            (b"data: [DONE]\n\n".as_slice(), false),
            (b"data: [DONE]\n\ndata: {}\n\n".as_slice(), true),
            (b"event: forged\ndata: [DONE]\n\n".as_slice(), true),
        ] {
            let mut state = DeliveryState { finished: true, ..DeliveryState::default() };
            assert!(state.sse(bytes, terminal, &expected).is_err());
        }
    }
}
