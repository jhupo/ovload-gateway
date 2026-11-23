// Modified for Ovload on 2026-10-27: workspace integration.

//! 管理端权限校验与请求审计上下文

use axum::{
    extract::{FromRequestParts, MatchedPath},
    http::{Method, request::Parts},
};
use ovload_admin::model::auth::{AdminPrincipal, AdminRequestContext};
use ovload_admin::model::identity_access::{IdentityError, IdentityOwner};
use ovload_core::access::Permission;
use tower_http::request_id::RequestId;

use crate::{auth::SessionState, identity::extract::IdentityRequest};

use super::AdminError;

const REQUEST_ID_HEADER: &str = "x-request-id";

/// A live platform operator session authorized for this resource operation.
pub struct AdminAuth {
    context: AdminRequestContext,
}

impl AdminAuth {
    #[must_use]
    pub const fn context(&self) -> &AdminRequestContext {
        &self.context
    }
}

impl<S> FromRequestParts<S> for AdminAuth
where
    S: SessionState + Send + Sync,
{
    type Rejection = AdminError;

    async fn from_request_parts(parts: &mut Parts, state: &S) -> Result<Self, Self::Rejection> {
        if parts.extensions.get::<AdminRequestContext>().is_some() {
            return Err(AdminError::forbidden());
        }
        let path = parts
            .extensions
            .get::<MatchedPath>()
            .ok_or_else(AdminError::forbidden)?
            .as_str();
        let permission =
            required_permission(path, &parts.method).ok_or_else(AdminError::forbidden)?;
        let write = !matches!(parts.method, Method::GET | Method::HEAD | Method::OPTIONS);
        if let Some(header) = parts.headers.get(axum::http::header::AUTHORIZATION) {
            if parts.headers.contains_key(axum::http::header::COOKIE)
                || parts.headers.contains_key(axum::http::header::ORIGIN)
            {
                return Err(AdminError::forbidden());
            }
            let token = header
                .to_str()
                .ok()
                .and_then(|s| s.strip_prefix("Bearer "))
                .ok_or_else(AdminError::forbidden)?;
            let services = state.admin_services();
            let session = services
                .identity()
                .authenticate(
                    ovload_admin::model::identity_access::IdentityAudience::Management,
                    token,
                )
                .await
                .map_err(|e| map_identity_error(&e))?;
            services
                .management_security()
                .authorize_platform(&session, permission)
                .await
                .map_err(|e| map_identity_error(&e))?;
            let IdentityOwner::Management(id) = session.owner else {
                return Err(AdminError::forbidden());
            };
            return Ok(Self {
                context: AdminRequestContext {
                    principal: AdminPrincipal::Management {
                        principal_id: id.to_string(),
                    },
                    request_id: admin_request_id(parts).ok_or_else(AdminError::internal)?,
                },
            });
        }
        let request = IdentityRequest::from_request_parts(parts, state)
            .await
            .map_err(|error| map_identity_error(error.kind()))?;
        if write {
            request
                .require_csrf()
                .map_err(|_| AdminError::forbidden())?;
        }
        let services = state.admin_services();
        let session = request
            .authenticate(services.identity())
            .await
            .map_err(|error| {
                if error.requires_step_up() {
                    AdminError::step_up_required()
                } else {
                    map_identity_error(error.kind())
                }
            })?;
        services
            .management_security()
            .authorize_platform(&session, permission)
            .await
            .map_err(|error| map_identity_error(&error))?;
        let IdentityOwner::Management(principal_id) = session.owner else {
            return Err(AdminError::forbidden());
        };
        let principal = AdminPrincipal::Management {
            principal_id: principal_id.to_string(),
        };
        let request_id = admin_request_id(parts).ok_or_else(AdminError::internal)?;
        Ok(Self {
            context: AdminRequestContext {
                principal,
                request_id,
            },
        })
    }
}

/// request-id 层按配置的 header 名注入，同时写入与名字无关的扩展；
/// 优先读扩展，使自定义 header 名不会让管理请求失去请求上下文
/// header 回退覆盖未装配该层的调用方
fn admin_request_id(parts: &Parts) -> Option<String> {
    parts
        .extensions
        .get::<RequestId>()
        .map(RequestId::header_value)
        .or_else(|| parts.headers.get(REQUEST_ID_HEADER))
        .and_then(|value| value.to_str().ok())
        .map(str::trim)
        .filter(|value| !value.is_empty())
        .map(ToOwned::to_owned)
}

fn required_permission(path: &str, method: &Method) -> Option<Permission> {
    let resource = path.strip_prefix("/api/admin/")?.split('/').next()?;
    let read = matches!(*method, Method::GET | Method::HEAD);
    match resource {
        "accounts" | "account-groups" | "proxies" => Some(if read {
            Permission::ProviderAccountsRead
        } else {
            Permission::ProviderAccountsManage
        }),
        "dashboard" | "usage" | "operations" | "diagnostics" => Some(Permission::UsageRead),
        "plugins" => Some(Permission::PluginsManage),
        "settings" | "system" => Some(Permission::SecuritySettingsManage),
        _ => None,
    }
}

fn map_identity_error(error: &IdentityError) -> AdminError {
    match error {
        IdentityError::Unauthorized => AdminError::session_required(),
        IdentityError::Forbidden => AdminError::forbidden(),
        _ => AdminError::service_unavailable(),
    }
}
