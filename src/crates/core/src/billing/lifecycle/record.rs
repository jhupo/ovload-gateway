//! Validated customer-safe financial operation projections.

use chrono::{DateTime, Utc};
use serde::{Deserialize, Serialize};
use uuid::Uuid;

use super::{
    BillingOperationRef, RetailBillingError, RetailBillingResult, RetailBillingTarget, positive,
};
use crate::metering::Decimal;

#[derive(Debug, Clone, Copy, PartialEq, Eq, Serialize, Deserialize)]
#[serde(rename_all = "snake_case")]
pub enum BillingOperationState {
    Held,
    Settled,
    Released,
    ReconciliationRequired,
}

impl BillingOperationState {
    #[must_use]
    pub const fn as_str(self) -> &'static str {
        match self {
            Self::Held => "held",
            Self::Settled => "settled",
            Self::Released => "released",
            Self::ReconciliationRequired => "reconciliation_required",
        }
    }
}

/// Store hydration input. The public record is produced only after validating
/// conservation, lifecycle and timestamp invariants in `new`.
#[derive(Debug, Clone, PartialEq, Eq)]
pub struct BillingOperationSnapshot {
    pub operation: BillingOperationRef,
    pub target: RetailBillingTarget,
    pub price_revision_id: Uuid,
    pub state: BillingOperationState,
    pub maximum_charge: Decimal,
    pub initial_reservation: Decimal,
    pub reserved_amount: Decimal,
    pub held_amount: Decimal,
    pub settled_amount: Decimal,
    pub released_amount: Decimal,
    pub created_at: DateTime<Utc>,
    pub updated_at: DateTime<Utc>,
    pub expires_at: DateTime<Utc>,
    pub completed_at: Option<DateTime<Utc>>,
    pub row_version: u64,
}

/// Customer-safe financial projection with no provider or private evidence.
#[derive(Debug, Clone, PartialEq, Eq)]
pub struct BillingOperationRecord {
    snapshot: BillingOperationSnapshot,
}

impl BillingOperationRecord {
    pub fn new(snapshot: BillingOperationSnapshot) -> RetailBillingResult<Self> {
        positive(snapshot.row_version)?;
        let conserved = snapshot
            .held_amount
            .checked_add(snapshot.settled_amount)
            .and_then(|amount| amount.checked_add(snapshot.released_amount));
        if snapshot.price_revision_id.is_nil()
            || snapshot.maximum_charge > snapshot.initial_reservation
            || snapshot.initial_reservation > snapshot.reserved_amount
            || conserved != Some(snapshot.reserved_amount)
            || snapshot.created_at > snapshot.updated_at
            || snapshot.expires_at <= snapshot.created_at
            || snapshot.completed_at.is_some_and(|completed| {
                completed < snapshot.created_at || completed > snapshot.updated_at
            })
        {
            return Err(RetailBillingError::Invalid);
        }
        let valid = match snapshot.state {
            BillingOperationState::Held | BillingOperationState::ReconciliationRequired => {
                snapshot.held_amount == snapshot.reserved_amount
                    && snapshot.settled_amount == Decimal::ZERO
                    && snapshot.released_amount == Decimal::ZERO
                    && snapshot.completed_at.is_none()
            }
            BillingOperationState::Settled => {
                snapshot.held_amount == Decimal::ZERO && snapshot.completed_at.is_some()
            }
            BillingOperationState::Released => {
                snapshot.held_amount == Decimal::ZERO
                    && snapshot.settled_amount == Decimal::ZERO
                    && snapshot.completed_at.is_some()
            }
        };
        if !valid {
            return Err(RetailBillingError::Invalid);
        }
        Ok(Self { snapshot })
    }

    #[must_use]
    pub const fn operation(&self) -> &BillingOperationRef {
        &self.snapshot.operation
    }

    #[must_use]
    pub const fn target(&self) -> &RetailBillingTarget {
        &self.snapshot.target
    }

    #[must_use]
    pub const fn price_revision_id(&self) -> Uuid {
        self.snapshot.price_revision_id
    }

    #[must_use]
    pub const fn state(&self) -> BillingOperationState {
        self.snapshot.state
    }

    #[must_use]
    pub const fn maximum_charge(&self) -> Decimal {
        self.snapshot.maximum_charge
    }

    #[must_use]
    pub const fn initial_reservation(&self) -> Decimal {
        self.snapshot.initial_reservation
    }

    #[must_use]
    pub const fn reserved_amount(&self) -> Decimal {
        self.snapshot.reserved_amount
    }

    #[must_use]
    pub const fn held_amount(&self) -> Decimal {
        self.snapshot.held_amount
    }

    #[must_use]
    pub const fn settled_amount(&self) -> Decimal {
        self.snapshot.settled_amount
    }

    #[must_use]
    pub const fn released_amount(&self) -> Decimal {
        self.snapshot.released_amount
    }

    #[must_use]
    pub const fn created_at(&self) -> DateTime<Utc> {
        self.snapshot.created_at
    }

    #[must_use]
    pub const fn updated_at(&self) -> DateTime<Utc> {
        self.snapshot.updated_at
    }

    #[must_use]
    pub const fn expires_at(&self) -> DateTime<Utc> {
        self.snapshot.expires_at
    }

    #[must_use]
    pub const fn completed_at(&self) -> Option<DateTime<Utc>> {
        self.snapshot.completed_at
    }

    #[must_use]
    pub const fn row_version(&self) -> u64 {
        self.snapshot.row_version
    }
}
