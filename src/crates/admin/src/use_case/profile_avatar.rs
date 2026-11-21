//! Owner-only avatar commands never mutate credential authority generations.

use std::sync::Arc;

use super::image_asset::ImageAssetProcessor;
use crate::{
    model::{
        identity_access::{IdentityError, IdentityResult, IdentitySession},
        identity_lifecycle::version,
        profile_avatar::ProfileAvatar,
    },
    ports::profile_avatar::ProfileAvatarStore,
};

pub struct ProfileAvatarService {
    store: Arc<dyn ProfileAvatarStore>,
    processor: Arc<ImageAssetProcessor>,
}

impl ProfileAvatarService {
    #[must_use]
    pub(crate) fn new(
        store: Arc<dyn ProfileAvatarStore>,
        processor: Arc<ImageAssetProcessor>,
    ) -> Self {
        Self { store, processor }
    }

    pub async fn get(&self, current: &IdentitySession) -> IdentityResult<ProfileAvatar> {
        self.store.read(current).await
    }

    pub async fn upload(
        &self,
        current: &IdentitySession,
        expected_revision: u64,
        bytes: Vec<u8>,
        content_type: &str,
    ) -> IdentityResult<ProfileAvatar> {
        version(expected_revision)?;
        let current_avatar = self.store.read(current).await?;
        if current_avatar.revision != expected_revision {
            return Err(IdentityError::Conflict);
        }
        let asset = self.processor.process(bytes, content_type).await?;
        self.store
            .replace(current, expected_revision, Some(asset))
            .await
    }

    pub async fn delete(
        &self,
        current: &IdentitySession,
        expected_revision: u64,
    ) -> IdentityResult<ProfileAvatar> {
        version(expected_revision)?;
        self.store.replace(current, expected_revision, None).await
    }
}
