//! Bounded, fail-closed hydration of sealed retail price documents.

use std::collections::BTreeMap;

use chrono::{DateTime, Utc};
use ovload_admin::model::{
    identity_access::{IdentityError, IdentityResult},
    retail_pricing::{PriceBookState, PriceRevisionRecord, PriceRevisionSummary},
};
use ovload_core::{
    billing::{
        RateDenominator, RetailPriceBook, RetailPriceCard, RetailRate, RetailRateCard,
        UsageDimension,
    },
    metering::Decimal,
    routing::AccountGroupId,
};
use sqlx::{Postgres, Row, Transaction, postgres::PgRow};
use uuid::Uuid;

use super::super::identity::db_error;

const MAX_CARDS: usize = 128;
const MAX_RATES: usize = MAX_CARDS * 14;

pub(crate) async fn load_revision(
    tx: &mut Transaction<'_, Postgres>,
    id: Uuid,
    for_update: bool,
) -> IdentityResult<PriceRevisionRecord> {
    let query = if for_update {
        "select id, revision_no, row_version, status, checksum, effective_at, created_at, \
         published_by, published_at, retired_at, updated_at \
         from retail_price_book_revisions where id = $1 for update"
    } else {
        "select id, revision_no, row_version, status, checksum, effective_at, created_at, \
         published_by, published_at, retired_at, updated_at \
         from retail_price_book_revisions where id = $1 for share"
    };
    let row = sqlx::query(query)
        .bind(id)
        .fetch_optional(&mut **tx)
        .await
        .map_err(db_error)?
        .ok_or(IdentityError::NotFound)?;
    let summary = summary(&row)?;
    validate_time_band(tx, id).await?;
    let mut cards = load_cards(tx, id).await?;
    load_rates(tx, id, &mut cards).await?;
    let document = RetailPriceBook::new(
        cards
            .into_values()
            .map(|card| {
                let rates =
                    RetailRateCard::new(card.rates).map_err(|_| IdentityError::Unavailable)?;
                RetailPriceCard::new(card.group, card.model, card.tier, rates)
                    .map_err(|_| IdentityError::Unavailable)
            })
            .collect::<IdentityResult<Vec<_>>>()?,
    )
    .map_err(|_| IdentityError::Unavailable)?;
    let checksum = document
        .checksum()
        .map_err(|_| IdentityError::Unavailable)?;
    if summary.checksum != Some(checksum) {
        return Err(IdentityError::Unavailable);
    }
    Ok(PriceRevisionRecord { summary, document })
}

pub(super) async fn load_summaries(
    tx: &mut Transaction<'_, Postgres>,
    cursor: Option<u64>,
    limit: u16,
) -> IdentityResult<(Vec<PriceRevisionSummary>, Option<u64>)> {
    if !(1..=100).contains(&limit) {
        return Err(IdentityError::Invalid);
    }
    let cursor = cursor
        .map(|value| {
            i64::try_from(value)
                .ok()
                .filter(|value| *value > 0)
                .ok_or(IdentityError::Invalid)
        })
        .transpose()?;
    let rows = sqlx::query(
        "select id, revision_no, row_version, status, checksum, effective_at, created_at, \
         published_by, published_at, retired_at, updated_at \
         from retail_price_book_revisions \
         where ($1::bigint is null or revision_no < $1) \
         order by revision_no desc limit $2",
    )
    .bind(cursor)
    .bind(i64::from(limit) + 1)
    .fetch_all(&mut **tx)
    .await
    .map_err(db_error)?;
    let mut items = rows
        .iter()
        .map(summary)
        .collect::<IdentityResult<Vec<_>>>()?;
    let has_more = items.len() > usize::from(limit);
    items.truncate(usize::from(limit));
    let next_cursor = if has_more {
        Some(items.last().ok_or(IdentityError::Unavailable)?.revision_no)
    } else {
        None
    };
    Ok((items, next_cursor))
}

fn summary(row: &PgRow) -> IdentityResult<PriceRevisionSummary> {
    let id: Uuid = row.try_get("id").map_err(db_error)?;
    let status: String = row.try_get("status").map_err(db_error)?;
    let checksum: Option<Vec<u8>> = row.try_get("checksum").map_err(db_error)?;
    let checksum: [u8; 32] = checksum
        .ok_or(IdentityError::Unavailable)?
        .try_into()
        .map_err(|_| IdentityError::Unavailable)?;
    let effective_at: DateTime<Utc> = row.try_get("effective_at").map_err(db_error)?;
    let created_at: DateTime<Utc> = row.try_get("created_at").map_err(db_error)?;
    let updated_at: DateTime<Utc> = row.try_get("updated_at").map_err(db_error)?;
    let published_by: Option<Uuid> = row.try_get("published_by").map_err(db_error)?;
    let published_at: Option<DateTime<Utc>> = row.try_get("published_at").map_err(db_error)?;
    let retired_at: Option<DateTime<Utc>> = row.try_get("retired_at").map_err(db_error)?;
    if id.is_nil() || created_at > updated_at || published_by.is_some_and(|id| id.is_nil()) {
        return Err(IdentityError::Unavailable);
    }
    let state = match (status.as_str(), published_by, published_at, retired_at) {
        ("draft", None, None, None) => PriceBookState::Draft,
        ("published", Some(_), Some(published), None)
            if created_at <= published && published <= updated_at && effective_at == published =>
        {
            PriceBookState::Published
        }
        ("retired", Some(_), Some(published), Some(retired))
            if created_at <= published
                && published <= retired
                && retired <= updated_at
                && effective_at == published =>
        {
            PriceBookState::Retired
        }
        _ => return Err(IdentityError::Unavailable),
    };
    Ok(PriceRevisionSummary {
        id,
        revision_no: positive(row.try_get("revision_no").map_err(db_error)?)?,
        row_version: positive(row.try_get("row_version").map_err(db_error)?)?,
        state,
        checksum: Some(checksum),
        effective_at,
        created_at,
        published_at,
        retired_at,
    })
}

