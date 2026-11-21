//! Provider-owned account test media protocol. Native payloads never reach the admin UI.
use ovload_admin::ports::provider::{ProviderAdminError, ProviderAdminErrorKind};
use ovload_core::{event::ProtocolWireEvent, operation::{Operation, ImageRequest, ImageRequestKind, RawJsonPayload}};
use serde_json::Value;
use base64::{Engine as _, engine::general_purpose::STANDARD};

pub(crate) fn kind(model: &str, authentication: &str) -> Option<&'static str> {
    if model.starts_with("gpt-image-") { return (authentication == "oauth").then_some("image"); }
    let id = model.to_ascii_lowercase();
    if ["image", "dall-e", "embedding", "audio", "tts", "whisper", "realtime", "video", "moderation"].iter().any(|part| id.contains(part)) { None } else { Some("text") }
}

pub(crate) fn image_operation(model: &str, prompt: &str) -> Result<Operation, ProviderAdminError> {
    let body = serde_json::to_vec(&serde_json::json!({"model":model,"prompt":prompt,"n":1,"size":"1024x1024","output_format":"png"}))
        .map_err(|_| ProviderAdminError::new(ProviderAdminErrorKind::Invalid))?;
    let payload = RawJsonPayload::new("openai", body.into()).map_err(|_| ProviderAdminError::new(ProviderAdminErrorKind::Invalid))?;
    Ok(Operation::GenerateImage(ImageRequest::from_raw_json(ImageRequestKind::Generation, payload)))
}

pub(crate) fn images(wire: &[ProtocolWireEvent]) -> Vec<String> {
    let mut result = Vec::new();
    for event in wire {
        if let Some(raw) = event.raw_json_body() {
            if raw.len() <= 12 * 1024 * 1024 {
                if let Ok(data) = serde_json::from_slice::<Value>(raw) { collect(&data, &mut result); }
            }
        } else if event.has_json_data() { collect(event.data(), &mut result); }
    }
    result
}
fn collect(data: &Value, result: &mut Vec<String>) {
    if let Some(items) = data.get("data").and_then(Value::as_array) {
        for item in items { push(item, result); }
    }
    if data.get("type").and_then(Value::as_str) == Some("image_generation.completed") { push(data, result); }
    if let Some(item) = data.get("item").filter(|_| data.get("type").and_then(Value::as_str) == Some("response.output_item.done")) {
        if item.get("type").and_then(Value::as_str) == Some("image_generation_call") { push(item, result); }
    }
    if let Some(items) = data.pointer("/response/output").or_else(|| data.get("output")).and_then(Value::as_array) {
        for item in items {
            if item.get("type").and_then(Value::as_str) == Some("image_generation_call") { push(item, result); }
        }
    }
}
fn push(item: &Value, result: &mut Vec<String>) {
    if result.len() >= 4 { return; }
    let url = if let Some(data) = item.get("b64_json").or_else(|| item.get("result")).and_then(Value::as_str) {
        if data.len() > 8 * 1024 * 1024 { return; }
        let Ok(bytes) = STANDARD.decode(data) else { return; };
        let mime = if bytes.starts_with(b"\x89PNG\r\n\x1a\n") { "image/png" }
            else if bytes.starts_with(&[0xff, 0xd8, 0xff]) { "image/jpeg" }
            else if bytes.starts_with(b"RIFF") && bytes.get(8..12) == Some(b"WEBP") { "image/webp" }
            else { return; };
        format!("data:{mime};base64,{data}")
    } else if let Some(url) = item.get("url").and_then(Value::as_str) {
        let Ok(parsed) = url::Url::parse(url) else { return; };
        if parsed.scheme() != "https" || !parsed.username().is_empty() || parsed.password().is_some() || url.len() > 8192 { return; }
        url.to_owned()
    } else { return; };
    if !result.contains(&url) { result.push(url); }
}

#[cfg(test)]
mod tests {
    use super::*;
    #[test]
    fn account_test_media_separates_oauth_and_api_and_rejects_unsupported_models() {
        assert_eq!(kind("gpt-image-2", "oauth"), Some("image"));
        assert_eq!(kind("gpt-image-2", "api_key"), None);
        assert_eq!(kind("text-embedding-3-large", "api_key"), None);
        assert_eq!(kind("gpt-5.4", "oauth"), Some("text"));
        let Operation::GenerateImage(request) = image_operation("gpt-image-2", "cat").unwrap() else { panic!("image operation required") };
        let body: Value = serde_json::from_slice(request.payload().body()).unwrap();
        assert_eq!(body["model"], "gpt-image-2");assert_eq!(body["prompt"], "cat");assert_eq!(body["n"], 1);
    }
    #[test]
    fn account_test_media_projects_images_and_deduplicates_without_exposing_payload() {
        let mut result=Vec::new();
        collect(&serde_json::json!({"data":[{"b64_json":"iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAwMCAO+a0WQAAAAASUVORK5CYII="},{"url":"javascript:alert(1)"},{"url":"https://user:secret@example.com/image"}]}), &mut result);
        collect(&serde_json::json!({"response":{"output":[{"type":"image_generation_call","result":"iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAwMCAO+a0WQAAAAASUVORK5CYII="}]}}), &mut result);
        assert_eq!(result, vec!["data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAwMCAO+a0WQAAAAASUVORK5CYII="]);
        collect(&serde_json::json!({"data":[{"b64_json":"invalid base64"}]}), &mut result);
        assert_eq!(result.len(), 1);
    }
}
