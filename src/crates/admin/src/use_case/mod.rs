//! 管理控制面的用例实现

pub mod account_groups;
pub mod accounts;
pub mod auth;
pub mod backup;
pub mod billing;
pub mod billing_operations;
pub mod client_distribution;
pub mod client_keys;
pub mod commerce;
pub mod credentials;
pub mod customer_usage;
pub mod identity;
pub mod identity_lifecycle;
mod identity_security;
pub mod image_asset;
pub mod import_tasks;
pub mod key_usage;
pub mod management_security;
pub mod model_keys;
pub mod observability;
pub mod plugin_accounts;
pub mod plugin_client_keys;
pub mod plugin_resources;
pub(crate) mod plugin_update;
pub mod plugins;
pub mod profile_avatar;
pub mod proxies;
pub mod retail_pricing;
pub mod settings;
pub mod site_settings;
pub mod system;
pub mod usage_data;

mod credential_mutation;
mod error;
mod publication;

use credential_mutation::{
    commit_authorization, commit_credential_refresh, commit_credential_rotation,
    delete_credentials, import_proxy_binding, pending_authorization,
    publish_credentials_and_observe_quota, required_credential, required_plugin_credential,
    validate_authorization_commit, validate_prepared_import, validate_prepared_rotation,
    validate_prepared_rotation_facts,
};
use error::{map_provider_error, map_store_error};
use publication::publish_committed;
pub mod application_settings;
