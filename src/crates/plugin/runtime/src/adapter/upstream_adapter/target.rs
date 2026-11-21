// Modified for Ovload on 2026-10-27: workspace integration.

//! 保存插件上游基址与路径用途，解析受管请求目标

use std::collections::BTreeMap;

use ovload_admin::model::AdminError;
use ovload_plugin_sdk::{
    ErrorCode, PluginFault,
    call::upstream_adapter::{UpstreamAdapterDeclaration, UpstreamPathPurpose},
};
use url::Url;

pub(crate) struct UpstreamTarget {
    base: Url,
    paths: BTreeMap<(String, String), UpstreamPathPurpose>,
}

impl UpstreamTarget {
    pub(super) fn compile(declaration: &UpstreamAdapterDeclaration) -> Result<Self, AdminError> {
        let base = Url::parse(&declaration.base_url)
            .map_err(|_| AdminError::invalid("上游 Base URL 无效"))?;
        let mut paths = BTreeMap::new();
        for path in &declaration.paths {
            let target = base
                .join(&path.path)
                .map_err(|_| AdminError::invalid("Invalid upstream purpose path"))?;
            if !matches!(target.scheme(), "http" | "https") || target.host_str().is_none() {
                return Err(AdminError::invalid("Invalid upstream purpose path"));
            }
            let key = path_key(&target);
            if paths
                .insert(key, path.purpose)
                .is_some_and(|previous| previous != path.purpose)
            {
                return Err(AdminError::invalid("Conflicting upstream path purposes"));
            }
        }
        Ok(Self { base, paths })
    }

    pub(crate) fn purpose(&self, target: &Url) -> UpstreamPathPurpose {
        self.paths
            .get(&path_key(target))
            .copied()
            .unwrap_or(UpstreamPathPurpose::Inference)
    }

    pub(crate) fn resolve(
        &self,
        path: &str,
        query: &[(String, String)],
    ) -> Result<(Url, UpstreamPathPurpose), PluginFault> {
        let mut target = self.base.join(path).map_err(|_| invalid())?;
        if !matches!(target.scheme(), "http" | "https") || target.host_str().is_none() {
            return Err(invalid());
        }
        if !query.is_empty() {
            target
                .query_pairs_mut()
                .extend_pairs(query.iter().map(|(key, value)| (key, value)));
        }
        let purpose = self.purpose(&target);
        Ok((target, purpose))
    }
}

fn path_key(target: &Url) -> (String, String) {
    (
        target.origin().ascii_serialization(),
        target.path().to_owned(),
    )
}

fn invalid() -> PluginFault {
    PluginFault::new(ErrorCode::InvalidInput, "upstream target is invalid")
}
