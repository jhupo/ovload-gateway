//! Durable public metadata and platform-authorized site configuration.

use async_trait::async_trait;

use crate::model::{
    identity_access::{IdentityManagementActor, IdentityResult},
    image_asset::ImageAsset,
    site_settings::{SiteSettings, UpdateSiteSettings},
    workspace_settings::{WorkspaceSettings, WorkspaceSettingsKind, WorkspaceVisibility},
};

#[async_trait]
pub trait SiteSettingsStore: Send + Sync {
    async fn engagement_view(
        &self,
        _session: &crate::model::identity_access::IdentitySession,
        _view: &str,
    ) -> IdentityResult<serde_json::Value> {
        Err(crate::model::identity_access::IdentityError::Unavailable)
    }
    async fn engagement_command(
        &self,
        _session: &crate::model::identity_access::IdentitySession,
        _command: crate::model::engagement::EngagementCommand,
    ) -> IdentityResult<serde_json::Value> {
        Err(crate::model::identity_access::IdentityError::Unavailable)
    }
    async fn workspace_get(
        &self,
        _actor: IdentityManagementActor,
        _kind: WorkspaceSettingsKind,
    ) -> IdentityResult<WorkspaceSettings> {
        Err(crate::model::identity_access::IdentityError::Unavailable)
    }
    async fn workspace_update(
        &self,
        _actor: IdentityManagementActor,
        _kind: WorkspaceSettingsKind,
        _revision: u64,
        _values: serde_json::Value,
    ) -> IdentityResult<WorkspaceSettings> {
        Err(crate::model::identity_access::IdentityError::Unavailable)
    }
    async fn workspace_visibility(&self) -> IdentityResult<WorkspaceVisibility> {
        Err(crate::model::identity_access::IdentityError::Unavailable)
    }
    async fn public_get(&self) -> IdentityResult<SiteSettings>;
    async fn get(&self, actor: IdentityManagementActor) -> IdentityResult<SiteSettings>;
    async fn update(
        &self,
        actor: IdentityManagementActor,
        expected_revision: u64,
        input: UpdateSiteSettings,
    ) -> IdentityResult<SiteSettings>;
    async fn replace_logo(
        &self,
        actor: IdentityManagementActor,
        expected_revision: u64,
        logo: Option<ImageAsset>,
    ) -> IdentityResult<SiteSettings>;
}
