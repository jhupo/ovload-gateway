//! Safe projection of Antigravity's Google RPC capacity and quota errors.

use super::super::network;
use ovload_core::{
    error::{OpaqueUpstreamValue, ProviderDiagnostic, ProviderError, ProviderErrorKind},
    upstream::UpstreamSendState,
};
use reqwest::{Response, StatusCode};
use serde_json::Value;
use std::time::Duration;

const ERROR_BODY_LIMIT: usize = 64 * 1024;
const MAX_RETRY_DELAY: Duration = Duration::from_secs(3_600);
const STAGE: &str = "antigravity_generation";
const MODEL_CAPACITY: &str = "MODEL_CAPACITY_EXHAUSTED";
const ERROR_INFO: &str = "type.googleapis.com/google.rpc.ErrorInfo";
const RETRY_INFO: &str = "type.googleapis.com/google.rpc.RetryInfo";

pub(in super::super) async fn classify(response: Response) -> ProviderError {
    let status = response.status();
    let retry_after = network::retry_after(response.headers());
    let document = network::bounded_body(response, ERROR_BODY_LIMIT)
        .await
        .ok()
        .and_then(|body| serde_json::from_slice::<Value>(&body).ok());
    classify_details(status, retry_after, document.as_ref())
}

pub(in super::super) fn is_model_capacity(error: &ProviderError) -> bool {
    error.kind() == ProviderErrorKind::UpstreamCapacityUnavailable
        && error.upstream_code().map(OpaqueUpstreamValue::as_str) == Some(MODEL_CAPACITY)
}

#[derive(PartialEq, Eq, PartialOrd, Ord)]
enum Reason {
    ModelCapacity,
    RateLimit,
    Quota,
}

fn classify_details(
    status: StatusCode,
    retry_after: Option<Duration>,
    document: Option<&Value>,
) -> ProviderError {
    let details = document
        .and_then(|value| value.pointer("/error/details"))
        .and_then(Value::as_array)
        .map(Vec::as_slice)
        .unwrap_or_default();
    let reason = details
        .iter()
        .filter(|detail| detail["@type"].as_str() == Some(ERROR_INFO))
        .filter_map(|detail| match detail["reason"].as_str()? {
            MODEL_CAPACITY => Some(Reason::ModelCapacity),
            "RATE_LIMIT_EXCEEDED" => Some(Reason::RateLimit),
            "QUOTA_EXHAUSTED" => Some(Reason::Quota),
            _ => None,
        })
        .max();
    let (kind, code, message) = match reason {
        Some(Reason::ModelCapacity) => (
            ProviderErrorKind::UpstreamCapacityUnavailable,
            MODEL_CAPACITY,
            "Antigravity model capacity is temporarily unavailable",
        ),
        Some(Reason::RateLimit) => (
            ProviderErrorKind::RateLimited,
            "RATE_LIMIT_EXCEEDED",
            "Antigravity rate limit exceeded",
        ),
        Some(Reason::Quota) => (
            ProviderErrorKind::QuotaExhausted,
            "QUOTA_EXHAUSTED",
            "Antigravity quota exhausted",
        ),
        None if status == StatusCode::TOO_MANY_REQUESTS => (
            ProviderErrorKind::RateLimited,
            "RESOURCE_EXHAUSTED",
            "Antigravity rejected the request with HTTP 429",
        ),
        None => (
            ProviderErrorKind::Unavailable,
            "UPSTREAM_UNAVAILABLE",
            "Antigravity service is temporarily unavailable",
        ),
    };
    let error = ProviderError::new(kind, UpstreamSendState::Sent)
        .with_status(status.as_u16())
        .with_upstream_code(OpaqueUpstreamValue::new(code))
        .with_diagnostic(ProviderDiagnostic::new(message).with_classification(STAGE, code));
    let retry_delay = details
        .iter()
        .filter(|detail| detail["@type"].as_str() == Some(RETRY_INFO))
        .filter_map(|detail| parse_retry_delay(detail["retryDelay"].as_str()?))
        .max();
    match retry_after.max(retry_delay) {
        Some(delay) => error.with_retry_after(delay),
        None => error,
    }
}

