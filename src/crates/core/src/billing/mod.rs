//! Portable customer retail billing contracts and checked calculations.

mod lifecycle;
mod pricebook;
pub use lifecycle::{
    BeginRetailDispatch, BillingDispatchEvidence, BillingOperationRecord, BillingOperationRef,
    BillingOperationSnapshot, BillingOperationState, BillingUnresolvedReason,
    CompleteRetailBilling, RETAIL_RESERVATION_TTL_SECONDS, RecordRetailDispatch,
    ReserveRetailBilling, RetailBillingCompletion, RetailBillingError, RetailBillingPort,
    RetailBillingResult, RetailBillingTarget, RetailDispatchAttempt, RetailUsageAuthority,
    RetailUsageEvidence,
};
pub use pricebook::{RetailPriceBook, RetailPriceBookError, RetailPriceCard};

use std::collections::BTreeMap;

use num_bigint::BigInt;
use num_rational::BigRational;
use num_traits::{ToPrimitive, Zero};

use crate::{metering::Decimal, validation::MeteringError};

const TOKEN_DENOMINATOR: u64 = 1_000_000;
const BASIS_POINT_DENOMINATOR: u64 = 10_000;
const USD_DECIMAL_SCALE: u64 = 10_000_000_000;

/// A customer-billable usage dimension. Text input is split into disjoint
/// cache classes before it reaches the calculator.
#[derive(
    Debug, Clone, Copy, PartialEq, Eq, PartialOrd, Ord, Hash, serde::Serialize, serde::Deserialize,
)]
#[serde(rename_all = "snake_case")]
pub enum UsageDimension {
    #[serde(rename = "input_tokens")]
    UncachedInputTokens,
    #[serde(rename = "cache_read_tokens")]
    CacheReadInputTokens,
    #[serde(rename = "cache_write_tokens_5m")]
    CacheWriteInputTokens5m,
    #[serde(rename = "cache_write_tokens_1h")]
    CacheWriteInputTokens1h,
    OutputTokens,
    AudioInputTokens,
    AudioOutputTokens,
    ImageInput,
    ImageOutput,
    AudioInputSeconds,
    AudioOutputSeconds,
    SearchCalls,
    ToolCalls,
    RequestFee,
}

impl UsageDimension {
    fn denominator(self) -> RateDenominator {
        match self {
            Self::UncachedInputTokens
            | Self::CacheReadInputTokens
            | Self::CacheWriteInputTokens5m
            | Self::CacheWriteInputTokens1h
            | Self::OutputTokens
            | Self::AudioInputTokens
            | Self::AudioOutputTokens => RateDenominator::PerMillionTokens,
            Self::ImageInput | Self::ImageOutput => RateDenominator::PerImage,
            Self::AudioInputSeconds | Self::AudioOutputSeconds => RateDenominator::PerAudioSecond,
            Self::SearchCalls | Self::ToolCalls => RateDenominator::PerCall,
            Self::RequestFee => RateDenominator::PerRequest,
        }
    }

    const fn is_text_input(self) -> bool {
        matches!(
            self,
            Self::UncachedInputTokens
                | Self::CacheReadInputTokens
                | Self::CacheWriteInputTokens5m
                | Self::CacheWriteInputTokens1h
        )
    }
}

/// Explicit denominator used by a USD rate. Valid combinations are enforced
/// by [`RetailRate::new`].
#[derive(
    Debug, Clone, Copy, PartialEq, Eq, PartialOrd, Ord, Hash, serde::Serialize, serde::Deserialize,
)]
#[serde(rename_all = "snake_case")]
pub enum RateDenominator {
    #[serde(rename = "per_1m_tokens")]
    PerMillionTokens,
    PerImage,
    PerAudioSecond,
    PerCall,
    PerRequest,
}

impl RateDenominator {
    const fn quantity_scale(self) -> u64 {
        match self {
            Self::PerMillionTokens => TOKEN_DENOMINATOR,
            Self::PerImage | Self::PerAudioSecond | Self::PerCall | Self::PerRequest => 1,
        }
    }
}

