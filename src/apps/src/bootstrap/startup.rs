// Modified for Ovload on 2026-10-27: workspace integration.

//! 启动模式共享的基础设施与 Provider 组装，不启动 HTTP 或 Worker

use std::{path::PathBuf, sync::Arc};

use ovload_admin::ports::provider::ProviderAdminRegistry;
use ovload_core::{engine::provider::ProviderRegistry, time::DeploymentTimeZone};
use ovload_host::{ConfigError, HostBundle, HostConfig, outbound::HttpClient};
use ovload_store::{StoreBundle, StoreConfig};

use super::BootstrapError;

pub(super) enum Mode {
    Server,
    Command,
    Help,
}

pub(super) struct Environment {
    pub(super) host: HostBundle,
    pub(super) store: StoreBundle,
    pub(super) timezone: DeploymentTimeZone,
    pub(super) plugin_cache: PathBuf,
    pub(super) version: String,
    pub(super) plugin_http: Arc<HttpClient>,
}

impl Environment {
    pub(super) async fn initialize(
        host: HostConfig,
        store: StoreConfig,
        mode: Mode,
    ) -> Result<Self, BootstrapError> {
        Self::initialize_runtime(host, store, mode, None).await
    }

    pub(super) async fn initialize_server(
        host: HostConfig,
        store: StoreConfig,
        logging: Arc<ovload_host::ProcessLogging>,
    ) -> Result<Self, BootstrapError> {
        Self::initialize_runtime(host, store, Mode::Server, Some(logging)).await
    }

    async fn initialize_runtime(
        host: HostConfig,
        store: StoreConfig,
        mode: Mode,
        logging: Option<Arc<ovload_host::ProcessLogging>>,
    ) -> Result<Self, BootstrapError> {
        let timezone = host.timezone;
        let store = store.with_timezone(timezone);
        let plugin_cache = host.runtime_data_dir().join("plugins");
        let host = match mode {
            Mode::Server => match logging {
                Some(logging) => ovload_host::initialize_with_logging(host, logging).await?,
                None => ovload_host::initialize(host).await?,
            },
            Mode::Command | Mode::Help => ovload_host::initialize_command_line(host).await?,
        };
        host.report_startup_ready("Host");
        let store = match mode {
            Mode::Server => ovload_store::initialize(store).await?,
            Mode::Command => ovload_store::initialize_command_line(store).await?,
            Mode::Help => ovload_store::initialize_read_only(store).await?,
        };
        host.report_startup_ready("Store");
        let version = host
            .system_operations()
            .version()
            .await
            .map_err(|_| ConfigError::InvalidField("host.version"))?
            .version;
        let plugin_http = Arc::new(HttpClient::new()?);
        Ok(Self {
            host,
            store,
            timezone,
            plugin_cache,
            version,
            plugin_http,
        })
    }
}

pub(super) struct Providers {
    pub(super) openai: provider_openai::ProviderBundle,
    pub(super) xai: provider_xai::ProviderBundle,
    pub(super) core: ProviderRegistry,
    pub(super) admin: ProviderAdminRegistry,
}

impl Providers {
    pub(super) async fn initialize(
        config: provider_openai::OpenAiConfig,
        environment: &Environment,
    ) -> Result<Self, BootstrapError> {
        let ports = environment.store.provider_ports();
        let openai = provider_openai::initialize_with_proxy_probe(
            config.with_timezone(environment.timezone),
            ports.clone(),
            Some(environment.host.cached_location_probe(
                provider_openai::build_reqwest_client_with_custom_ca,
            )),
        )
        .await?;
        environment.host.report_startup_ready("OpenAI Provider");
        let xai = provider_xai::initialize(ports.clone()).await?;
        environment.host.report_startup_ready("xAI Provider");
        let openai_api = provider_http::initialize_http_provider("openai_api", ports.clone())?;
        let claude = provider_http::initialize_http_provider("claude", ports.clone())?;
        let gemini = provider_http::initialize_http_provider("gemini", ports.clone())?;
        let xai_api = provider_http::initialize_http_provider("xai_api", ports)?;
        environment
            .host
            .report_startup_ready("Standard API Provider");
        let core = ProviderRegistry::new([
            openai.core_provider(),
            xai.core_provider(),
            openai_api.core_provider(),
            claude.core_provider(),
            gemini.core_provider(),
            xai_api.core_provider(),
        ])?;
        let admin = ProviderAdminRegistry::new([
            openai.admin_provider(),
            xai.admin_provider(),
            openai_api.admin_provider(),
            claude.admin_provider(),
            gemini.admin_provider(),
            xai_api.admin_provider(),
        ])
        .map_err(|_| ovload_admin::model::AdminError::invalid("Provider 管理身份冲突"))?;
        Ok(Self {
            openai,
            xai,
            core,
            admin,
        })
    }
}
