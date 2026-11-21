use std::collections::BTreeMap;

use serde_json::{Value, json};
use sha2::{Digest as _, Sha256};

use super::{
    ConversionError, MAX_FRAME_BYTES, MAX_ITEMS,
    response::{finish_reason, identity, reasoning_is_hidden, required_text, usage},
};
use crate::openai::sse::{DONE_SSE_FRAME, parse_sse_events};

/// A bounded projection of one Responses stream; generated text is never retained.
pub struct ChatStreamConverter {
    model: String,
    include_usage: bool,
    identity: Option<(String, u64)>,
    items: BTreeMap<u64, OutputItem>,
    calls: BTreeMap<u64, ToolCall>,
    parts: BTreeMap<(u64, u64), ContentPart>,
    last_text_part: Option<(u64, u64)>,
    last_refusal_part: Option<(u64, u64)>,
    terminal: Option<(String, Value)>,
    failure: bool,
    done: bool,
    pending: Vec<u8>,
}

struct OutputItem {
    kind: OutputKind,
    done: bool,
}

#[derive(Clone, Copy, PartialEq, Eq)]
enum OutputKind {
    Message,
    FunctionCall,
    HiddenReasoning,
}

struct ToolCall {
    index: usize,
    id: String,
    name: String,
    arguments: ContentDigest,
    done: bool,
}

struct ContentPart {
    refusal: bool,
    content: ContentDigest,
    done: bool,
}

#[derive(Default)]
struct ContentDigest {
    bytes: u64,
    hash: Sha256,
}

impl ContentDigest {
    fn append(&mut self, text: &str) -> Result<(), ConversionError> {
        self.bytes = self
            .bytes
            .checked_add(text.len() as u64)
            .ok_or(ConversionError::LimitExceeded)?;
        self.hash.update(text.as_bytes());
        Ok(())
    }

    fn matches(&self, text: &str) -> bool {
        self.bytes == text.len() as u64
            && self.hash.clone().finalize() == Sha256::digest(text.as_bytes())
    }
}

impl ChatStreamConverter {
    pub fn new(model: String, include_usage: bool) -> Self {
        Self {
            model,
            include_usage,
            identity: None,
            items: BTreeMap::new(),
            calls: BTreeMap::new(),
            parts: BTreeMap::new(),
            last_text_part: None,
            last_refusal_part: None,
            terminal: None,
            failure: false,
            done: false,
            pending: Vec::new(),
        }
    }

