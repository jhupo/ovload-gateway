//! Stable identity responses, safe errors and credential delivery.

use axum::{
    Json,
    extract::Request,
    http::{Extensions, HeaderValue, StatusCode, header},
    middleware::Next,
    response::{IntoResponse, Response},
};
use ovload_admin::{
    IdentityService,
    model::{
        identity::{CustomerUserRecord, IdentityStatus},
        identity_access::{
            CustomerDirectoryRecord, IdentityAudience, IdentityError, IdentityOwner,
            IdentitySession, IdentitySessionGrant,
        },
    },
};
use secrecy::ExposeSecret as _;
use serde::Serialize;
use tower_http::request_id::RequestId;

use super::extract::{IdentityRequest, cookie_name};

pub(crate) struct IdentityHttpError {
    error: IdentityError,
    request_id: String,
    step_up: bool,
}

impl IdentityHttpError {
    pub(crate) fn kind(&self) -> &IdentityError {
        &self.error
    }

    pub fn step_up(request_id: String) -> Self {
        Self {
            error: IdentityError::Forbidden,
            request_id,
            step_up: true,
        }
    }
    pub fn new(error: IdentityError, request_id: String) -> Self {
        Self {
            error,
            request_id,
            step_up: false,
        }
    }
}

impl IntoResponse for IdentityHttpError {
    fn into_response(self) -> Response {
        if self.step_up {
            return error_response(
                StatusCode::FORBIDDEN,
                "identity.step_up_required",
                "Security verification is required",
                self.request_id,
            );
        }
        let (status, code) = match self.error {
            IdentityError::Unauthorized => (StatusCode::UNAUTHORIZED, "identity.unauthorized"),
            IdentityError::Forbidden => (StatusCode::FORBIDDEN, "identity.forbidden"),
            IdentityError::Invalid => (StatusCode::BAD_REQUEST, "identity.invalid_input"),
            IdentityError::NotFound => (StatusCode::NOT_FOUND, "identity.not_found"),
            IdentityError::Conflict => (StatusCode::CONFLICT, "identity.conflict"),
            IdentityError::RateLimited => (StatusCode::TOO_MANY_REQUESTS, "identity.rate_limited"),
            IdentityError::Unavailable => (StatusCode::SERVICE_UNAVAILABLE, "identity.unavailable"),
        };
        let mut response = error_response(status, code, &self.error.to_string(), self.request_id);
        if status == StatusCode::TOO_MANY_REQUESTS {
            response
                .headers_mut()
                .insert(header::RETRY_AFTER, HeaderValue::from_static("60"));
        }
        response
    }
}

fn error_response(status: StatusCode, code: &str, message: &str, request_id: String) -> Response {
    (
        status,
        Json(serde_json::json!({
            "error": { "code": code, "message": message },
            "request_id": request_id,
        })),
    )
        .into_response()
}

pub(super) fn request_id(extensions: &Extensions) -> String {
    extensions
        .get::<RequestId>()
        .and_then(|value| value.header_value().to_str().ok())
        .map(ToOwned::to_owned)
        .unwrap_or_else(|| uuid::Uuid::now_v7().to_string())
}

pub(super) async fn protect_response(request: Request, next: Next) -> Response {
    let id = request_id(request.extensions());
    let mut response =
        match tokio::time::timeout(std::time::Duration::from_secs(15), next.run(request)).await {
            Ok(response) => response,
            Err(_) => error_response(
                StatusCode::SERVICE_UNAVAILABLE,
                "identity.unavailable",
                "identity workflow deadline exceeded",
                id.clone(),
            ),
        };
    if (response.status().is_client_error() || response.status().is_server_error())
        && response
            .headers()
            .get(header::CONTENT_TYPE)
            .is_none_or(|value| !value.as_bytes().starts_with(b"application/json"))
    {
        let allow = response.headers().get(header::ALLOW).cloned();
        let (code, message) = match response.status() {
            StatusCode::METHOD_NOT_ALLOWED => ("identity.method_not_allowed", "method not allowed"),
            StatusCode::PAYLOAD_TOO_LARGE => ("identity.body_too_large", "request body too large"),
            StatusCode::NOT_FOUND => ("identity.not_found", "identity route not found"),
            status if status.is_client_error() => {
                ("identity.invalid_input", "invalid identity input")
            }
            _ => ("identity.unavailable", "identity service unavailable"),
        };
        response = error_response(response.status(), code, message, id);
        if let Some(allow) = allow {
            response.headers_mut().insert(header::ALLOW, allow);
        }
    }
    response
        .headers_mut()
        .insert(header::CACHE_CONTROL, HeaderValue::from_static("no-store"));
    response.headers_mut().insert(
        header::X_CONTENT_TYPE_OPTIONS,
        HeaderValue::from_static("nosniff"),
    );
    response
}

pub(super) async fn not_found(request: Request) -> Response {
    error_response(
        StatusCode::NOT_FOUND,
        "identity.not_found",
        "identity route not found",
        request_id(request.extensions()),
    )
}

pub(super) async fn method_not_allowed() -> StatusCode {
    StatusCode::METHOD_NOT_ALLOWED
}

