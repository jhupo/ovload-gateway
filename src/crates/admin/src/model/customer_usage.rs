//! Safe customer-owned execution facts, independent of procurement accounting.

use chrono::{DateTime, NaiveDate, Utc};
use ovload_core::{
    billing::BillingOperationState,
    engine::{ExecutionOutcome, ModelRequestId},
    metering::Decimal,
    policy::ClientApiKeyId,
    routing::PublicModelId,
};

use super::identity_access::{IdentityError, IdentityResult};

#[derive(Debug, Clone, serde::Serialize)]
pub struct UserUsageRanking {
    pub user_id: String,
    pub tenant_id: String,
    pub user: String,
    pub email: String,
    pub requests: i64,
    pub tokens: Option<i64>,
    pub charge_usd: Option<String>,
    pub cost_usd: Option<String>,
}

#[derive(Debug, Clone)]
pub struct CustomerUsageFilter {
    from: DateTime<Utc>,
    to: DateTime<Utc>,
    api_key_id: Option<ClientApiKeyId>,
    public_model_id: Option<PublicModelId>,
    outcome: Option<ExecutionOutcome>,
}

impl CustomerUsageFilter {
    pub fn new(
        from: DateTime<Utc>,
        to: DateTime<Utc>,
        api_key_id: Option<ClientApiKeyId>,
        public_model_id: Option<PublicModelId>,
        outcome: Option<ExecutionOutcome>,
    ) -> IdentityResult<Self> {
        if from >= to || to.signed_duration_since(from) > chrono::Duration::days(31) {
            return Err(IdentityError::Invalid);
        }
        Ok(Self {
            from,
            to,
            api_key_id,
            public_model_id,
            outcome,
        })
    }

    #[must_use]
    pub const fn from(&self) -> DateTime<Utc> {
        self.from
    }
    #[must_use]
    pub const fn to(&self) -> DateTime<Utc> {
        self.to
    }
    #[must_use]
    pub fn api_key_id(&self) -> Option<&ClientApiKeyId> {
        self.api_key_id.as_ref()
    }
    #[must_use]
    pub fn public_model_id(&self) -> Option<&PublicModelId> {
        self.public_model_id.as_ref()
    }
    #[must_use]
    pub const fn outcome(&self) -> Option<ExecutionOutcome> {
        self.outcome
    }
}

#[derive(Debug, Clone, PartialEq, Eq)]
pub struct CustomerUsageRecord {
    pub request_id: ModelRequestId,
    pub api_key_id: ClientApiKeyId,
    pub public_model_id: Option<PublicModelId>,
    pub operation: String,
    pub outcome: ExecutionOutcome,
    pub client_status_code: Option<u16>,
    pub started_at: DateTime<Utc>,
    pub completed_at: Option<DateTime<Utc>>,
    pub input_tokens: Option<u64>,
    pub output_tokens: Option<u64>,
    pub cached_input_tokens: Option<u64>,
    pub cache_write_input_tokens: Option<u64>,
    pub reasoning_output_tokens: Option<u64>,
    pub total_tokens: Option<u64>,
    pub first_token_ms: Option<u64>,
    pub latency_ms: Option<u64>,
    pub retail_charge_usd: Option<Decimal>,
    pub retail_state: Option<BillingOperationState>,
}

#[derive(Debug, Clone, PartialEq, Eq)]
pub struct CustomerUsagePage {
    pub items: Vec<CustomerUsageRecord>,
    pub next_cursor: Option<ModelRequestId>,
}

#[derive(Debug, Clone, Default, PartialEq, Eq)]
pub struct CustomerUsageSummary {
    pub requests: u64,
    pub succeeded: u64,
    pub failed: u64,
    pub cancelled: u64,
    pub incomplete: u64,
    pub running: u64,
    pub usage_reported_requests: u64,
    pub input_tokens: Option<u64>,
    pub output_tokens: Option<u64>,
    pub cached_input_tokens: Option<u64>,
    pub cache_write_input_tokens: Option<u64>,
    pub reasoning_output_tokens: Option<u64>,
    pub total_tokens: Option<u64>,
    pub settled_requests: u64,
    pub retail_charge_usd: Option<Decimal>,
}

#[derive(Debug, Clone, PartialEq, Eq)]
pub struct CustomerUsageDay {
    pub date: NaiveDate,
    pub summary: CustomerUsageSummary,
}
