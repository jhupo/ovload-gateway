//! Shared image decoding runs in bounded blocking slots, without a waiting queue.

mod webp;

use std::{io::Cursor, sync::Arc};

use image::{
    ImageDecoder as _, ImageEncoder as _, ImageFormat, ImageReader, Limits,
    codecs::png::{CompressionType, FilterType, PngEncoder},
};
use tokio::sync::Semaphore;

use crate::model::{
    identity_access::{IdentityError, IdentityResult},
    image_asset::{ImageAsset, MAX_IMAGE_ASSET_DIMENSION},
};

const MAX_DECODE_DIMENSION: u32 = 4096;
const MAX_DECODE_PIXELS: u64 = 16_000_000;
const MAX_DECODE_BYTES: u64 = 64 * 1024 * 1024;
const MAX_PROCESS_INPUT_BYTES: usize = 2 * 1024 * 1024;

pub(crate) struct ImageAssetProcessor {
    capacity: Arc<Semaphore>,
}

impl ImageAssetProcessor {
    #[must_use]
    pub fn new() -> Self {
        Self {
            capacity: Arc::new(Semaphore::new(4)),
        }
    }

    pub async fn process(&self, bytes: Vec<u8>, content_type: &str) -> IdentityResult<ImageAsset> {
        if bytes.is_empty() || bytes.len() > MAX_PROCESS_INPUT_BYTES {
            return Err(IdentityError::Invalid);
        }
        let format = match content_type {
            "image/png" => ImageFormat::Png,
            "image/jpeg" => ImageFormat::Jpeg,
            "image/webp" => ImageFormat::WebP,
            _ => return Err(IdentityError::Invalid),
        };
        let permit = self
            .capacity
            .clone()
            .try_acquire_owned()
            .map_err(|_| IdentityError::RateLimited)?;
        tokio::task::spawn_blocking(move || {
            // Cancellation cannot release capacity while decoding still runs.
            let _permit = permit;
            canonicalize(bytes, format)
        })
        .await
        .map_err(|_| IdentityError::Unavailable)?
    }
}

impl Default for ImageAssetProcessor {
    fn default() -> Self {
        Self::new()
    }
}

fn reader(bytes: &[u8], format: ImageFormat) -> ImageReader<Cursor<&[u8]>> {
    let mut reader = ImageReader::with_format(Cursor::new(bytes), format);
    let mut limits = Limits::default();
    limits.max_image_width = Some(MAX_DECODE_DIMENSION);
    limits.max_image_height = Some(MAX_DECODE_DIMENSION);
    limits.max_alloc = Some(MAX_DECODE_BYTES);
    reader.limits(limits);
    reader
}

fn canonicalize(bytes: Vec<u8>, format: ImageFormat) -> IdentityResult<ImageAsset> {
    if image::guess_format(&bytes).map_err(|_| IdentityError::Invalid)? != format {
        return Err(IdentityError::Invalid);
    }
    if format == ImageFormat::WebP {
        webp::verify(&bytes)?;
    }
    let mut decoder = reader(&bytes, format)
        .into_decoder()
        .map_err(|_| IdentityError::Invalid)?;
    let (width, height) = decoder.dimensions();
    if width == 0
        || height == 0
        || width > MAX_DECODE_DIMENSION
        || height > MAX_DECODE_DIMENSION
        || u64::from(width) * u64::from(height) > MAX_DECODE_PIXELS
        || decoder.total_bytes() > MAX_DECODE_BYTES
    {
        return Err(IdentityError::Invalid);
    }
    let orientation = decoder.orientation().map_err(|_| IdentityError::Invalid)?;
    drop(decoder);

    let mut decoded = reader(&bytes, format)
        .decode()
        .map_err(|_| IdentityError::Invalid)?;
    decoded.apply_orientation(orientation);
    let canonical = if decoded.width() > MAX_IMAGE_ASSET_DIMENSION
        || decoded.height() > MAX_IMAGE_ASSET_DIMENSION
    {
        decoded.thumbnail(MAX_IMAGE_ASSET_DIMENSION, MAX_IMAGE_ASSET_DIMENSION)
    } else {
        decoded
    }
    .to_rgba8();
    let mut png = Vec::new();
    PngEncoder::new_with_quality(&mut png, CompressionType::Best, FilterType::Adaptive)
        .write_image(
            canonical.as_raw(),
            canonical.width(),
            canonical.height(),
            image::ExtendedColorType::Rgba8,
        )
        .map_err(|_| IdentityError::Unavailable)?;
    let asset = ImageAsset {
        png,
        width: canonical.width(),
        height: canonical.height(),
    };
    asset.validate()?;
    Ok(asset)
}
