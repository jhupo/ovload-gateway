//! Explicit asynchronous mode retains the existing execution and billing path.

use axum::{
    Json,
    body::{Bytes, to_bytes},
    extract::{Path, State},
    http::{HeaderMap, StatusCode},
    response::{IntoResponse, Response},
};
use ovload_admin::model::{AdminError, AdminErrorKind};
use ovload_core::engine::execution::{AuthenticatedClient, ClientTransport};
use ovload_core::operation::{ImageRequestKind, OperationKind};
use serde_json::json;
use std::{net::IpAddr, time::Duration};

use crate::{
    ApiState,
    auth::SessionState as _,
    middleware::headers::encode_headers,
    openai::{
        auth::{client_access_error_response, verify_client},
        endpoint::provider_endpoint_response,
        middleware::RequestInput,
    },
};

pub(super) fn requested(headers: &HeaderMap) -> bool {
    headers
        .get("prefer")
        .and_then(|value| value.to_str().ok())
        .is_some_and(|value| {
            value
                .split(',')
                .any(|item| item.trim().eq_ignore_ascii_case("respond-async"))
        })
}

pub(crate) async fn limit_body(
    request: axum::extract::Request,
    next: axum::middleware::Next,
) -> Response {
    if !requested(request.headers()) {
        return next.run(request).await;
    }
    let (parts, body) = request.into_parts();
    match to_bytes(body, 32 * 1024 * 1024).await {
        Ok(body) => {
            next.run(axum::extract::Request::from_parts(
                parts,
                axum::body::Body::from(body),
            ))
            .await
        }
        Err(_) => error_response(
            StatusCode::PAYLOAD_TOO_LARGE,
            "异步生图请求超过 32 MiB 或传输中断",
        ),
    }
}

pub(super) async fn start(
    state: ApiState,
    client: AuthenticatedClient,
    mut headers: HeaderMap,
    body: Bytes,
    kind: ImageRequestKind,
    endpoint: &'static str,
    client_ip: Option<IpAddr>,
    user_agent: Option<String>,
) -> Response {
    if body.len() > 32 * 1024 * 1024 {
        return error_response(StatusCode::PAYLOAD_TOO_LARGE, "异步生图请求超过 32 MiB");
    }
    let body = if kind == ImageRequestKind::Edit {
        match super::request::normalize_edit_body(body, &mut headers).await {
            Ok(value) => value,
            Err(_) => return error_response(StatusCode::BAD_REQUEST, "图片编辑请求无效"),
        }
    } else {
        body
    };
    let mut value: serde_json::Value = match serde_json::from_slice(&body) {
        Ok(serde_json::Value::Object(value)) => value.into(),
        _ => return error_response(StatusCode::BAD_REQUEST, "请求必须是 JSON 对象"),
    };
    // Stored results use bounded binary uploads; no server-side fetching of arbitrary URLs.
    value["response_format"] = json!("b64_json");
    headers.insert(
        "content-type",
        axum::http::HeaderValue::from_static("application/json"),
    );
    let guard = match state.openai().try_register_connection() {
        Ok(guard) => guard,
        Err(_) => return error_response(StatusCode::SERVICE_UNAVAILABLE, "服务正在停止"),
    };
    let store = state.admin_services().backup_extensions();
    let job = match store
        .create_image_job(client.policy().key_id().as_str())
        .await
    {
        Ok(job) => job,
        Err(error) => return admin_error(error),
    };
    let id = job.id.clone();
    tokio::spawn(async move {
        let _guard = guard;
        let cancellation = state.openai().lifecycle().cancellation();
        let execution = async {
            let response = provider_endpoint_response(
                state.openai().clone(),
                client,
                RequestInput {
                    endpoint: endpoint.to_owned(),
                    protocol: "openai".to_owned(),
                    operation: Some(OperationKind::GenerateImage),
                    transport: ClientTransport::HttpJson,
                    model_hint: None,
                    headers: encode_headers(&headers),
                    body: Bytes::from(
                        serde_json::to_vec(&value).map_err(|_| "请求编码失败".to_owned())?,
                    ),
                },
                client_ip,
                user_agent,
                move |body, headers| super::http::image_operation(body, headers, kind),
            )
            .await;
            if !response.status().is_success() {
                return Err(format!(
                    "上游生图请求失败（HTTP {}）",
                    response.status().as_u16()
                ));
            }
            let body = to_bytes(response.into_body(), 90 * 1024 * 1024)
                .await
                .map_err(|_| "上游生图响应超限或连接中断".to_owned())?;
            serde_json::from_slice(&body).map_err(|_| "上游生图响应格式无效".to_owned())
        };
        let result = tokio::select! {
            biased;
            _ = cancellation.cancelled() => Err("服务正在停止，生图任务已中止".to_owned()),
            result = tokio::time::timeout(Duration::from_secs(15*60), execution) => result.unwrap_or_else(|_| Err("生图任务执行超时".to_owned())),
        };
        let finish = tokio::select! {
            biased;
            _ = cancellation.cancelled() => store.finish_image_job(&id, Err("服务正在停止，生图任务已中止".to_owned())).await,
            result = tokio::time::timeout(Duration::from_secs(5*60), store.finish_image_job(&id, result)) => match result {
                Ok(result) => result,
                Err(_) => store.finish_image_job(&id, Err("图片存储操作超时".to_owned())).await,
            },
        };
        if finish.is_err() {
            tracing::warn!(image_job_id=%id, "Failed to persist generated image result");
        }
    });
    (
        StatusCode::ACCEPTED,
        [
            ("location", format!("/v1/images/jobs/{}", job.id)),
            ("preference-applied", "respond-async".to_owned()),
        ],
        Json(job),
    )
        .into_response()
}

pub(crate) async fn get(
    State(state): State<ApiState>,
    Path(id): Path<String>,
    headers: HeaderMap,
) -> Response {
    let client = match verify_client(state.openai(), &headers).await {
        Ok(client) => client,
        Err(error) => return client_access_error_response(error),
    };
    match state
        .admin_services()
        .backup_extensions()
        .image_job(client.policy().key_id().as_str(), &id)
        .await
    {
        Ok(job) => ([("cache-control", "no-store")], Json(job)).into_response(),
        Err(error) => admin_error(error),
    }
}

fn admin_error(error: AdminError) -> Response {
    let status = match error.kind() {
        AdminErrorKind::Invalid => StatusCode::BAD_REQUEST,
        AdminErrorKind::NotFound => StatusCode::NOT_FOUND,
        AdminErrorKind::Conflict => StatusCode::CONFLICT,
        AdminErrorKind::RateLimited => StatusCode::TOO_MANY_REQUESTS,
        _ => StatusCode::BAD_GATEWAY,
    };
    error_response(status, &error.to_string())
}

fn error_response(status: StatusCode, message: &str) -> Response {
    (
        status,
        [("cache-control", "no-store")],
        Json(json!({"error":{"message":message,"type":"image_job_error"}})),
    )
        .into_response()
}
