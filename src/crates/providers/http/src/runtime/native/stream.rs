//! Bounded native SSE translation into the gateway's Responses wire contract.
use super::protocol;
use base64::{Engine as _, engine::general_purpose::STANDARD};
use ovload_core::error::ProviderError;
use ovload_protocol::openai::sse::SseEventDecoder;
use serde_json::{Value, json};
use std::collections::BTreeMap;

pub(in super::super) struct Decoder {
    kind: String,
    model: String,
    id: String,
    created_at: u64,
    parser: SseEventDecoder,
    started: bool,
    done: bool,
    finished: bool,
    incomplete: bool,
    outputs: Vec<Value>,
    blocks: BTreeMap<u64, usize>,
    usage: Value,
    bytes: usize,
    sequence: u64,
    claude_input: Option<u64>,
}

impl Decoder {
    pub(in super::super) fn new(kind: &str, model: &str) -> Self {
        Self {
            kind: kind.into(),
            model: model.into(),
            id: format!("resp_{}", uuid::Uuid::now_v7().simple()),
            created_at: chrono::Utc::now().timestamp().max(0) as u64,
            parser: SseEventDecoder::default(),
            started: false,
            done: false,
            finished: false,
            incomplete: false,
            outputs: Vec::new(),
            blocks: BTreeMap::new(),
            usage: json!({}),
            bytes: 0,
            sequence: 0,
            claude_input: None,
        }
    }
    pub(in super::super) fn push(&mut self, chunk: &[u8]) -> Result<Vec<u8>, ProviderError> {
        self.bytes = self.bytes.checked_add(chunk.len()).ok_or_else(protocol)?;
        if self.bytes > 32 * 1024 * 1024 {
            return Err(protocol());
        }
        let events = self.parser.push(chunk).map_err(|_| protocol())?;
        let mut wire = Vec::new();
        for event in events {
            if event.data.trim().is_empty() {
                continue;
            }
            if self.done {
                return Err(protocol());
            }
            let value: Value = serde_json::from_str(&event.data).map_err(|_| protocol())?;
            if value.get("error").is_some()
                || value.get("type").and_then(Value::as_str) == Some("error")
            {
                return Err(protocol());
            }
            if !self.started {
                self.started = true;
                self.emit(json!({"type":"response.created","response":{"id":self.id,"object":"response","created_at":self.created_at,"model":self.model,"status":"in_progress","output":[]}}), &mut wire)?;
            }
            if self.kind == "claude" {
                self.claude(&value, &mut wire)?;
            } else {
                self.gemini(value.get("response").unwrap_or(&value), &mut wire)?;
            }
        }
        Ok(wire)
    }
    pub(in super::super) fn finish(&mut self) -> Result<Vec<u8>, ProviderError> {
        let pending = self.parser.finish().map_err(|_| protocol())?;
        if !pending.is_empty() {
            return Err(protocol());
        }
        let mut wire = Vec::new();
        if !self.done {
            if self.kind != "gemini" || !self.finished {
                return Err(protocol());
            }
            self.complete(&mut wire)?;
        }
        Ok(wire)
    }
    fn emit(&mut self, mut value: Value, wire: &mut Vec<u8>) -> Result<(), ProviderError> {
        value["sequence_number"] = json!(self.sequence);
        self.sequence += 1;
        let kind = value
            .get("type")
            .and_then(Value::as_str)
            .ok_or_else(protocol)?;
        wire.extend_from_slice(format!("event: {kind}\ndata: ").as_bytes());
        serde_json::to_writer(&mut *wire, &value).map_err(|_| protocol())?;
        wire.extend_from_slice(b"\n\n");
        Ok(())
    }
    fn add(&mut self, item: Value, wire: &mut Vec<u8>) -> Result<usize, ProviderError> {
        if self.outputs.len() >= 128 {
            return Err(protocol());
        }
        let index = self.outputs.len();
        self.outputs.push(item.clone());
        self.emit(
            json!({"type":"response.output_item.added","output_index":index,"item":item}),
            wire,
        )?;
        if item["type"] == "message" {
            let part = item
                .get("content")
                .and_then(Value::as_array)
                .and_then(|parts| parts.first())
                .cloned()
                .ok_or_else(protocol)?;
            self.emit(json!({"type":"response.content_part.added","output_index":index,"item_id":item["id"],"content_index":0,"part":part}),wire)?;
        }
        Ok(index)
    }
    fn text_item(&mut self, wire: &mut Vec<u8>) -> Result<usize, ProviderError> {
        self.add(json!({"type":"message","id":format!("msg_{}_{}",self.id,self.outputs.len()),"role":"assistant","status":"in_progress","content":[{"type":"output_text","text":"","annotations":[]}]}),wire)
    }
    fn delta(
        &mut self,
        index: usize,
        delta: &str,
        wire: &mut Vec<u8>,
    ) -> Result<(), ProviderError> {
        let item = self.outputs.get_mut(index).ok_or_else(protocol)?;
        let tool = item["type"] == "function_call";
        let text = if tool {
            item.get_mut("arguments")
        } else {
            item.get_mut("content")
                .and_then(Value::as_array_mut)
                .and_then(|parts| parts.first_mut())
                .and_then(|part| part.get_mut("text"))
        }
        .ok_or_else(protocol)?;
        let mut accumulated = text.as_str().ok_or_else(protocol)?.to_owned();
        if accumulated.len().saturating_add(delta.len()) > 8 * 1024 * 1024 {
            return Err(protocol());
        }
        accumulated.push_str(delta);
        *text = json!(accumulated);
        let id = item["id"].clone();
        self.emit(json!({"type":if tool {"response.function_call_arguments.delta"}else{"response.output_text.delta"},"output_index":index,"item_id":id,"content_index":0,"delta":delta}),wire)
    }
    fn complete(&mut self, wire: &mut Vec<u8>) -> Result<(), ProviderError> {
        let input = self
            .usage
            .get("input_tokens")
            .and_then(Value::as_u64)
            .ok_or_else(protocol)?;
        let output = self
            .usage
            .get("output_tokens")
            .and_then(Value::as_u64)
            .ok_or_else(protocol)?;
        self.usage["total_tokens"] = json!(input.checked_add(output).ok_or_else(protocol)?);
        for index in 0..self.outputs.len() {
            let mut item = self.outputs[index].clone();
            item["status"] = json!("completed");
            if item["type"] == "function_call" {
                if item["arguments"] == "" {
                    item["arguments"] = json!("{}");
                }
                let args: Value =
                    serde_json::from_str(item["arguments"].as_str().ok_or_else(protocol)?)
                        .map_err(|_| protocol())?;
                if !args.is_object() {
                    return Err(protocol());
                }
                self.emit(json!({"type":"response.function_call_arguments.done","output_index":index,"item_id":item["id"],"arguments":item["arguments"]}),wire)?;
            } else {
                let part = item
                    .get("content")
                    .and_then(Value::as_array)
                    .and_then(|parts| parts.first())
                    .ok_or_else(protocol)?;
                if part.get("type").and_then(Value::as_str) == Some("output_text") {
                    self.emit(json!({"type":"response.output_text.done","output_index":index,"item_id":item["id"],"content_index":0,"text":part["text"]}),wire)?;
                }
                self.emit(json!({"type":"response.content_part.done","output_index":index,"item_id":item["id"],"content_index":0,"part":part}),wire)?;
            }
            self.outputs[index] = item.clone();
            self.emit(
                json!({"type":"response.output_item.done","output_index":index,"item":item}),
                wire,
            )?;
        }
        let status = if self.incomplete {
            "incomplete"
        } else {
            "completed"
        };
        self.emit(json!({"type":format!("response.{status}"),"response":{"id":self.id,"object":"response","created_at":self.created_at,"model":self.model,"status":status,"output":self.outputs,"usage":self.usage,"incomplete_details":if self.incomplete {json!({"reason":"max_output_tokens"})}else{Value::Null}}}),wire)?;
        self.done = true;
        Ok(())
    }
    fn claude(&mut self, value: &Value, wire: &mut Vec<u8>) -> Result<(), ProviderError> {
        match value
            .get("type")
            .and_then(Value::as_str)
            .ok_or_else(protocol)?
        {
            "message_start" => {
                self.claude_usage(&value["message"]["usage"])?;
            }
            "content_block_start" => {
                let block = value
                    .get("index")
                    .and_then(Value::as_u64)
                    .ok_or_else(protocol)?;
                if self.blocks.contains_key(&block) {
                    return Err(protocol());
                }
                let content = &value["content_block"];
                let index = match content["type"].as_str() {
                    Some("text") => self.text_item(wire)?,
                    Some("tool_use") => self.add(json!({"type":"function_call","id":format!("fc_{}_{}",self.id,self.outputs.len()),"call_id":content.get("id").and_then(Value::as_str).ok_or_else(protocol)?,"name":content.get("name").and_then(Value::as_str).ok_or_else(protocol)?,"arguments":"","status":"in_progress"}),wire)?,
                    _ => return Err(protocol()),
                };
                self.blocks.insert(block, index);
                if let Some(text) = content
                    .get("text")
                    .and_then(Value::as_str)
                    .filter(|text| !text.is_empty())
                {
                    self.delta(index, text, wire)?;
                }
            }
            "content_block_delta" => {
                let index = *self
                    .blocks
                    .get(
                        &value
                            .get("index")
                            .and_then(Value::as_u64)
                            .ok_or_else(protocol)?,
                    )
                    .ok_or_else(protocol)?;
                let delta = &value["delta"];
                let text = match delta["type"].as_str() {
                    Some("text_delta") => delta.get("text"),
                    Some("input_json_delta") => delta.get("partial_json"),
                    _ => return Err(protocol()),
                }
                .and_then(Value::as_str)
                .ok_or_else(protocol)?;
                self.delta(index, text, wire)?;
            }
            "content_block_stop" | "ping" => {}
            "message_delta" => {
                self.claude_usage(&value["usage"])?;
                self.finished = true;
                self.incomplete = value["delta"]["stop_reason"] == "max_tokens";
            }
            "message_stop" => {
                if !self.finished {
                    return Err(protocol());
                }
                self.complete(wire)?;
            }
            _ => return Err(protocol()),
        }
        Ok(())
    }
    fn claude_usage(&mut self, value: &Value) -> Result<(), ProviderError> {
        if let Some(input) = value.get("input_tokens") {
            self.claude_input = Some(input.as_u64().ok_or_else(protocol)?);
        }
        if let Some(input) = self.claude_input {
            let read = value
                .get("cache_read_input_tokens")
                .or_else(|| {
                    self.usage
                        .get("input_tokens_details")
                        .and_then(|details| details.get("cached_tokens"))
                })
                .map_or(Ok(0), |v| v.as_u64().ok_or_else(protocol))?;
            let write = value
                .get("cache_creation_input_tokens")
                .or_else(|| {
                    self.usage
                        .get("input_tokens_details")
                        .and_then(|details| details.get("cache_write_tokens"))
                })
                .map_or(Ok(0), |v| v.as_u64().ok_or_else(protocol))?;
            self.usage["input_tokens"] = json!(
                input
                    .checked_add(read)
                    .and_then(|n| n.checked_add(write))
                    .ok_or_else(protocol)?
            );
            self.usage["input_tokens_details"] =
                json!({"cached_tokens":read,"cache_write_tokens":write});
        }
        if let Some(output) = value.get("output_tokens") {
            self.usage["output_tokens"] = json!(output.as_u64().ok_or_else(protocol)?);
        }
        Ok(())
    }
    fn gemini(&mut self, value: &Value, wire: &mut Vec<u8>) -> Result<(), ProviderError> {
        if let Some(candidates) = value.get("candidates").and_then(Value::as_array) {
            if candidates.len() > 1 {
                return Err(protocol());
            }
            for candidate in candidates {
                if let Some(parts) = candidate["content"]["parts"].as_array() {
                    for part in parts {
                        if part.get("thought") == Some(&Value::Bool(true)) {
                            return Err(protocol());
                        }
                        if let Some(text) = part.get("text").and_then(Value::as_str) {
                            let index = if let Some(index) = self.blocks.get(&0) {
                                *index
                            } else {
                                let index = self.text_item(wire)?;
                                self.blocks.insert(0, index);
                                index
                            };
                            self.delta(index, text, wire)?;
                        } else if let Some(call) = part.get("functionCall") {
                            let index = self.add(json!({"type":"function_call","id":format!("fc_{}_{}",self.id,self.outputs.len()),"call_id":super::request::gemini_call_id(part)?,"name":call.get("name").and_then(Value::as_str).ok_or_else(protocol)?,"arguments":"","status":"in_progress"}),wire)?;
                            self.delta(
                                index,
                                &serde_json::to_string(call.get("args").ok_or_else(protocol)?)
                                    .map_err(|_| protocol())?,
                                wire,
                            )?;
                        } else if part.get("inlineData").is_some() || part.get("fileData").is_some()
                        {
                            self.gemini_media_item(part, wire)?;
                        } else {
                            return Err(protocol());
                        }
                    }
                }
                if let Some(reason) = candidate.get("finishReason").and_then(Value::as_str) {
                    if !matches!(reason, "STOP" | "MAX_TOKENS") {
                        return Err(protocol());
                    }
                    self.finished = true;
                    self.incomplete = reason == "MAX_TOKENS";
                }
            }
        }
        if let Some(usage) = value.get("usageMetadata") {
            let input = usage
                .get("promptTokenCount")
                .and_then(Value::as_u64)
                .ok_or_else(protocol)?;
            let output = usage
                .get("candidatesTokenCount")
                .map_or(Ok(0), |v| v.as_u64().ok_or_else(protocol))?;
            let reasoning = usage
                .get("thoughtsTokenCount")
                .map_or(Ok(0), |v| v.as_u64().ok_or_else(protocol))?;
            let cached = usage
                .get("cachedContentTokenCount")
                .map_or(Ok(0), |v| v.as_u64().ok_or_else(protocol))?;
            self.usage = json!({"input_tokens":input,"output_tokens":output.checked_add(reasoning).ok_or_else(protocol)?,"input_tokens_details":{"cached_tokens":cached,"cache_write_tokens":0},"output_tokens_details":{"reasoning_tokens":reasoning}});
        }
        if self.finished && value.get("usageMetadata").is_some() {
            self.complete(wire)?;
        }
        Ok(())
    }

