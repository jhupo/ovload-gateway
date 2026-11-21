//! Session-scoped avatar storage and atomic replacement.

use async_trait::async_trait;

use crate::model::{
    identity_access::{IdentityResult, IdentitySession},
    image_asset::ImageAsset,
    profile_avatar::ProfileAvatar,
};

#[async_trait]
pub trait ProfileAvatarStore: Send + Sync {
    async fn read(&self, current: &IdentitySession) -> IdentityResult<ProfileAvatar>;

    async fn replace(
        &self,
        current: &IdentitySession,
        expected_revision: u64,
        asset: Option<ImageAsset>,
    ) -> IdentityResult<ProfileAvatar>;
}
