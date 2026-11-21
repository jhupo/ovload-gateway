//! Immutable complete retail price books with deterministic content digests.

use std::cmp::Ordering;

use serde::Serialize;
use sha2::{Digest, Sha256};

use crate::{metering::Decimal, routing::AccountGroupId};

use super::{RateDenominator, RetailRateCard, UsageDimension};

const MAXIMUM_CARDS: usize = 128;
const MAXIMUM_MODEL_ID_BYTES: usize = 256;
const MAXIMUM_SERVICE_TIER_BYTES: usize = 64;

/// One complete platform card or one complete group replacement.
#[derive(Debug, Clone, PartialEq, Eq)]
pub struct RetailPriceCard {
    account_group_id: Option<AccountGroupId>,
    public_model_id: String,
    service_tier: String,
    rates: RetailRateCard,
}

impl RetailPriceCard {
    /// Creates an exact selector without normalizing model or tier identity.
    pub fn new(
        account_group_id: Option<AccountGroupId>,
        public_model_id: String,
        service_tier: String,
        rates: RetailRateCard,
    ) -> Result<Self, RetailPriceBookError> {
        validate_model_and_tier(&public_model_id, &service_tier)?;
        Ok(Self {
            account_group_id,
            public_model_id,
            service_tier,
            rates,
        })
    }

    #[must_use]
    pub const fn account_group_id(&self) -> Option<&AccountGroupId> {
        self.account_group_id.as_ref()
    }

    #[must_use]
    pub fn public_model_id(&self) -> &str {
        &self.public_model_id
    }

    #[must_use]
    pub fn service_tier(&self) -> &str {
        &self.service_tier
    }

    #[must_use]
    pub const fn rates(&self) -> &RetailRateCard {
        &self.rates
    }

    fn selector_cmp(&self, other: &Self) -> Ordering {
        (
            self.account_group_id.as_ref().map(AccountGroupId::as_str),
            self.public_model_id.as_str(),
            self.service_tier.as_str(),
        )
            .cmp(&(
                other.account_group_id.as_ref().map(AccountGroupId::as_str),
                other.public_model_id.as_str(),
                other.service_tier.as_str(),
            ))
    }
}

/// A bounded immutable document for the always-active UTC time band and the
/// complete `[0, unbounded)` context interval.
#[derive(Debug, Clone, PartialEq, Eq)]
pub struct RetailPriceBook {
    cards: Vec<RetailPriceCard>,
}

impl RetailPriceBook {
    /// Validates complete cards and replacement coverage, then freezes their
    /// canonical order. No per-component inheritance is allowed.
    pub fn new(mut cards: Vec<RetailPriceCard>) -> Result<Self, RetailPriceBookError> {
        if cards.is_empty() || cards.len() > MAXIMUM_CARDS {
            return Err(RetailPriceBookError::InvalidCardCount);
        }
        cards.sort_by(RetailPriceCard::selector_cmp);
        if cards
            .windows(2)
            .any(|pair| pair[0].selector_cmp(&pair[1]).is_eq())
        {
            return Err(RetailPriceBookError::DuplicateSelector);
        }
        for group_card in cards.iter().filter(|card| card.account_group_id.is_some()) {
            let platform_card = cards
                .iter()
                .find(|card| {
                    card.account_group_id.is_none()
                        && card.public_model_id == group_card.public_model_id
                        && card.service_tier == group_card.service_tier
                })
                .ok_or(RetailPriceBookError::MissingPlatformCard)?;
            let group_tiers = cards
                .iter()
                .filter(|card| {
                    card.account_group_id == group_card.account_group_id
                        && card.public_model_id == group_card.public_model_id
                })
                .map(|card| card.service_tier.as_str());
            let platform_tiers = cards
                .iter()
                .filter(|card| {
                    card.account_group_id.is_none()
                        && card.public_model_id == group_card.public_model_id
                })
                .map(|card| card.service_tier.as_str());
            if !group_tiers.eq(platform_tiers) {
                return Err(RetailPriceBookError::IncompleteGroupSelectors);
            }
            if !group_card
                .rates
                .rates()
                .map(|rate| rate.dimension())
                .eq(platform_card.rates.rates().map(|rate| rate.dimension()))
            {
                return Err(RetailPriceBookError::IncompleteGroupOverride);
            }
        }
        Ok(Self { cards })
    }

    #[must_use]
    pub fn cards(&self) -> &[RetailPriceCard] {
        &self.cards
    }