/// One nonnegative USD rate with an explicit billable unit.
#[derive(Debug, Clone, Copy, PartialEq, Eq)]
pub struct RetailRate {
    dimension: UsageDimension,
    denominator: RateDenominator,
    usd_per_unit: Decimal,
}

impl RetailRate {
    /// Returns an exact unit rate after applying basis points, without amount rounding.
    pub fn effective_unit_usd(self, multiplier_bps: u32) -> Result<String, RetailPricingError> {
        if multiplier_bps > 1_000_000 {
            return Err(RetailPricingError::InvalidMultiplier);
        }
        let scaled = self.usd_per_unit.scaled() * u128::from(multiplier_bps);
        const SCALE: u128 = 100_000_000_000_000;
        let integer = scaled / SCALE;
        let fraction = scaled % SCALE;
        if fraction == 0 {
            return Ok(integer.to_string());
        }
        let fraction = format!("{fraction:014}");
        Ok(format!("{integer}.{}", fraction.trim_end_matches('0')))
    }

    /// Creates a USD rate such as USD per million tokens or USD per image.
    ///
    /// # Errors
    ///
    /// Returns `InvalidRateUnit` when the denominator does not match the dimension.
    pub fn new(
        dimension: UsageDimension,
        denominator: RateDenominator,
        usd_per_unit: Decimal,
    ) -> Result<Self, RetailPricingError> {
        if denominator != dimension.denominator() {
            return Err(RetailPricingError::InvalidRateUnit);
        }
        Ok(Self {
            dimension,
            denominator,
            usd_per_unit,
        })
    }

    #[must_use]
    pub const fn dimension(self) -> UsageDimension {
        self.dimension
    }

    #[must_use]
    pub const fn denominator(self) -> RateDenominator {
        self.denominator
    }

    #[must_use]
    pub const fn usd_per_unit(self) -> Decimal {
        self.usd_per_unit
    }
}

/// Complete unbanded card for the text token dimensions and any additional
/// dimensions that this published card explicitly prices.
#[derive(Debug, Clone, PartialEq, Eq)]
pub struct RetailRateCard {
    rates: BTreeMap<UsageDimension, RetailRate>,
}

impl RetailRateCard {
    /// Creates a complete card. Every text-token dimension is required even
    /// when its explicit USD rate is zero.
    ///
    /// # Errors
    ///
    /// Returns an error for duplicate or missing required dimensions.
    pub fn new(rates: impl IntoIterator<Item = RetailRate>) -> Result<Self, RetailPricingError> {
        let mut indexed = BTreeMap::new();
        for rate in rates {
            if indexed.insert(rate.dimension, rate).is_some() {
                return Err(RetailPricingError::DuplicateDimension);
            }
        }
        for dimension in [
            UsageDimension::UncachedInputTokens,
            UsageDimension::CacheReadInputTokens,
            UsageDimension::CacheWriteInputTokens5m,
            UsageDimension::CacheWriteInputTokens1h,
            UsageDimension::OutputTokens,
        ] {
            if !indexed.contains_key(&dimension) {
                return Err(RetailPricingError::MissingRate);
            }
        }
        Ok(Self { rates: indexed })
    }