    fn gemini_media_item(&mut self, part: &Value, wire: &mut Vec<u8>) -> Result<(), ProviderError> {
        let (mime, source) = if let Some(inline) = part.get("inlineData") {
            let mime = inline
                .get("mimeType")
                .and_then(Value::as_str)
                .filter(|mime| !mime.is_empty())
                .ok_or_else(protocol)?;
            let data = inline
                .get("data")
                .and_then(Value::as_str)
                .filter(|data| !data.is_empty())
                .ok_or_else(protocol)?;
            STANDARD.decode(data).map_err(|_| protocol())?;
            (mime.to_owned(), format!("data:{mime};base64,{data}"))
        } else {
            let file = part.get("fileData").ok_or_else(protocol)?;
            let mime = file
                .get("mimeType")
                .and_then(Value::as_str)
                .filter(|mime| !mime.is_empty())
                .ok_or_else(protocol)?;
            let uri = file
                .get("fileUri")
                .and_then(Value::as_str)
                .filter(|uri| !uri.is_empty())
                .ok_or_else(protocol)?;
            (mime.to_owned(), uri.to_owned())
        };
        let (part_type, field) = if mime.starts_with("image/") {
            ("output_image", "image_url")
        } else if mime.starts_with("audio/") {
            ("output_audio", "audio_url")
        } else {
            ("output_file", "file_url")
        };
        self.add(
            json!({
                "type":"message",
                "id":format!("msg_{}_{}", self.id, self.outputs.len()),
                "role":"assistant",
                "status":"in_progress",
                "content":[{"type":part_type,field:source}]
            }),
            wire,
        )?;
        Ok(())
    }
}
