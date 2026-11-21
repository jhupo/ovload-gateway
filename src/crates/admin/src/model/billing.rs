//! Tenant wallet values and validated operator credit commands.

use chrono::{DateTime, Utc};
use ovload_core::{
    access::{ManagementPrincipalId, TenantId},
    metering::Decimal,
};

use super::identity_access::IdentityError;

const MAXIMUM_REASON_BYTES: usize = 512;
const MAXIMUM_IDEMPOTENCY_KEY_BYTES: usize = 128;

/// One committed operator credit; financial commands and credentials are omitted.
#[derive(Debug, Clone, PartialEq, Eq)]
pub struct WalletCreditEntry {
    pub ledger_entry_id: uuid::Uuid,
    pub tenant_id: TenantId,
    pub principal_id: ManagementPrincipalId,
    pub amount_usd: Decimal,
    pub reason: String,
    pub created_at: DateTime<Utc>,
}

/// A bounded credit-history page and its exact lifetime operator-funding sum.
#[derive(Debug, Clone, PartialEq, Eq)]
pub struct WalletCreditPage {
    pub items: Vec<WalletCreditEntry>,
    pub next_cursor: Option<uuid::Uuid>,
    /// PostgreSQL's unrounded SUM may exceed one wallet's numeric(20,10) range.
    pub total_credited_usd: String,
}

/// One tenant's USD balance projection and outstanding reservations.
#[derive(Debug, Clone, PartialEq, Eq)]
pub struct WalletBalance {
    tenant_id: TenantId,
    settled_usd: Decimal,
    held_usd: Decimal,
    available_usd: Decimal,
}

impl WalletBalance {
    /// Creates a balance only when held and available amounts reconcile exactly.
    pub fn new(
        tenant_id: TenantId,
        settled_usd: Decimal,
        held_usd: Decimal,
        available_usd: Decimal,
    ) -> Result<Self, IdentityError> {
        let expected_available = (held_usd <= settled_usd)
            .then(|| Decimal::from_scaled(settled_usd.scaled() - held_usd.scaled()).ok())
            .flatten();
        if expected_available != Some(available_usd) {
            return Err(IdentityError::Unavailable);
        }
        Ok(Self {
            tenant_id,
            settled_usd,
            held_usd,
            available_usd,
        })
    }

    #[must_use]
    pub const fn tenant_id(&self) -> TenantId {
        self.tenant_id
    }

    #[must_use]
    pub const fn settled_usd(&self) -> Decimal {
        self.settled_usd
    }

    #[must_use]
    pub const fn held_usd(&self) -> Decimal {
        self.held_usd
    }

    #[must_use]
    pub const fn available_usd(&self) -> Decimal {
        self.available_usd
    }
}

/// An audited, idempotent operator credit to a tenant's USD wallet.
#[derive(Debug, Clone, PartialEq, Eq)]
pub struct CreditTenantWallet {
    paid_cny: Option<String>,
    tenant_id: TenantId,
    amount_usd: Decimal,
    reason: String,
    idempotency_key: String,
}

impl CreditTenantWallet {
    /// Validates the facts required for a durable ledger credit.
    pub fn new(
        tenant_id: TenantId,
        amount_usd: Decimal,
        reason: String,
        idempotency_key: String,
    ) -> Result<Self, IdentityError> {
        if amount_usd == Decimal::ZERO
            || !valid_bounded_text(&reason, MAXIMUM_REASON_BYTES)
            || !valid_idempotency_key(&idempotency_key)
        {
            return Err(IdentityError::Invalid);
        }
        Ok(Self {
            tenant_id,
            amount_usd,
            reason,
            idempotency_key,
            paid_cny: None,
        })
    }

    pub fn with_paid_cny(mut self, paid: Option<String>) -> Result<Self, IdentityError> {
        if let Some(value) = &paid {
            let parts = value.split('.').collect::<Vec<_>>();
            if parts.len() > 2
                || parts[0].is_empty()
                || parts[0].len() > 8
                || !parts.iter().all(|s| s.bytes().all(|c| c.is_ascii_digit()))
                || parts.get(1).is_some_and(|s| s.is_empty() || s.len() > 2)
            {
                return Err(IdentityError::Invalid);
            }
            let amount = value
                .parse::<Decimal>()
                .map_err(|_| IdentityError::Invalid)?;
            if amount == Decimal::ZERO {
                return Err(IdentityError::Invalid);
            }
        }
        self.paid_cny = paid;
        Ok(self)
    }
    pub fn paid_cny(&self) -> Option<&str> {
        self.paid_cny.as_deref()
    }

    #[must_use]
    pub const fn tenant_id(&self) -> TenantId {
        self.tenant_id
    }

    #[must_use]
    pub const fn amount_usd(&self) -> Decimal {
        self.amount_usd
    }

    #[must_use]
    pub fn reason(&self) -> &str {
        &self.reason
    }

    #[must_use]
    pub fn idempotency_key(&self) -> &str {
        &self.idempotency_key
    }
}

/// Immutable outcome returned for both the first credit and an identical replay.
#[derive(Debug, Clone, PartialEq, Eq)]
pub struct WalletCreditReceipt {
    ledger_entry_id: uuid::Uuid,
    tenant_id: TenantId,
    amount_usd: Decimal,
    resulting_balance: WalletBalance,
    created_at: DateTime<Utc>,
}

impl WalletCreditReceipt {
    pub fn new(
        ledger_entry_id: uuid::Uuid,
        tenant_id: TenantId,
        amount_usd: Decimal,
        resulting_balance: WalletBalance,
        created_at: DateTime<Utc>,
    ) -> Result<Self, IdentityError> {
        if amount_usd == Decimal::ZERO
            || tenant_id != resulting_balance.tenant_id()
            || resulting_balance.settled_usd().scaled() < amount_usd.scaled()
        {
            return Err(IdentityError::Unavailable);
        }
        Ok(Self {
            ledger_entry_id,
            tenant_id,
            amount_usd,
            resulting_balance,
            created_at,
        })
    }

    #[must_use]
    pub const fn ledger_entry_id(&self) -> uuid::Uuid {
        self.ledger_entry_id
    }

    #[must_use]
    pub const fn tenant_id(&self) -> TenantId {
        self.tenant_id
    }

    #[must_use]
    pub const fn amount_usd(&self) -> Decimal {
        self.amount_usd
    }

    #[must_use]
    pub const fn resulting_balance(&self) -> &WalletBalance {
        &self.resulting_balance
    }

    #[must_use]
    pub fn created_at(&self) -> &DateTime<Utc> {
        &self.created_at
    }
}

fn valid_bounded_text(value: &str, maximum_bytes: usize) -> bool {
    !value.is_empty()
        && value.len() <= maximum_bytes
        && value.trim() == value
        && !value.chars().any(char::is_control)
}

fn valid_idempotency_key(value: &str) -> bool {
    !value.is_empty()
        && value.len() <= MAXIMUM_IDEMPOTENCY_KEY_BYTES
        && value.bytes().all(|byte| (0x21..=0x7e).contains(&byte))
}
