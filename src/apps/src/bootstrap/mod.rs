// Modified for Ovload on 2026-10-27: workspace integration.

//! 网关唯一组合根：按启动模式连接各 Bundle

mod command;
mod config;
mod identity;
mod plugins;
mod server;
mod startup;

pub use command::{PluginCommand, plugin_command};
pub use config::GatewayConfig;
pub use identity::{bootstrap_identity_owner, provision_identity_operator};
pub use server::run;

/// 组合根只保留包级错误分类，不展开内部实现或敏感配置
#[derive(Debug, thiserror::Error)]
pub enum BootstrapError {
    #[error(transparent)]
    Identity(#[from] ovload_admin::model::identity_access::IdentityError),
    #[error(transparent)]
    Worker(#[from] ovload_core::task::WorkerDefinitionError),
    #[error(transparent)]
    PluginCommand(#[from] ovload_plugin_runtime::PluginCommandError),
    #[error(transparent)]
    Config(#[from] ovload_host::ConfigError),
    #[error(transparent)]
    Host(#[from] ovload_host::HostError),
    #[error(transparent)]
    Outbound(#[from] ovload_host::outbound::HttpError),
    #[error(transparent)]
    Store(#[from] ovload_store::StoreError),
    #[error(transparent)]
    CommandStoreDrain(#[from] ovload_store::CommandStoreDrainError),
    #[error(transparent)]
    OpenAi(#[from] provider_openai::OpenAiInitializeError),
    #[error(transparent)]
    HttpProvider(#[from] provider_http::HttpProviderInitializeError),
    #[error(transparent)]
    Xai(#[from] provider_xai::XaiInitializeError),
    #[error(transparent)]
    Registry(#[from] ovload_core::engine::provider::RegistryError),
    #[error(transparent)]
    Core(#[from] ovload_core::CoreError),
    #[error(transparent)]
    Admin(#[from] ovload_admin::model::AdminError),
    #[error(transparent)]
    Api(#[from] ovload_api::ApiError),
}