    pub fn push(&mut self, bytes: &[u8]) -> Result<Vec<Vec<u8>>, ConversionError> {
        if self.done {
            return Err(ConversionError::InvalidResponse);
        }
        if self
            .pending
            .len()
            .checked_add(bytes.len())
            .is_none_or(|len| len > MAX_FRAME_BYTES)
        {
            return Err(ConversionError::LimitExceeded);
        }
        self.pending.extend_from_slice(bytes);
        let Some(end) = frame_end(&self.pending) else {
            return Ok(Vec::new());
        };
        if end != self.pending.len() {
            return Err(ConversionError::InvalidResponse);
        }
        let frame =
            std::str::from_utf8(&self.pending).map_err(|_| ConversionError::InvalidResponse)?;
        let done = crate::openai::sse::sse_frame_is_done(frame);
        let events = parse_sse_events(frame).map_err(|_| ConversionError::InvalidResponse)?;
        self.pending.clear();
        if events.len() > 1 {
            return Err(ConversionError::InvalidResponse);
        }
        if done {
            if !self.failure && self.terminal.is_none() {
                return Err(ConversionError::InvalidResponse);
            }
            self.done = true;
            let mut frames = Vec::new();
            // The executor confirms terminal EOF before its encoder emits DONE.
            if let Some((reason, usage)) = self.terminal.take() {
                frames.push(self.chunk(json!({}), Some(&reason), None)?);
                if self.include_usage && !usage.is_null() {
                    frames.push(self.chunk(Value::Null, None, Some(usage))?);
                }
            }
            frames.push(DONE_SSE_FRAME.as_bytes().to_vec());
            return Ok(frames);
        }
        let Some(event) = events.into_iter().next() else {
            return Ok(Vec::new());
        };
        if self.terminal.is_some() || self.failure {
            return Err(ConversionError::InvalidResponse);
        }
        let event: Value =
            serde_json::from_str(&event.data).map_err(|_| ConversionError::InvalidResponse)?;
        let kind = required_text(&event, "type")?;
        match kind {
            "response.created" => {
                let response = event
                    .get("response")
                    .ok_or(ConversionError::InvalidResponse)?;
                let found = identity(response)?;
                if self.identity.is_some() {
                    return Err(ConversionError::InvalidResponse);
                }
                self.identity = Some(found);
                Ok(vec![self.chunk(
                    json!({"role":"assistant","content":""}),
                    None,
                    None,
                )?])
            }
            "response.in_progress" => {
                let response = event
                    .get("response")
                    .ok_or(ConversionError::InvalidResponse)?;
                if self.identity.as_ref() != Some(&identity(response)?) {
                    return Err(ConversionError::InvalidResponse);
                }
                Ok(Vec::new())
            }
            "response.metadata" => {
                // Supplemental metadata has no Chat delta. It must still belong
                // to the active response and cannot replace a terminal event.
                let response_id = required_text(&event, "response_id")?;
                if self.identity.as_ref().is_none_or(|(id, _)| {
                    id.strip_prefix("chatcmpl-") != Some(response_id)
                }) || !event.get("metadata").is_some_and(Value::is_object)
                {
                    return Err(ConversionError::InvalidResponse);
                }
                Ok(Vec::new())
            }
            "response.output_item.added" => self.item_added(&event),
            "response.content_part.added" => {
                let part = event.get("part").ok_or(ConversionError::InvalidResponse)?;
                let key = part_key(&event)?;
                let item = self
                    .items
                    .get(&key.0)
                    .ok_or(ConversionError::InvalidResponse)?;
                if item.done || item.kind != OutputKind::Message {
                    return Err(ConversionError::InvalidResponse);
                }
                let refusal = part_kind(part)?;
                if self.parts.len() >= 256 || self.parts.contains_key(&key) {
                    return Err(ConversionError::LimitExceeded);
                }
                let text = required_text(part, if refusal { "refusal" } else { "text" })?;
                let mut content = ContentDigest::default();
                content.append(text)?;
                self.parts.insert(
                    key,
                    ContentPart {
                        refusal,
                        content,
                        done: false,
                    },
                );
                if text.is_empty() {
                    Ok(Vec::new())
                } else {
                    self.text_chunk(key, refusal, text)
                }
            }
            "response.output_text.delta" | "response.refusal.delta" => {
                let key = part_key(&event)?;
                let refusal = kind == "response.refusal.delta";
                let part = self
                    .parts
                    .get_mut(&key)
                    .ok_or(ConversionError::InvalidResponse)?;
                if part.done || part.refusal != refusal {
                    return Err(ConversionError::InvalidResponse);
                }
                let delta = required_text(&event, "delta")?;
                part.content.append(delta)?;
                self.text_chunk(key, refusal, delta)
            }
            "response.output_text.done" | "response.refusal.done" => {
                let key = part_key(&event)?;
                let refusal = kind == "response.refusal.done";
                let text = required_text(&event, if refusal { "refusal" } else { "text" })?;
                self.finish_part(key, refusal, text)?;
                Ok(Vec::new())
            }
            "response.content_part.done" => {
                let part = event.get("part").ok_or(ConversionError::InvalidResponse)?;
                let refusal = part_kind(part)?;
                let text = required_text(part, if refusal { "refusal" } else { "text" })?;
                self.finish_part(part_key(&event)?, refusal, text)?;
                Ok(Vec::new())
            }
            "response.function_call_arguments.delta" => {
                let output = output_index(&event)?;
                let call = self
                    .calls
                    .get_mut(&output)
                    .ok_or(ConversionError::InvalidResponse)?;
                if call.done {
                    return Err(ConversionError::InvalidResponse);
                }
                let delta = required_text(&event, "delta")?;
                call.arguments.append(delta)?;
                let index = call.index;
                Ok(vec![self.chunk(
                    json!({"tool_calls":[{"index":index,"function":{"arguments":delta}}]}),
                    None,
                    None,
                )?])
            }
            "response.function_call_arguments.done" => {
                let call = self
                    .calls
                    .get_mut(&output_index(&event)?)
                    .ok_or(ConversionError::InvalidResponse)?;
                if !call.arguments.matches(required_text(&event, "arguments")?) {
                    return Err(ConversionError::InvalidResponse);
                }
                call.done = true;
                Ok(Vec::new())
            }
            "response.output_item.done" => {
                let item = event.get("item").ok_or(ConversionError::InvalidResponse)?;
                self.finish_item(output_index(&event)?, item)?;
                Ok(Vec::new())
            }
            "response.completed" | "response.incomplete" => {
                let response = event
                    .get("response")
                    .ok_or(ConversionError::InvalidResponse)?;
                if self.identity.as_ref() != Some(&identity(response)?) {
                    return Err(ConversionError::InvalidResponse);
                }
                self.validate_terminal(response)?;
                self.terminal = Some((
                    finish_reason(response, !self.calls.is_empty())?.to_owned(),
                    usage(response)?,
                ));
                Ok(Vec::new())
            }
            "response.failed" | "error" => {
                self.failure = true;
                let error = if kind == "error" {
                    event.get("error").unwrap_or(&event)
                } else {
                    event
                        .pointer("/response/error")
                        .ok_or(ConversionError::InvalidResponse)?
                };
                if !error.is_object() {
                    return Err(ConversionError::InvalidResponse);
                }
                Ok(vec![data_frame(&json!({"error":error}))])
            }
            _ => Err(ConversionError::InvalidResponse),
        }
    }

