//! Native subscription OAuth and API-key transports. OAuth identities never apply to keys.

pub(super) mod antigravity_error;
pub(super) mod oauth;
mod oauth_http;
pub(super) mod profile;
mod quota;
mod request;
mod stream;
#[cfg(test)]
mod tests;

use super::{Credential, PublicApiProvider, error, network};
use ovload_core::{
    account::ProviderAccount,
    error::{ProviderError, ProviderErrorKind},
    routing::UpstreamModelId,
    upstream::UpstreamSendState,
};
use reqwest::{
    Url,
    header::{HeaderMap, HeaderValue},
};
use serde_json::{Value, json};

pub(super) use request::encode;
pub(super) use stream::Decoder;

pub(super) fn is_native(kind: &str) -> bool {
    matches!(kind, "claude" | "gemini")
}
pub(super) fn invalid() -> ProviderError {
    error(
        ProviderErrorKind::InvalidRequest,
        UpstreamSendState::NotSent,
    )
    .with_retry_prohibited()
}
pub(super) fn protocol() -> ProviderError {
    error(ProviderErrorKind::Protocol, UpstreamSendState::Sent)
}

pub(super) fn headers(kind: &str, credential: &Credential) -> Result<HeaderMap, ProviderError> {
    let mut headers = HeaderMap::new();
    headers.insert("content-type", HeaderValue::from_static("application/json"));
    headers.insert("accept", HeaderValue::from_static("text/event-stream"));
    let (name, value) = if credential.oauth.is_some() {
        ("authorization", format!("Bearer {}", credential.api_key))
    } else if kind == "claude" {
        ("x-api-key", credential.api_key.clone())
    } else {
        ("x-goog-api-key", credential.api_key.clone())
    };
    let mut value = HeaderValue::from_str(&value).map_err(|_| invalid())?;
    value.set_sensitive(true);
    headers.insert(name, value);
    if kind == "claude" {
        headers.insert("anthropic-version", HeaderValue::from_static("2023-06-01"));
    }
    if credential.oauth.is_some() {
        profile::apply(kind, None, &mut headers)?;
    }
    if kind == "gemini" && credential.oauth.is_some() {
        headers.insert(
            "client-metadata",
            HeaderValue::from_static(
                r#"{"ideType":"ANTIGRAVITY","platform":"LINUX","pluginType":"GEMINI"}"#,
            ),
        );
    }
    Ok(headers)
}

pub(super) fn endpoint(
    kind: &str,
    credential: &Credential,
    model: &str,
) -> Result<Url, ProviderError> {
    if kind == "claude" {
        return network::endpoint(credential, "messages");
    }
    if credential.oauth.is_some() {
        let mut url = network::endpoint(credential, "v1internal:streamGenerateContent")?;
        url.set_query(Some("alt=sse"));
        return Ok(url);
    }
    if model.is_empty()
        || model.len() > 256
        || !model
            .bytes()
            .all(|byte| byte.is_ascii_alphanumeric() || b"-_.".contains(&byte))
    {
        return Err(invalid());
    }
    let mut url = network::endpoint(credential, &format!("models/{model}:streamGenerateContent"))?;
    url.set_query(Some("alt=sse"));
    Ok(url)
}

