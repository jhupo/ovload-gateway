//! Customer and management browser APIs with independent, durable identities.

use axum::{
    Extension, Router,
    extract::DefaultBodyLimit,
    middleware,
    routing::{any, delete, get, post},
};
use ovload_admin::model::identity_access::IdentityAudience;

use crate::auth::SessionState;

mod application_settings;
mod billing;
mod billing_operations;
mod customer_oauth;
mod customer_usage;
mod engagement;
pub(crate) mod extract;
mod handlers;
mod keys;
mod lifecycle;
mod management_security;
mod monitoring;
mod profile_avatar;
mod retail_pricing;
mod security;
mod site_settings;
mod wire;
mod workspace_settings;

#[derive(Clone)]
pub(crate) struct IdentityPolicy {
    pub(crate) audience: IdentityAudience,
    pub(crate) public_origin: String,
}

pub(crate) fn router<S>(public_origin: String) -> Router<S>
where
    S: SessionState + Clone + Send + Sync + 'static,
{
    Router::new()
        .merge(application_settings::callback_router::<S>())
        .nest(
            "/api/v1",
            audience_router(IdentityAudience::Customer, public_origin.clone()),
        )
        .nest(
            "/api/admin/v1",
            audience_router(IdentityAudience::Management, public_origin),
        )
        .route("/api/v1/", any(wire::not_found))
        .route("/api/admin/v1/", any(wire::not_found))
        .layer(middleware::from_fn(wire::protect_response))
}

fn audience_router<S>(audience: IdentityAudience, public_origin: String) -> Router<S>
where
    S: SessionState + Clone + Send + Sync + 'static,
{
    let mut router = Router::new()
        .merge(lifecycle::router::<S>(audience))
        .merge(security::router::<S>(audience))
        .merge(customer_oauth::router::<S>(audience))
        .merge(profile_avatar::router::<S>())
        .merge(site_settings::router::<S>(audience))
        .merge(workspace_settings::router::<S>(audience))
        .merge(application_settings::router::<S>(audience))
        .merge(engagement::router::<S>())
        .merge(customer_usage::router::<S>(audience))
        .route("/auth/sessions", post(handlers::login::<S>))
        .route("/auth/session", delete(handlers::logout::<S>))
        .route("/session", get(handlers::session::<S>))
        .route("/api-keys", get(keys::list::<S>).post(keys::create::<S>))
        .route(
            "/api-keys/{id}",
            get(keys::get::<S>).patch(keys::update::<S>),
        )
        .route("/api-keys/{id}/rotate", post(keys::rotate::<S>))
        .route("/api-keys/{id}/revoke", post(keys::revoke::<S>))
        .route("/api-key-groups", get(keys::groups::<S>));
    router = match audience {
        IdentityAudience::Customer => router
            .route("/pricing/effective", get(retail_pricing::effective::<S>))
            .route(
                "/billing/operations",
                get(billing_operations::customer_list::<S>),
            )
            .route(
                "/billing/operations/{id}",
                get(billing_operations::customer_get::<S>),
            )
            .route("/billing/balance", get(billing::customer_balance::<S>)),
        IdentityAudience::Management => router
            .merge(management_security::router::<S>())
            .merge(monitoring::router::<S>())
            .nest("/pricing", retail_pricing::router::<S>())
            .route(
                "/users",
                get(handlers::customers::<S>).post(handlers::provision_customer::<S>),
            )
            .route("/users/{id}", get(handlers::customer::<S>))
            .route("/users/{id}/suspend", post(handlers::suspend::<S>))
            .route("/users/{id}/activate", post(handlers::activate::<S>))
            .route("/users/{id}/group-grants", post(keys::grant_group::<S>))
            .route(
                "/users/{id}/group-grants/{group}",
                delete(keys::ungrant_group::<S>),
            )
            .route(
                "/billing/wallets/{tenant_id}",
                get(billing::management_wallet_balance::<S>),
            )
            .route(
                "/billing/wallets/{tenant_id}/credits",
                get(billing::management_wallet_credits::<S>).post(billing::credit_wallet::<S>),
            )
            .route(
                "/billing/wallets/{tenant_id}/operations",
                get(billing_operations::management_list::<S>),
            )
            .route(
                "/billing/wallets/{tenant_id}/operations/{id}",
                get(billing_operations::management_get::<S>),
            )
            .route("/api-key-assignments", get(keys::pending::<S>))
            .route("/api-key-assignments/{id}", post(keys::assign::<S>)),
    };
    router
        .route("/", any(wire::not_found))
        .route("/{*path}", any(wire::not_found))
        .method_not_allowed_fallback(wire::method_not_allowed)
        .layer(DefaultBodyLimit::max(32 * 1024))
        .layer(Extension(IdentityPolicy {
            audience,
            public_origin,
        }))
}
