//! Canonical, bounded PNG assets shared by profile and website settings.

use std::fmt;

use super::identity_access::{IdentityError, IdentityResult};

pub const MAX_IMAGE_ASSET_BYTES: usize = 300 * 1024;
pub const MAX_IMAGE_ASSET_DIMENSION: u32 = 256;

#[derive(Clone, PartialEq, Eq)]
pub struct ImageAsset {
    pub png: Vec<u8>,
    pub width: u32,
    pub height: u32,
}

impl ImageAsset {
    pub fn validate(&self) -> IdentityResult<()> {
        if !(1..=MAX_IMAGE_ASSET_DIMENSION).contains(&self.width)
            || !(1..=MAX_IMAGE_ASSET_DIMENSION).contains(&self.height)
            || self.png.len() > MAX_IMAGE_ASSET_BYTES
            || !self.png.starts_with(b"\x89PNG\r\n\x1a\n")
        {
            return Err(IdentityError::Invalid);
        }
        Ok(())
    }
}

impl fmt::Debug for ImageAsset {
    fn fmt(&self, formatter: &mut fmt::Formatter<'_>) -> fmt::Result {
        formatter
            .debug_struct("ImageAsset")
            .field("png_bytes", &self.png.len())
            .field("width", &self.width)
            .field("height", &self.height)
            .finish()
    }
}
