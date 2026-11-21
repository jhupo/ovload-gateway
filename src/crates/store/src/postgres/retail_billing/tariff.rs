//! Strict reuse of sealed price hydration and the exact selected frozen card.

use std::collections::BTreeMap;

use ovload_core::{
    billing::{
        BillableUsageBounds, PrechargePolicy, RetailBillingError, RetailBillingTarget,
        RetailRateCard, UsageDimension,
    },
    metering::Decimal,
};
use serde::{Deserialize, Serialize};
use serde_json::{Value, json};
use sqlx::{Postgres, Row, Transaction, postgres::PgRow};
use uuid::Uuid;

use super::{db_error, read};

#[derive(Debug, Serialize, Deserialize, PartialEq, Eq)]
#[serde(deny_unknown_fields)]
struct FrozenPrice {
    format: String,
    revision_id: Uuid,
    checksum: [u8; 32],
    rate_card_id: Uuid,
    multiplier_bps: u32,
    card: Value,
    #[serde(default, skip_serializing_if = "Option::is_none")]
    group_token_prices: Option<ovload_core::metering::TokenPriceOverride>,
}

pub(super) struct SelectedTariff {
    pub revision_id: Uuid,
    pub card_id: Uuid,
    pub rates: RetailRateCard,
    pub rate_ids: BTreeMap<UsageDimension, Uuid>,
    pub multiplier_bps: u32,
    frozen: FrozenPrice,
}

impl SelectedTariff {
    pub fn snapshot(&self) -> Result<Value, RetailBillingError> {
        serde_json::to_value(&self.frozen).map_err(|_| RetailBillingError::Unavailable)
    }
}

pub(super) async fn current(
    tx: &mut Transaction<'_, Postgres>,
    target: &RetailBillingTarget,
    identity: &ovload_core::engine::authentication::ModelKeyIdentity,
) -> Result<(u64, SelectedTariff), RetailBillingError> {
    let policy = sqlx::query(
        "select retail_multiplier_bps, model_routes_json, pricing_json, controls_json from account_groups where id=$1 and enabled for share",
    )
    .bind(target.group().as_str())
    .fetch_optional(&mut **tx)
    .await
    .map_err(db_error)?
    .ok_or(RetailBillingError::PriceUnavailable)?;
    let multiplier: i32 = policy.try_get("retail_multiplier_bps").map_err(db_error)?;
    let multiplier = u32::try_from(multiplier)
        .ok()
        .filter(|value| *value <= 1_000_000)
        .ok_or(RetailBillingError::Unavailable)?;
    let pricing: sqlx::types::Json<ovload_core::metering::GroupPricing> =
        policy.try_get("pricing_json").map_err(db_error)?;
    let controls: sqlx::types::Json<ovload_core::metering::GroupControls> =
        policy.try_get("controls_json").map_err(db_error)?;
    controls
        .0
        .validate(&pricing.0)
        .map_err(|_| RetailBillingError::Unavailable)?;
    let base = controls
        .0
        .for_user(identity.tenant_id, identity.user_id)
        .multiplier_bps
        .unwrap_or(multiplier);
    pricing
        .0
        .validate(base)
        .map_err(|_| RetailBillingError::Unavailable)?;
    let multiplier = pricing.0.multiplier_at(base, chrono::Utc::now());
    let routes: Option<sqlx::types::Json<BTreeMap<String, String>>> =
        policy.try_get("model_routes_json").map_err(db_error)?;
    let model = target.public_model().as_str();
    let custom = pricing.0.model_prices.get(model).or_else(|| {
        routes
            .as_ref()
            .and_then(|r| r.0.get(model))
            .and_then(|target| pricing.0.model_prices.get(target))
    });
    let catalog = super::super::retail_pricing::load_catalog(tx, false)
        .await
        .map_err(|_| RetailBillingError::Unavailable)?;
    let revision = catalog
        .published_revision_id
        .ok_or(RetailBillingError::PriceUnavailable)?;
    Ok((
        catalog.generation,
        select(tx, revision, target, multiplier, custom).await?,
    ))
}

