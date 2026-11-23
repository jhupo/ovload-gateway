//! Validated, provider-owned OAuth client presets, frozen once per request.
use ovload_core::account::OpaqueProviderData;
use reqwest::header::{HeaderMap, HeaderValue};
use serde::{Deserialize, Serialize};
use serde_json::{Value, json};

const ANTIGRAVITY_METADATA: &str =
    r#"{"ideType":"ANTIGRAVITY","platform":"LINUX","pluginType":"GEMINI"}"#;
pub(super) const ANTIGRAVITY_USER_AGENT: &str =
    "antigravity/cli/1.1.27 (aidev_client; os_type=linux; arch=amd64; auth_method=consumer)";

#[derive(Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase", deny_unknown_fields)]
pub(in super::super) struct Profile {
    pub preset: String,
}

pub(in super::super) fn defaults() -> OpaqueProviderData {
    object(json!({"preset":"linux-x64"}))
}
pub(in super::super) fn object(value: Value) -> OpaqueProviderData {
    OpaqueProviderData::new(value.as_object().cloned().unwrap_or_default())
}
pub(in super::super) fn parse(value: &OpaqueProviderData) -> Result<Profile, ()> {
    let profile: Profile =
        serde_json::from_value(Value::Object(value.expose_to_provider().clone()))
            .map_err(|_| ())?;
    if !matches!(
        profile.preset.as_str(),
        "linux-x64" | "macos-arm64" | "windows-x64"
    ) {
        return Err(());
    }
    Ok(profile)
}
pub(in super::super) fn options(kind: &str) -> OpaqueProviderData {
    object(json!({"defaults":{"preset":"linux-x64"},"presets":[
        {"configuration":{"preset":"linux-x64"},"automaticAvailable":true},
        {"configuration":{"preset":"macos-arm64"},"automaticAvailable":true},
        {"configuration":{"preset":"windows-x64"},"automaticAvailable":true}
    ],"oauthOnly":true,"client":if kind=="claude" {"Claude Code"}else{"Antigravity CLI"}}))
}
pub(in super::super) fn preview(
    kind: &str,
    value: &OpaqueProviderData,
) -> Result<OpaqueProviderData, ()> {
    let profile = parse(value)?;
    let (os, arch) = match profile.preset.as_str() {
        "macos-arm64" => ("MacOS", "arm64"),
        "windows-x64" => ("Windows", "x64"),
        _ => ("Linux", "x64"),
    };
    let user_agent = if kind == "claude" {
        "claude-cli/2.1.318 (external, cli)".to_owned()
    } else {
        // Antigravity's OAuth service identifies requests with a stable CLI UA.
        // Keep the configured preset in the preview for compatibility, while
        // using the same UA for every request sent by the provider.
        ANTIGRAVITY_USER_AGENT.to_owned()
    };
    let mut headers = json!({"user-agent":user_agent});
    if kind == "claude" {
        headers["x-app"] = json!("cli");
        headers["anthropic-beta"] = json!("claude-code-20250219,oauth-2025-04-20");
        headers["x-stainless-os"] = json!(os);
        headers["x-stainless-arch"] = json!(arch);
        headers["x-stainless-lang"] = json!("js");
        headers["x-stainless-runtime"] = json!("node");
        headers["x-stainless-retry-count"] = json!("0");
    }
    Ok(object(
        json!({"configuration":profile,"userAgent":user_agent,"versionSource":"preset","headers":headers}),
    ))
}

pub(in super::super) fn antigravity_request(
    request: reqwest::RequestBuilder,
) -> reqwest::RequestBuilder {
    request
        .header("client-metadata", ANTIGRAVITY_METADATA)
        .header(reqwest::header::USER_AGENT, ANTIGRAVITY_USER_AGENT)
}

pub(in super::super) fn apply(
    kind: &str,
    value: Option<&OpaqueProviderData>,
    headers: &mut HeaderMap,
) -> Result<(), super::super::ProviderError> {
    let defaults = defaults();
    let preview = preview(kind, value.unwrap_or(&defaults)).map_err(|_| super::invalid())?;
    let values = preview
        .expose_to_provider()
        .get("headers")
        .and_then(Value::as_object)
        .ok_or_else(super::invalid)?;
    for (key, value) in values {
        headers.insert(
            reqwest::header::HeaderName::from_bytes(key.as_bytes())
                .map_err(|_| super::invalid())?,
            HeaderValue::from_str(value.as_str().ok_or_else(super::invalid)?)
                .map_err(|_| super::invalid())?,
        );
    }
    Ok(())
}
