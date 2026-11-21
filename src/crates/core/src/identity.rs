//! 编译期 Provider 身份；账号与路由共同使用，不依赖路由计划

use crate::validation::{IdentifierError, validate_text};
use std::fmt;

/// Built-in product platforms exposed to account management.
///
/// Provider adapters may have a distinct slug (for example `openai_api`),
/// while these four values are the stable platform identities used by the
/// management UI and account/group filters.
pub const BUILTIN_ACCOUNT_PLATFORMS: &[&str] = &["openai", "claude", "gemini", "xai"];

/// Built-in provider adapter slugs accepted by management APIs.
pub const BUILTIN_PROVIDER_KINDS: &[&str] = &[
    "openai",
    "openai_api",
    "claude",
    "gemini",
    "xai",
    "xai_api",
];

#[must_use]
pub fn is_builtin_account_platform(value: &str) -> bool {
    BUILTIN_ACCOUNT_PLATFORMS.contains(&value)
}

#[must_use]
pub fn is_builtin_provider_kind(value: &str) -> bool {
    BUILTIN_PROVIDER_KINDS.contains(&value)
}

/// Provider slugs represented by one account-management platform filter.
#[must_use]
pub fn provider_filter_aliases(platform: &str) -> Option<&'static [&'static str]> {
    match platform {
        "openai" => Some(&["openai", "openai_api"]),
        "claude" => Some(&["claude"]),
        "gemini" => Some(&["gemini"]),
        "xai" => Some(&["xai", "xai_api"]),
        _ => None,
    }
}

/// 编译进二进制的 Provider adapter slug
#[derive(Debug, Clone, PartialEq, Eq, PartialOrd, Ord, Hash, serde::Serialize)]
#[serde(transparent)]
pub struct ProviderKind(String);

impl<'de> serde::Deserialize<'de> for ProviderKind {
    fn deserialize<D: serde::Deserializer<'de>>(deserializer: D) -> Result<Self, D::Error> {
        Self::new(<String as serde::Deserialize>::deserialize(deserializer)?)
            .map_err(serde::de::Error::custom)
    }
}

impl ProviderKind {
    /// 校验 Provider slug
    pub fn new(value: impl Into<String>) -> Result<Self, IdentifierError> {
        let value = value.into();
        validate_text(&value, 64, true, None)?;
        Ok(Self(value))
    }

    #[must_use]
    pub fn as_str(&self) -> &str {
        &self.0
    }
}

impl fmt::Display for ProviderKind {
    fn fmt(&self, formatter: &mut fmt::Formatter<'_>) -> fmt::Result {
        formatter.write_str(&self.0)
    }
}
