// Modified for Ovload on 2026-10-27: workspace integration.

//! 跨 Provider 账号分组的管理命令与查询投影

use std::collections::BTreeMap;

use chrono::{DateTime, Utc};
use ovload_core::{
    account::{AccountStatusFacts, FastMode},
    routing::AccountGroupId,
};

use super::{PageSize, Revision, observability::DecimalAmount};

#[derive(Debug, Clone, Copy, Default, PartialEq, Eq, serde::Serialize, serde::Deserialize)]
#[serde(rename_all = "snake_case")]
pub enum GroupVisibility {
    Public,
    #[default]
    Private,
}

impl GroupVisibility {
    #[must_use]
    pub const fn as_str(self) -> &'static str {
        match self {
            Self::Public => "public",
            Self::Private => "private",
        }
    }
}

#[derive(Debug, Clone, PartialEq, Eq, serde::Serialize, serde::Deserialize)]
#[serde(rename_all = "camelCase", deny_unknown_fields)]
pub struct AccountGroupPolicy {
    #[serde(default)]
    pub controls: ovload_core::metering::GroupControls,
    #[serde(default)]
    pub platform: Option<String>,
    pub visibility: GroupVisibility,
    pub retail_multiplier_bps: u32,
    pub model_routes: Option<BTreeMap<String, String>>,
    #[serde(default)]
    pub pricing: ovload_core::metering::GroupPricing,
}

impl Default for AccountGroupPolicy {
    fn default() -> Self {
        Self {
            controls: Default::default(),
            platform: None,
            visibility: GroupVisibility::Private,
            retail_multiplier_bps: 10_000,
            model_routes: None,
            pricing: Default::default(),
        }
    }
}

impl AccountGroupPolicy {
    pub fn validate(&self) -> Result<(), super::AdminModelError> {
        if self.controls.validate(&self.pricing).is_err()
            || self.platform.as_ref().is_some_and(|p| {
                !ovload_core::identity::is_builtin_provider_kind(p)
            })
            || self.pricing.validate(self.retail_multiplier_bps).is_err()
            || self.retail_multiplier_bps > 1_000_000
            || self.model_routes.as_ref().is_some_and(|routes| {
                routes.len() > 256
                    || routes.iter().any(|(public, target)| {
                        ovload_core::routing::PublicModelId::new(public.clone()).is_err()
                            || ovload_core::routing::UpstreamModelId::new(target.clone()).is_err()
                            || public.trim() != public
                            || target.trim() != target
                    })
            })
        {
            return Err(super::AdminModelError::InvalidAccountGroupFields);
        }
        Ok(())
    }
}

/// 名称与描述的共同约束，HTTP、用例和存储边界只映射错误
pub fn validate_group_fields(
    name: &str,
    description: Option<&str>,
) -> Result<(), super::AdminModelError> {
    if name.trim() != name
        || name.is_empty()
        || name.chars().count() > 100
        || name.chars().any(char::is_control)
        || description
            .is_some_and(|value| value.len() > 4096 || value.chars().any(char::is_control))
    {
        return Err(super::AdminModelError::InvalidAccountGroupFields);
    }
    Ok(())
}

/// 账号分组持久化使用的标准 `#RRGGBBAA` 颜色
#[derive(Debug, Clone, PartialEq, Eq)]
pub struct AccountGroupColor(String);

impl AccountGroupColor {
    #[must_use]
    pub fn as_str(&self) -> &str {
        &self.0
    }

    #[must_use]
    pub fn parse(value: &str) -> Option<Self> {
        (value.len() == 9
            && value.starts_with('#')
            && value[1..].bytes().all(|byte| byte.is_ascii_hexdigit()))
        .then(|| Self(value.to_ascii_uppercase()))
    }
}

/// 当前观测时刻的分组成员可用性
#[derive(Debug, Clone, Copy, PartialEq, Eq)]
pub struct AccountGroupAccountSummary {
    pub available: u64,
    pub limited: u64,
    pub total: u64,
}

/// 根据全部成员账号与运行时租约计算的分组调度槽位
#[derive(Debug, Clone, Copy, PartialEq, Eq)]
pub struct AccountGroupCapacity {
    pub used_slots: Option<u64>,
    /// `None` 表示成员账号中存在不限制并发的账号
    pub total_slots: Option<u64>,
}

