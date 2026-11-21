//! Site metadata changes and bounded logo processing under live authority.

use std::sync::Arc;

use crate::{
    model::{
        identity_access::{
            IdentityError, IdentityManagementActor, IdentityOwner, IdentityResult, IdentitySession,
        },
        identity_lifecycle::version,
        site_settings::{MAX_SITE_LOGO_UPLOAD_BYTES, SiteSettings, UpdateSiteSettings},
        workspace_settings::{WorkspaceSettings, WorkspaceSettingsKind, WorkspaceVisibility},
    },
    ports::site_settings::SiteSettingsStore,
};

use super::image_asset::ImageAssetProcessor;

pub struct SiteSettingsService {
    store: Arc<dyn SiteSettingsStore>,
    images: Arc<ImageAssetProcessor>,
}

impl SiteSettingsService {
    pub async fn engagement_view(
        &self,
        session: &IdentitySession,
        view: &str,
    ) -> IdentityResult<serde_json::Value> {
        self.store.engagement_view(session, view).await
    }
    pub async fn engagement_command(
        &self,
        session: &IdentitySession,
        command: crate::model::engagement::EngagementCommand,
    ) -> IdentityResult<serde_json::Value> {
        self.store.engagement_command(session, command).await
    }
    pub async fn workspace_get(
        &self,
        session: &IdentitySession,
        kind: WorkspaceSettingsKind,
    ) -> IdentityResult<WorkspaceSettings> {
        self.store.workspace_get(actor(session)?, kind).await
    }

    pub async fn workspace_update(
        &self,
        session: &IdentitySession,
        kind: WorkspaceSettingsKind,
        revision: u64,
        values: serde_json::Value,
    ) -> IdentityResult<WorkspaceSettings> {
        version(revision)?;
        kind.validate(&values)?;
        self.store
            .workspace_update(actor(session)?, kind, revision, values)
            .await
    }

    pub async fn workspace_visibility(&self) -> IdentityResult<WorkspaceVisibility> {
        self.store.workspace_visibility().await
    }
    pub(crate) fn new(store: Arc<dyn SiteSettingsStore>, images: Arc<ImageAssetProcessor>) -> Self {
        Self { store, images }
    }

    pub async fn public_get(&self) -> IdentityResult<SiteSettings> {
        self.store.public_get().await
    }

    pub async fn get(&self, session: &IdentitySession) -> IdentityResult<SiteSettings> {
        self.store.get(actor(session)?).await
    }

    pub async fn update(
        &self,
        session: &IdentitySession,
        expected_revision: u64,
        input: UpdateSiteSettings,
    ) -> IdentityResult<SiteSettings> {
        version(expected_revision)?;
        input.validate()?;
        self.store
            .update(actor(session)?, expected_revision, input)
            .await
    }

    pub async fn upload_logo(
        &self,
        session: &IdentitySession,
        expected_revision: u64,
        bytes: Vec<u8>,
        content_type: &str,
    ) -> IdentityResult<SiteSettings> {
        version(expected_revision)?;
        let actor = actor(session)?;
        let current = self.store.get(actor).await?;
        if current.revision != expected_revision {
            return Err(IdentityError::Conflict);
        }
        if bytes.is_empty()
            || bytes.len() > MAX_SITE_LOGO_UPLOAD_BYTES
            || !matches!(content_type, "image/png" | "image/jpeg")
        {
            return Err(IdentityError::Invalid);
        }
        let logo = self.images.process(bytes, content_type).await?;
        self.store
            .replace_logo(actor, expected_revision, Some(logo))
            .await
    }

    pub async fn delete_logo(
        &self,
        session: &IdentitySession,
        expected_revision: u64,
    ) -> IdentityResult<SiteSettings> {
        version(expected_revision)?;
        self.store
            .replace_logo(actor(session)?, expected_revision, None)
            .await
    }
}

fn actor(session: &IdentitySession) -> IdentityResult<IdentityManagementActor> {
    let IdentityOwner::Management(principal_id) = session.owner else {
        return Err(IdentityError::Forbidden);
    };
    Ok(IdentityManagementActor {
        session_id: session.id,
        principal_id,
        authority_generation: session.authority_generation,
    })
}
