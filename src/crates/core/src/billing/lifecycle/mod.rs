//! Durable funds contracts. These commands do not activate model execution.

mod commands;
mod facts;
mod record;

pub use commands::{
    BeginRetailDispatch, BillingDispatchEvidence, BillingUnresolvedReason, CompleteRetailBilling,
    RecordRetailDispatch, ReserveRetailBilling, RetailBillingCompletion, RetailDispatchAttempt,
    RetailUsageAuthority, RetailUsageEvidence,
};
pub use record::{BillingOperationRecord, BillingOperationSnapshot, BillingOperationState};

use serde_json::{Value, json};

use crate::{
    access::{TenantId, UserId},
    engine::{ModelRequestId, authentication::ModelKeyIdentity},
    policy::ClientApiKeyId,
    routing::{AccountGroupId, PublicModelId},
};

pub const RETAIL_RESERVATION_TTL_SECONDS: i64 = 30 * 60;

pub type RetailBillingResult<T> = Result<T, RetailBillingError>;

#[derive(Debug, Clone, Copy, PartialEq, Eq, thiserror::Error)]
pub enum RetailBillingError {
    #[error("retail billing command or stored facts are invalid")]
    Invalid,
    #[error("retail billing operation is not authorized")]
    Unauthorized,
    #[error("retail billing operation was not found")]
    NotFound,
    #[error("retail billing command conflicts with durable state")]
    Conflict,
    #[error("a complete published retail price is unavailable")]
    PriceUnavailable,
    #[error("available funds cannot cover the reservation")]
    InsufficientFunds,
    #[error("retail billing requires reconciliation")]
    ReconciliationRequired,
    #[error("retail billing authority is unavailable")]
    Unavailable,
}

/// Frozen ownership only; completion must not require current key generations.
#[derive(Debug, Clone, PartialEq, Eq)]
pub struct BillingOperationRef {
    operation_id: ModelRequestId,
    tenant_id: TenantId,
    user_id: UserId,
    key_id: ClientApiKeyId,
}

impl BillingOperationRef {
    pub fn new(
        operation_id: ModelRequestId,
        tenant_id: TenantId,
        user_id: UserId,
        key_id: ClientApiKeyId,
    ) -> RetailBillingResult<Self> {
        if tenant_id.as_uuid().is_nil()
            || user_id.as_uuid().is_nil()
            || !bounded_text(operation_id.as_str(), 128)
            || !bounded_text(key_id.as_str(), 128)
        {
            return Err(RetailBillingError::Invalid);
        }
        Ok(Self {
            operation_id,
            tenant_id,
            user_id,
            key_id,
        })
    }

    #[must_use]
    pub const fn operation_id(&self) -> &ModelRequestId {
        &self.operation_id
    }

    #[must_use]
    pub const fn tenant_id(&self) -> TenantId {
        self.tenant_id
    }

    #[must_use]
    pub const fn user_id(&self) -> UserId {
        self.user_id
    }

    #[must_use]
    pub const fn key_id(&self) -> &ClientApiKeyId {
        &self.key_id
    }

    fn facts(&self) -> Value {
        json!({
            "operation_id": self.operation_id.as_str(),
            "tenant_id": self.tenant_id.as_uuid().to_string(),
            "user_id": self.user_id.as_uuid().to_string(),
            "key_id": self.key_id.as_str(),
        })
    }

    fn matches(&self, identity: &ModelKeyIdentity) -> bool {
        self.tenant_id == identity.tenant_id
            && self.user_id == identity.user_id
            && self.key_id == identity.key_id
    }
}

#[derive(Debug, Clone, PartialEq, Eq)]
pub struct RetailBillingTarget {
    group: AccountGroupId,
    public_model: PublicModelId,
    service_tier: String,
}

impl RetailBillingTarget {
    pub fn new(
        group: AccountGroupId,
        public_model: PublicModelId,
        service_tier: String,
    ) -> RetailBillingResult<Self> {
        if !bounded_text(public_model.as_str(), 256) || !bounded_text(&service_tier, 64) {
            return Err(RetailBillingError::Invalid);
        }
        Ok(Self {
            group,
            public_model,
            service_tier,
        })
    }

    #[must_use]
    pub const fn group(&self) -> &AccountGroupId {
        &self.group
    }

    #[must_use]
    pub const fn public_model(&self) -> &PublicModelId {
        &self.public_model
    }

    #[must_use]
    pub fn service_tier(&self) -> &str {
        &self.service_tier
    }

    fn facts(&self) -> Value {
        json!({
            "account_group_id": self.group.as_str(),
            "public_model_id": self.public_model.as_str(),
            "service_tier": self.service_tier,
        })
    }
}

/// Financial authority is durable and independent of observation writes.
/// Reserve and dispatch require live ownership checks inside their transaction;
/// completion uses frozen ownership so revocation cannot strand existing funds.
#[async_trait::async_trait]
pub trait RetailBillingPort: Send + Sync {
    /// Select current prices and reserve max(twice the last real charge, Q).
    /// Repeating an operation requires the same fingerprint and live authority.
    async fn reserve(
        &self,
        command: ReserveRetailBilling,
    ) -> RetailBillingResult<BillingOperationRecord>;

    /// Commit a fresh intent before polling a cold provider stream. Duplicate
    /// intents always conflict; a lost acknowledgment never permits a resend.
    async fn begin_dispatch(&self, command: BeginRetailDispatch) -> RetailBillingResult<()>;

    /// Append idempotent evidence. Ambiguous may resolve; final sent/not-sent
    /// evidence cannot contradict prior final evidence or revert to ambiguous.
    async fn record_dispatch(&self, command: RecordRetailDispatch) -> RetailBillingResult<()>;

    /// Persist one receipt/debit, proven release, or retained-hold case. Missing
    /// usage and expired reservations never prove a zero charge or nonexecution.
    async fn complete(
        &self,
        command: CompleteRetailBilling,
    ) -> RetailBillingResult<BillingOperationRecord>;
}

fn positive(value: u64) -> RetailBillingResult<()> {
    if value == 0 || i64::try_from(value).is_err() {
        return Err(RetailBillingError::Invalid);
    }
    Ok(())
}

fn bounded_text(value: &str, maximum: usize) -> bool {
    !value.is_empty()
        && value.len() <= maximum
        && value.trim() == value
        && !value.chars().any(char::is_control)
}