    pub fn rates(&self) -> impl Iterator<Item = RetailRate> + '_ {
        self.rates.values().copied()
    }

    /// Quotes the maximum charge under frozen, enforced usage bounds.
    ///
    /// # Errors
    ///
    /// A required billable dimension without a rate, invalid multiplier, or
    /// arithmetic overflow rejects the quote.
    pub fn quote(
        &self,
        bounds: &BillableUsageBounds,
        multiplier_bps: u32,
    ) -> Result<RetailQuote, RetailPricingError> {
        let quantities = bounds.maximum_quantities();
        let exact = self.calculate(&quantities, multiplier_bps)?;
        let maximum_charge =
            Decimal::from_scaled(round_up(exact)?).map_err(RetailPricingError::MoneyRange)?;
        Ok(RetailQuote {
            maximum_charge,
            multiplier_bps,
            quantities,
        })
    }

    /// Settles a complete authoritative usage receipt using one final
    /// half-to-even rounding after all exact components are summed.
    ///
    /// # Errors
    ///
    /// Usage outside its frozen bounds or missing tariff rows cannot settle.
    pub fn settle(
        &self,
        usage: &BillableUsage,
        bounds: &BillableUsageBounds,
        multiplier_bps: u32,
    ) -> Result<RetailCharge, RetailPricingError> {
        bounds.validate_usage(usage)?;
        Ok(RetailCharge {
            amount: self.preview(usage, multiplier_bps)?.amount(),
        })
    }

    /// Explains sample usage with exact USD components and one half-to-even
    /// rounding of the total. This does not verify bounds or provider evidence,
    /// reserve funds, or authorize dispatch.
    pub fn preview(
        &self,
        usage: &BillableUsage,
        multiplier_bps: u32,
    ) -> Result<RetailPricePreview, RetailPricingError> {
        let exact = self.calculate(&usage.quantities, multiplier_bps)?;
        let amount = Decimal::from_scaled(round_half_even(exact)?)
            .map_err(RetailPricingError::MoneyRange)?;
        let components = self
            .rates()
            .map(|rate| {
                let quantity = *usage
                    .quantities
                    .get(&rate.dimension)
                    .ok_or(RetailPricingError::IncompleteUsage)?;
                let exact_usd = exact_component_scaled(rate, quantity, multiplier_bps)
                    / BigInt::from(USD_DECIMAL_SCALE);
                Ok(RetailPriceComponent {
                    rate,
                    quantity,
                    exact_usd_numerator: exact_usd.numer().to_string(),
                    exact_usd_denominator: exact_usd.denom().to_string(),
                })
            })
            .collect::<Result<Vec<_>, RetailPricingError>>()?;
        Ok(RetailPricePreview {
            amount,
            multiplier_bps,
            components,
        })
    }

    fn calculate(
        &self,
        quantities: &BTreeMap<UsageDimension, u64>,
        multiplier_bps: u32,
    ) -> Result<BigRational, RetailPricingError> {
        if multiplier_bps > 1_000_000 {
            return Err(RetailPricingError::InvalidMultiplier);
        }
        if self.rates.len() != quantities.len()
            || self
                .rates
                .keys()
                .any(|dimension| !quantities.contains_key(dimension))
        {
            return Err(RetailPricingError::IncompleteBounds);
        }
        let mut total = BigRational::zero();
        for (dimension, quantity) in quantities {
            let rate = self
                .rates
                .get(dimension)
                .ok_or(RetailPricingError::MissingRate)?;
            total += exact_component_scaled(*rate, *quantity, multiplier_bps);
        }
        Ok(total)
    }
}

fn exact_component_scaled(rate: RetailRate, quantity: u64, multiplier_bps: u32) -> BigRational {
    BigRational::new(
        BigInt::from(rate.usd_per_unit.scaled())
            * BigInt::from(quantity)
            * BigInt::from(multiplier_bps),
        BigInt::from(rate.denominator.quantity_scale()) * BigInt::from(BASIS_POINT_DENOMINATOR),
    )
}

/// A verified ceiling assertion for the requested model. The billing service
/// must independently match both identifiers against every frozen route
/// candidate before using this bound; the type itself proves no verification.
#[derive(Debug, Clone, PartialEq, Eq)]
pub struct VerifiedInputTokenBound {
    maximum_tokens: u64,
    verifier: String,
    revision: String,
}

impl VerifiedInputTokenBound {
    pub fn new(
        maximum_tokens: u64,
        verifier: impl Into<String>,
        revision: impl Into<String>,
    ) -> Result<Self, RetailPricingError> {
        let verifier = verifier.into();
        let revision = revision.into();
        if maximum_tokens == 0
            || verifier.trim().is_empty()
            || revision.trim().is_empty()
            || verifier.len() > 128
            || revision.len() > 128
            || verifier.chars().any(char::is_control)
            || revision.chars().any(char::is_control)
        {
            return Err(RetailPricingError::InvalidInputBound);
        }
        Ok(Self {
            maximum_tokens,
            verifier,
            revision,
        })
    }