async fn select(
    tx: &mut Transaction<'_, Postgres>,
    revision_id: Uuid,
    target: &RetailBillingTarget,
    multiplier_bps: u32,
    custom: Option<&ovload_core::metering::TokenPriceOverride>,
) -> Result<SelectedTariff, RetailBillingError> {
    let revision = super::super::retail_pricing::read::load_revision(tx, revision_id, false)
        .await
        .map_err(|_| RetailBillingError::Unavailable)?;
    let selected = revision
        .document
        .select(
            target.group(),
            target.public_model().as_str(),
            target.service_tier(),
        )
        .map_err(|_| RetailBillingError::PriceUnavailable)?;
    let card_id: Uuid = sqlx::query_scalar(
        "select id from retail_rate_cards
         where revision_id=$1 and public_model_id=$2 and service_tier=$3
           and account_group_id is not distinct from $4
           and time_band_id='always' and context_min_tokens=0 and context_max_tokens is null",
    )
    .bind(revision_id)
    .bind(target.public_model().as_str())
    .bind(target.service_tier())
    .bind(selected.account_group_id().map(|group| group.as_str()))
    .fetch_optional(&mut **tx)
    .await
    .map_err(db_error)?
    .ok_or(RetailBillingError::Unavailable)?;
    let rows = sqlx::query(
        "select id, dimension from retail_rates where rate_card_id=$1 order by dimension limit 15",
    )
    .bind(card_id)
    .fetch_all(&mut **tx)
    .await
    .map_err(db_error)?;
    let mut rate_ids = BTreeMap::new();
    for row in rows {
        let dimension: String = row.try_get("dimension").map_err(db_error)?;
        let dimension = serde_json::from_value::<UsageDimension>(Value::String(dimension))
            .map_err(|_| RetailBillingError::Unavailable)?;
        if rate_ids
            .insert(dimension, row.try_get("id").map_err(db_error)?)
            .is_some()
        {
            return Err(RetailBillingError::Unavailable);
        }
    }
    if !rate_ids
        .keys()
        .copied()
        .eq(selected.rates().rates().map(|rate| rate.dimension()))
    {
        return Err(RetailBillingError::Unavailable);
    }
    let rates = apply_group_token_prices(selected.rates(), custom)?;
    let card = json!({
        "account_group_id": selected.account_group_id().map(|group| group.as_str()),
        "public_model_id": selected.public_model_id(),
        "service_tier": selected.service_tier(),
        "rates": rates.rates().map(|rate| json!({
            "dimension": rate.dimension(),
            "unit": rate.denominator(),
            "rate_usd_per_unit": rate.usd_per_unit().canonical(),
            "billable": rate.usd_per_unit() != Decimal::ZERO,
        })).collect::<Vec<_>>(),
    });
    let frozen = FrozenPrice {
        format: "ovload.retail_funds_snapshot.v1".to_owned(),
        revision_id,
        checksum: revision
            .summary
            .checksum
            .ok_or(RetailBillingError::Unavailable)?,
        rate_card_id: card_id,
        multiplier_bps,
        card,
        group_token_prices: custom.cloned(),
    };
    Ok(SelectedTariff {
        revision_id,
        card_id,
        rates,
        rate_ids,
        multiplier_bps,
        frozen,
    })
}

pub(super) async fn frozen(
    tx: &mut Transaction<'_, Postgres>,
    row: &PgRow,
) -> Result<(SelectedTariff, BillableUsageBounds), RetailBillingError> {
    let record = read::record_from_row(row)?;
    let saved: FrozenPrice = serde_json::from_value(
        row.try_get::<Value, _>("frozen_price_snapshot")
            .map_err(db_error)?,
    )
    .map_err(|_| RetailBillingError::Unavailable)?;
    if saved.multiplier_bps > 1_000_000 {
        return Err(RetailBillingError::Unavailable);
    }
    let selected = select(
        tx,
        record.price_revision_id(),
        record.target(),
        saved.multiplier_bps,
        saved.group_token_prices.as_ref(),
    )
    .await?;
    if saved != selected.frozen
        || row.try_get::<Uuid, _>("rate_card_id").map_err(db_error)? != selected.card_id
        || row
            .try_get::<i32, _>("effective_multiplier_bps")
            .map_err(db_error)?
            != i32::try_from(saved.multiplier_bps).map_err(|_| RetailBillingError::Unavailable)?
    {
        return Err(RetailBillingError::Unavailable);
    }
    let bounds =
        BillableUsageBounds::from_facts(row.try_get::<Value, _>("quote_bounds").map_err(db_error)?)
            .map_err(|_| RetailBillingError::Unavailable)?;
    if row
        .try_get::<i64, _>("input_token_bound")
        .map_err(db_error)?
        != super::bigint(bounds.input_tokens().maximum_tokens())?
        || row
            .try_get::<i64, _>("output_token_bound")
            .map_err(db_error)?
            != super::bigint(bounds.output_tokens())?
    {
        return Err(RetailBillingError::Unavailable);
    }
    let quote = selected
        .rates
        .quote(&bounds, saved.multiplier_bps)
        .map_err(|_| RetailBillingError::Unavailable)?;
    let initial = PrechargePolicy
        .reserve(
            Some(read::decimal(row, "latest_settled_charge_usd")?),
            &quote,
        )
        .map_err(|_| RetailBillingError::Unavailable)?;
    if quote.maximum_charge() != record.maximum_charge() || initial != record.initial_reservation()
    {
        return Err(RetailBillingError::Unavailable);
    }
    Ok((selected, bounds))
}