    pub fn finish(&self) -> Result<(), ConversionError> {
        if self.done && self.pending.is_empty() {
            Ok(())
        } else {
            Err(ConversionError::InvalidResponse)
        }
    }

    fn item_added(&mut self, event: &Value) -> Result<Vec<Vec<u8>>, ConversionError> {
        let item = event.get("item").ok_or(ConversionError::InvalidResponse)?;
        let output = output_index(event)?;
        let kind = output_kind(item)?;
        if self.items.len() >= MAX_ITEMS || self.items.contains_key(&output) {
            return Err(ConversionError::LimitExceeded);
        }
        self.items.insert(output, OutputItem { kind, done: false });
        match item.get("type").and_then(Value::as_str) {
            Some("message") if item.get("role").and_then(Value::as_str) == Some("assistant") => {
                Ok(Vec::new())
            }
            Some("function_call") => {
                if self.calls.len() >= MAX_ITEMS || self.calls.contains_key(&output) {
                    return Err(ConversionError::LimitExceeded);
                }
                let index = self.calls.len();
                let id = required_text(item, "call_id")?.to_owned();
                let name = required_text(item, "name")?.to_owned();
                if !super::valid_tool_call_id(&id)
                    || name.is_empty()
                    || name.len() > 64
                    || self.calls.values().any(|call| call.id == id)
                {
                    return Err(ConversionError::InvalidResponse);
                }
                let text = required_text(item, "arguments")?;
                let mut arguments = ContentDigest::default();
                arguments.append(text)?;
                self.calls.insert(
                    output,
                    ToolCall {
                        index,
                        id: id.clone(),
                        name: name.clone(),
                        arguments,
                        done: false,
                    },
                );
                Ok(vec![self.chunk(json!({"tool_calls":[{"index":index,"id":id,"type":"function","function":{"name":name,"arguments":text}}]}), None, None)?])
            }
            Some("reasoning") if reasoning_is_hidden(item) => Ok(Vec::new()),
            _ => Err(ConversionError::InvalidResponse),
        }
    }

    fn finish_part(
        &mut self,
        key: (u64, u64),
        refusal: bool,
        text: &str,
    ) -> Result<(), ConversionError> {
        let part = self
            .parts
            .get_mut(&key)
            .ok_or(ConversionError::InvalidResponse)?;
        if part.refusal != refusal || !part.content.matches(text) {
            return Err(ConversionError::InvalidResponse);
        }
        part.done = true;
        Ok(())
    }

    fn text_chunk(
        &mut self,
        key: (u64, u64),
        refusal: bool,
        text: &str,
    ) -> Result<Vec<Vec<u8>>, ConversionError> {
        let previous = if refusal {
            &mut self.last_refusal_part
        } else {
            &mut self.last_text_part
        };
        if previous.is_some_and(|previous| previous > key) {
            return Err(ConversionError::InvalidResponse);
        }
        *previous = Some(key);
        let delta = if refusal {
            json!({"refusal":text})
        } else {
            json!({"content":text})
        };
        Ok(vec![self.chunk(delta, None, None)?])
    }

    fn validate_item(&self, output: u64, item: &Value) -> Result<(), ConversionError> {
        let registered = self
            .items
            .get(&output)
            .ok_or(ConversionError::InvalidResponse)?;
        if registered.kind != output_kind(item)? {
            return Err(ConversionError::InvalidResponse);
        }
        match item.get("type").and_then(Value::as_str) {
            Some("function_call") => {
                let call = self
                    .calls
                    .get(&output)
                    .ok_or(ConversionError::InvalidResponse)?;
                if required_text(item, "call_id")? != call.id
                    || required_text(item, "name")? != call.name
                    || !call.arguments.matches(required_text(item, "arguments")?)
                {
                    return Err(ConversionError::InvalidResponse);
                }
            }
            Some("message") if item.get("role").and_then(Value::as_str) == Some("assistant") => {
                let content = item
                    .get("content")
                    .and_then(Value::as_array)
                    .ok_or(ConversionError::InvalidResponse)?;
                if content.len()
                    != self
                        .parts
                        .keys()
                        .filter(|(index, _)| *index == output)
                        .count()
                {
                    return Err(ConversionError::InvalidResponse);
                }
                for (index, part) in content.iter().enumerate() {
                    let refusal = part_kind(part)?;
                    let current = self
                        .parts
                        .get(&(output, index as u64))
                        .ok_or(ConversionError::InvalidResponse)?;
                    if current.refusal != refusal
                        || !current.content.matches(required_text(
                            part,
                            if refusal { "refusal" } else { "text" },
                        )?)
                    {
                        return Err(ConversionError::InvalidResponse);
                    }
                }
            }
            Some("reasoning") if reasoning_is_hidden(item) => {}
            _ => return Err(ConversionError::InvalidResponse),
        }
        Ok(())
    }

