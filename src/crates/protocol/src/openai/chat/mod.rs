//! Directional text/function Chat Completions to Responses conversion.

mod request;
mod response;
mod stream;

pub use request::{ChatRequest, convert_request};
pub use response::convert_response;
pub use stream::ChatStreamConverter;

#[derive(Debug, Clone, Copy, PartialEq, Eq, thiserror::Error)]
pub enum ConversionError {
    #[error("invalid or unsupported Chat Completions request")]
    InvalidRequest,
    #[error("invalid or unsupported Responses output")]
    InvalidResponse,
    #[error("protocol conversion exceeded its bounded state")]
    LimitExceeded,
}

pub(super) const MAX_ITEMS: usize = 128;
pub(super) const MAX_FRAME_BYTES: usize = 4 * 1024 * 1024;

/// Ordinary tool IDs retain their existing bound. Providers may return a bounded,
/// opaque continuation handle when a stateless Chat turn must carry upstream state.
#[must_use]
pub fn valid_tool_call_id(value: &str) -> bool {
    if value.is_empty() || value.chars().any(char::is_control) {
        return false;
    }
    value.len() <= 256
        || (value.len() <= 48 * 1024
            && value
                .bytes()
                .all(|byte| byte.is_ascii_alphanumeric() || b"-_".contains(&byte)))
}
