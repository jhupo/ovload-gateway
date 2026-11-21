//! Account-bound HTTPS, pinned public DNS and bounded response bodies.

use super::{Credential, MAX_MODELS, error};
use futures::StreamExt;
use ovload_core::{
    account::ProviderAccount,
    error::{ProviderError, ProviderErrorKind},
    routing::UpstreamModelId,
    upstream::UpstreamSendState,
};
use reqwest::{Client, Url};
use std::{
    collections::HashMap,
    net::{IpAddr, SocketAddr},
    sync::{Mutex, OnceLock},
    time::{Duration, Instant},
};

pub(super) fn egress_fingerprint(account: &ProviderAccount) -> String {
    use sha2::{Digest, Sha256};
    let mut identity = Sha256::new();
    identity.update(account.id().as_str().as_bytes());
    identity.update(account.revision().get().to_be_bytes());
    identity.update(
        account
            .outbound_proxy()
            .map_or("direct", |proxy| proxy.expose_url())
            .as_bytes(),
    );
    if let Some(ca_identity) = provider_openai::transport::tls::custom_ca_env_cache_key() {
        identity.update(ca_identity.as_bytes());
    }
    hex::encode(identity.finalize())
}

pub(super) fn base_url(value: &str) -> Result<Url, ()> {
    if value.len() > 2_048 || value.trim() != value {
        return Err(());
    }
    let url = Url::parse(value).map_err(|_| ())?;
    if url.scheme() != "https"
        || url.host_str().is_none()
        || url.port() == Some(0)
        || !url.username().is_empty()
        || url.password().is_some()
        || url.query().is_some()
        || url.fragment().is_some()
        || url.host_str().is_some_and(|host| {
            host.eq_ignore_ascii_case("localhost") || host.ends_with(".localhost")
        })
    {
        return Err(());
    }
    if let Some(host) = url
        .host_str()
        .and_then(|host| host.trim_matches(['[', ']']).parse::<IpAddr>().ok())
        && !public_address(host)
    {
        return Err(());
    }
    Ok(url)
}

pub(super) fn endpoint(credential: &Credential, path: &str) -> Result<Url, ProviderError> {
    let mut url = base_url(&credential.base_url).map_err(|_| {
        error(
            ProviderErrorKind::InvalidRequest,
            UpstreamSendState::NotSent,
        )
    })?;
    let full_path = format!("{}/{}", url.path().trim_end_matches('/'), path);
    url.set_path(&full_path);
    Ok(url)
}

