//! Exact explicit procurement rates; this product has no inherited model price table.

use ovload_core::metering::{
    CalculatedCostAmounts, CalculatedCostBreakdown, CalculatedCostRates, CurrencyCode, Decimal,
    ModelPriceOverride, Money, TokenPrice, TokenPriceOverride, Usage,
};

pub(super) fn evaluate(
    usage: &Usage,
    service_tier: Option<&str>,
    pricing: Option<&ModelPriceOverride>,
) -> Option<CalculatedCostBreakdown> {
    let pricing = pricing?;
    if pricing.deleted {
        return None;
    }
    pricing.validate().ok()?;
    if pricing
        .bands
        .keys()
        .any(|band| band.starts_with("long_") || band == "image")
    {
        return None;
    }
    let (band, tier) = match service_tier {
        None | Some("default") => ("standard", "default"),
        Some("flex") => ("flex", "flex"),
        Some("priority") => ("fast", "priority"),
        Some(_) => return None,
    };
    let standard = pricing.bands.get("standard")?;
    let selected = pricing.bands.get(band)?;
    let quantities = Quantities::new(usage)?;
    let standard = quantities.amounts(standard)?;
    let amounts = quantities.amounts(selected)?;
    let standard_total = total(standard)?;
    let selected_total = total(amounts)?;
    let multiplier_percent = match (standard_total, selected_total) {
        (0, 0) => 100,
        (0, _) => return None,
        (standard, selected) => {
            u32::try_from(selected.checked_mul(100)?.checked_add(standard / 2)? / standard).ok()?
        }
    };
    CalculatedCostBreakdown::new(
        CalculatedCostAmounts::new(
            usd(amounts[0])?,
            usd(amounts[1])?,
            usd(amounts[2])?,
            usd(amounts[3])?,
            usd(standard_total)?,
            usd(selected_total)?,
        ),
        CalculatedCostRates::new(
            per_million(selected.input)?,
            per_million(selected.output)?,
            per_million(selected.cache_read)?,
            per_million(selected.cache_write)?,
        ),
        Some(tier.to_owned()),
        multiplier_percent,
    )
    .with_custom_multiplier(pricing.multiplier_bps)
}

struct Quantities([u64; 4]);

impl Quantities {
    fn new(usage: &Usage) -> Option<Self> {
        let input = usage.input_tokens?;
        let output = usage.output_tokens?;
        let cached = usage.cached_input_tokens?;
        let written = usage.cache_write_input_tokens?;
        let total = input.checked_add(output)?;
        if usage.image_input_tokens != Some(0)
            || usage.image_output_tokens != Some(0)
            || usage
                .reasoning_output_tokens
                .is_some_and(|count| count > output)
            || usage.total_tokens.is_some_and(|count| total != count)
        {
            return None;
        }
        Some(Self([
            input.checked_sub(cached.checked_add(written)?)?,
            output,
            cached,
            written,
        ]))
    }

    fn amounts(&self, prices: &TokenPriceOverride) -> Option<[u128; 4]> {
        let rates = [
            prices.input,
            prices.output,
            prices.cache_read,
            prices.cache_write,
        ];
        let mut amounts = [0; 4];
        for (index, rate) in rates.into_iter().enumerate() {
            amounts[index] = u128::from(self.0[index]).checked_mul(rate.ticks_per_token())?;
        }
        Some(amounts)
    }
}

fn total(amounts: [u128; 4]) -> Option<u128> {
    amounts.into_iter().try_fold(0_u128, u128::checked_add)
}

fn usd(ticks: u128) -> Option<Money> {
    Some(Money::new(
        Decimal::from_scaled(ticks).ok()?,
        CurrencyCode::new("USD").ok()?,
    ))
}

fn per_million(price: TokenPrice) -> Option<Money> {
    usd(price.ticks_per_token().checked_mul(1_000_000)?)
}