    #[must_use]
    pub const fn maximum_tokens(&self) -> u64 {
        self.maximum_tokens
    }

    #[must_use]
    pub fn verifier(&self) -> &str {
        &self.verifier
    }

    #[must_use]
    pub fn revision(&self) -> &str {
        &self.revision
    }
}

/// Per-operation enforced maxima for every billable dimension.
#[derive(Debug, Clone, PartialEq, Eq)]
pub struct BillableUsageBounds {
    input_tokens: VerifiedInputTokenBound,
    output_tokens: u64,
    additional: BTreeMap<UsageDimension, u64>,
}

impl BillableUsageBounds {
    /// Creates a bound for input/output tokens plus explicitly bounded extra
    /// dimensions. Extra quantities must not duplicate the text dimensions.
    pub fn new(
        input_tokens: VerifiedInputTokenBound,
        output_tokens: u64,
        additional: impl IntoIterator<Item = (UsageDimension, u64)>,
    ) -> Result<Self, RetailPricingError> {
        if output_tokens == 0 {
            return Err(RetailPricingError::InvalidOutputBound);
        }
        let mut indexed = BTreeMap::new();
        for (dimension, maximum) in additional {
            if dimension.is_text_input() || dimension == UsageDimension::OutputTokens {
                return Err(RetailPricingError::DuplicateDimension);
            }
            if indexed.insert(dimension, maximum).is_some() {
                return Err(RetailPricingError::DuplicateDimension);
            }
        }
        Ok(Self {
            input_tokens,
            output_tokens,
            additional: indexed,
        })
    }

    #[must_use]
    pub const fn input_tokens(&self) -> &VerifiedInputTokenBound {
        &self.input_tokens
    }

    #[must_use]
    pub const fn output_tokens(&self) -> u64 {
        self.output_tokens
    }

    fn maximum_quantities(&self) -> BTreeMap<UsageDimension, u64> {
        let mut quantities = BTreeMap::from([
            (
                UsageDimension::UncachedInputTokens,
                self.input_tokens.maximum_tokens,
            ),
            (
                UsageDimension::CacheReadInputTokens,
                self.input_tokens.maximum_tokens,
            ),
            (
                UsageDimension::CacheWriteInputTokens5m,
                self.input_tokens.maximum_tokens,
            ),
            (
                UsageDimension::CacheWriteInputTokens1h,
                self.input_tokens.maximum_tokens,
            ),
            (UsageDimension::OutputTokens, self.output_tokens),
        ]);
        quantities.extend(self.additional.iter().map(|(key, value)| (*key, *value)));
        quantities
    }

    fn validate_usage(&self, usage: &BillableUsage) -> Result<(), RetailPricingError> {
        let quantities = &usage.quantities;
        let uncached = *quantities
            .get(&UsageDimension::UncachedInputTokens)
            .ok_or(RetailPricingError::IncompleteUsage)?;
        let cached = *quantities
            .get(&UsageDimension::CacheReadInputTokens)
            .ok_or(RetailPricingError::IncompleteUsage)?;
        let cache_write_5m = *quantities
            .get(&UsageDimension::CacheWriteInputTokens5m)
            .ok_or(RetailPricingError::IncompleteUsage)?;
        let cache_write_1h = *quantities
            .get(&UsageDimension::CacheWriteInputTokens1h)
            .ok_or(RetailPricingError::IncompleteUsage)?;
        let total_input = uncached
            .checked_add(cached)
            .and_then(|tokens| tokens.checked_add(cache_write_5m))
            .and_then(|tokens| tokens.checked_add(cache_write_1h))
            .ok_or(RetailPricingError::InvalidUsage)?;
        if total_input > self.input_tokens.maximum_tokens
            || quantities
                .get(&UsageDimension::OutputTokens)
                .is_none_or(|tokens| *tokens > self.output_tokens)
            || self.additional.iter().any(|(dimension, maximum)| {
                quantities
                    .get(dimension)
                    .is_none_or(|quantity| quantity > maximum)
            })
            || quantities.keys().any(|dimension| {
                !dimension.is_text_input()
                    && *dimension != UsageDimension::OutputTokens
                    && !self.additional.contains_key(dimension)
            })
        {
            return Err(RetailPricingError::UsageOutsideBounds);
        }
        Ok(())
    }
}

