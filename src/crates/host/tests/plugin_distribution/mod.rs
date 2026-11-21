// Modified for Ovload on 2026-10-27: workspace integration.

//! 插件分发测试入口，以及共用下载环境与摘要辅助

mod github;
mod http;
mod lifecycle;

use std::sync::Arc;

use ovload_admin::model::plugins::distribution::{
    DownloadPurpose, SourceAuthentication, SourceCredential, SourceCredentialInfo,
};
use ovload_host::plugin_distribution::HttpPluginDistribution;
use sha2::{Digest as _, Sha256};
use wiremock::MockServer;

fn transport(server: &MockServer) -> HttpPluginDistribution {
    HttpPluginDistribution::with_transport(
        &format!("{}/", server.uri()),
        Arc::new(ovload_host::outbound::HttpClient::new().unwrap()),
        ovload_host::outbound::NetworkPolicy::new(&["127.0.0.0/8".into(), "::1/128".into()])
            .unwrap(),
    )
    .unwrap()
}

fn digest(body: &[u8]) -> String {
    hex::encode(Sha256::digest(body))
}

fn credential(server: &MockServer, prefix: &str) -> SourceCredential {
    credential_with(
        server,
        prefix,
        SourceAuthentication::Bearer {
            token: "test-token".into(),
        },
    )
}

fn credential_with(
    server: &MockServer,
    prefix: &str,
    authentication: SourceAuthentication,
) -> SourceCredential {
    SourceCredential {
        info: SourceCredentialInfo {
            id: "test-credential".into(),
            name: "Test".into(),
            origin: server.uri(),
            path_prefix: prefix.into(),
            purposes: vec![DownloadPurpose::Metadata, DownloadPurpose::Artifact],
        },
        authentication,
    }
}
