//! An owner's avatar has a revision independent of credentials and profile data.

use chrono::{DateTime, Utc};

use super::image_asset::ImageAsset;

pub const MAX_AVATAR_UPLOAD_BYTES: usize = 2 * 1024 * 1024;

#[derive(Debug, Clone, PartialEq, Eq)]
pub struct ProfileAvatar {
    pub revision: u64,
    pub asset: Option<ImageAsset>,
    pub updated_at: DateTime<Utc>,
}