/// 请求实际绑定分组的已结算用量；独立于明细保留期和当前成员关系
#[derive(Debug, Clone, PartialEq, Eq)]
pub struct AccountGroupUsage {
    pub today_usd: DecimalAmount,
    pub yesterday_usd: DecimalAmount,
    /// 分组自创建以来的已结算累计用量（保留原字段名兼容客户端）
    pub retained_total_usd: DecimalAmount,
}

/// 当前页账号组 membership 对应的持久账号事实；运行态在 Admin query service 合并
#[derive(Debug, Clone, PartialEq, Eq)]
pub struct AccountGroupMemberFact {
    pub group_id: AccountGroupId,
    pub account_id: String,
    pub status: AccountStatusFacts,
    pub total_slots: Option<u64>,
}

/// 账号与 Client Key 视图内嵌的轻量分组引用
#[derive(Debug, Clone, PartialEq, Eq)]
pub struct AccountGroupRef {
    pub id: AccountGroupId,
    pub name: String,
    pub color: AccountGroupColor,
    pub enabled: bool,
}

/// 账号分组列表查询
#[derive(Debug, Clone, PartialEq, Eq)]
pub struct AccountGroupListQuery {
    pub platforms: Vec<String>,
    pub visibilities: Vec<GroupVisibility>,
    pub sort_by_name: bool,
    pub descending: bool,
    pub page: u32,
    pub page_size: PageSize,
    pub search: Option<String>,
    pub enabled: Option<bool>,
}

/// 完整账号分组摘要
#[derive(Debug, Clone, PartialEq, Eq)]
pub struct AccountGroupRecord {
    pub policy: AccountGroupPolicy,
    pub allow_image_generation: bool,
    pub fast_mode: FastMode,
    pub id: AccountGroupId,
    pub name: String,
    pub description: Option<String>,
    pub color: AccountGroupColor,
    pub enabled: bool,
    pub member_count: u64,
    pub provider_counts: BTreeMap<String, u64>,
    pub client_key_count: u64,
    pub account_summary: AccountGroupAccountSummary,
    pub capacity: AccountGroupCapacity,
    pub usage: AccountGroupUsage,
    pub created_at: DateTime<Utc>,
    pub updated_at: DateTime<Utc>,
}

/// 账号分组分页结果
#[derive(Debug, Clone, PartialEq, Eq)]
pub struct AccountGroupPage {
    pub config_revision: Revision,
    pub items: Vec<AccountGroupRecord>,
    pub total: u64,
    pub page: u32,
    pub page_size: u16,
}

/// 分组选择器使用的轻量分页结果
#[derive(Debug, Clone, PartialEq, Eq)]
pub struct AccountGroupOptionsPage {
    pub config_revision: Revision,
    pub items: Vec<AccountGroupRef>,
    pub total: u64,
    pub page: u32,
    pub page_size: u16,
}

/// 创建账号分组
#[derive(Debug, Clone, PartialEq, Eq)]
pub struct CreateAccountGroup {
    pub policy: AccountGroupPolicy,
    pub allow_image_generation: bool,
    pub fast_mode: FastMode,
    pub name: String,
    pub description: Option<String>,
    pub color: AccountGroupColor,
}

/// 已生成稳定标识、可直接提交存储的创建命令
#[derive(Debug, Clone, PartialEq, Eq)]
pub struct NewAccountGroup {
    pub policy: AccountGroupPolicy,
    pub allow_image_generation: bool,
    pub fast_mode: FastMode,
    pub id: AccountGroupId,
    pub name: String,
    pub description: Option<String>,
    pub color: AccountGroupColor,
}

/// 更新账号分组的描述字段
#[derive(Debug, Clone, PartialEq, Eq)]
pub struct UpdateAccountGroup {
    pub policy: AccountGroupPolicy,
    pub expected_revision: Revision,
    pub allow_image_generation: Option<bool>,
    pub fast_mode: Option<FastMode>,
    pub id: AccountGroupId,
    pub name: String,
    pub description: Option<String>,
    pub color: AccountGroupColor,
}

/// 启用或停用账号分组
#[derive(Debug, Clone, PartialEq, Eq)]
pub struct SetAccountGroupEnabled {
    pub id: AccountGroupId,
    pub enabled: bool,
}

/// 删除未被 Client Key 引用的账号分组
#[derive(Debug, Clone, PartialEq, Eq)]
pub struct DeleteAccountGroup {
    pub id: AccountGroupId,
}

/// 账号分组变更结果
#[derive(Debug, Clone, PartialEq, Eq)]
pub struct AccountGroupMutation {
    pub config_revision: Revision,
    pub id: AccountGroupId,
    pub record: Option<AccountGroupRecord>,
}