async fn validate_time_band(tx: &mut Transaction<'_, Postgres>, id: Uuid) -> IdentityResult<()> {
    let rows = sqlx::query(
        "select id, timezone, weekdays, local_start_minute, local_end_minute \
         from retail_time_bands where revision_id = $1 order by id limit 2",
    )
    .bind(id)
    .fetch_all(&mut **tx)
    .await
    .map_err(db_error)?;
    let [row] = rows.as_slice() else {
        return Err(IdentityError::Unavailable);
    };
    let band: String = row.try_get("id").map_err(db_error)?;
    let timezone: String = row.try_get("timezone").map_err(db_error)?;
    let weekdays: Vec<i16> = row.try_get("weekdays").map_err(db_error)?;
    let start: i16 = row.try_get("local_start_minute").map_err(db_error)?;
    let end: i16 = row.try_get("local_end_minute").map_err(db_error)?;
    if band != "always"
        || timezone != "UTC"
        || weekdays != [1, 2, 3, 4, 5, 6, 7]
        || start != 0
        || end != 1440
    {
        return Err(IdentityError::Unavailable);
    }
    Ok(())
}

struct StoredCard {
    group: Option<AccountGroupId>,
    model: String,
    tier: String,
    rates: Vec<RetailRate>,
}

async fn load_cards(
    tx: &mut Transaction<'_, Postgres>,
    revision: Uuid,
) -> IdentityResult<BTreeMap<Uuid, StoredCard>> {
    let rows = sqlx::query(
        "select id, account_group_id, public_model_id, service_tier, time_band_id, \
         context_min_tokens, context_max_tokens from retail_rate_cards \
         where revision_id = $1 order by id limit 129",
    )
    .bind(revision)
    .fetch_all(&mut **tx)
    .await
    .map_err(db_error)?;
    if rows.is_empty() || rows.len() > MAX_CARDS {
        return Err(IdentityError::Unavailable);
    }
    let mut cards = BTreeMap::new();
    for row in rows {
        let id: Uuid = row.try_get("id").map_err(db_error)?;
        let group: Option<String> = row.try_get("account_group_id").map_err(db_error)?;
        let band: String = row.try_get("time_band_id").map_err(db_error)?;
        let context_min: i64 = row.try_get("context_min_tokens").map_err(db_error)?;
        let context_max: Option<i64> = row.try_get("context_max_tokens").map_err(db_error)?;
        if id.is_nil() || band != "always" || context_min != 0 || context_max.is_some() {
            return Err(IdentityError::Unavailable);
        }
        let card = StoredCard {
            group: group
                .map(AccountGroupId::new)
                .transpose()
                .map_err(|_| IdentityError::Unavailable)?,
            model: row.try_get("public_model_id").map_err(db_error)?,
            tier: row.try_get("service_tier").map_err(db_error)?,
            rates: Vec::new(),
        };
        if cards.insert(id, card).is_some() {
            return Err(IdentityError::Unavailable);
        }
    }
    Ok(cards)
}

async fn load_rates(
    tx: &mut Transaction<'_, Postgres>,
    revision: Uuid,
    cards: &mut BTreeMap<Uuid, StoredCard>,
) -> IdentityResult<()> {
    let rows = sqlx::query(
        "select rate.rate_card_id, rate.dimension, rate.unit, rate.billable, \
         rate.rate_usd_per_unit::text as rate_usd_per_unit from retail_rates rate \
         join retail_rate_cards card on card.id = rate.rate_card_id \
         where card.revision_id = $1 order by rate.rate_card_id, rate.dimension limit 1793",
    )
    .bind(revision)
    .fetch_all(&mut **tx)
    .await
    .map_err(db_error)?;
    if rows.len() > MAX_RATES {
        return Err(IdentityError::Unavailable);
    }
    for row in rows {
        let card_id: Uuid = row.try_get("rate_card_id").map_err(db_error)?;
        let dimension: String = row.try_get("dimension").map_err(db_error)?;
        let unit: String = row.try_get("unit").map_err(db_error)?;
        let amount: String = row.try_get("rate_usd_per_unit").map_err(db_error)?;
        let billable: bool = row.try_get("billable").map_err(db_error)?;
        let dimension: UsageDimension =
            serde_json::from_value(serde_json::Value::String(dimension))
                .map_err(|_| IdentityError::Unavailable)?;
        let unit: RateDenominator = serde_json::from_value(serde_json::Value::String(unit))
            .map_err(|_| IdentityError::Unavailable)?;
        let amount: Decimal = amount.parse().map_err(|_| IdentityError::Unavailable)?;
        if billable != (amount != Decimal::ZERO) {
            return Err(IdentityError::Unavailable);
        }
        let rate =
            RetailRate::new(dimension, unit, amount).map_err(|_| IdentityError::Unavailable)?;
        cards
            .get_mut(&card_id)
            .ok_or(IdentityError::Unavailable)?
            .rates
            .push(rate);
    }
    Ok(())
}

fn positive(value: i64) -> IdentityResult<u64> {
    u64::try_from(value)
        .ok()
        .filter(|value| *value > 0)
        .ok_or(IdentityError::Unavailable)
}
