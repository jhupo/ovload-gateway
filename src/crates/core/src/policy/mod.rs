//! 下游 Client API Key 的准入策略
//!
//! Client API Key 冻结账号分组权限；模型名称不参与权限判断

mod client_version;

pub use client_version::{
    ClientVersionRejection, CodexClientKind, CodexClientMinVersions, CodexClientVersion,
};

use std::collections::BTreeMap;
use std::fmt;
use std::sync::Arc;

use crate::account::{FastMode, OpaqueProviderData, scope::FrozenAccountScope};
use crate::identity::ProviderKind;
use crate::validation::{IdentifierError, PolicyError, validate_text};

/// `client_api_keys.id` 的核心值对象
#[derive(Debug, Clone, PartialEq, Eq, PartialOrd, Ord, Hash)]
pub struct ClientApiKeyId(String);

impl ClientApiKeyId {
    /// 校验并创建 Key ID
    ///
    /// # Errors
    ///
    /// ID 为空、过长或包含控制字符时返回错误
    pub fn new(value: impl Into<String>) -> Result<Self, IdentifierError> {
        let value = value.into();
        validate_text(&value, 128, false, None)?;
        Ok(Self(value))
    }

    #[must_use]
    pub fn as_str(&self) -> &str {
        &self.0
    }
}

impl fmt::Display for ClientApiKeyId {
    fn fmt(&self, formatter: &mut fmt::Formatter<'_>) -> fmt::Result {
        formatter.write_str(&self.0)
    }
}

/// Transient bearer credential. Never persist it or include it in snapshots.
#[derive(Clone, PartialEq, Eq)]
pub struct PlaintextClientApiKey(String);

impl PlaintextClientApiKey {
    /// 校验并创建明文 Key
    ///
    /// # Errors
    ///
    /// Key 为空或无法作为 HTTP Bearer 值发送时返回错误
    pub fn new(value: impl Into<String>) -> Result<Self, IdentifierError> {
        let value = value.into();
        Self::validate(&value)?;
        Ok(Self(value))
    }

    /// Validate the transport representation without changing credential bytes.
    ///
    /// # Errors
    ///
    /// Key 为空或包含空白、控制字符、非 ASCII 字符时返回错误
    pub fn validate(value: &str) -> Result<(), IdentifierError> {
        if value.is_empty() {
            return Err(IdentifierError::Empty);
        }
        if !value.bytes().all(|byte| byte.is_ascii_graphic()) {
            return Err(IdentifierError::InvalidFormat);
        }
        Ok(())
    }

    /// Borrow only for request authentication and verifier generation.
    #[must_use]
    pub fn expose_for_auth(&self) -> &str {
        &self.0
    }
}

impl fmt::Debug for PlaintextClientApiKey {
    fn fmt(&self, formatter: &mut fmt::Formatter<'_>) -> fmt::Result {
        formatter.write_str("PlaintextClientApiKey(<redacted>)")
    }
}

/// 零表示对应维度不额外限制
#[derive(Debug, Clone, Copy, PartialEq, Eq, Default, serde::Serialize, serde::Deserialize)]
#[serde(deny_unknown_fields)]
pub struct RateLimits {
    pub max_concurrency: u64,
    pub requests_per_minute: u64,
}

impl RateLimits {
    #[must_use]
    pub const fn unlimited() -> Self {
        Self {
            max_concurrency: 0,
            requests_per_minute: 0,
        }
    }
}

/// Key 自身的设置默认值；请求派生策略保留本值，不能把宿主默认或插件覆盖写回
#[derive(Debug, Clone, PartialEq, Eq)]
pub struct ClientSettings {
    pub request_profiles: BTreeMap<ProviderKind, OpaqueProviderData>,
    pub fast_mode: FastMode,
    pub limits: RateLimits,
}

/// 从 `client_api_keys` 冻结的公开准入事实
#[derive(Debug, Clone, PartialEq, Eq)]
pub struct ClientPolicy {
    name_snapshot: Option<String>,
    defaults: Arc<ClientSettings>,
    key_id: ClientApiKeyId,
    key_generation: u64,
    account_scope: Arc<FrozenAccountScope>,
    enabled: bool,
    limits: RateLimits,
}

impl ClientPolicy {
    #[must_use]
    pub fn defaults(&self) -> &Arc<ClientSettings> {
        &self.defaults
    }

    pub(crate) fn with_settings(
        mut self,
        profiles: &BTreeMap<ProviderKind, OpaqueProviderData>,
        fast_mode: FastMode,
        limits: RateLimits,
    ) -> Self {
        if self.account_scope.request_profiles() != profiles
            || self.account_scope.fast_mode() != fast_mode
        {
            self.account_scope = Arc::new(
                self.account_scope
                    .as_ref()
                    .clone()
                    .with_request_profiles(profiles.clone())
                    .with_fast_mode(fast_mode),
            );
        }
        self.limits = limits;
        self
    }

    #[must_use]
    pub fn new(
        key_id: ClientApiKeyId,
        key_generation: u64,
        account_scope: Arc<FrozenAccountScope>,
        enabled: bool,
        limits: RateLimits,
    ) -> Self {
        Self {
            key_generation,
            name_snapshot: None,
            defaults: Arc::new(ClientSettings {
                request_profiles: account_scope.request_profiles().clone(),
                fast_mode: account_scope.fast_mode(),
                limits,
            }),
            key_id,
            account_scope,
            enabled,
            limits,
        }
    }

    #[must_use]
    pub const fn key_generation(&self) -> u64 {
        self.key_generation
    }

    #[must_use]
    pub fn with_name_snapshot(mut self, name: Option<String>) -> Self {
        self.name_snapshot = name;
        self
    }

    #[must_use]
    pub fn name_snapshot(&self) -> Option<&str> {
        self.name_snapshot.as_deref()
    }

    #[must_use]
    pub const fn key_id(&self) -> &ClientApiKeyId {
        &self.key_id
    }

    #[must_use]
    pub const fn account_scope(&self) -> &Arc<FrozenAccountScope> {
        &self.account_scope
    }

    #[must_use]
    pub const fn enabled(&self) -> bool {
        self.enabled
    }

    #[must_use]
    pub const fn limits(&self) -> RateLimits {
        self.limits
    }

    /// 禁用的 Key 不接受新请求
    ///
    /// # Errors
    ///
    /// Key 已禁用时返回稳定拒绝原因
    pub fn authorize(&self) -> Result<(), PolicyError> {
        if self.enabled {
            Ok(())
        } else {
            Err(PolicyError::Denied {
                reason: "client API key is disabled",
            })
        }
    }
}
