use std::collections::BTreeSet;

use serde_json::{Map, Value, json};

use super::{ConversionError, MAX_ITEMS};

pub struct ChatRequest {
    pub responses: Value,
    pub model: String,
    pub stream: bool,
    pub include_usage: bool,
}

pub fn convert_request(body: &[u8]) -> Result<ChatRequest, ConversionError> {
    let value: Value = serde_json::from_slice(body).map_err(|_| ConversionError::InvalidRequest)?;
    let object = object(&value)?;
    keys(
        object,
        &[
            "model",
            "messages",
            "stream",
            "stream_options",
            "n",
            "max_completion_tokens",
            "temperature",
            "top_p",
            "tools",
            "tool_choice",
            "parallel_tool_calls",
            "reasoning_effort",
            "response_format",
            "service_tier",
            "metadata",
            "store",
        ],
    )?;
    let model = string(object.get("model"))?;
    if model.len() > 256 || model.trim() != model || model.chars().any(char::is_control) {
        return Err(ConversionError::InvalidRequest);
    }
    let stream = boolean(object.get("stream"))?.unwrap_or(false);
    if object.get("n").is_some_and(|n| n.as_u64() != Some(1)) {
        return Err(ConversionError::InvalidRequest);
    }
    let include_usage = match object.get("stream_options") {
        None | Some(Value::Null) => false,
        Some(options) if stream => {
            let options = self::object(options)?;
            keys(options, &["include_usage"])?;
            boolean(options.get("include_usage"))?.unwrap_or(false)
        }
        _ => return Err(ConversionError::InvalidRequest),
    };
    let messages = object
        .get("messages")
        .and_then(Value::as_array)
        .ok_or(ConversionError::InvalidRequest)?;
    if messages.is_empty() || messages.len() > 256 {
        return Err(ConversionError::LimitExceeded);
    }
    let mut input = Vec::new();
    let mut calls = BTreeSet::new();
    let mut pending = BTreeSet::new();
    for message in messages {
        let message = self::object(message)?;
        keys(message, &["role", "content", "tool_calls", "tool_call_id"])?;
        let role = string(message.get("role"))?;
        if role == "tool" {
            if message.contains_key("tool_calls") {
                return Err(ConversionError::InvalidRequest);
            }
            let id = identifier(message.get("tool_call_id"))?;
            if !pending.remove(id) {
                return Err(ConversionError::InvalidRequest);
            }
            let output = string_allow_empty(message.get("content"))?;
            input.push(json!({"type":"function_call_output", "call_id":id, "output":output}));
            continue;
        }
        if !matches!(role, "system" | "developer" | "user" | "assistant")
            || message.contains_key("tool_call_id")
        {
            return Err(ConversionError::InvalidRequest);
        }
        if !pending.is_empty() {
            return Err(ConversionError::InvalidRequest);
        }
        let content = text_content(message.get("content"), role == "assistant")?;
        if !content.is_empty() {
            input.push(json!({"type":"message","role":role,"content":content}));
        }
        if let Some(tools) = message.get("tool_calls") {
            if role != "assistant" {
                return Err(ConversionError::InvalidRequest);
            }
            let tools = tools.as_array().ok_or(ConversionError::InvalidRequest)?;
            if tools.is_empty() || tools.len() > MAX_ITEMS {
                return Err(ConversionError::LimitExceeded);
            }
            for tool in tools {
                let tool = self::object(tool)?;
                keys(tool, &["id", "type", "function"])?;
                if string(tool.get("type"))? != "function" {
                    return Err(ConversionError::InvalidRequest);
                }
                let id = identifier(tool.get("id"))?;
                if calls.len() >= MAX_ITEMS || !calls.insert(id.to_owned()) {
                    return Err(ConversionError::LimitExceeded);
                }
                pending.insert(id.to_owned());
                let function = self::object(
                    tool.get("function")
                        .ok_or(ConversionError::InvalidRequest)?,
                )?;
                keys(function, &["name", "arguments"])?;
                input.push(json!({"type":"function_call", "call_id":id, "name":function_name(function.get("name"))?, "arguments":string_allow_empty(function.get("arguments"))?}));
            }
        } else if content_is_missing(message.get("content")) {
            return Err(ConversionError::InvalidRequest);
        }
    }
    if !pending.is_empty() {
        return Err(ConversionError::InvalidRequest);
    }
    let mut responses = Map::from_iter([
        ("model".to_owned(), Value::String(model.to_owned())),
        ("input".to_owned(), Value::Array(input)),
        ("stream".to_owned(), Value::Bool(stream)),
    ]);
    for name in ["temperature", "top_p"] {
        if let Some(value) = object.get(name) {
            let number = value
                .as_f64()
                .filter(|number| number.is_finite())
                .ok_or(ConversionError::InvalidRequest)?;
            if !(0.0..=if name == "top_p" { 1.0 } else { 2.0 }).contains(&number) {
                return Err(ConversionError::InvalidRequest);
            }
            responses.insert(name.to_owned(), value.clone());
        }
    }
    if let Some(value) = object.get("max_completion_tokens") {
        if value.as_u64().filter(|n| *n > 0).is_none() {
            return Err(ConversionError::InvalidRequest);
        }
        responses.insert("max_output_tokens".to_owned(), value.clone());
    }
    for name in ["store", "parallel_tool_calls"] {
        if let Some(value) = boolean(object.get(name))? {
            responses.insert(name.to_owned(), Value::Bool(value));
        }
    }
    if let Some(value) = object.get("service_tier") {
        if !matches!(
            value.as_str(),
            Some("auto" | "default" | "flex" | "priority")
        ) {
            return Err(ConversionError::InvalidRequest);
        }
        responses.insert("service_tier".to_owned(), value.clone());
    }
    if let Some(metadata) = object.get("metadata") {
        let metadata = self::object(metadata)?;
        if metadata.len() > 16
            || metadata.iter().any(|(key, value)| {
                key.len() > 64 || value.as_str().is_none_or(|text| text.len() > 512)
            })
        {
            return Err(ConversionError::InvalidRequest);
        }
        responses.insert("metadata".to_owned(), Value::Object(metadata.clone()));
    }
    if let Some(effort) = object.get("reasoning_effort") {
        if !matches!(
            effort.as_str(),
            Some("none" | "minimal" | "low" | "medium" | "high" | "xhigh")
        ) {
            return Err(ConversionError::InvalidRequest);
        }
        responses.insert("reasoning".to_owned(), json!({"effort":effort}));
    }
    let mut names = BTreeSet::new();
    if let Some(tools) = object.get("tools") {
        let tools = tools.as_array().ok_or(ConversionError::InvalidRequest)?;
        if tools.len() > MAX_ITEMS {
            return Err(ConversionError::LimitExceeded);
        }
        let mut converted = Vec::new();
        for tool in tools {
            let tool = self::object(tool)?;
            keys(tool, &["type", "function"])?;
            if string(tool.get("type"))? != "function" {
                return Err(ConversionError::InvalidRequest);
            }
            let function = self::object(
                tool.get("function")
                    .ok_or(ConversionError::InvalidRequest)?,
            )?;
            keys(function, &["name", "description", "parameters", "strict"])?;
            let name = function_name(function.get("name"))?;
            if !names.insert(name.to_owned()) {
                return Err(ConversionError::InvalidRequest);
            }
            let mut converted_tool = function.clone();
            if function.get("description").is_some_and(|v| !v.is_string())
                || function.get("parameters").is_some_and(|v| !v.is_object())
            {
                return Err(ConversionError::InvalidRequest);
            }
            converted_tool.insert(
                "strict".to_owned(),
                Value::Bool(boolean(function.get("strict"))?.unwrap_or(false)),
            );
            converted_tool.insert("type".to_owned(), Value::String("function".to_owned()));
            converted.push(Value::Object(converted_tool));
        }
        responses.insert("tools".to_owned(), Value::Array(converted));
    }
    if let Some(choice) = object.get("tool_choice") {
        let converted = match choice.as_str() {
            Some("none" | "auto" | "required") => choice.clone(),
            Some(_) => return Err(ConversionError::InvalidRequest),
            None => {
                let choice = self::object(choice)?;
                keys(choice, &["type", "function"])?;
                if string(choice.get("type"))? != "function" {
                    return Err(ConversionError::InvalidRequest);
                }
                let function = self::object(
                    choice
                        .get("function")
                        .ok_or(ConversionError::InvalidRequest)?,
                )?;
                keys(function, &["name"])?;
                let name = function_name(function.get("name"))?;
                if !names.contains(name) {
                    return Err(ConversionError::InvalidRequest);
                }
                json!({"type":"function", "name":name})
            }
        };
        if names.is_empty() && converted != "none" {
            return Err(ConversionError::InvalidRequest);
        }
        responses.insert("tool_choice".to_owned(), converted);
    }
    if let Some(format) = object.get("response_format") {
        let format = self::object(format)?;
        keys(format, &["type", "json_schema"])?;
        let converted = match string(format.get("type"))? {
            "text" | "json_object" if !format.contains_key("json_schema") => {
                Value::Object(format.clone())
            }
            "json_schema" => {
                let schema = self::object(
                    format
                        .get("json_schema")
                        .ok_or(ConversionError::InvalidRequest)?,
                )?;
                keys(schema, &["name", "description", "schema", "strict"])?;
                function_name(schema.get("name"))?;
                if !schema.get("schema").is_some_and(Value::is_object)
                    || schema.get("description").is_some_and(|v| !v.is_string())
                {
                    return Err(ConversionError::InvalidRequest);
                }
                let mut converted = schema.clone();
                converted.insert("type".to_owned(), Value::String("json_schema".to_owned()));
                if let Some(strict) = boolean(schema.get("strict"))? {
                    converted.insert("strict".to_owned(), Value::Bool(strict));
                }
                Value::Object(converted)
            }
            _ => return Err(ConversionError::InvalidRequest),
        };
        responses.insert("text".to_owned(), json!({"format":converted}));
    }
    Ok(ChatRequest {
        responses: Value::Object(responses),
        model: model.to_owned(),
        stream,
        include_usage,
    })
}

