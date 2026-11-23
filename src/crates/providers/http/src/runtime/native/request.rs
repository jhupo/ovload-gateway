//! Explicit Responses-to-native conversion; unsupported semantics fail before sending.
use super::{super::Credential, invalid};
use base64::{Engine as _, engine::general_purpose::STANDARD};
use ovload_core::error::ProviderError;
use serde_json::{Map, Value, json};
use std::collections::BTreeMap;

pub(in super::super) fn encode(
    kind: &str,
    credential: &Credential,
    body: &Map<String, Value>,
) -> Result<Value, ProviderError> {
    super::super::request::validate(body)?;
    for key in [
        "reasoning",
        "text",
        "service_tier",
        "truncation",
        "prompt_cache_retention",
    ] {
        if body
            .get(key)
            .is_some_and(|value| !value.is_null() && !value.as_object().is_some_and(Map::is_empty))
        {
            return Err(invalid());
        }
    }
    let gemini = kind == "gemini";
    let mut system = Vec::new();
    if let Some(instructions) = body
        .get("instructions")
        .and_then(Value::as_str)
        .filter(|text| !text.is_empty())
    {
        system.push(instructions.to_owned());
    }
    let input = match body.get("input") {
        Some(Value::String(text)) => vec![json!({"role":"user","content":text})],
        Some(Value::Array(items)) => items.clone(),
        _ => return Err(invalid()),
    };
    let mut messages: Vec<Value> = Vec::new();
    let mut calls = BTreeMap::new();
    for item in input {
        let item_type = item
            .get("type")
            .and_then(Value::as_str)
            .unwrap_or("message");
        let (role, parts) = match item_type {
            "function_call" => {
                let id = item
                    .get("call_id")
                    .and_then(Value::as_str)
                    .ok_or_else(invalid)?;
                let name = item
                    .get("name")
                    .and_then(Value::as_str)
                    .ok_or_else(invalid)?;
                let args: Value = serde_json::from_str(
                    item.get("arguments")
                        .and_then(Value::as_str)
                        .ok_or_else(invalid)?,
                )
                .map_err(|_| invalid())?;
                if !args.is_object() {
                    return Err(invalid());
                }
                calls.insert(id.to_owned(), name.to_owned());
                let mut call = if gemini {
                    json!({"functionCall":{"name":name,"args":args}})
                } else {
                    json!({"type":"tool_use","id":id,"name":name,"input":args})
                };
                if gemini && let Some(saved) = gemini_call_metadata(id)? {
                    if saved.get("name").and_then(Value::as_str) != Some(name) {
                        return Err(invalid());
                    }
                    if let Some(signature) = saved.get("signature").filter(|value| !value.is_null())
                    {
                        call["thoughtSignature"] = signature.clone();
                    }
                    if let Some(id) = saved.get("id").filter(|value| !value.is_null()) {
                        call["functionCall"]["id"] = id.clone();
                    }
                }
                ("assistant", vec![call])
            }
            "function_call_output" => {
                let id = item
                    .get("call_id")
                    .and_then(Value::as_str)
                    .ok_or_else(invalid)?;
                let output = item
                    .get("output")
                    .and_then(Value::as_str)
                    .ok_or_else(invalid)?;
                let mut result = if gemini {
                    json!({"functionResponse":{"name":calls.get(id).ok_or_else(invalid)?,"response":{"result":output}}})
                } else {
                    json!({"type":"tool_result","tool_use_id":id,"content":output})
                };
                if gemini
                    && let Some(saved) = gemini_call_metadata(id)?
                    && let Some(id) = saved.get("id").filter(|value| !value.is_null())
                {
                    result["functionResponse"]["id"] = id.clone();
                }
                ("user", vec![result])
            }
            "message" => {
                let role = item
                    .get("role")
                    .and_then(Value::as_str)
                    .ok_or_else(invalid)?;
                let parts = match item.get("content") {
                    Some(Value::String(text)) => vec![native_text_part(gemini, text)],
                    Some(Value::Array(parts)) => parts
                        .iter()
                        .map(|part| native_content_part(gemini, part))
                        .collect::<Result<_, _>>()?,
                    _ => return Err(invalid()),
                };
                if matches!(role, "system" | "developer") {
                    for part in parts {
                        system.push(
                            part.get("text")
                                .and_then(Value::as_str)
                                .ok_or_else(invalid)?
                                .to_owned(),
                        );
                    }
                    continue;
                }
                (
                    if role == "assistant" {
                        "assistant"
                    } else {
                        "user"
                    },
                    parts,
                )
            }
            _ => return Err(invalid()),
        };
        let role = if gemini && role == "assistant" {
            "model"
        } else {
            role
        };
        let part_key = if gemini { "parts" } else { "content" };
        if let Some(last) = messages
            .last_mut()
            .filter(|last| last.get("role").and_then(Value::as_str) == Some(role))
        {
            last.get_mut(part_key)
                .and_then(Value::as_array_mut)
                .ok_or_else(invalid)?
                .extend(parts);
        } else {
            messages.push(json!({"role":role,part_key:parts}));
        }
    }
    if messages.is_empty() {
        return Err(invalid());
    }
    let mut native = if gemini {
        json!({"contents":messages})
    } else {
        json!({"model":body.get("model").ok_or_else(invalid)?,"messages":messages,"stream":true,"max_tokens":body.get("max_output_tokens").cloned().unwrap_or(json!(4096))})
    };
    if !system.is_empty() {
        if gemini {
            native["systemInstruction"] = json!({"parts":[{"text":system.join("\n\n")}]});
        } else {
            native["system"] = json!(system.join("\n\n"));
        }
    }
    for (source, target) in [
        ("temperature", "temperature"),
        ("top_p", if gemini { "topP" } else { "top_p" }),
        (
            "max_output_tokens",
            if gemini {
                "maxOutputTokens"
            } else {
                "max_tokens"
            },
        ),
    ] {
        if let Some(value) = body.get(source) {
            if gemini {
                if native.get("generationConfig").is_none() {
                    native["generationConfig"] = json!({});
                }
                native["generationConfig"][target] = value.clone();
            } else {
                native[target] = value.clone();
            }
        }
    }
    if let Some(tools) = body
        .get("tools")
        .and_then(Value::as_array)
        .filter(|tools| !tools.is_empty())
    {
        let tools: Vec<Value> = tools.iter().map(|tool| {
            let mut output = json!({"name":tool["name"],if gemini {"parametersJsonSchema"}else{"input_schema"}:tool.get("parameters").cloned().unwrap_or(json!({"type":"object","properties":{}}))});
            if let Some(description) = tool.get("description") { output["description"] = description.clone(); }
            output
        }).collect();
        native["tools"] = if gemini {
            json!([{"functionDeclarations":tools}])
        } else {
            json!(tools)
        };
        if let Some(choice) = body.get("tool_choice") {
            let (mode, name) = match choice.as_str() {
                Some("auto") => (if gemini { "AUTO" } else { "auto" }, None),
                Some("none") => (if gemini { "NONE" } else { "none" }, None),
                Some("required") => (if gemini { "ANY" } else { "any" }, None),
                _ => (
                    if gemini { "ANY" } else { "tool" },
                    Some(
                        choice
                            .get("name")
                            .and_then(Value::as_str)
                            .ok_or_else(invalid)?,
                    ),
                ),
            };
            if gemini {
                native["toolConfig"] = json!({"functionCallingConfig":{"mode":mode}});
                if let Some(name) = name {
                    native["toolConfig"]["functionCallingConfig"]["allowedFunctionNames"] =
                        json!([name]);
                }
            } else {
                native["tool_choice"] = json!({"type":mode});
                if let Some(name) = name {
                    native["tool_choice"]["name"] = json!(name);
                }
            }
        }
        if body.get("parallel_tool_calls") == Some(&Value::Bool(false)) {
            if gemini {
                return Err(invalid());
            }
            if native.get("tool_choice").is_none() {
                native["tool_choice"] = json!({"type":"auto"});
            }
            native["tool_choice"]["disable_parallel_tool_use"] = json!(true);
        }
    }
    if gemini && let Some(tokens) = &credential.oauth {
        native["sessionId"] = json!(uuid::Uuid::now_v7().to_string());
        if native.get("generationConfig").is_none() {
            native["generationConfig"] = json!({});
        }
        native = json!({
            "project": tokens.project.as_ref().ok_or_else(invalid)?,
            "model": body.get("model").ok_or_else(invalid)?,
            "userAgent": "antigravity",
            "requestType": "agent",
            "requestId": format!("agent-{}", uuid::Uuid::now_v7()),
            "request": native
        });
    }
    if !gemini && let Some(tokens) = &credential.oauth {
        use sha2::{Digest, Sha256};
        let mut system = vec![
            json!({"type":"text","text":"You are Claude Code, Anthropic's official CLI for Claude."}),
        ];
        if let Some(text) = native.get("system").and_then(Value::as_str) {
            system.push(json!({"type":"text","text":text}));
        }
        native["system"] = json!(system);
        native["metadata"] = json!({"user_id":serde_json::to_string(&json!({"device_id":hex::encode(Sha256::digest(format!("ovload-device:{}",tokens.subject))),"account_uuid":tokens.subject,"session_id":uuid::Uuid::now_v7().to_string()})).map_err(|_| invalid())?});
    }
    Ok(native)
}

