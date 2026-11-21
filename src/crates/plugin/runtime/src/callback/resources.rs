// Modified for Ovload on 2026-10-27: workspace integration.

//! 将插件自有资源回调绑定到宿主管理端口与实例身份

use super::{
    admin::{encode, map_admin_error, mutation_context},
    denied, invalid,
};
use crate::RpcReply;
use ovload_admin::{
    model::{
        AdminError,
        account_groups::{AccountGroupColor, CreateAccountGroup},
        plugin_resources::{GroupMembersChange, PluginResourceOwner},
        plugins::instances::PluginInstance,
    },
    ports::plugin_resources::PluginResourceAccess,
};
use ovload_plugin_sdk::{CallContext, PluginFault, call::resources};
use std::sync::{Arc, OnceLock, Weak};

pub(crate) struct PluginResourcePorts(OnceLock<Weak<dyn PluginResourceAccess>>);
impl PluginResourcePorts {
    pub(crate) const fn new() -> Self {
        Self(OnceLock::new())
    }
    pub(crate) fn bind(&self, port: &Arc<dyn PluginResourceAccess>) -> Result<(), AdminError> {
        self.0
            .set(Arc::downgrade(port))
            .map_err(|_| AdminError::conflict("插件资源端口已经绑定"))
    }
}

pub(super) struct PluginResources {
    owner: PluginResourceOwner,
    ports: Arc<PluginResourcePorts>,
}

impl PluginResources {
    pub(super) fn new(instance: &PluginInstance, ports: Arc<PluginResourcePorts>) -> Self {
        Self {
            owner: PluginResourceOwner {
                instance_id: instance.id.clone(),
                artifact_sha256: instance.artifact_sha256.clone(),
                revision: instance.revision,
            },
            ports,
        }
    }

    pub(super) async fn call(
        &self,
        context: &CallContext,
        method: &str,
        params: serde_json::Value,
        payload: &[u8],
    ) -> Result<RpcReply, PluginFault> {
        if params != serde_json::json!({}) {
            return Err(invalid());
        }
        let access = self
            .ports
            .0
            .get()
            .and_then(Weak::upgrade)
            .ok_or_else(denied)?;
        let mutation = mutation_context(context);
        match method {
            resources::GROUP_ENSURE => {
                let request: resources::GroupEnsureRequest =
                    serde_json::from_slice(payload).map_err(|_| invalid())?;
                let value = access
                    .ensure_group(
                        &self.owner,
                        request.resource_key,
                        CreateAccountGroup {
                            policy: Default::default(),
                            allow_image_generation: true,
                            fast_mode: ovload_core::account::FastMode::Default,
                            name: request.name,
                            description: request.description,
                            color: AccountGroupColor::parse(&request.color).ok_or_else(invalid)?,
                        },
                        &mutation,
                    )
                    .await
                    .map_err(map_admin_error)?;
                encode(&resources::ManagedResource {
                    id: value.id,
                    name: value.name,
                    enabled: value.enabled,
                })
            }
            resources::GROUP_MEMBERS => {
                let request: resources::GroupMembersChange =
                    serde_json::from_slice(payload).map_err(|_| invalid())?;
                let value = access
                    .change_members(
                        &self.owner,
                        GroupMembersChange {
                            resource_key: request.resource_key,
                            add: request.add,
                            remove: request.remove,
                        },
                        &mutation,
                    )
                    .await
                    .map_err(map_admin_error)?;
                encode(&resources::GroupMembersChanged {
                    added: value.added,
                    removed: value.removed,
                })
            }
            _ => Err(invalid()),
        }
    }
}