pub(super) async fn client(account: &ProviderAccount, url: &Url) -> Result<Client, ProviderError> {
    use sha2::{Digest, Sha256};
    let host = url.host_str().ok_or_else(|| {
        error(
            ProviderErrorKind::InvalidRequest,
            UpstreamSendState::NotSent,
        )
    })?;
    let mut cache_identity = Sha256::new();
    cache_identity.update(account.id().as_str().as_bytes());
    cache_identity.update(account.revision().get().to_be_bytes());
    cache_identity.update(url.as_str().as_bytes());
    if let Some(ca_identity) = provider_openai::transport::tls::custom_ca_env_cache_key() {
        cache_identity.update(ca_identity.as_bytes());
    }
    let mut builder = Client::builder()
        .no_proxy()
        .redirect(reqwest::redirect::Policy::none())
        .retry(reqwest::retry::never())
        .connect_timeout(Duration::from_secs(15))
        .pool_max_idle_per_host(2)
        .pool_idle_timeout(Duration::from_secs(60));
    let official = match account.provider().as_str() {
        "claude" => host == "api.anthropic.com",
        "xai_api" => host == "api.x.ai",
        "gemini" => matches!(
            host,
            "generativelanguage.googleapis.com"
                | "cloudcode-pa.googleapis.com"
                | "daily-cloudcode-pa.googleapis.com"
                | "autopush-cloudcode-pa.googleapis.com"
                | "cloudcode-pa.sandbox.googleapis.com"
                | "daily-cloudcode-pa.sandbox.googleapis.com"
                | "autopush-cloudcode-pa.sandbox.googleapis.com"
        ),
        _ => host == "api.openai.com",
    };
    // Custom API endpoints can use the selected proxy, but must still resolve to
    // public addresses. Keep the same destination checks as direct connections.
    if account.outbound_proxy().is_none() || !official || url.port_or_known_default() != Some(443) {
        let port = url.port_or_known_default().ok_or_else(|| {
            error(
                ProviderErrorKind::InvalidRequest,
                UpstreamSendState::NotSent,
            )
        })?;
        let mut addresses: Vec<SocketAddr> =
            if let Ok(ip) = host.trim_matches(['[', ']']).parse::<IpAddr>() {
                vec![SocketAddr::new(ip, port)]
            } else {
                tokio::time::timeout(
                    Duration::from_secs(10),
                    tokio::net::lookup_host((host, port)),
                )
                .await
                .map_err(|_| error(ProviderErrorKind::Timeout, UpstreamSendState::NotSent))?
                .map_err(|_| error(ProviderErrorKind::Transport, UpstreamSendState::NotSent))?
                .take(65)
                .collect()
            };
        if addresses.is_empty()
            || addresses.len() > 64
            || addresses
                .iter()
                .any(|address| !public_address(address.ip()))
        {
            return Err(error(
                ProviderErrorKind::RequestPolicyDenied,
                UpstreamSendState::NotSent,
            )
            .with_retry_prohibited());
        }
        addresses.sort_unstable();
        addresses.dedup();
        for address in &addresses {
            cache_identity.update(address.to_string().as_bytes());
        }
        builder = builder.resolve_to_addrs(host, &addresses);
    }
    if let Some(proxy) = account.outbound_proxy() {
        builder = builder.proxy(reqwest::Proxy::all(proxy.expose_url()).map_err(|_| {
            error(
                ProviderErrorKind::ProviderInfrastructureUnavailable,
                UpstreamSendState::NotSent,
            )
        })?);
        cache_identity.update(proxy.expose_url().as_bytes());
    }
    // DNS is revalidated above before cache lookup, so pooling cannot bypass rebinding checks.
    type Clients = Mutex<HashMap<String, (Instant, Client)>>;
    static CLIENTS: OnceLock<Clients> = OnceLock::new();
    let clients = CLIENTS.get_or_init(|| Mutex::new(HashMap::new()));
    let key = hex::encode(cache_identity.finalize());
    if let Some((_, client)) = clients
        .lock()
        .unwrap_or_else(std::sync::PoisonError::into_inner)
        .get(&key)
        .filter(|(expires_at, _)| *expires_at > Instant::now())
    {
        return Ok(client.clone());
    }
    let client = provider_openai::transport::tls::build_reqwest_client_with_custom_ca(builder)
        .map_err(|_| {
            error(
                ProviderErrorKind::ProviderInfrastructureUnavailable,
                UpstreamSendState::NotSent,
            )
        })?;
    let mut clients = clients
        .lock()
        .unwrap_or_else(std::sync::PoisonError::into_inner);
    clients.retain(|_, (expires_at, _)| *expires_at > Instant::now());
    if clients.len() >= 256 {
        clients.clear();
    }
    clients.insert(
        key,
        (Instant::now() + Duration::from_secs(300), client.clone()),
    );
    Ok(client)
}

pub(super) async fn models(
    account: &ProviderAccount,
    credential: &Credential,
) -> Result<Vec<UpstreamModelId>, ProviderError> {
    let url = endpoint(credential, "models")?;
    let response = client(account, &url)
        .await?
        .get(url)
        .bearer_auth(&credential.api_key)
        .header(reqwest::header::ACCEPT, "application/json")
        .send()
        .await
        .map_err(|failure| {
            error(
                ProviderErrorKind::Transport,
                if failure.is_connect() {
                    UpstreamSendState::NotSent
                } else {
                    UpstreamSendState::Ambiguous
                },
            )
        })?;
    if !response.status().is_success() {
        let mut failure = status_error(response.status());
        if let Some(delay) = retry_after(response.headers()) {
            failure = failure.with_retry_after(delay);
        }
        return Err(failure);
    }
    let body = bounded_body(response, 2 * 1024 * 1024).await?;
    parse_models(&body)
}