fn native_text_part(gemini: bool, text: &str) -> Value {
    if gemini {
        json!({"text":text})
    } else {
        json!({"type":"text","text":text})
    }
}

fn native_content_part(gemini: bool, part: &Value) -> Result<Value, ProviderError> {
    let part = part.as_object().ok_or_else(invalid)?;
    match part.get("type").and_then(Value::as_str) {
        Some("input_text" | "output_text" | "text") => Ok(native_text_part(
            gemini,
            part.get("text")
                .and_then(Value::as_str)
                .ok_or_else(invalid)?,
        )),
        Some("input_image") => {
            let source = image_source(part)?;
            native_media_part(gemini, MediaKind::Image, source)
        }
        Some("input_audio") => {
            let audio = part
                .get("input_audio")
                .and_then(Value::as_object)
                .ok_or_else(invalid)?;
            let format = audio
                .get("format")
                .and_then(Value::as_str)
                .filter(|value| !value.is_empty())
                .ok_or_else(invalid)?;
            let source = inline_source(
                audio
                    .get("data")
                    .and_then(Value::as_str)
                    .ok_or_else(invalid)?,
                audio_mime(format),
            )?;
            native_media_part(gemini, MediaKind::Audio, source)
        }
        Some("input_file") => {
            let filename = part.get("filename").and_then(Value::as_str);
            let fallback = filename.map_or("application/octet-stream", |name| file_mime(name));
            let source = if let Some(data) = part.get("file_data").and_then(Value::as_str) {
                inline_source(data, fallback)?
            } else if let Some(url) = part
                .get("file_url")
                .or_else(|| part.get("file_id"))
                .and_then(Value::as_str)
            {
                uri_source(url, fallback)?
            } else {
                return Err(invalid());
            };
            native_media_part(gemini, MediaKind::File, source)
        }
        _ => Err(invalid()),
    }
}

