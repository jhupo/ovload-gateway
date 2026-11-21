// Modified for Ovload on 2026-10-27: workspace integration.

//! Instance-owned groups and membership changes; model keys require customer authority.

use crate::{
    model::{
        AdminError, MutationContext,
        account_groups::{CreateAccountGroup, NewAccountGroup},
        plugin_resources::{
            GroupMembersChange, GroupMembersChanged, ManagedResource, PluginResourceOwner,
            ResourceMutation,
        },
    },
    ports::plugin_resources::{PluginResourceAccess, PluginResourceStore},
};
use async_trait::async_trait;
use ovload_core::{routing::AccountGroupId, runtime::SnapshotControl};
use std::sync::Arc;
use uuid::Uuid;

pub(crate) struct DefaultPluginResourceAccess {
    pub store: Arc<dyn PluginResourceStore>,
    pub snapshot: Arc<dyn SnapshotControl>,
}

impl DefaultPluginResourceAccess {
    async fn publish<T>(
        &self,
        result: crate::ports::store::AdminStoreResult<ResourceMutation<T>>,
    ) -> Result<T, AdminError> {
        let result = result.map_err(|error| super::map_store_error(error, "plugin resource"))?;
        if let Some(revision) = result.revision {
            super::publish_committed(self.snapshot.as_ref(), revision).await?;
        }
        Ok(result.value)
    }
}

#[async_trait]
impl PluginResourceAccess for DefaultPluginResourceAccess {
    async fn ensure_group(
        &self,
        owner: &PluginResourceOwner,
        resource_key: String,
        command: CreateAccountGroup,
        context: &MutationContext,
    ) -> Result<ManagedResource, AdminError> {
        let id = AccountGroupId::new(format!("grp_{}", Uuid::now_v7().simple()))
            .map_err(|_| AdminError::internal("创建账号组 ID 失败"))?;
        self.publish(
            self.store
                .ensure_group(
                    owner,
                    resource_key,
                    NewAccountGroup {
                        policy: command.policy,
                        allow_image_generation: command.allow_image_generation,
                        id,
                        name: command.name,
                        description: command.description,
                        color: command.color,
                        fast_mode: command.fast_mode,
                    },
                    context,
                )
                .await,
        )
        .await
    }

    async fn change_members(
        &self,
        owner: &PluginResourceOwner,
        command: GroupMembersChange,
        context: &MutationContext,
    ) -> Result<GroupMembersChanged, AdminError> {
        self.publish(self.store.change_members(owner, command, context).await)
            .await
    }
}