/// Complete disjoint usage quantities, including explicit zero-valued extra
/// dimensions. Settlement callers supply provider authority and completeness
/// evidence; preview callers may supply samples.
#[derive(Debug, Clone, PartialEq, Eq)]
pub struct BillableUsage {
    quantities: BTreeMap<UsageDimension, u64>,
}

impl BillableUsage {
    pub fn new(
        uncached_input_tokens: u64,
        cache_read_input_tokens: u64,
        cache_write_input_tokens_5m: u64,
        cache_write_input_tokens_1h: u64,
        output_tokens: u64,
        additional: impl IntoIterator<Item = (UsageDimension, u64)>,
    ) -> Result<Self, RetailPricingError> {
        let mut quantities = BTreeMap::from([
            (UsageDimension::UncachedInputTokens, uncached_input_tokens),
            (
                UsageDimension::CacheReadInputTokens,
                cache_read_input_tokens,
            ),
            (
                UsageDimension::CacheWriteInputTokens5m,
                cache_write_input_tokens_5m,
            ),
            (
                UsageDimension::CacheWriteInputTokens1h,
                cache_write_input_tokens_1h,
            ),
            (UsageDimension::OutputTokens, output_tokens),
        ]);
        for (dimension, quantity) in additional {
            if dimension.is_text_input() || dimension == UsageDimension::OutputTokens {
                return Err(RetailPricingError::DuplicateDimension);
            }
            if quantities.insert(dimension, quantity).is_some() {
                return Err(RetailPricingError::DuplicateDimension);
            }
        }
        Ok(Self { quantities })
    }

    #[must_use]
    pub fn quantities(&self) -> &BTreeMap<UsageDimension, u64> {
        &self.quantities
    }
}

/// Maximum charge quote rounded upward to the USD decimal scale.
#[derive(Debug, Clone, PartialEq, Eq)]
pub struct RetailQuote {
    maximum_charge: Decimal,
    multiplier_bps: u32,
    quantities: BTreeMap<UsageDimension, u64>,
}

impl RetailQuote {
    #[must_use]
    pub const fn maximum_charge(&self) -> Decimal {
        self.maximum_charge
    }

    #[must_use]
    pub const fn multiplier_bps(&self) -> u32 {
        self.multiplier_bps
    }

    #[must_use]
    pub fn quantities(&self) -> &BTreeMap<UsageDimension, u64> {
        &self.quantities
    }
}

/// Final customer retail charge rounded half-to-even at ten USD decimals.
#[derive(Debug, Clone, Copy, PartialEq, Eq)]
pub struct RetailCharge {
    amount: Decimal,
}

impl RetailCharge {
    #[must_use]
    pub const fn amount(self) -> Decimal {
        self.amount
    }
}

/// Sample arithmetic only, with a rounded total and exact unrounded USD parts.
/// This value carries no funding, input-bound, dispatch or usage authority.
#[derive(Debug, Clone, PartialEq, Eq)]
pub struct RetailPricePreview {
    amount: Decimal,
    multiplier_bps: u32,
    components: Vec<RetailPriceComponent>,
}

impl RetailPricePreview {
    #[must_use]
    pub const fn amount(&self) -> Decimal {
        self.amount
    }

    #[must_use]
    pub const fn multiplier_bps(&self) -> u32 {
        self.multiplier_bps
    }

    #[must_use]
    pub fn components(&self) -> &[RetailPriceComponent] {
        &self.components
    }
}

