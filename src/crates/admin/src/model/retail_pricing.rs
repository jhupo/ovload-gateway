//! Immutable retail documents, catalog observations and reasoned commands.

use chrono::{DateTime, Utc};
use ovload_core::{
    billing::{BillableUsage, RetailPriceBook, RetailPricePreview, RetailRateCard},
    routing::AccountGroupId,
};
use sha2::{Digest, Sha256};
use uuid::Uuid;

use super::identity_access::{IdentityError, IdentityResult};

#[derive(Debug, Clone, Copy, PartialEq, Eq)]
pub enum PriceBookState {
    Draft,
    Published,
    Retired,
}

impl PriceBookState {
    #[must_use]
    pub const fn as_str(self) -> &'static str {
        match self {
            Self::Draft => "draft",
            Self::Published => "published",
            Self::Retired => "retired",
        }
    }
}

#[derive(Debug, Clone)]
pub struct PriceCatalogState {
    pub generation: u64,
    pub published_revision_id: Option<Uuid>,
}

#[derive(Debug, Clone)]
pub struct PriceRevisionSummary {
    pub id: Uuid,
    pub revision_no: u64,
    pub row_version: u64,
    pub state: PriceBookState,
    pub checksum: Option<[u8; 32]>,
    pub effective_at: DateTime<Utc>,
    pub created_at: DateTime<Utc>,
    pub published_at: Option<DateTime<Utc>>,
    pub retired_at: Option<DateTime<Utc>>,
}

#[derive(Debug, Clone)]
pub struct PriceRevisionRecord {
    pub summary: PriceRevisionSummary,
    pub document: RetailPriceBook,
}

pub struct PriceRevisionDetail {
    pub catalog: PriceCatalogState,
    pub revision: PriceRevisionRecord,
}

pub struct PriceRevisionPage {
    pub catalog: PriceCatalogState,
    pub items: Vec<PriceRevisionSummary>,
    pub next_cursor: Option<u64>,
}

pub struct PriceRevisionMutation {
    pub detail: PriceRevisionDetail,
    pub replayed: bool,
}

pub struct PriceRevisionPreview {
    pub catalog: PriceCatalogState,
    pub revision: PriceRevisionSummary,
    pub selected_account_group_id: Option<AccountGroupId>,
    pub public_model_id: String,
    pub service_tier: String,
    pub calculation: RetailPricePreview,
}

pub struct EffectiveRetailPrice {
    pub catalog: PriceCatalogState,
    pub revision_id: Uuid,
    pub account_group_id: AccountGroupId,
    pub selected_account_group_id: Option<AccountGroupId>,
    pub public_model_id: String,
    pub service_tier: String,
    pub multiplier_bps: u32,
    pub rates: RetailRateCard,
}

pub struct EffectiveRetailPriceQuery {
    group: AccountGroupId,
    public_model: String,
    tier: String,
}

impl EffectiveRetailPriceQuery {
    pub fn new(group: AccountGroupId, public_model: String, tier: String) -> IdentityResult<Self> {
        if !bounded_text(&public_model, 256) || !bounded_text(&tier, 64) {
            return Err(IdentityError::Invalid);
        }
        Ok(Self {
            group,
            public_model,
            tier,
        })
    }

    #[must_use]
    pub const fn group(&self) -> &AccountGroupId {
        &self.group
    }

    #[must_use]
    pub fn public_model(&self) -> &str {
        &self.public_model
    }

    #[must_use]
    pub fn tier(&self) -> &str {
        &self.tier
    }
}

pub struct CreatePriceRevision {
    expected_catalog_generation: u64,
    document: RetailPriceBook,
    reason: String,
    idempotency_key: String,
}

impl CreatePriceRevision {
    pub fn new(
        expected_catalog_generation: u64,
        document: RetailPriceBook,
        reason: String,
        idempotency_key: String,
    ) -> IdentityResult<Self> {
        command_metadata(expected_catalog_generation, &reason, &idempotency_key)?;
        Ok(Self {
            expected_catalog_generation,
            document,
            reason,
            idempotency_key,
        })
    }

    #[must_use]
    pub const fn expected_catalog_generation(&self) -> u64 {
        self.expected_catalog_generation
    }

    #[must_use]
    pub const fn document(&self) -> &RetailPriceBook {
        &self.document
    }