    fn finish_item(&mut self, output: u64, item: &Value) -> Result<(), ConversionError> {
        self.validate_item(output, item)?;
        self.items
            .get_mut(&output)
            .ok_or(ConversionError::InvalidResponse)?
            .done = true;
        if let Some(call) = self.calls.get_mut(&output) {
            call.done = true;
        }
        for ((index, _), part) in &mut self.parts {
            if *index == output {
                part.done = true;
            }
        }
        Ok(())
    }

    fn validate_terminal(&self, response: &Value) -> Result<(), ConversionError> {
        if self
            .items
            .iter()
            .enumerate()
            .any(|(expected, (index, item))| expected as u64 != *index || !item.done)
            || self.parts.values().any(|part| !part.done)
            || self.calls.values().any(|call| !call.done)
        {
            return Err(ConversionError::InvalidResponse);
        }
        let output = match response.get("output") {
            // A native terminal can omit its output snapshot after verified item.done events.
            None => return Ok(()),
            Some(Value::Array(output)) if output.is_empty() => return Ok(()),
            Some(Value::Array(output)) => output,
            _ => return Err(ConversionError::InvalidResponse),
        };
        super::convert_response(response, &self.model)?;
        if output.len() != self.items.len() {
            return Err(ConversionError::InvalidResponse);
        }
        let mut calls = 0;
        let mut parts = 0;
        for (index, item) in output.iter().enumerate() {
            self.validate_item(index as u64, item)?;
            if item.get("type").and_then(Value::as_str) == Some("function_call") {
                calls += 1;
            }
            if let Some(content) = item.get("content").and_then(Value::as_array) {
                parts += content.len();
            }
        }
        if calls != self.calls.len() || parts != self.parts.len() {
            return Err(ConversionError::InvalidResponse);
        }
        Ok(())
    }

    fn chunk(
        &self,
        delta: Value,
        finish: Option<&str>,
        usage: Option<Value>,
    ) -> Result<Vec<u8>, ConversionError> {
        let (id, created) = self
            .identity
            .as_ref()
            .ok_or(ConversionError::InvalidResponse)?;
        let choices = if delta.is_null() {
            Vec::new()
        } else {
            vec![json!({"index":0,"delta":delta,"finish_reason":finish,"logprobs":null})]
        };
        let mut chunk = json!({"id":id,"object":"chat.completion.chunk","created":created,"model":self.model,"choices":choices});
        if self.include_usage {
            chunk["usage"] = usage.unwrap_or(Value::Null);
        }
        Ok(data_frame(&chunk))
    }
}

fn output_kind(item: &Value) -> Result<OutputKind, ConversionError> {
    match item.get("type").and_then(Value::as_str) {
        Some("message") if item.get("role").and_then(Value::as_str) == Some("assistant") => {
            Ok(OutputKind::Message)
        }
        Some("function_call") => Ok(OutputKind::FunctionCall),
        Some("reasoning") if reasoning_is_hidden(item) => Ok(OutputKind::HiddenReasoning),
        _ => Err(ConversionError::InvalidResponse),
    }
}

fn part_kind(part: &Value) -> Result<bool, ConversionError> {
    if part
        .get("annotations")
        .is_some_and(|v| !v.as_array().is_some_and(Vec::is_empty))
    {
        return Err(ConversionError::InvalidResponse);
    }
    match part.get("type").and_then(Value::as_str) {
        Some("output_text") => Ok(false),
        Some("refusal") => Ok(true),
        _ => Err(ConversionError::InvalidResponse),
    }
}

fn output_index(event: &Value) -> Result<u64, ConversionError> {
    event
        .get("output_index")
        .and_then(Value::as_u64)
        .filter(|index| *index < MAX_ITEMS as u64)
        .ok_or(ConversionError::InvalidResponse)
}

fn part_key(event: &Value) -> Result<(u64, u64), ConversionError> {
    let content = event
        .get("content_index")
        .and_then(Value::as_u64)
        .filter(|index| *index < 256)
        .ok_or(ConversionError::InvalidResponse)?;
    Ok((output_index(event)?, content))
}

fn data_frame(value: &Value) -> Vec<u8> {
    format!("data: {value}\n\n").into_bytes()
}

fn frame_end(value: &[u8]) -> Option<usize> {
    value
        .windows(2)
        .position(|p| p == b"\n\n")
        .map(|p| p + 2)
        .or_else(|| {
            value
                .windows(4)
                .position(|p| p == b"\r\n\r\n")
                .map(|p| p + 4)
        })
}