#[derive(Clone, Copy)]
enum MediaKind {
    Image,
    Audio,
    File,
}

enum MediaSource {
    Inline { mime: String, data: String },
    Uri { mime: String, uri: String },
}

fn image_source(part: &Map<String, Value>) -> Result<MediaSource, ProviderError> {
    if let Some(value) = part.get("image_url") {
        let url = value
            .as_str()
            .or_else(|| value.get("url").and_then(Value::as_str))
            .ok_or_else(invalid)?;
        if let Some(source) = data_url_source(url)? {
            return Ok(source);
        }
        return uri_source(url, "image/jpeg");
    }
    let file_id = part
        .get("file_id")
        .and_then(Value::as_str)
        .filter(|value| !value.is_empty())
        .ok_or_else(invalid)?;
    uri_source(file_id, "image/jpeg")
}

fn native_media_part(
    gemini: bool,
    kind: MediaKind,
    source: MediaSource,
) -> Result<Value, ProviderError> {
    if gemini {
        return Ok(match source {
            MediaSource::Inline { mime, data } => {
                json!({"inlineData":{"mimeType":mime,"data":data}})
            }
            MediaSource::Uri { mime, uri } => {
                json!({"fileData":{"mimeType":mime,"fileUri":uri}})
            }
        });
    }
    match kind {
        MediaKind::Image => Ok(match source {
            MediaSource::Inline { mime, data } => {
                json!({"type":"image","source":{"type":"base64","media_type":mime,"data":data}})
            }
            MediaSource::Uri { uri, .. } => {
                json!({"type":"image","source":{"type":"url","url":uri}})
            }
        }),
        MediaKind::File => Ok(match source {
            MediaSource::Inline { mime, data } => {
                json!({"type":"document","source":{"type":"base64","media_type":mime,"data":data}})
            }
            MediaSource::Uri { uri, .. } => {
                json!({"type":"document","source":{"type":"url","url":uri}})
            }
        }),
        MediaKind::Audio => Err(invalid()),
    }
}

