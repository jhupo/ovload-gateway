//! Apply frozen privacy/outbound policy before resolving the final account destination.

use super::{PublicApiProvider, error, network, request, scheduler::SelectedAccount};
use bytes::Bytes;
use ovload_core::{
    engine::{
        AttemptContext,
        middleware::{
            MiddlewareHeader,
            outbound::{Request, Target},
        },
    },
    error::{ProviderError, ProviderErrorKind},
    routing::UpstreamModelId,
    upstream::UpstreamSendState,
};
use reqwest::{
    Url,
    header::{HeaderMap, HeaderName, HeaderValue},
};
use serde_json::{Map, Value};

pub(super) struct Prepared {
    pub(super) client: reqwest::Client,
    pub(super) request: reqwest::Request,
    pub(super) service_tier: Option<String>,
}

pub(super) async fn prepare(
    provider: &PublicApiProvider,
    selected: &SelectedAccount,
    context: &AttemptContext,
    model: &UpstreamModelId,
    body: &Map<String, Value>,
    headers: &[MiddlewareHeader],
) -> Result<Prepared, ProviderError> {
    let native = provider.adapter.is_native();
    let endpoint = if native {
        super::native::endpoint(provider.kind.as_str(), &selected.credential, model.as_str())?
    } else {
        network::endpoint(&selected.credential, "responses")?
    };
    let mut outgoing_headers = HeaderMap::new();
    outgoing_headers.insert(
        reqwest::header::ACCEPT,
        HeaderValue::from_static("text/event-stream"),
    );
    outgoing_headers.insert(
        reqwest::header::CONTENT_TYPE,
        HeaderValue::from_static("application/json"),
    );
    let mut authorization =
        HeaderValue::from_str(&format!("Bearer {}", selected.credential.api_key))
            .map_err(|_| invalid())?;
    authorization.set_sensitive(true);
    outgoing_headers.insert(reqwest::header::AUTHORIZATION, authorization);
    if native {
        outgoing_headers = super::native::headers(provider.kind.as_str(), &selected.credential)?;
        if selected.credential.oauth.is_some() {
            super::native::profile::apply(
                provider.kind.as_str(),
                context.request_profile(),
                &mut outgoing_headers,
            )?;
            if provider.adapter.is_gemini() {
                let user_agent = outgoing_headers
                    .get("user-agent")
                    .and_then(|value| value.to_str().ok())
                    .ok_or_else(invalid)?
                    .replace("{model}", model.as_str());
                outgoing_headers.insert(
                    "user-agent",
                    HeaderValue::from_str(&user_agent).map_err(|_| invalid())?,
                );
            }
        }
    }
    for header in headers {
        let name = HeaderName::from_bytes(header.name().as_bytes()).map_err(|_| invalid())?;
        let value = HeaderValue::from_bytes(header.value()).map_err(|_| invalid())?;
        outgoing_headers.insert(name, value);
    }
    let mut body = Value::Object(body.clone());
    if let Some(privacy) = context.privacy() {
        privacy
            .apply(&mut body, &mut outgoing_headers, &mut None, &|| {
                context.cancellation().is_cancelled() || context.deadline().is_elapsed()
            })
            .map_err(|_| invalid())?;
    }
    if native {
        body = super::native::encode(
            provider.kind.as_str(),
            &selected.credential,
            body.as_object().ok_or_else(invalid)?,
        )?;
    }
    let bytes = serde_json::to_vec(&body)
        .map(Bytes::from)
        .map_err(|_| invalid())?;
    let mut prepared = Request {
        target: Target::Http {
            method: reqwest::Method::POST,
            uri: endpoint.as_str().parse().map_err(|_| invalid())?,
        },
        headers: outgoing_headers
            .iter()
            .map(|(name, value)| {
                MiddlewareHeader::new(name.as_str(), Bytes::copy_from_slice(value.as_bytes()))
            })
            .collect(),
        body: bytes,
    };
    if let Some(pipeline) = context.outbound_middleware(
        provider.kind.clone(),
        Some(model.as_str().to_owned()),
        selected.account.id().clone(),
    ) {
        prepared = pipeline.prepare(prepared).await?;
    }
    let final_headers = prepared.header_map()?;
    let Target::Http { method, uri } = prepared.target else {
        return Err(invalid());
    };
    let url = Url::parse(&uri.to_string()).map_err(|_| invalid())?;
    let mut validation_url = url.clone();
    if native {
        validation_url.set_query(None);
    }
    network::base_url(validation_url.as_str()).map_err(|_| invalid())?;
    if url.origin() != endpoint.origin() {
        return Err(error(
            ProviderErrorKind::RequestPolicyDenied,
            UpstreamSendState::NotSent,
        )
        .with_retry_prohibited());
    }
    let final_body: Map<String, Value> =
        serde_json::from_slice(&prepared.body).map_err(|_| invalid())?;
    if native {
        if Value::Object(final_body.clone()) != body || url != endpoint {
            return Err(invalid());
        }
    } else {
        request::validate(&final_body)?;
        if final_body.get("model").and_then(Value::as_str) != Some(model.as_str())
            || final_body.get("stream") != Some(&Value::Bool(true))
        {
            return Err(invalid());
        }
    }
    let client = network::client(&selected.account, &url).await?;
    let mut request = reqwest::Request::new(method, url);
    *request.headers_mut() = final_headers;
    *request.body_mut() = Some(prepared.body.into());
    Ok(Prepared {
        client,
        request,
        service_tier: final_body
            .get("service_tier")
            .and_then(Value::as_str)
            .map(str::to_owned),
    })
}

fn invalid() -> ProviderError {
    error(
        ProviderErrorKind::InvalidRequest,
        UpstreamSendState::NotSent,
    )
    .with_retry_prohibited()
}
