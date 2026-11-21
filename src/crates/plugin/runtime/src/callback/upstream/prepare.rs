//! Prepare one managed HTTP request without owning its actual send.

use bytes::Bytes;
use http::{HeaderMap, Method, header};
use ovload_core::{
    engine::middleware::{
        MiddlewareHeader,
        outbound::{Request, Target},
    },
    error::{ProviderError, ProviderErrorKind},
    upstream::UpstreamSendState,
};
use ovload_host::outbound::HttpRequest;
use ovload_plugin_sdk::{PluginFault, call::upstream_adapter::UpstreamPathPurpose};
use serde_json::Value;
use url::Url;

use super::ManagedUpstream;

impl ManagedUpstream {
    pub(super) async fn prepare_request(
        &self,
        request: HttpRequest,
        purpose: UpstreamPathPurpose,
    ) -> Result<HttpRequest, PluginFault> {
        self.ensure_preparation_allowed()?;
        self.prepare(request, purpose)
            .await
            .map_err(|error| self.reject_preparation(error))
    }

    async fn prepare(
        &self,
        request: HttpRequest,
        purpose: UpstreamPathPurpose,
    ) -> Result<HttpRequest, ProviderError> {
        if self.context.cancellation().is_cancelled() {
            return Err(ProviderError::new(
                ProviderErrorKind::Cancelled,
                UpstreamSendState::NotSent,
            ));
        }
        if self.context.deadline().is_elapsed() {
            return Err(ProviderError::new(
                ProviderErrorKind::Timeout,
                UpstreamSendState::NotSent,
            ));
        }
        let original = Url::parse(&request.url).map_err(|_| invalid())?;
        let maximum_body_bytes = request.maximum_body_bytes;
        let empty_auxiliary = purpose == UpstreamPathPurpose::Auxiliary && request.body.is_empty();
        let mut outgoing = Request {
            target: Target::Http {
                method: Method::from_bytes(request.method.as_bytes()).map_err(|_| invalid())?,
                uri: request.url.parse().map_err(|_| invalid())?,
            },
            headers: request
                .headers
                .into_iter()
                .map(|(name, value)| MiddlewareHeader::new(name, Bytes::from(value)))
                .collect(),
            body: Bytes::from(request.body),
        };
        validate(&outgoing, maximum_body_bytes)?;
        if let Some(privacy) = self.context.privacy() {
            let mut headers = outgoing.header_map()?;
            let mut body = privacy_body(&outgoing.body, &headers, empty_auxiliary)?;
            privacy
                .apply(&mut body, &mut headers, &mut None, &|| {
                    self.context.cancellation().is_cancelled()
                        || self.context.deadline().is_elapsed()
                })
                .map_err(|_| denied())?;
            if empty_auxiliary {
                if !body.is_null() {
                    return Err(denied());
                }
            } else {
                outgoing.body = serde_json::to_vec(&body).map_err(|_| invalid())?.into();
            }
            outgoing.headers = headers
                .iter()
                .map(|(name, value)| {
                    MiddlewareHeader::new(name.as_str(), Bytes::copy_from_slice(value.as_bytes()))
                })
                .collect();
        }
        if let Some(pipeline) = &self.outbound {
            outgoing = pipeline.prepare(outgoing).await?;
        }
        validate(&outgoing, maximum_body_bytes)?;
        let headers = outgoing.header_map()?;
        if self.context.privacy().is_some() {
            privacy_body(&outgoing.body, &headers, empty_auxiliary)?;
        }
        let Target::Http { method, uri } = outgoing.target else {
            return Err(denied());
        };
        let final_url = Url::parse(&uri.to_string()).map_err(|_| invalid())?;
        if original.origin() != final_url.origin() || self.target.purpose(&final_url) != purpose {
            return Err(denied());
        }
        Ok(HttpRequest {
            method: method.as_str().to_owned(),
            url: final_url.into(),
            headers: outgoing
                .headers
                .into_iter()
                .map(|header| {
                    let (name, value) = header.into_parts();
                    (name, value.to_vec())
                })
                .collect(),
            body: outgoing.body.into(),
            maximum_body_bytes,
        })
    }
}

fn validate(request: &Request, maximum_body_bytes: usize) -> Result<(), ProviderError> {
    if request.body.len() > maximum_body_bytes {
        return Err(ProviderError::new(
            ProviderErrorKind::MessageTooBig,
            UpstreamSendState::NotSent,
        )
        .with_retry_prohibited());
    }
    if request.headers.len() > 128
        || request
            .headers
            .iter()
            .map(|header| header.name().len().saturating_add(header.value().len()))
            .sum::<usize>()
            > 32 * 1024
    {
        return Err(invalid());
    }
    let headers = request.header_map()?;
    if headers.keys().any(|name| {
        matches!(
            name.as_str(),
            "host"
                | "connection"
                | "content-length"
                | "transfer-encoding"
                | "proxy-authorization"
                | "upgrade"
                | "te"
                | "trailer"
        )
    }) {
        return Err(invalid());
    }
    let Target::Http { method, uri } = &request.target else {
        return Err(denied());
    };
    if matches!(*method, Method::CONNECT | Method::TRACE) {
        return Err(invalid());
    }
    let url = Url::parse(&uri.to_string()).map_err(|_| invalid())?;
    if !matches!(url.scheme(), "http" | "https")
        || url.host_str().is_none()
        || !url.username().is_empty()
        || url.password().is_some()
        || url.fragment().is_some()
        || url.port_or_known_default().is_none_or(|port| port == 0)
    {
        return Err(invalid());
    }
    Ok(())
}

fn privacy_body(
    bytes: &[u8],
    headers: &HeaderMap,
    empty_auxiliary: bool,
) -> Result<Value, ProviderError> {
    let mut encodings = headers.get_all(header::CONTENT_ENCODING).iter();
    if let Some(encoding) = encodings.next()
        && (encodings.next().is_some()
            || !encoding
                .to_str()
                .is_ok_and(|value| value.trim().eq_ignore_ascii_case("identity")))
    {
        return Err(denied());
    }
    if empty_auxiliary {
        return if bytes.is_empty() {
            Ok(Value::Null)
        } else {
            Err(denied())
        };
    }
    if bytes.is_empty() {
        return Err(denied());
    }
    let mut types = headers.get_all(header::CONTENT_TYPE).iter();
    let content_type = types
        .next()
        .ok_or_else(denied)?
        .to_str()
        .map_err(|_| denied())?;
    let media_type = content_type
        .split(';')
        .next()
        .ok_or_else(denied)?
        .trim()
        .to_ascii_lowercase();
    if types.next().is_some()
        || !(media_type == "application/json"
            || media_type
                .strip_prefix("application/")
                .is_some_and(|subtype| subtype.len() > 5 && subtype.ends_with("+json")))
    {
        return Err(denied());
    }
    serde_json::from_slice(bytes).map_err(|_| denied())
}

fn invalid() -> ProviderError {
    ProviderError::new(
        ProviderErrorKind::InvalidRequest,
        UpstreamSendState::NotSent,
    )
    .with_retry_prohibited()
}

fn denied() -> ProviderError {
    ProviderError::new(
        ProviderErrorKind::RequestPolicyDenied,
        UpstreamSendState::NotSent,
    )
    .with_retry_prohibited()
}