pub(super) fn parse_models(body: &[u8]) -> Result<Vec<UpstreamModelId>, ProviderError> {
    let document: serde_json::Value = serde_json::from_slice(body)
        .map_err(|_| error(ProviderErrorKind::Protocol, UpstreamSendState::Sent))?;
    let models = document
        .get("data")
        .and_then(serde_json::Value::as_array)
        .filter(|models| models.len() <= MAX_MODELS)
        .ok_or_else(|| error(ProviderErrorKind::Protocol, UpstreamSendState::Sent))?;
    let mut result = std::collections::BTreeSet::new();
    for model in models {
        let id = model
            .get("id")
            .and_then(serde_json::Value::as_str)
            .ok_or_else(|| error(ProviderErrorKind::Protocol, UpstreamSendState::Sent))?;
        result.insert(
            UpstreamModelId::new(id)
                .map_err(|_| error(ProviderErrorKind::Protocol, UpstreamSendState::Sent))?,
        );
    }
    Ok(result.into_iter().collect())
}

pub(super) async fn bounded_body(
    response: reqwest::Response,
    limit: usize,
) -> Result<Vec<u8>, ProviderError> {
    if response
        .content_length()
        .is_some_and(|length| length > limit as u64)
    {
        return Err(error(ProviderErrorKind::Protocol, UpstreamSendState::Sent));
    }
    let mut stream = response.bytes_stream();
    let mut body = Vec::new();
    while let Some(chunk) = stream.next().await {
        let chunk =
            chunk.map_err(|_| error(ProviderErrorKind::Transport, UpstreamSendState::Sent))?;
        if chunk.len() > limit.saturating_sub(body.len()) {
            return Err(error(ProviderErrorKind::Protocol, UpstreamSendState::Sent));
        }
        body.extend_from_slice(&chunk);
    }
    Ok(body)
}

pub(super) fn status_error(status: reqwest::StatusCode) -> ProviderError {
    let kind = match status.as_u16() {
        400 | 404 | 409 | 422 => ProviderErrorKind::InvalidRequest,
        401 => ProviderErrorKind::Unauthorized,
        403 => ProviderErrorKind::PermissionDenied,
        413 => ProviderErrorKind::MessageTooBig,
        429 => ProviderErrorKind::RateLimited,
        500..=599 => ProviderErrorKind::Unavailable,
        _ => ProviderErrorKind::Protocol,
    };
    error(kind, UpstreamSendState::Sent).with_status(status.as_u16())
}

pub(super) fn retry_after(headers: &reqwest::header::HeaderMap) -> Option<Duration> {
    let value = headers.get(reqwest::header::RETRY_AFTER)?.to_str().ok()?;
    let delay = match value.parse::<u64>() {
        Ok(seconds) => Duration::from_secs(seconds),
        Err(_) => chrono::DateTime::parse_from_rfc2822(value)
            .ok()?
            .signed_duration_since(chrono::Utc::now())
            .to_std()
            .unwrap_or(Duration::ZERO),
    };
    Some(delay.min(Duration::from_secs(3_600)))
}

fn public_address(address: IpAddr) -> bool {
    match address {
        IpAddr::V4(ip) => {
            let [a, b, c, _] = ip.octets();
            !ip.is_private()
                && !ip.is_loopback()
                && !ip.is_link_local()
                && !ip.is_broadcast()
                && !ip.is_documentation()
                && a != 0
                && a < 224
                && !(a == 100 && (64..=127).contains(&b))
                && !(a == 192 && b == 0 && c == 0)
                && !(a == 192 && b == 88 && c == 99)
                && !(a == 198 && (b == 18 || b == 19))
        }
        IpAddr::V6(ip) => {
            if let Some(mapped) = ip.to_ipv4_mapped() {
                return public_address(IpAddr::V4(mapped));
            }
            let segments = ip.segments();
            segments[0] & 0xe000 == 0x2000
                && !(segments[0] == 0x2001 && segments[1] < 0x0200)
                && !(segments[0] == 0x2001 && segments[1] == 0x0db8)
                && segments[0] != 0x2002
                && !(segments[0] == 0x3fff && segments[1] < 0x1000)
        }
    }
}