fn text_content(value: Option<&Value>, assistant: bool) -> Result<Vec<Value>, ConversionError> {
    let texts = match value {
        Some(Value::String(text)) => vec![text.as_str()],
        Some(Value::Array(parts)) => {
            if parts.is_empty() || parts.len() > 256 {
                return Err(ConversionError::LimitExceeded);
            }
            let mut texts = Vec::new();
            for part in parts {
                let part = object(part)?;
                keys(part, &["type", "text"])?;
                if string(part.get("type"))? != "text" {
                    return Err(ConversionError::InvalidRequest);
                }
                texts.push(string_allow_empty(part.get("text"))?);
            }
            texts
        }
        None | Some(Value::Null) if assistant => Vec::new(),
        _ => return Err(ConversionError::InvalidRequest),
    };
    Ok(texts
        .into_iter()
        .map(|text| json!({"type":"input_text","text":text}))
        .collect())
}

fn content_is_missing(value: Option<&Value>) -> bool {
    value.is_none_or(Value::is_null)
}
fn object(value: &Value) -> Result<&Map<String, Value>, ConversionError> {
    value.as_object().ok_or(ConversionError::InvalidRequest)
}
fn keys(object: &Map<String, Value>, allowed: &[&str]) -> Result<(), ConversionError> {
    if object.keys().any(|key| !allowed.contains(&key.as_str())) {
        Err(ConversionError::InvalidRequest)
    } else {
        Ok(())
    }
}
fn string(value: Option<&Value>) -> Result<&str, ConversionError> {
    string_allow_empty(value).and_then(|text| {
        if text.is_empty() {
            Err(ConversionError::InvalidRequest)
        } else {
            Ok(text)
        }
    })
}
fn string_allow_empty(value: Option<&Value>) -> Result<&str, ConversionError> {
    value
        .and_then(Value::as_str)
        .ok_or(ConversionError::InvalidRequest)
}
fn identifier(value: Option<&Value>) -> Result<&str, ConversionError> {
    let text = string(value)?;
    if !super::valid_tool_call_id(text) {
        Err(ConversionError::InvalidRequest)
    } else {
        Ok(text)
    }
}
fn function_name(value: Option<&Value>) -> Result<&str, ConversionError> {
    let text = string(value)?;
    if text.len() > 64
        || !text
            .bytes()
            .all(|b| b.is_ascii_alphanumeric() || b == b'_' || b == b'-')
    {
        Err(ConversionError::InvalidRequest)
    } else {
        Ok(text)
    }
}
fn boolean(value: Option<&Value>) -> Result<Option<bool>, ConversionError> {
    value
        .map(|v| v.as_bool().ok_or(ConversionError::InvalidRequest))
        .transpose()
}
