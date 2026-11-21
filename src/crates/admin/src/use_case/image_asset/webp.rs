//! Validate container ranges and actual frame dimensions before WebP metadata or pixels.

use std::io::{Cursor, Write as _};

use image::{ImageDecoder as _, codecs::webp::WebPDecoder};
use riff::Chunk;

use super::{MAX_DECODE_BYTES, MAX_DECODE_DIMENSION, MAX_DECODE_PIXELS, MAX_PROCESS_INPUT_BYTES};
use crate::model::identity_access::{IdentityError, IdentityResult};

const MAX_CHUNKS: usize = 1024;
const CRITICAL_CHUNKS: [[u8; 4]; 7] = [
    *b"VP8X", *b"VP8 ", *b"VP8L", *b"ALPH", *b"ICCP", *b"EXIF", *b"XMP ",
];

pub(super) fn verify(bytes: &[u8]) -> IdentityResult<()> {
    if bytes.len() > MAX_PROCESS_INPUT_BYTES {
        return Err(IdentityError::Invalid);
    }
    let mut stream = Cursor::new(bytes);
    let root = Chunk::read(&mut stream, 0).map_err(|_| IdentityError::Invalid)?;
    let root_end = root
        .offset()
        .checked_add(8)
        .and_then(|offset| offset.checked_add(u64::from(root.len())))
        .ok_or(IdentityError::Invalid)?;
    if root.id() != riff::RIFF_ID
        || root.len() < 4
        || root_end != bytes.len() as u64
        || root
            .read_type(&mut stream)
            .map_err(|_| IdentityError::Invalid)?
            .value
            != *b"WEBP"
    {
        return Err(IdentityError::Invalid);
    }

    let mut offset = 12;
    let mut chunk_count = 0;
    let mut seen = [false; CRITICAL_CHUNKS.len()];
    let mut extended = false;
    let mut alpha = false;
    let mut frame: Option<Chunk> = None;
    while offset < root_end {
        if chunk_count == MAX_CHUNKS || root_end - offset < 8 {
            return Err(IdentityError::Invalid);
        }
        let chunk = Chunk::read(&mut stream, offset).map_err(|_| IdentityError::Invalid)?;
        let payload_end = chunk
            .offset()
            .checked_add(8)
            .and_then(|offset| offset.checked_add(u64::from(chunk.len())))
            .ok_or(IdentityError::Invalid)?;
        let padded_end = payload_end
            .checked_add(u64::from(chunk.len() % 2))
            .filter(|end| *end <= root_end)
            .ok_or(IdentityError::Invalid)?;
        if padded_end != payload_end && bytes[payload_end as usize] != 0 {
            return Err(IdentityError::Invalid);
        }
        let id = chunk.id().value;
        if let Some(index) = CRITICAL_CHUNKS.iter().position(|known| *known == id) {
            if seen[index] {
                return Err(IdentityError::Invalid);
            }
            seen[index] = true;
        }
        match &id {
            b"ANIM" | b"ANMF" | b"RIFF" | b"RIFX" | b"LIST" | b"WEBP" => {
                return Err(IdentityError::Invalid);
            }
            b"VP8X" => {
                if offset != 12 || chunk.len() != 10 {
                    return Err(IdentityError::Invalid);
                }
                extended = true;
            }
            b"VP8 " | b"VP8L" => {
                let minimum = if id == *b"VP8 " { 10 } else { 5 };
                if chunk.len() < minimum || frame.replace(chunk).is_some() {
                    return Err(IdentityError::Invalid);
                }
            }
            b"ALPH" => {
                if !extended || frame.is_some() || chunk.len() == 0 {
                    return Err(IdentityError::Invalid);
                }
                alpha = true;
            }
            b"ICCP" => {
                if !extended || alpha || frame.is_some() {
                    return Err(IdentityError::Invalid);
                }
            }
            b"EXIF" | b"XMP " if !extended || frame.is_none() => {
                return Err(IdentityError::Invalid);
            }
            _ => {}
        }
        offset = padded_end;
        chunk_count += 1;
    }
    if offset != root_end {
        return Err(IdentityError::Invalid);
    }
    let frame = frame.ok_or(IdentityError::Invalid)?;
    if alpha && frame.id().value == *b"VP8L" {
        return Err(IdentityError::Invalid);
    }

    // The simple container exposes bitstream dimensions without trusting VP8X.
    // Decode the original later to preserve its separately bounded ALPH and EXIF.
    let simple = frame_container(bytes, &frame)?;
    let actual = WebPDecoder::new(Cursor::new(simple)).map_err(|_| IdentityError::Invalid)?;
    dimensions(&actual)?;
    let canvas = WebPDecoder::new(Cursor::new(bytes)).map_err(|_| IdentityError::Invalid)?;
    dimensions(&canvas)?;
    if canvas.has_animation() || canvas.dimensions() != actual.dimensions() {
        return Err(IdentityError::Invalid);
    }
    Ok(())
}

fn dimensions(decoder: &impl image::ImageDecoder) -> IdentityResult<()> {
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
    Ok(())
}

fn frame_container(bytes: &[u8], frame: &Chunk) -> IdentityResult<Vec<u8>> {
    let length = u64::from(frame.len());
    let end = frame
        .offset()
        .checked_add(8)
        .and_then(|offset| offset.checked_add(length))
        .and_then(|offset| offset.checked_add(length % 2))
        .ok_or(IdentityError::Invalid)?;
    let start = usize::try_from(frame.offset()).map_err(|_| IdentityError::Invalid)?;
    let end = usize::try_from(end).map_err(|_| IdentityError::Invalid)?;
    let frame_bytes = bytes.get(start..end).ok_or(IdentityError::Invalid)?;
    let riff_length = frame_bytes
        .len()
        .checked_add(4)
        .and_then(|length| u32::try_from(length).ok())
        .ok_or(IdentityError::Invalid)?;
    let mut container = Vec::with_capacity(frame_bytes.len() + 12);
    container
        .write_all(b"RIFF")
        .and_then(|_| container.write_all(&riff_length.to_le_bytes()))
        .and_then(|_| container.write_all(b"WEBP"))
        .and_then(|_| container.write_all(frame_bytes))
        .map_err(|_| IdentityError::Unavailable)?;
    Ok(container)
}