    /// Selects an exact group replacement or the complete platform card.
    pub fn select(
        &self,
        account_group_id: &AccountGroupId,
        public_model_id: &str,
        service_tier: &str,
    ) -> Result<&RetailPriceCard, RetailPriceBookError> {
        validate_model_and_tier(public_model_id, service_tier)?;
        let has_group_override = self.cards.iter().any(|card| {
            card.account_group_id.as_ref() == Some(account_group_id)
                && card.public_model_id == public_model_id
        });
        let selected_group = has_group_override.then_some(account_group_id);
        self.cards
            .iter()
            .find(|card| {
                card.account_group_id.as_ref() == selected_group
                    && card.public_model_id == public_model_id
                    && card.service_tier == service_tier
            })
            .ok_or(if has_group_override {
                RetailPriceBookError::MissingGroupSelector
            } else {
                RetailPriceBookError::PriceUnavailable
            })
    }

    /// Produces the versioned digest document. Database identities, mutation
    /// state and timestamps are deliberately absent from tariff content.
    pub fn canonical_document(&self) -> Result<serde_json::Value, RetailPriceBookError> {
        let cards = self
            .cards
            .iter()
            .map(|card| CanonicalPriceCard {
                account_group_id: card.account_group_id.as_ref().map(AccountGroupId::as_str),
                public_model_id: &card.public_model_id,
                service_tier: &card.service_tier,
                rates: card
                    .rates
                    .rates()
                    .map(|rate| CanonicalRate {
                        dimension: rate.dimension(),
                        unit: rate.denominator(),
                        rate_usd_per_unit: rate.usd_per_unit().canonical(),
                        billable: rate.usd_per_unit() != Decimal::ZERO,
                    })
                    .collect(),
            })
            .collect();
        serde_json::to_value(CanonicalPriceBook {
            format: "ovload.retail_price_book.v1",
            currency: "USD",
            scale: 10,
            time_band_id: "always",
            timezone: "UTC",
            weekdays: [1, 2, 3, 4, 5, 6, 7],
            local_start_minute: 0,
            local_end_minute: 1440,
            context_min_tokens: 0,
            context_max_tokens: None,
            cards,
        })
        .map_err(RetailPriceBookError::Serialization)
    }

    /// Computes SHA-256 over the canonical document's compact JSON bytes.
    pub fn checksum(&self) -> Result<[u8; 32], RetailPriceBookError> {
        let bytes = serde_json::to_vec(&self.canonical_document()?)
            .map_err(RetailPriceBookError::Serialization)?;
        Ok(Sha256::digest(bytes).into())
    }
}

#[derive(Debug, thiserror::Error)]
pub enum RetailPriceBookError {
    #[error("price book must contain between 1 and 128 complete cards")]
    InvalidCardCount,
    #[error("public model identity is invalid")]
    InvalidPublicModelId,
    #[error("service tier identity is invalid")]
    InvalidServiceTier,
    #[error("price book contains a duplicate group, model and tier selector")]
    DuplicateSelector,
    #[error("group replacement requires a matching platform model and tier card")]
    MissingPlatformCard,
    #[error("group model replacement must cover exactly the platform model's service tiers")]
    IncompleteGroupSelectors,
    #[error("group replacement must price exactly the platform card's billable dimensions")]
    IncompleteGroupOverride,
    #[error("group model replacement has no card for the requested service tier")]
    MissingGroupSelector,
    #[error("requested model and service tier have no retail price")]
    PriceUnavailable,
    #[error("retail price document could not be serialized")]
    Serialization(#[source] serde_json::Error),
}

fn validate_model_and_tier(
    public_model_id: &str,
    service_tier: &str,
) -> Result<(), RetailPriceBookError> {
    if !valid_identifier(public_model_id, MAXIMUM_MODEL_ID_BYTES) {
        return Err(RetailPriceBookError::InvalidPublicModelId);
    }
    if !valid_identifier(service_tier, MAXIMUM_SERVICE_TIER_BYTES) {
        return Err(RetailPriceBookError::InvalidServiceTier);
    }
    Ok(())
}

fn valid_identifier(value: &str, maximum_bytes: usize) -> bool {
    !value.is_empty()
        && value.len() <= maximum_bytes
        && value.trim() == value
        && !value.chars().any(char::is_control)
}

#[derive(Serialize)]
struct CanonicalPriceBook<'a> {
    format: &'static str,
    currency: &'static str,
    scale: u8,
    time_band_id: &'static str,
    timezone: &'static str,
    weekdays: [u8; 7],
    local_start_minute: u16,
    local_end_minute: u16,
    context_min_tokens: u64,
    context_max_tokens: Option<u64>,
    cards: Vec<CanonicalPriceCard<'a>>,
}

#[derive(Serialize)]
struct CanonicalPriceCard<'a> {
    account_group_id: Option<&'a str>,
    public_model_id: &'a str,
    service_tier: &'a str,
    rates: Vec<CanonicalRate>,
}

#[derive(Serialize)]
struct CanonicalRate {
    dimension: UsageDimension,
    unit: RateDenominator,
    rate_usd_per_unit: String,
    billable: bool,
}
