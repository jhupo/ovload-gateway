//! Validate the implemented Responses subset without applying Codex wire rewrites.

use super::error;
use ovload_core::{
    engine::provider::ProviderRequest,
    error::{ProviderError, ProviderErrorKind},
    operation::Operation,
    upstream::UpstreamSendState,
};
use serde_json::{Map, Value};

pub(super) fn encode(request: &ProviderRequest) -> Result<Map<String, Value>, ProviderError> {
    let Operation::Generate(generate) = request.operation() else {
        return Err(unsupported());
    };
    let payload = generate.protocol_payload();
    if payload.protocol() != "openai" {
        return Err(unsupported());
    }
    let body = payload.body();
    validate(body)?;
    let mut body = body.clone();
    let model = request
        .candidate()
        .upstream_model()
        .ok_or_else(unsupported)?;
    body.insert("model".into(), Value::String(model.as_str().to_owned()));
    body.insert("stream".into(), Value::Bool(true));
    Ok(body)
}

pub(super) fn validate(body: &Map<String, Value>) -> Result<(), ProviderError> {
    const FIELDS: &[&str] = &[
        "model",
        "input",
        "instructions",
        "max_output_tokens",
        "stream",
        "store",
        "temperature",
        "top_p",
        "tools",
        "tool_choice",
        "parallel_tool_calls",
        "text",
        "reasoning",
        "metadata",
        "service_tier",
        "truncation",
        "user",
        "safety_identifier",
        "prompt_cache_key",
        "prompt_cache_retention",
        "include",
        "background",
    ];
    if body.keys().any(|key| !FIELDS.contains(&key.as_str())) {
        return Err(unsupported());
    }
    if body
        .get("background")
        .is_some_and(|value| value != &Value::Bool(false))
        || body
            .get("include")
            .is_some_and(|value| !value.as_array().is_some_and(Vec::is_empty))
    {
        return Err(unsupported());
    }
    for field in ["stream", "store", "parallel_tool_calls"] {
        if body.get(field).is_some_and(|value| !value.is_boolean()) {
            return Err(invalid());
        }
    }
    if body
        .get("model")
        .and_then(Value::as_str)
        .is_none_or(str::is_empty)
        || body
            .get("max_output_tokens")
            .is_some_and(|value| value.as_u64().is_none_or(|tokens| tokens == 0))
        || body
            .get("instructions")
            .is_some_and(|value| !value.is_string() && !value.is_null())
        || body
            .get("service_tier")
            .is_some_and(|value| value.as_str().is_none_or(str::is_empty))
    {
        return Err(invalid());
    }
    match body.get("input") {
        Some(Value::String(_)) => {}
        Some(Value::Array(items)) if !items.is_empty() && items.len() <= 4_096 => {
            for item in items {
                validate_item(item)?;
            }
        }
        _ => return Err(invalid()),
    }
    if let Some(tools) = body.get("tools") {
        let tools = tools
            .as_array()
            .filter(|tools| tools.len() <= 256)
            .ok_or_else(invalid)?;
        for tool in tools {
            let tool = tool.as_object().ok_or_else(invalid)?;
            if tool.get("type").and_then(Value::as_str) != Some("function") {
                return Err(unsupported());
            }
            if tool
                .get("name")
                .and_then(Value::as_str)
                .is_none_or(str::is_empty)
                || tool
                    .get("parameters")
                    .is_some_and(|value| !value.is_object() && !value.is_null())
                || tool
                    .get("strict")
                    .is_some_and(|value| !value.is_boolean() && !value.is_null())
            {
                return Err(invalid());
            }
            if tool.keys().any(|key| {
                !["type", "name", "description", "parameters", "strict"].contains(&key.as_str())
            }) {
                return Err(unsupported());
            }
        }
    }
    if let Some(choice) = body.get("tool_choice") {
        match choice {
            Value::String(choice) if ["none", "auto", "required"].contains(&choice.as_str()) => {}
            Value::Object(choice)
                if choice.get("type").and_then(Value::as_str) == Some("function")
                    && choice
                        .get("name")
                        .and_then(Value::as_str)
                        .is_some_and(|name| !name.is_empty())
                    && choice.len() == 2 => {}
            _ => return Err(unsupported()),
        }
    }
    let encoded = serde_json::to_vec(body).map_err(|_| invalid())?;
    if encoded.len() > 8 * 1024 * 1024 {
        return Err(error(
            ProviderErrorKind::MessageTooBig,
            UpstreamSendState::NotSent,
        ));
    }
    Ok(())
}