fn parse_retry_delay(delay: &str) -> Option<Duration> {
    let delay = delay.strip_suffix('s')?;
    let (seconds, nanos) = match delay.split_once('.') {
        Some((seconds, fraction)) => {
            if !(1..=9).contains(&fraction.len())
                || !fraction.bytes().all(|byte| byte.is_ascii_digit())
            {
                return None;
            }
            let nanos = fraction.parse::<u32>().ok()? * 10_u32.pow(9 - fraction.len() as u32);
            (seconds, nanos)
        }
        None => (delay, 0),
    };
    if seconds.is_empty() || !seconds.bytes().all(|byte| byte.is_ascii_digit()) {
        return None;
    }
    Some(Duration::new(seconds.parse().ok()?, nanos).min(MAX_RETRY_DELAY))
}

#[cfg(test)]
mod tests {
    use super::*;
    use serde_json::json;
    use wiremock::{Mock, MockServer, ResponseTemplate, matchers::method};

    #[tokio::test]
    async fn projects_model_capacity_and_retry_info_without_retaining_response_body() {
        let server = MockServer::start().await;
        Mock::given(method("POST"))
            .respond_with(ResponseTemplate::new(429).set_body_json(json!({
                "error": {
                    "message": "private upstream response marker",
                    "status": "RESOURCE_EXHAUSTED",
                    "details": [
                        { "@type": ERROR_INFO, "reason": MODEL_CAPACITY },
                        { "@type": RETRY_INFO, "retryDelay": "1.250s" }
                    ]
                }
            })))
            .mount(&server)
            .await;
        let error = classify(
            reqwest::Client::new()
                .post(server.uri())
                .send()
                .await
                .unwrap(),
        )
        .await;
        assert_eq!(error.upstream_status(), Some(429));
        assert!(is_model_capacity(&error));
        assert_eq!(error.retry_after(), Some(Duration::from_millis(1_250)));
        assert_eq!(error.diagnostic().unwrap().code(), Some(MODEL_CAPACITY));
        assert!(
            !error
                .diagnostic()
                .unwrap()
                .as_str()
                .contains("private upstream")
        );
        assert!(error.raw_upstream_error().is_none());
    }

    #[test]
    fn distinguishes_quota_rate_limit_and_unclassified_http_errors() {
        for (status, detail_reason, kind, code) in [
            (
                StatusCode::TOO_MANY_REQUESTS,
                "QUOTA_EXHAUSTED",
                ProviderErrorKind::QuotaExhausted,
                "QUOTA_EXHAUSTED",
            ),
            (
                StatusCode::TOO_MANY_REQUESTS,
                "RATE_LIMIT_EXCEEDED",
                ProviderErrorKind::RateLimited,
                "RATE_LIMIT_EXCEEDED",
            ),
            (
                StatusCode::TOO_MANY_REQUESTS,
                "unknown reason with private data",
                ProviderErrorKind::RateLimited,
                "RESOURCE_EXHAUSTED",
            ),
            (
                StatusCode::SERVICE_UNAVAILABLE,
                "unknown reason",
                ProviderErrorKind::Unavailable,
                "UPSTREAM_UNAVAILABLE",
            ),
        ] {
            let document = json!({"error":{"details":[
                {"@type": ERROR_INFO, "reason": detail_reason},
                {"@type": "unrelated", "reason": MODEL_CAPACITY},
                {"@type": RETRY_INFO, "retryDelay": "2s"}
            ]}});
            let error = classify_details(status, Some(Duration::from_secs(5)), Some(&document));
            assert_eq!(error.kind(), kind);
            assert_eq!(error.upstream_code().unwrap().as_str(), code);
            assert_eq!(error.retry_after(), Some(Duration::from_secs(5)));
            assert!(!is_model_capacity(&error));
        }
    }

    #[test]
    fn bounds_and_validates_protobuf_duration() {
        assert_eq!(parse_retry_delay("2.000000001s"), Some(Duration::new(2, 1)));
        assert_eq!(parse_retry_delay("7200s"), Some(MAX_RETRY_DELAY));
        for invalid in ["+1s", "-1s", "1.s", "1.0000000010s", "1e2s", "1ms"] {
            assert_eq!(parse_retry_delay(invalid), None, "{invalid}");
        }
    }
}