fn data_url_source(value: &str) -> Result<Option<MediaSource>, ProviderError> {
    let Some(rest) = value.strip_prefix("data:") else {
        return Ok(None);
    };
    let (metadata, data) = rest.split_once(',').ok_or_else(invalid)?;
    let mut parts = metadata.split(';');
    let mime = parts
        .next()
        .filter(|mime| !mime.is_empty() && mime.contains('/'))
        .ok_or_else(invalid)?;
    if !parts.any(|part| part.eq_ignore_ascii_case("base64")) {
        return Err(invalid());
    }
    STANDARD.decode(data).map_err(|_| invalid())?;
    Ok(Some(MediaSource::Inline {
        mime: mime.to_owned(),
        data: data.to_owned(),
    }))
}

fn inline_source(value: &str, mime: &str) -> Result<MediaSource, ProviderError> {
    if let Some(source) = data_url_source(value)? {
        return Ok(source);
    }
    STANDARD.decode(value).map_err(|_| invalid())?;
    Ok(MediaSource::Inline {
        mime: mime.to_owned(),
        data: value.to_owned(),
    })
}

fn uri_source(value: &str, mime: &str) -> Result<MediaSource, ProviderError> {
    if value.is_empty()
        || !(value.starts_with("https://")
            || value.starts_with("http://")
            || value.starts_with("gs://")
            || value.starts_with("files/"))
    {
        return Err(invalid());
    }
    Ok(MediaSource::Uri {
        mime: mime.to_owned(),
        uri: value.to_owned(),
    })
}

fn audio_mime(format: &str) -> &str {
    match format.to_ascii_lowercase().as_str() {
        "wav" => "audio/wav",
        "mp3" => "audio/mpeg",
        "m4a" => "audio/mp4",
        "ogg" => "audio/ogg",
        "flac" => "audio/flac",
        "webm" => "audio/webm",
        _ => "application/octet-stream",
    }
}

fn file_mime(filename: &str) -> &str {
    match filename
        .rsplit_once('.')
        .map(|(_, extension)| extension.to_ascii_lowercase())
        .as_deref()
    {
        Some("pdf") => "application/pdf",
        Some("txt" | "md" | "csv") => "text/plain",
        Some("json") => "application/json",
        Some("html" | "htm") => "text/html",
        Some("png") => "image/png",
        Some("jpg" | "jpeg") => "image/jpeg",
        Some("webp") => "image/webp",
        Some("gif") => "image/gif",
        _ => "application/octet-stream",
    }
}

// Preserve opaque Gemini tool signatures across standard Responses/chat tool turns.
// The handle contains no account credentials and survives process restarts.
pub(super) fn gemini_call_id(part: &Value) -> Result<String, ProviderError> {
    use base64::{Engine as _, engine::general_purpose::URL_SAFE_NO_PAD};
    let call = part.get("functionCall").ok_or_else(super::protocol)?;
    let name = call
        .get("name")
        .and_then(Value::as_str)
        .ok_or_else(super::protocol)?;
    let payload = json!({"name":name,"signature":part.get("thoughtSignature"),"id":call.get("id"),"nonce":uuid::Uuid::now_v7().to_string()});
    let bytes = serde_json::to_vec(&payload).map_err(|_| super::protocol())?;
    if bytes.len() > 32 * 1024 {
        return Err(super::protocol());
    }
    Ok(format!("gemini_call_{}", URL_SAFE_NO_PAD.encode(bytes)))
}

fn gemini_call_metadata(id: &str) -> Result<Option<Value>, ProviderError> {
    use base64::{Engine as _, engine::general_purpose::URL_SAFE_NO_PAD};
    let Some(encoded) = id.strip_prefix("gemini_call_") else {
        return Ok(None);
    };
    if encoded.len() > 48 * 1024 {
        return Err(invalid());
    }
    let value: Value =
        serde_json::from_slice(&URL_SAFE_NO_PAD.decode(encoded).map_err(|_| invalid())?)
            .map_err(|_| invalid())?;
    if value.get("name").and_then(Value::as_str).is_none()
        || ["signature", "id"].iter().any(|key| {
            value
                .get(*key)
                .is_some_and(|value| !value.is_null() && !value.is_string())
        })
    {
        return Err(invalid());
    }
    Ok(Some(value))
}