/// One exact USD fraction after applying the multiplier, without rounding.
#[derive(Debug, Clone, PartialEq, Eq)]
pub struct RetailPriceComponent {
    rate: RetailRate,
    quantity: u64,
    exact_usd_numerator: String,
    exact_usd_denominator: String,
}

impl RetailPriceComponent {
    #[must_use]
    pub const fn rate(&self) -> RetailRate {
        self.rate
    }

    #[must_use]
    pub const fn quantity(&self) -> u64 {
        self.quantity
    }

    #[must_use]
    pub fn exact_usd_numerator(&self) -> &str {
        &self.exact_usd_numerator
    }

    #[must_use]
    pub fn exact_usd_denominator(&self) -> &str {
        &self.exact_usd_denominator
    }
}

/// Pure policy value for `R = max(2 * A, Q)`. `A` must be selected by the
/// financial adapter from fully settled matching customer charges.
#[derive(Debug, Clone, Copy, Default)]
pub struct PrechargePolicy;

impl PrechargePolicy {
    pub fn reserve(
        self,
        latest_settled_charge: Option<Decimal>,
        quote: &RetailQuote,
    ) -> Result<Decimal, RetailPricingError> {
        let doubled_history = latest_settled_charge
            .filter(|amount| *amount != Decimal::ZERO)
            .map(|amount| {
                amount
                    .scaled()
                    .checked_mul(2)
                    .ok_or(RetailPricingError::ArithmeticOverflow)
                    .and_then(|scaled| {
                        Decimal::from_scaled(scaled).map_err(RetailPricingError::MoneyRange)
                    })
            })
            .transpose()?
            .unwrap_or(Decimal::ZERO);
        Ok(doubled_history.max(quote.maximum_charge))
    }
}

#[derive(Debug, Clone, PartialEq, Eq, thiserror::Error)]
pub enum RetailPricingError {
    #[error("retail price card has no rate for a billable dimension")]
    MissingRate,
    #[error("usage or frozen bounds do not account for every rate-card dimension")]
    IncompleteBounds,
    #[error("retail price card contains a duplicate dimension")]
    DuplicateDimension,
    #[error("rate denominator does not match its usage dimension")]
    InvalidRateUnit,
    #[error("multiplier must be within 0 and 1000000 basis points")]
    InvalidMultiplier,
    #[error("verified input token bound is invalid")]
    InvalidInputBound,
    #[error("output token bound must be positive")]
    InvalidOutputBound,
    #[error("normalized usage receipt is incomplete")]
    IncompleteUsage,
    #[error("normalized usage is outside the frozen request bounds")]
    UsageOutsideBounds,
    #[error("normalized usage is inconsistent or overflows its dimension")]
    InvalidUsage,
    #[error("billing arithmetic overflowed")]
    ArithmeticOverflow,
    #[error("USD amount is outside numeric(20,10)")]
    MoneyRange(#[source] MeteringError),
}

fn round_up(value: BigRational) -> Result<u128, RetailPricingError> {
    let numerator = value.numer();
    let denominator = value.denom();
    let (quotient, remainder) = (numerator / denominator, numerator % denominator);
    let rounded = if remainder.is_zero() {
        quotient
    } else {
        quotient + 1
    };
    rounded
        .to_u128()
        .ok_or(RetailPricingError::ArithmeticOverflow)
}

fn round_half_even(value: BigRational) -> Result<u128, RetailPricingError> {
    let numerator = value.numer();
    let denominator = value.denom();
    let quotient = numerator / denominator;
    let remainder = numerator % denominator;
    let doubled_remainder = &remainder * 2;
    let rounded = if doubled_remainder < *denominator {
        quotient
    } else if doubled_remainder > *denominator || (&quotient & BigInt::from(1u8)) != BigInt::zero()
    {
        quotient + 1
    } else {
        quotient
    };
    rounded
        .to_u128()
        .ok_or(RetailPricingError::ArithmeticOverflow)
}
