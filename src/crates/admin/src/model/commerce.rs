//! Commerce commands carry integer cents and optimistic revisions.
use chrono::{DateTime, Utc};
use serde::{Deserialize, Serialize};
use uuid::Uuid;

#[derive(Debug, Deserialize, Serialize)]
#[serde(tag = "action", rename_all = "snake_case", deny_unknown_fields)]
pub enum CommerceCommand {
    SavePlan {
        id: Option<Uuid>,
        revision: Option<i64>,
        document: Plan,
    },
    DeletePlan {
        id: Uuid,
        revision: i64,
    },
    Assign {
        user_id: Uuid,
        plan_id: Uuid,
        notes: String,
    },
    Adjust {
        id: Uuid,
        revision: i64,
        ends_at: DateTime<Utc>,
        notes: String,
    },
    Revoke {
        id: Uuid,
        revision: i64,
    },
    ResetQuota {
        id: Uuid,
        revision: i64,
    },
    Generate {
        kind: CodeKind,
        value: i64,
        plan_id: Option<Uuid>,
        count: i32,
        max_uses: i32,
        per_user: i32,
        expires_at: Option<DateTime<Utc>>,
        notes: String,
    },
    UpdateCode {
        id: Uuid,
        revision: i64,
        disabled: bool,
    },
    DeleteCode {
        id: Uuid,
        revision: i64,
    },
    Redeem {
        code: String,
    },
    Purchase {
        plan_id: Uuid,
        revision: i64,
    },
}
#[derive(Debug, Deserialize, Serialize, PartialEq)]
#[serde(rename_all = "snake_case")]
pub enum CodeKind {
    Balance,
    Concurrency,
    Subscription,
    Invitation,
}
impl CodeKind {
    pub fn as_str(&self) -> &'static str {
        match self {
            Self::Balance => "balance",
            Self::Concurrency => "concurrency",
            Self::Subscription => "subscription",
            Self::Invitation => "invitation",
        }
    }
}
#[derive(Debug, Deserialize, Serialize)]
#[serde(rename_all = "camelCase", deny_unknown_fields)]
pub struct Plan {
    pub name: String,
    pub description: String,
    pub notes: String,
    pub price_cents: i64,
    pub original_price_cents: i64,
    pub daily_cents: i64,
    pub weekly_cents: i64,
    pub monthly_cents: i64,
    pub unlimited: Unlimited,
    pub days: i32,
    pub sort: i32,
    pub currency_label: String,
    pub features: String,
    pub reset_time: String,
    pub timezone: String,
    pub published: bool,
}
#[derive(Debug, Deserialize, Serialize)]
#[serde(deny_unknown_fields)]
pub struct Unlimited {
    pub daily: bool,
    pub weekly: bool,
    pub monthly: bool,
}
impl Plan {
    pub fn valid(&self) -> bool {
        let time = chrono::NaiveTime::parse_from_str(&self.reset_time, "%H:%M");
        !self.name.trim().is_empty()
            && self.name.chars().count() <= 60
            && self.description.len() <= 800
            && self.notes.len() <= 2000
            && self.features.len() <= 8000
            && (1..=999_999_999).contains(&self.price_cents)
            && (self.original_price_cents == 0
                || (self.price_cents..=999_999_999).contains(&self.original_price_cents))
            && [
                (self.daily_cents, self.unlimited.daily),
                (self.weekly_cents, self.unlimited.weekly),
                (self.monthly_cents, self.unlimited.monthly),
            ]
            .iter()
            .all(|(n, unlimited)| (0..=999_999_999).contains(n) && (*unlimited || *n > 0))
            && (1..=3650).contains(&self.days)
            && (0..=999999).contains(&self.sort)
            && (self.currency_label.is_empty() || self.currency_label == "USD")
            && matches!(self.timezone.as_str(), "UTC" | "Asia/Shanghai")
            && time.is_ok()
            && self.reset_time.len() == 5
    }
}
