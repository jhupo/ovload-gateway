//! Authenticated operations queries and bounded process telemetry ingestion.
use crate::model::identity_access::{IdentityResult, IdentitySession};
use async_trait::async_trait;
use chrono::{DateTime, Utc};
use serde::{Deserialize, Serialize};
use serde_json::Value;

#[derive(Clone, Debug, Serialize, Deserialize)]
#[serde(rename_all = "camelCase", deny_unknown_fields)]
pub struct LogConfig {
    pub revision: i64,
    pub enabled: bool,
    pub level: String,
    pub retention_days: i32,
}
impl Default for LogConfig {
    fn default() -> Self {
        Self {
            revision: 1,
            enabled: true,
            level: "INFO".into(),
            retention_days: 7,
        }
    }
}
impl LogConfig {
    pub fn valid(&self) -> bool {
        self.revision > 0
            && (1..=90).contains(&self.retention_days)
            && matches!(self.level.as_str(), "DEBUG" | "INFO" | "WARN" | "ERROR")
    }
}

#[derive(Clone, Debug, Deserialize)]
#[serde(rename_all = "camelCase", deny_unknown_fields)]
pub struct LogQuery {
    pub from: DateTime<Utc>,
    pub to: DateTime<Utc>,
    pub level: Option<String>,
    pub component: Option<String>,
    pub search: Option<String>,
    pub request_id: Option<String>,
    pub provider: Option<String>,
    pub group_id: Option<String>,
    pub account_id: Option<String>,
    pub page: Option<i64>,
    pub page_size: Option<i64>,
}
impl LogQuery {
    pub fn valid(&self) -> bool {
        self.from < self.to
            && (self.to - self.from).num_days() <= 90
            && (1..=100_000).contains(&self.page.unwrap_or(1))
            && (1..=100).contains(&self.page_size.unwrap_or(20))
            && self
                .level
                .as_deref()
                .is_none_or(|s| matches!(s, "DEBUG" | "INFO" | "WARN" | "ERROR"))
            && [
                &self.component,
                &self.search,
                &self.request_id,
                &self.provider,
                &self.group_id,
                &self.account_id,
            ]
            .iter()
            .all(|s| s.as_ref().is_none_or(|s| s.len() <= 256))
    }
}

#[async_trait]
pub trait MonitoringStore: Send + Sync {
    async fn logs(&self, session: &IdentitySession, query: &LogQuery) -> IdentityResult<Value>;
    async fn config(&self, session: &IdentitySession) -> IdentityResult<LogConfig>;
    async fn save_config(
        &self,
        session: &IdentitySession,
        config: LogConfig,
    ) -> IdentityResult<LogConfig>;
    async fn cleanup(
        &self,
        session: &IdentitySession,
        before: DateTime<Utc>,
    ) -> IdentityResult<u64>;
    async fn resources(&self, session: &IdentitySession) -> IdentityResult<Value>;
    /// Internal worker only. Idempotent event IDs allow retry after uncertain commit.
    async fn ingest(&self, records: &[Value]) -> IdentityResult<LogConfig>;
}

pub trait RuntimeMonitoring: Send + Sync {
    fn snapshot(&self) -> Value;
}

#[cfg(test)]
mod tests {
    use super::*;
    #[test]
    fn log_queries_are_bounded() {
        let from = Utc::now();
        let mut q = LogQuery {
            from,
            to: from + chrono::Duration::hours(1),
            level: None,
            component: None,
            search: None,
            request_id: None,
            provider: None,
            group_id: None,
            account_id: None,
            page: None,
            page_size: None,
        };
        assert!(q.valid());
        q.page_size = Some(101);
        assert!(!q.valid());
        q.page_size = Some(20);
        q.level = Some("raw".into());
        assert!(!q.valid());
        q.level = None;
        q.to = q.from;
        assert!(!q.valid());
        q.to = q.from + chrono::Duration::days(91);
        assert!(!q.valid());
    }
    #[test]
    fn config_rejects_unbounded_retention_and_invalid_levels() {
        let mut cfg = LogConfig::default();
        assert!(cfg.valid());
        cfg.retention_days = 0;
        assert!(!cfg.valid());
        cfg.retention_days = 91;
        assert!(!cfg.valid());
        cfg.retention_days = 7;
        cfg.level = "TRACE".into();
        assert!(!cfg.valid());
    }
}