#[derive(Serialize)]
pub(super) struct SessionView {
    id: String,
    audience: &'static str,
    tenant_id: Option<String>,
    user_id: Option<String>,
    principal_id: Option<String>,
    expires_at: String,
    csrf_token: String,
}

impl SessionView {
    pub fn new(session: &IdentitySession, csrf_token: String) -> Self {
        let (audience, tenant_id, user_id, principal_id) = match session.owner {
            IdentityOwner::Customer { tenant_id, user_id } => (
                "customer",
                Some(tenant_id.to_string()),
                Some(user_id.to_string()),
                None,
            ),
            IdentityOwner::Management(id) => ("management", None, None, Some(id.to_string())),
        };
        Self {
            id: session.id.to_string(),
            audience,
            tenant_id,
            user_id,
            principal_id,
            expires_at: session.expires_at.to_rfc3339(),
            csrf_token,
        }
    }
}

pub(super) fn session_response(
    request: &IdentityRequest,
    session: &IdentitySession,
) -> Result<Response, IdentityHttpError> {
    let csrf =
        IdentityService::csrf_token(request.access()?).map_err(|error| request.error(error))?;
    Ok(Json(SessionView::new(session, csrf)).into_response())
}

pub(super) fn grant_response(
    request: &IdentityRequest,
    grant: &IdentitySessionGrant,
) -> Result<Response, IdentityHttpError> {
    let mut response = Json(SessionView::new(
        &grant.session,
        grant.csrf_token.expose_secret().to_owned(),
    ))
    .into_response();
    let age = (grant.session.expires_at - chrono::Utc::now())
        .num_seconds()
        .max(0);
    append_cookie(
        &mut response,
        cookie_name(match grant.session.owner {
            IdentityOwner::Customer { .. } => IdentityAudience::Customer,
            IdentityOwner::Management(_) => IdentityAudience::Management,
        }),
        grant.access_token.expose_secret(),
        age,
    )
    .map_err(|error| request.error(error))?;
    let other = match grant.session.owner {
        IdentityOwner::Customer { .. } => IdentityAudience::Management,
        IdentityOwner::Management(_) => IdentityAudience::Customer,
    };
    append_cookie(&mut response, cookie_name(other), "", 0)
        .map_err(|error| request.error(error))?;
    Ok(response)
}

pub(super) fn logout_response(request: &IdentityRequest) -> Result<Response, IdentityHttpError> {
    let mut response = StatusCode::NO_CONTENT.into_response();
    for audience in [IdentityAudience::Customer, IdentityAudience::Management] {
        append_cookie(&mut response, cookie_name(audience), "", 0)
            .map_err(|error| request.error(error))?;
    }
    Ok(response)
}

fn append_cookie(
    response: &mut Response,
    name: &str,
    value: &str,
    age: i64,
) -> Result<(), IdentityError> {
    let cookie =
        format!("{name}={value}; Path=/; Secure; HttpOnly; SameSite=Strict; Max-Age={age}");
    response.headers_mut().append(
        header::SET_COOKIE,
        HeaderValue::from_str(&cookie).map_err(|_| IdentityError::Unavailable)?,
    );
    Ok(())
}

#[derive(Serialize)]
pub(super) struct CustomerView {
    id: String,
    tenant_id: String,
    email: String,
    display_name: String,
    status: &'static str,
    revision: u64,
    created_at: chrono::DateTime<chrono::Utc>,
    updated_at: chrono::DateTime<chrono::Utc>,
}

#[derive(Serialize)]
pub(super) struct CustomerDirectoryView {
    #[serde(flatten)]
    customer: CustomerView,
    role: &'static str,
    max_concurrency: u32,
    requests_per_minute: u32,
    notes: String,
    balance_usd: Option<String>,
    last_active_at: Option<chrono::DateTime<chrono::Utc>>,
    last_called_at: Option<chrono::DateTime<chrono::Utc>>,
}

impl From<CustomerDirectoryRecord> for CustomerDirectoryView {
    fn from(value: CustomerDirectoryRecord) -> Self {
        Self {
            customer: value.customer.into(),
            role: "user",
            max_concurrency: value.max_concurrency,
            requests_per_minute: value.requests_per_minute,
            notes: value.notes,
            balance_usd: value.balance_usd,
            last_active_at: value.last_active_at,
            last_called_at: value.last_called_at,
        }
    }
}

impl From<CustomerUserRecord> for CustomerView {
    fn from(customer: CustomerUserRecord) -> Self {
        Self {
            id: customer.id.to_string(),
            tenant_id: customer.tenant_id.to_string(),
            email: customer.email,
            display_name: customer.display_name,
            status: match customer.status {
                IdentityStatus::Active => "active",
                IdentityStatus::Suspended => "suspended",
                IdentityStatus::Revoked => "revoked",
            },
            revision: customer.revision,
            created_at: customer.created_at,
            updated_at: customer.updated_at,
        }
    }
}

pub(super) fn customer_response(status: StatusCode, customer: CustomerUserRecord) -> Response {
    let etag = format!("\"{}\"", customer.revision);
    let mut response = (status, Json(CustomerView::from(customer))).into_response();
    if let Ok(etag) = HeaderValue::from_str(&etag) {
        response.headers_mut().insert(header::ETAG, etag);
    }
    response
}
