//! Strict browser credential parsing; no fallback to model or deployment keys.

use axum::{
    extract::FromRequestParts,
    http::{HeaderMap, Method, header, request::Parts},
};
use headers::{Cookie, HeaderMapExt as _};
use ovload_admin::{
    IdentityService,
    model::identity_access::{IdentityAudience, IdentityError, IdentitySession},
};

use super::{IdentityPolicy, wire::IdentityHttpError};

pub(crate) struct IdentityRequest {
    pub audience: IdentityAudience,
    step_up_required: bool,
    human_token: Option<String>,
    hostname: String,
    pub request_id: String,
    pub access: Option<String>,
    pub login_tokens: [Option<String>; 2],
    csrf: Option<String>,
    revision: Option<String>,
    idempotency_key: Option<String>,
}

impl IdentityRequest {
    pub fn idempotency_key(&self) -> Result<String, IdentityHttpError> {
        self.idempotency_key
            .clone()
            .ok_or_else(|| self.error(IdentityError::Invalid))
    }

    pub fn error(&self, error: IdentityError) -> IdentityHttpError {
        IdentityHttpError::new(error, self.request_id.clone())
    }

    pub fn access(&self) -> Result<&str, IdentityHttpError> {
        self.access
            .as_deref()
            .ok_or_else(|| self.error(IdentityError::Unauthorized))
    }

    pub async fn authenticate(
        &self,
        service: &IdentityService,
    ) -> Result<IdentitySession, IdentityHttpError> {
        let session = service
            .authenticate(self.audience, self.access()?)
            .await
            .map_err(|error| self.error(error))?;
        if self.step_up_required
            && !service
                .step_up_allowed(&session)
                .await
                .map_err(|e| self.error(e))?
        {
            return Err(IdentityHttpError::step_up(self.request_id.clone()));
        }
        Ok(session)
    }

    pub async fn verify_human<S: crate::auth::SessionState>(
        &self,
        state: &S,
    ) -> Result<(), IdentityHttpError> {
        state
            .admin_services()
            .identity_lifecycle()
            .verify_human(self.human_token.clone(), &self.hostname)
            .await
            .map_err(|e| self.error(e))
    }

    pub fn require_csrf(&self) -> Result<(), IdentityHttpError> {
        IdentityService::verify_csrf(
            self.access()?,
            self.csrf
                .as_deref()
                .ok_or_else(|| self.error(IdentityError::Forbidden))?,
        )
        .map_err(|error| self.error(error))
    }

    pub fn if_match(&self) -> Result<&str, IdentityHttpError> {
        self.revision
            .as_deref()
            .ok_or_else(|| self.error(IdentityError::Invalid))
    }

    pub fn revision(&self) -> Result<u64, IdentityHttpError> {
        self.if_match()?
            .strip_prefix('"')
            .and_then(|raw| raw.strip_suffix('"'))
            .and_then(|raw| raw.parse::<u64>().ok())
            .filter(|revision| *revision > 0)
            .ok_or_else(|| self.error(IdentityError::Invalid))
    }
}

impl<S: Send + Sync> FromRequestParts<S> for IdentityRequest {
    type Rejection = IdentityHttpError;

    async fn from_request_parts(parts: &mut Parts, _: &S) -> Result<Self, Self::Rejection> {
        let request_id = super::wire::request_id(&parts.extensions);
        let fail = |error| IdentityHttpError::new(error, request_id.clone());
        let policy = parts
            .extensions
            .get::<IdentityPolicy>()
            .ok_or_else(|| fail(IdentityError::Unavailable))?;
        let headers = &parts.headers;
        if headers.get_all(header::COOKIE).iter().count() > 1 {
            return Err(fail(IdentityError::Invalid));
        }
        if headers.contains_key(header::AUTHORIZATION) || headers.contains_key("x-api-key") {
            return Err(fail(IdentityError::Unauthorized));
        }
        let origin = single_header(headers, header::ORIGIN.as_str()).map_err(fail)?;
        if !matches!(parts.method, Method::GET | Method::HEAD | Method::OPTIONS)
            && origin.as_deref() != Some(policy.public_origin.as_str())
        {
            return Err(fail(IdentityError::Forbidden));
        }
        let csrf = single_header(headers, "x-csrf-token").map_err(fail)?;
        let revision = single_header(headers, header::IF_MATCH.as_str()).map_err(fail)?;
        let idempotency_key = single_header(headers, "idempotency-key").map_err(fail)?;
        let access_name = cookie_name(policy.audience);
        let cookies = headers
            .typed_try_get::<Cookie>()
            .map_err(|_| fail(IdentityError::Invalid))?;
        let access = cookie_value(cookies.as_ref(), access_name).map_err(fail)?;
        let login_tokens = [
            cookie_value(cookies.as_ref(), cookie_name(IdentityAudience::Customer))
                .map_err(fail)?,
            cookie_value(cookies.as_ref(), cookie_name(IdentityAudience::Management))
                .map_err(fail)?,
        ];
        Ok(Self {
            audience: policy.audience,
            step_up_required: policy.audience == IdentityAudience::Management
                && !matches!(parts.method, Method::GET | Method::HEAD | Method::OPTIONS)
                && !parts.uri.path().ends_with("/auth/step-up")
                && !parts.uri.path().ends_with("/auth/session")
                && parts.uri.path() != "/api/admin/v1/session"
                && !parts.uri.path().ends_with("/auth/sessions"),
            human_token: single_header(headers, "x-turnstile-token").map_err(fail)?,
            hostname: url::Url::parse(&policy.public_origin)
                .ok()
                .and_then(|u| u.host_str().map(str::to_owned))
                .ok_or_else(|| fail(IdentityError::Unavailable))?,
            request_id,
            access,
            login_tokens,
            csrf,
            revision,
            idempotency_key,
        })
    }
}

fn single_header(headers: &HeaderMap, name: &str) -> Result<Option<String>, IdentityError> {
    let mut values = headers.get_all(name).iter();
    let Some(value) = values.next() else {
        return Ok(None);
    };
    if values.next().is_some() {
        return Err(IdentityError::Invalid);
    }
    let value = value.to_str().map_err(|_| IdentityError::Invalid)?;
    if value.is_empty() || value.len() > 2048 {
        return Err(IdentityError::Invalid);
    }
    Ok(Some(value.to_owned()))
}

fn cookie_value(cookies: Option<&Cookie>, name: &str) -> Result<Option<String>, IdentityError> {
    let Some(cookies) = cookies else {
        return Ok(None);
    };
    let mut matches = cookies.iter().filter(|(candidate, _)| *candidate == name);
    let Some((_, value)) = matches.next() else {
        return Ok(None);
    };
    if matches.next().is_some() || value.is_empty() || value.len() > 512 {
        return Err(IdentityError::Invalid);
    }
    Ok(Some(value.to_owned()))
}

pub(crate) const fn cookie_name(audience: IdentityAudience) -> &'static str {
    match audience {
        IdentityAudience::Customer => "__Host-ovload_customer",
        IdentityAudience::Management => "__Host-ovload_management",
    }
}