    #[must_use]
    pub fn reason(&self) -> &str {
        &self.reason
    }

    #[must_use]
    pub fn idempotency_key(&self) -> &str {
        &self.idempotency_key
    }

    pub fn fingerprint(&self) -> IdentityResult<[u8; 32]> {
        let document = self
            .document
            .canonical_document()
            .map_err(|_| IdentityError::Invalid)?;
        fingerprint(&serde_json::json!({
            "expected_catalog_generation": self.expected_catalog_generation,
            "document": document,
            "reason": self.reason,
        }))
    }
}

pub struct ChangePriceRevision {
    id: Uuid,
    expected_row_version: u64,
    expected_catalog_generation: u64,
    reason: String,
    idempotency_key: String,
}

impl ChangePriceRevision {
    pub fn new(
        id: Uuid,
        expected_row_version: u64,
        expected_catalog_generation: u64,
        reason: String,
        idempotency_key: String,
    ) -> IdentityResult<Self> {
        command_metadata(expected_catalog_generation, &reason, &idempotency_key)?;
        positive_version(expected_row_version)?;
        if id.is_nil() {
            return Err(IdentityError::Invalid);
        }
        Ok(Self {
            id,
            expected_row_version,
            expected_catalog_generation,
            reason,
            idempotency_key,
        })
    }

    #[must_use]
    pub const fn id(&self) -> Uuid {
        self.id
    }

    #[must_use]
    pub const fn expected_row_version(&self) -> u64 {
        self.expected_row_version
    }

    #[must_use]
    pub const fn expected_catalog_generation(&self) -> u64 {
        self.expected_catalog_generation
    }

    #[must_use]
    pub fn reason(&self) -> &str {
        &self.reason
    }

    #[must_use]
    pub fn idempotency_key(&self) -> &str {
        &self.idempotency_key
    }

    pub fn fingerprint(&self) -> IdentityResult<[u8; 32]> {
        fingerprint(&serde_json::json!({
            "revision_id": self.id.to_string(),
            "expected_row_version": self.expected_row_version,
            "expected_catalog_generation": self.expected_catalog_generation,
            "reason": self.reason,
        }))
    }
}

pub struct PreviewRetailPrice {
    group: AccountGroupId,
    public_model: String,
    tier: String,
    usage: BillableUsage,
    multiplier_bps: u32,
}

impl PreviewRetailPrice {
    pub fn new(
        group: AccountGroupId,
        public_model: String,
        tier: String,
        usage: BillableUsage,
        multiplier_bps: u32,
    ) -> IdentityResult<Self> {
        if !bounded_text(&public_model, 256)
            || !bounded_text(&tier, 64)
            || multiplier_bps > 1_000_000
        {
            return Err(IdentityError::Invalid);
        }
        Ok(Self {
            group,
            public_model,
            tier,
            usage,
            multiplier_bps,
        })
    }

    #[must_use]
    pub const fn group(&self) -> &AccountGroupId {
        &self.group
    }

    #[must_use]
    pub fn public_model(&self) -> &str {
        &self.public_model
    }

    #[must_use]
    pub fn tier(&self) -> &str {
        &self.tier
    }

    #[must_use]
    pub const fn usage(&self) -> &BillableUsage {
        &self.usage
    }

    #[must_use]
    pub const fn multiplier_bps(&self) -> u32 {
        self.multiplier_bps
    }
}

fn command_metadata(generation: u64, reason: &str, key: &str) -> IdentityResult<()> {
    positive_version(generation)?;
    if !bounded_text(reason, 512)
        || key.is_empty()
        || key.len() > 128
        || !key.bytes().all(|byte| (0x21..=0x7e).contains(&byte))
    {
        return Err(IdentityError::Invalid);
    }
    Ok(())
}

fn positive_version(value: u64) -> IdentityResult<()> {
    if value == 0 || i64::try_from(value).is_err() {
        return Err(IdentityError::Invalid);
    }
    Ok(())
}

fn bounded_text(value: &str, max: usize) -> bool {
    !value.is_empty()
        && value.len() <= max
        && value.trim() == value
        && !value.chars().any(char::is_control)
}

fn fingerprint(value: &serde_json::Value) -> IdentityResult<[u8; 32]> {
    let encoded = serde_json::to_vec(value).map_err(|_| IdentityError::Invalid)?;
    Ok(Sha256::digest(encoded).into())
}