fn validate_item(item: &Value) -> Result<(), ProviderError> {
    let item = item.as_object().ok_or_else(invalid)?;
    if item.get("type").is_some_and(|value| !value.is_string()) {
        return Err(invalid());
    }
    if item.get("id").is_some_and(|value| {
        value
            .as_str()
            .is_none_or(|id| id.is_empty() || id.len() > 512)
    }) || item.get("status").is_some_and(|value| {
        !value
            .as_str()
            .is_some_and(|status| ["in_progress", "completed", "incomplete"].contains(&status))
    }) {
        return Err(invalid());
    }
    match item
        .get("type")
        .and_then(Value::as_str)
        .unwrap_or("message")
    {
        "message" => {
            if item
                .keys()
                .any(|key| !["type", "role", "content", "id", "status"].contains(&key.as_str()))
            {
                return Err(unsupported());
            }
            if !item
                .get("role")
                .and_then(Value::as_str)
                .is_some_and(|role| ["system", "developer", "user", "assistant"].contains(&role))
            {
                return Err(invalid());
            }
            match item.get("content") {
                Some(Value::String(_)) => {}
                Some(Value::Array(parts)) if parts.len() <= 1_024 => {
                    for part in parts {
                        validate_content_part(part)?;
                    }
                }
                _ => return Err(invalid()),
            }
        }
        "function_call" => {
            if item.keys().any(|key| {
                !["type", "id", "call_id", "name", "arguments", "status"].contains(&key.as_str())
            }) {
                return Err(unsupported());
            }
            if ["call_id", "name", "arguments"]
                .iter()
                .any(|key| item.get(*key).and_then(Value::as_str).is_none())
            {
                return Err(invalid());
            }
        }
        "function_call_output" => {
            if item
                .keys()
                .any(|key| !["type", "id", "call_id", "output", "status"].contains(&key.as_str()))
            {
                return Err(unsupported());
            }
            if item.get("call_id").and_then(Value::as_str).is_none()
                || item.get("output").and_then(Value::as_str).is_none()
            {
                return Err(invalid());
            }
        }
        _ => return Err(unsupported()),
    }
    Ok(())
}

fn validate_content_part(value: &Value) -> Result<(), ProviderError> {
    let part = value.as_object().ok_or_else(invalid)?;
    let kind = part
        .get("type")
        .and_then(Value::as_str)
        .ok_or_else(invalid)?;
    match kind {
        "input_text" | "output_text" => {
            if part.get("text").and_then(Value::as_str).is_none() {
                return Err(invalid());
            }
            let fields: &[&str] = if kind == "output_text" {
                &["type", "text", "annotations", "logprobs"]
            } else {
                &["type", "text"]
            };
            if part.keys().any(|key| !fields.contains(&key.as_str())) {
                return Err(unsupported());
            }
            for field in ["annotations", "logprobs"] {
                if part
                    .get(field)
                    .is_some_and(|value| !value.as_array().is_some_and(Vec::is_empty))
                {
                    return Err(unsupported());
                }
            }
        }
        "input_image" => {
            if part
                .keys()
                .any(|key| !["type", "image_url", "file_id", "detail"].contains(&key.as_str()))
            {
                return Err(unsupported());
            }
            let source = part
                .get("image_url")
                .or_else(|| part.get("file_id"))
                .ok_or_else(invalid)?;
            if source.is_null()
                || (source.as_str().is_some_and(str::is_empty) && !source.is_object())
            {
                return Err(invalid());
            }
            if let Some(detail) = part.get("detail")
                && detail
                    .as_str()
                    .is_none_or(|value| !["auto", "low", "high", "original"].contains(&value))
            {
                return Err(invalid());
            }
        }
        "input_audio" => {
            if part
                .keys()
                .any(|key| !["type", "input_audio"].contains(&key.as_str()))
            {
                return Err(unsupported());
            }
            let audio = part
                .get("input_audio")
                .and_then(Value::as_object)
                .ok_or_else(invalid)?;
            if audio
                .keys()
                .any(|key| !["data", "format"].contains(&key.as_str()))
                || audio
                    .get("data")
                    .and_then(Value::as_str)
                    .is_none_or(str::is_empty)
                || audio
                    .get("format")
                    .and_then(Value::as_str)
                    .is_none_or(str::is_empty)
            {
                return Err(invalid());
            }
        }
        "input_file" => {
            if part.keys().any(|key| {
                !["type", "file_data", "file_id", "filename", "file_url"].contains(&key.as_str())
            }) {
                return Err(unsupported());
            }
            let source = ["file_data", "file_id", "file_url"]
                .into_iter()
                .find_map(|field| {
                    part.get(field)
                        .and_then(Value::as_str)
                        .filter(|value| !value.is_empty())
                })
                .ok_or_else(invalid)?;
            if source.len() > 8 * 1024 * 1024 {
                return Err(error(
                    ProviderErrorKind::MessageTooBig,
                    UpstreamSendState::NotSent,
                ));
            }
            if part
                .get("filename")
                .is_some_and(|value| value.as_str().is_none())
            {
                return Err(invalid());
            }
        }
        _ => return Err(unsupported()),
    }
    Ok(())
}

fn invalid() -> ProviderError {
    error(
        ProviderErrorKind::InvalidRequest,
        UpstreamSendState::NotSent,
    )
    .with_retry_prohibited()
}
fn unsupported() -> ProviderError {
    error(ProviderErrorKind::Unsupported, UpstreamSendState::NotSent).with_retry_prohibited()
}
