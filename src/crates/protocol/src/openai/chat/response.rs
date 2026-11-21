use serde_json::{Value, json};

use super::{ConversionError, MAX_ITEMS};

pub fn convert_response(response: &Value, model: &str) -> Result<Value, ConversionError> {
    let (id, created) = identity(response)?;
    let output = response
        .get("output")
        .and_then(Value::as_array)
        .ok_or(ConversionError::InvalidResponse)?;
    if output.len() > MAX_ITEMS {
        return Err(ConversionError::LimitExceeded);
    }
    let mut text = String::new();
    let mut refusal = String::new();
    let mut calls = Vec::new();
    for item in output {
        match item.get("type").and_then(Value::as_str) {
            Some("message") => {
                if item.get("role").and_then(Value::as_str) != Some("assistant") { return Err(ConversionError::InvalidResponse); }
                for part in item.get("content").and_then(Value::as_array).ok_or(ConversionError::InvalidResponse)? {
                    match part.get("type").and_then(Value::as_str) {
                        Some("output_text") => {
                            if part.get("annotations").is_some_and(|v|!v.as_array().is_some_and(Vec::is_empty)) { return Err(ConversionError::InvalidResponse); }
                            text.push_str(required_text(part,"text")?);
                        }
                        Some("refusal") => refusal.push_str(required_text(part,"refusal")?),
                        _ => return Err(ConversionError::InvalidResponse),
                    }
                }
            }
            Some("function_call") => calls.push(json!({"id":required_text(item,"call_id")?,"type":"function","function":{"name":required_text(item,"name")?,"arguments":required_text(item,"arguments")?}})),
            Some("reasoning") if reasoning_is_hidden(item) => {},
            _ => return Err(ConversionError::InvalidResponse),
        }
    }
    let finish = finish_reason(response, !calls.is_empty())?;
    let mut message = json!({"role":"assistant","content":if text.is_empty(){Value::Null}else{Value::String(text)},"refusal":if refusal.is_empty(){Value::Null}else{Value::String(refusal)}});
    if !calls.is_empty() {
        message["tool_calls"] = Value::Array(calls);
    }
    let mut converted = json!({"id":id,"object":"chat.completion","created":created,"model":model,"choices":[{"index":0,"message":message,"finish_reason":finish,"logprobs":null}],"usage":usage(response)?});
    if let Some(tier) = response
        .get("service_tier")
        .filter(|value| !value.is_null())
    {
        if !tier.is_string() {
            return Err(ConversionError::InvalidResponse);
        }
        converted["service_tier"] = tier.clone();
    }
    Ok(converted)
}

pub(super) fn identity(response: &Value) -> Result<(String, u64), ConversionError> {
    let id = required_text(response, "id")?;
    if id.is_empty() || id.len() > 256 {
        return Err(ConversionError::InvalidResponse);
    }
    let created = response
        .get("created_at")
        .and_then(Value::as_u64)
        .ok_or(ConversionError::InvalidResponse)?;
    Ok((format!("chatcmpl-{id}"), created))
}

pub(super) fn finish_reason(
    response: &Value,
    tools: bool,
) -> Result<&'static str, ConversionError> {
    match response.get("status").and_then(Value::as_str) {
        Some("completed") => Ok(if tools { "tool_calls" } else { "stop" }),
        Some("incomplete") => match response
            .pointer("/incomplete_details/reason")
            .and_then(Value::as_str)
        {
            Some("max_output_tokens") => Ok("length"),
            Some("content_filter") => Ok("content_filter"),
            _ => Err(ConversionError::InvalidResponse),
        },
        _ => Err(ConversionError::InvalidResponse),
    }
}

pub(super) fn usage(response: &Value) -> Result<Value, ConversionError> {
    let Some(value) = response.get("usage").filter(|v| !v.is_null()) else {
        return Ok(Value::Null);
    };
    let input = value
        .get("input_tokens")
        .and_then(Value::as_u64)
        .ok_or(ConversionError::InvalidResponse)?;
    let output = value
        .get("output_tokens")
        .and_then(Value::as_u64)
        .ok_or(ConversionError::InvalidResponse)?;
    let total = value
        .get("total_tokens")
        .and_then(Value::as_u64)
        .ok_or(ConversionError::InvalidResponse)?;
    if input.checked_add(output) != Some(total) {
        return Err(ConversionError::InvalidResponse);
    }
    let mut usage = json!({"prompt_tokens":input,"completion_tokens":output,"total_tokens":total});
    if let Some(cached) = value.pointer("/input_tokens_details/cached_tokens") {
        if cached.as_u64().is_none_or(|count| count > input) {
            return Err(ConversionError::InvalidResponse);
        }
        usage["prompt_tokens_details"] = json!({"cached_tokens":cached});
    }
    if let Some(reasoning) = value.pointer("/output_tokens_details/reasoning_tokens") {
        if reasoning.as_u64().is_none_or(|count| count > output) {
            return Err(ConversionError::InvalidResponse);
        }
        usage["completion_tokens_details"] = json!({"reasoning_tokens":reasoning});
    }
    Ok(usage)
}

pub(super) fn required_text<'a>(value: &'a Value, key: &str) -> Result<&'a str, ConversionError> {
    value
        .get(key)
        .and_then(Value::as_str)
        .ok_or(ConversionError::InvalidResponse)
}
pub(super) fn reasoning_is_hidden(value: &Value) -> bool {
    value
        .get("summary")
        .is_none_or(|summary| summary.as_array().is_some_and(Vec::is_empty))
        && value.get("encrypted_content").is_none_or(Value::is_null)
}
