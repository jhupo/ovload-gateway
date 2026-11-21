// Modified for Ovload on 2026-10-27: workspace integration.

//! 插件资源归属由宿主调用上下文给出，不能由插件参数选择实例或代次

use super::Revision;

#[derive(Debug, Clone)]
pub struct PluginResourceOwner {
    pub instance_id: String,
    pub artifact_sha256: String,
    pub revision: Revision,
}

#[derive(Debug, Clone, PartialEq, Eq)]
pub struct ManagedResource {
    pub id: String,
    pub name: String,
    pub enabled: bool,
}

pub struct ResourceMutation<T> {
    /// 没有事实变化时不递增配置 revision，也不触发发布
    pub revision: Option<Revision>,
    pub value: T,
}

pub struct GroupMembersChange {
    pub resource_key: String,
    pub add: Vec<String>,
    pub remove: Vec<String>,
}

#[derive(Debug, Clone, PartialEq, Eq)]
pub struct GroupMembersChanged {
    pub added: u64,
    pub removed: u64,
}