fn apply_group_token_prices(
    card: &RetailRateCard,
    custom: Option<&ovload_core::metering::TokenPriceOverride>,
) -> Result<RetailRateCard, RetailBillingError> {
    let Some(custom) = custom else {
        return Ok(card.clone());
    };
    let rates = card
        .rates()
        .map(|rate| {
            let value = match rate.dimension() {
                UsageDimension::UncachedInputTokens => Some(custom.input),
                UsageDimension::OutputTokens => Some(custom.output),
                UsageDimension::CacheReadInputTokens => Some(custom.cache_read),
                UsageDimension::CacheWriteInputTokens5m
                | UsageDimension::CacheWriteInputTokens1h => Some(custom.cache_write),
                _ => None,
            };
            match value {
                None => Ok(rate),
                Some(value) => ovload_core::billing::RetailRate::new(
                    rate.dimension(),
                    rate.denominator(),
                    value.decimal(),
                )
                .map_err(|_| RetailBillingError::Unavailable),
            }
        })
        .collect::<Result<Vec<_>, _>>()?;
    RetailRateCard::new(rates).map_err(|_| RetailBillingError::Unavailable)
}

#[cfg(test)]
mod group_price_tests {
    use super::*;
    use ovload_core::billing::{RateDenominator, RetailRate};
    #[test]
    fn group_token_override_replaces_text_prices_and_keeps_other_dimensions() {
        let dimensions = [
            UsageDimension::UncachedInputTokens,
            UsageDimension::CacheReadInputTokens,
            UsageDimension::CacheWriteInputTokens5m,
            UsageDimension::CacheWriteInputTokens1h,
            UsageDimension::OutputTokens,
        ];
        let mut rates = dimensions
            .map(|d| {
                RetailRate::new(d, RateDenominator::PerMillionTokens, "10".parse().unwrap())
                    .unwrap()
            })
            .to_vec();
        rates.push(
            RetailRate::new(
                UsageDimension::SearchCalls,
                RateDenominator::PerCall,
                "0.2".parse().unwrap(),
            )
            .unwrap(),
        );
        let original = RetailRateCard::new(rates).unwrap();
        let custom: ovload_core::metering::TokenPriceOverride = serde_json::from_value(
            json!({"input":"1","output":"2","cacheRead":"0.25","cacheWrite":"0.5"}),
        )
        .unwrap();
        let result = apply_group_token_prices(&original, Some(&custom)).unwrap();
        let prices = result
            .rates()
            .map(|r| (r.dimension(), r.usd_per_unit().canonical()))
            .collect::<BTreeMap<_, _>>();
        assert_eq!(prices[&UsageDimension::UncachedInputTokens], "1");
        assert_eq!(prices[&UsageDimension::CacheWriteInputTokens1h], "0.5");
        assert_eq!(prices[&UsageDimension::SearchCalls], "0.2");
        assert_eq!(apply_group_token_prices(&original, None).unwrap(), original);
        assert_eq!(
            original
                .rates()
                .find(|r| r.dimension() == UsageDimension::UncachedInputTokens)
                .unwrap()
                .usd_per_unit()
                .canonical(),
            "10"
        );
    }
}
