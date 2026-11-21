//! 实例自有资源：稳定 resource_key 用于重试，名称只在首次创建时使用

use serde::{Deserialize, Serialize};

pub const GROUP_ENSURE: &str = "host.groups.ensure";
pub const GROUP_MEMBERS: &str = "host.groups.change_members";

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(deny_unknown_fields)]
pub struct GroupEnsureRequest {
    pub resource_key: String,
    pub name: String,
    pub color: String,
    #[serde(default)]
    pub description: Option<String>,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(deny_unknown_fields)]
pub struct GroupMembersChange {
    pub resource_key: String,
    #[serde(default)]
    pub add: Vec<String>,
    #[serde(default)]
    pub remove: Vec<String>,
}

/// Non-secret identity of an instance-owned group.
#[derive(Debug, Clone, PartialEq, Eq, Serialize, Deserialize)]
#[serde(deny_unknown_fields)]
pub struct ManagedResource {
    pub id: String,
    pub name: String,
    pub enabled: bool,
}

#[derive(Debug, Clone, PartialEq, Eq, Serialize, Deserialize)]
#[serde(deny_unknown_fields)]
pub struct GroupMembersChanged {
    pub added: u64,
    pub removed: u64,
}
