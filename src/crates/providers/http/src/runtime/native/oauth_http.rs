//! OAuth diagnostics only expose fixed classifications, never upstream bodies or credentials.
use ovload_admin::ports::provider::{ProviderAdminError, ProviderAdminErrorKind};
use serde_json::Value;

#[derive(Clone, Copy)]
pub(super) enum Stage {
    Token,
    Profile,
    LoadProject,
    Onboard,
    Poll,
    DiscoverProject,
}

impl Stage {
    fn name(self) -> &'static str {
        match self {
            Self::Token => "token_exchange",
            Self::Profile => "user_profile",
            Self::LoadProject => "load_code_assist",
            Self::Onboard => "onboard_user",
            Self::Poll => "onboarding_operation",
            Self::DiscoverProject => "discover_cloud_project",
        }
    }

    fn message(self, provider: &str, reason: &str) -> &'static str {
        if provider == "gemini" {
            match reason {
                "timeout" | "connect" => {
                    "Gemini 授权无法连接 Google，请检查账号的出站代理或服务器网络"
                }
                "invalid_grant" => "Google 拒绝了授权码，授权码可能已过期或已使用，请重新开始授权",
                "invalid_client" | "unauthorized_client" => {
                    "Google 拒绝了 OAuth 客户端配置，请检查服务端 Gemini 授权配置"
                }
                _ => match self {
                    Self::Token => "Google 令牌交换失败，请重新授权并检查服务端授权日志",
                    Self::Profile => "无法读取 Google 账号信息，请检查出站网络后重新授权",
                    Self::LoadProject => {
                        "无法读取 Gemini Code Assist 项目，请检查账号资格及出站网络"
                    }
                    Self::Onboard | Self::Poll => {
                        "Gemini Code Assist 项目初始化失败，请检查账号资格及服务端授权日志"
                    }
                    Self::DiscoverProject => {
                        "Google 未返回可用的 Gemini 项目，请检查 Code Assist 资格或配置 Google Cloud 项目"
                    }
                },
            }
        } else {
            match reason {
                "timeout" | "connect" => {
                    "Claude 授权无法连接上游，请检查账号的出站代理或服务器网络"
                }
                "invalid_grant" => "Claude 拒绝了授权码，请重新开始授权",
                _ => "Claude 授权请求失败，请检查服务端授权日志",
            }
        }
    }

    pub(super) fn failure(
        self,
        provider: &str,
        reason: &'static str,
        status: Option<u16>,
    ) -> ProviderAdminError {
        tracing::warn!(
            provider,
            stage = self.name(),
            reason,
            upstream_status = status,
            "Subscription OAuth request failed"
        );
        ProviderAdminError::new(ProviderAdminErrorKind::BadGateway)
            .with_public_message(self.message(provider, reason))
    }
}

fn error_code(value: &Value) -> &'static str {
    let error = value.get("error");
    match error
        .and_then(Value::as_str)
        .or_else(|| error?.get("status")?.as_str())
    {
        Some("invalid_grant") => "invalid_grant",
        Some("invalid_client") => "invalid_client",
        Some("unauthorized_client") => "unauthorized_client",
        Some("access_denied" | "PERMISSION_DENIED") => "permission_denied",
        Some("RESOURCE_EXHAUSTED") => "resource_exhausted",
        _ => "http_rejected",
    }
}

pub(super) async fn json(
    request: reqwest::RequestBuilder,
    provider: &str,
    stage: Stage,
) -> Result<Value, ProviderAdminError> {
    let response = request.send().await.map_err(|error| {
        let reason = if error.is_timeout() {
            "timeout"
        } else if error.is_connect() {
            "connect"
        } else {
            "transport"
        };
        stage.failure(provider, reason, None)
    })?;
    let status = response.status();
    let body = super::super::network::bounded_body(response, 2 * 1024 * 1024)
        .await
        .map_err(|_| stage.failure(provider, "response_body", Some(status.as_u16())))?;
    let parsed = serde_json::from_slice::<Value>(&body);
    if !status.is_success() {
        let reason = parsed.as_ref().map_or("http_rejected", error_code);
        return Err(stage.failure(provider, reason, Some(status.as_u16())));
    }
    parsed.map_err(|_| stage.failure(provider, "invalid_json", Some(status.as_u16())))
}

#[cfg(test)]
mod tests {
    use super::*;
    use wiremock::{Mock, MockServer, ResponseTemplate, matchers::method};

    #[tokio::test]
    async fn google_rejection_has_safe_specific_message() {
        let server = MockServer::start().await;
        Mock::given(method("POST"))
            .respond_with(ResponseTemplate::new(400).set_body_json(serde_json::json!({
                "error":"invalid_grant",
                "error_description":"secret-authorization-code-must-never-be-returned"
            })))
            .mount(&server)
            .await;
        let error = json(
            reqwest::Client::new().post(server.uri()),
            "gemini",
            Stage::Token,
        )
        .await
        .unwrap_err();
        assert!(error.public_message().unwrap().contains("授权码"));
        assert!(!format!("{error:?}").contains("secret-authorization"));
        assert!(error.message().is_none());
    }

    #[tokio::test]
    async fn response_parse_failure_identifies_project_step() {
        let server = MockServer::start().await;
        Mock::given(method("GET"))
            .respond_with(ResponseTemplate::new(200).set_body_string("invalid JSON"))
            .mount(&server)
            .await;
        let error = json(
            reqwest::Client::new().get(server.uri()),
            "gemini",
            Stage::LoadProject,
        )
        .await
        .unwrap_err();
        assert!(error.public_message().unwrap().contains("Code Assist"));
    }

    #[test]
    fn diagnostics_discard_unknown_upstream_text() {
        assert_eq!(
            error_code(&serde_json::json!({"error":"arbitrary-secret"})),
            "http_rejected"
        );
        let error = Stage::Token.failure("gemini", "timeout", None);
        assert!(error.public_message().unwrap().contains("出站代理"));
    }
}