pub(super) async fn models(
    provider: &PublicApiProvider,
    account: &ProviderAccount,
    credential: &Credential,
) -> Result<Vec<UpstreamModelId>, ProviderError> {
    if provider.kind.as_str() == "gemini" && credential.oauth.is_some() {
        // Antigravity exposes the account-specific catalog separately from quota.
        // Do not use the public Gemini `models` endpoint for an OAuth account.
        let url = network::endpoint(credential, "v1internal:fetchAvailableModels")?;
        let client = network::client(account, &url).await?;
        let project = credential
            .oauth
            .as_ref()
            .and_then(|tokens| tokens.project.as_deref())
            .filter(|project| !project.is_empty());
        let body = project.map_or_else(|| json!({}), |project| json!({"project": project}));
        let response =
            profile::antigravity_request(client.post(url).headers(headers("gemini", credential)?))
                .json(&body)
                .send()
                .await
                .map_err(|_| protocol())?;
        if !response.status().is_success() {
            return Err(network::status_error(response.status()));
        }
        let document: Value =
            serde_json::from_slice(&network::bounded_body(response, 2 * 1024 * 1024).await?)
                .map_err(|_| protocol())?;
        let models = document.get("models").ok_or_else(protocol)?;
        let mut names = std::collections::BTreeSet::new();
        if let Some(models) = models.as_object() {
            for (name, row) in models {
                if row.get("disabled") == Some(&Value::Bool(true)) {
                    continue;
                }
                names.insert(name.strip_prefix("models/").unwrap_or(name));
            }
        } else if let Some(models) = models.as_array() {
            for row in models {
                if row.get("disabled") == Some(&Value::Bool(true)) {
                    continue;
                }
                if let Some(name) = row
                    .get("name")
                    .or_else(|| row.get("modelId"))
                    .and_then(Value::as_str)
                {
                    names.insert(name.strip_prefix("models/").unwrap_or(name));
                }
            }
        }
        return model_ids(names.into_iter());
    }
    let mut result = std::collections::BTreeSet::new();
    let mut page: Option<String> = None;
    for _ in 0..32 {
        let mut url = network::endpoint(credential, "models")?;
        if let Some(page) = &page {
            url.query_pairs_mut().append_pair(
                if provider.kind.as_str() == "gemini" {
                    "pageToken"
                } else {
                    "after_id"
                },
                page,
            );
        }
        let client = network::client(account, &url).await?;
        let response = client
            .get(url)
            .headers(headers(provider.kind.as_str(), credential)?)
            .header(reqwest::header::ACCEPT, "application/json")
            .send()
            .await
            .map_err(|failure| {
                error(
                    if failure.is_timeout() {
                        ProviderErrorKind::Timeout
                    } else {
                        ProviderErrorKind::Transport
                    },
                    if failure.is_connect() {
                        UpstreamSendState::NotSent
                    } else {
                        UpstreamSendState::Ambiguous
                    },
                )
            })?;
        if !response.status().is_success() {
            return Err(network::status_error(response.status()));
        }
        let document: Value =
            serde_json::from_slice(&network::bounded_body(response, 2 * 1024 * 1024).await?)
                .map_err(|_| protocol())?;
        let rows = document
            .get(if provider.kind.as_str() == "gemini" {
                "models"
            } else {
                "data"
            })
            .and_then(Value::as_array)
            .ok_or_else(protocol)?;
        for row in rows {
            if provider.kind.as_str() == "gemini"
                && !row
                    .get("supportedGenerationMethods")
                    .and_then(Value::as_array)
                    .is_some_and(|methods| methods.iter().any(|method| method == "generateContent"))
            {
                continue;
            }
            let name = row
                .get(if provider.kind.as_str() == "gemini" {
                    "name"
                } else {
                    "id"
                })
                .and_then(Value::as_str)
                .ok_or_else(protocol)?;
            result.insert(
                UpstreamModelId::new(name.strip_prefix("models/").unwrap_or(name))
                    .map_err(|_| protocol())?,
            );
        }
        if result.len() > super::MAX_MODELS {
            return Err(protocol());
        }
        page = if provider.kind.as_str() == "gemini" {
            document
                .get("nextPageToken")
                .and_then(Value::as_str)
                .filter(|page| !page.is_empty())
                .map(str::to_owned)
        } else if document.get("has_more") == Some(&Value::Bool(true)) {
            Some(
                document
                    .get("last_id")
                    .and_then(Value::as_str)
                    .ok_or_else(protocol)?
                    .to_owned(),
            )
        } else {
            None
        };
        if page.is_none() {
            return Ok(result.into_iter().collect());
        }
    }
    Err(protocol())
}

fn model_ids<'a>(
    names: impl Iterator<Item = &'a str>,
) -> Result<Vec<UpstreamModelId>, ProviderError> {
    let mut result = std::collections::BTreeSet::new();
    for name in names {
        result.insert(UpstreamModelId::new(name).map_err(|_| protocol())?);
        if result.len() > super::MAX_MODELS {
            return Err(protocol());
        }
    }
    if result.is_empty() {
        return Err(protocol());
    }
    Ok(result.into_iter().collect())
}
