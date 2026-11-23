// Modified for Ovload on 2026-10-27: workspace integration.

//! OpenAI 客户端协议的 Bearer API key 认证

use axum::{
    http::{HeaderMap, header::AUTHORIZATION},
    response::{IntoResponse, Response},
};
use ovload_core::engine::{
    authentication::ClientAuthenticationRequest, execution::AuthenticatedClient,
};

use super::{
    error::{missing_client_api_key_response, runtime_unavailable_response},
    service::OpenAiService,
};

/// Client API key 鉴权失败原因
#[derive(Debug, Clone, Copy, PartialEq, Eq)]
pub enum ClientApiKeyAuthError {
    /// 缺失 Authorization 头
    MissingAuthorization,
    /// Authorization 头不是合法的 Bearer token
    MalformedAuthorization,
    /// Bearer token 不是 client API key 格式
    InvalidKeyFormat,
    /// Key 不存在、已禁用或 wire 格式无效
    InvalidKey,
    /// RuntimeSnapshot 一致性保护暂停接收新请求
    RuntimeUnavailable,
}

impl ClientApiKeyAuthError {
    /// 返回可用于日志和指标的稳定失败原因
    #[must_use]
    pub const fn reason(self) -> &'static str {
        match self {
            Self::MissingAuthorization => "missing_authorization",
            Self::MalformedAuthorization => "malformed_authorization",
            Self::InvalidKeyFormat => "invalid_key_format",
            Self::InvalidKey => "invalid_key",
            Self::RuntimeUnavailable => "runtime_unavailable",
        }
    }
}

pub(crate) async fn authenticate_client(
    service: &OpenAiService,
    headers: &HeaderMap,
) -> Result<AuthenticatedClient, ClientApiKeyAuthError> {
    let request = client_authentication_request(headers)?;
    service.authenticate(request).await
}

/// 复用数据面入口认证计划，但不记录 Key 使用事实或执行推理准入
pub(crate) async fn verify_client(
    service: &OpenAiService,
    headers: &HeaderMap,
) -> Result<AuthenticatedClient, ClientApiKeyAuthError> {
    let request = client_authentication_request(headers)?;
    service.verify(request).await
}

fn client_authentication_request(
    headers: &HeaderMap,
) -> Result<ClientAuthenticationRequest, ClientApiKeyAuthError> {
    let raw = headers
        .get(AUTHORIZATION)
        .ok_or(ClientApiKeyAuthError::MissingAuthorization)?
        .to_str()
        .map_err(|_| ClientApiKeyAuthError::MalformedAuthorization)?;
    let request = ClientAuthenticationRequest::new(raw.to_owned())
        .map_err(|_| ClientApiKeyAuthError::MalformedAuthorization)?;
    let request = request.with_request_context(
        crate::middleware::current().and_then(|context| context.extensions.shared_request()),
    );
    Ok(match crate::middleware::current_settings() {
        Some(settings) => request.with_settings(settings),
        None => request,
    })
}

pub(crate) fn client_access_error_response(error: ClientApiKeyAuthError) -> Response {
    log_client_api_key_auth_failure(error);
    if error == ClientApiKeyAuthError::RuntimeUnavailable {
        runtime_unavailable_response().into_response()
    } else {
        missing_client_api_key_response().into_response()
    }
}

fn log_client_api_key_auth_failure(error: ClientApiKeyAuthError) {
    match error {
        ClientApiKeyAuthError::RuntimeUnavailable => {
            tracing::warn!(
                auth_failure = error.reason(),
                "Client API key authorization failed"
            );
        }
        _ => {
            tracing::info!(
                auth_failure = error.reason(),
                "Client API key authorization failed"
            );
        }
    }
}
