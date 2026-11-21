//! Management-only immutable retail price documents and sample previews.

use std::{collections::BTreeMap, str::FromStr as _};

use axum::{
    Json, Router,
    extract::{
        DefaultBodyLimit, Path, Query, State,
        rejection::{JsonRejection, PathRejection, QueryRejection},
    },
    http::{HeaderValue, header},
    response::{IntoResponse, Response},
    routing::{get, post},
};
use chrono::{DateTime, Utc};
use ovload_admin::model::{
    identity_access::IdentityError,
    retail_pricing::{
        ChangePriceRevision, CreatePriceRevision, EffectiveRetailPrice, EffectiveRetailPriceQuery,
        PreviewRetailPrice, PriceCatalogState, PriceRevisionDetail, PriceRevisionMutation,
        PriceRevisionPage, PriceRevisionPreview, PriceRevisionRecord, PriceRevisionSummary,
    },
};
use ovload_core::{
    billing::{
        BillableUsage, RateDenominator, RetailPriceBook, RetailPriceCard, RetailRate,
        RetailRateCard, UsageDimension,
    },
    metering::Decimal,
    routing::AccountGroupId,
};
use serde::{Deserialize, Serialize};
use uuid::Uuid;

use crate::auth::SessionState;

use super::{extract::IdentityRequest, wire::IdentityHttpError};

const MAXIMUM_CARDS: usize = 128;
const MAXIMUM_DIMENSIONS: usize = 14;

pub(super) fn router<S>() -> Router<S>
where
    S: SessionState + Clone + Send + Sync + 'static,
{
    Router::new()
        .route("/effective", get(effective::<S>))
        .route("/revisions", get(list::<S>).post(create::<S>))
        .route("/revisions/{id}", get(item::<S>))
        .route("/revisions/{id}/validate", post(validate::<S>))
        .route("/revisions/{id}/preview", post(preview::<S>))
        .route("/revisions/{id}/publish", post(publish::<S>))
        .route("/revisions/{id}/retire", post(retire::<S>))
        .layer(DefaultBodyLimit::max(512 * 1024))
}

#[derive(Deserialize)]
#[serde(deny_unknown_fields)]
pub(super) struct EffectiveQuery {
    account_group_id: String,
    public_model_id: String,
    service_tier: String,
}

#[derive(Serialize)]
struct EffectiveRateView {
    dimension: UsageDimension,
    unit: RateDenominator,
    rate_usd_per_unit: String,
    effective_rate_usd_per_unit: String,
    billable: bool,
}

#[derive(Serialize)]
struct EffectiveView {
    currency: &'static str,
    scale: u8,
    catalog_generation: u64,
    revision_id: String,
    account_group_id: String,
    selected_account_group_id: Option<String>,
    public_model_id: String,
    service_tier: String,
    multiplier_bps: u32,
    rates: Vec<EffectiveRateView>,
}

impl EffectiveView {
    fn from_price(price: EffectiveRetailPrice) -> Result<Self, IdentityError> {
        let rates = price
            .rates
            .rates()
            .map(|rate| {
                Ok(EffectiveRateView {
                    dimension: rate.dimension(),
                    unit: rate.denominator(),
                    rate_usd_per_unit: rate.usd_per_unit().canonical(),
                    effective_rate_usd_per_unit: rate
                        .effective_unit_usd(price.multiplier_bps)
                        .map_err(|_| IdentityError::Unavailable)?,
                    billable: rate.usd_per_unit() != Decimal::ZERO,
                })
            })
            .collect::<Result<Vec<_>, IdentityError>>()?;
        Ok(Self {
            currency: "USD",
            scale: 10,
            catalog_generation: price.catalog.generation,
            revision_id: price.revision_id.to_string(),
            account_group_id: price.account_group_id.to_string(),
            selected_account_group_id: price
                .selected_account_group_id
                .map(|value| value.to_string()),
            public_model_id: price.public_model_id,
            service_tier: price.service_tier,
            multiplier_bps: price.multiplier_bps,
            rates,
        })
    }
}

pub(super) async fn effective<S: SessionState>(
    State(state): State<S>,
    request: IdentityRequest,
    query: Result<Query<EffectiveQuery>, QueryRejection>,
) -> Result<Response, IdentityHttpError> {
    let Query(query) = query.map_err(|_| request.error(IdentityError::Invalid))?;
    let group = AccountGroupId::new(query.account_group_id)
        .map_err(|_| request.error(IdentityError::Invalid))?;
    let command = EffectiveRetailPriceQuery::new(group, query.public_model_id, query.service_tier)
        .map_err(|error| request.error(error))?;
    let session = request
        .authenticate(state.admin_services().identity())
        .await?;
    let result = state
        .admin_services()
        .retail_pricing()
        .effective(&session, command)
        .await
        .map_err(|error| request.error(error))?;
    let view = EffectiveView::from_price(result).map_err(|error| request.error(error))?;
    Ok(Json(view).into_response())
}

#[derive(Default, Deserialize)]
#[serde(deny_unknown_fields)]
struct ListQuery {
    cursor: Option<u64>,
    limit: Option<u16>,
}

#[derive(Deserialize)]
#[serde(deny_unknown_fields)]
struct CreateInput {
    cards: Vec<CardInput>,
    reason: String,
}

#[derive(Deserialize)]
#[serde(deny_unknown_fields)]
struct CardInput {
    account_group_id: Option<String>,
    public_model_id: String,
    service_tier: String,
    rates: Vec<RateInput>,
}

#[derive(Deserialize)]
#[serde(deny_unknown_fields)]
struct RateInput {
    dimension: UsageDimension,
    unit: RateDenominator,
    rate_usd_per_unit: String,
    billable: bool,
}

impl CreateInput {
    fn document(self) -> Result<(RetailPriceBook, String), IdentityError> {
        if self.cards.is_empty() || self.cards.len() > MAXIMUM_CARDS {
            return Err(IdentityError::Invalid);
        }
        let cards = self
            .cards
            .into_iter()
            .map(CardInput::card)
            .collect::<Result<Vec<_>, _>>()?;
        let document = RetailPriceBook::new(cards).map_err(|_| IdentityError::Invalid)?;
        Ok((document, self.reason))
    }
}

impl CardInput {
    fn card(self) -> Result<RetailPriceCard, IdentityError> {
        if self.rates.len() > MAXIMUM_DIMENSIONS {
            return Err(IdentityError::Invalid);
        }
        let group = self
            .account_group_id
            .map(AccountGroupId::new)
            .transpose()
            .map_err(|_| IdentityError::Invalid)?;
        let rates = self
            .rates
            .into_iter()
            .map(RateInput::rate)
            .collect::<Result<Vec<_>, _>>()?;
        let rates = RetailRateCard::new(rates).map_err(|_| IdentityError::Invalid)?;
        RetailPriceCard::new(group, self.public_model_id, self.service_tier, rates)
            .map_err(|_| IdentityError::Invalid)
    }
}

impl RateInput {
    fn rate(self) -> Result<RetailRate, IdentityError> {
        let amount =
            Decimal::from_str(&self.rate_usd_per_unit).map_err(|_| IdentityError::Invalid)?;
        if self.billable != (amount != Decimal::ZERO) {
            return Err(IdentityError::Invalid);
        }
        RetailRate::new(self.dimension, self.unit, amount).map_err(|_| IdentityError::Invalid)
    }
}

#[derive(Deserialize)]
#[serde(deny_unknown_fields)]
struct ChangeInput {
    expected_catalog_generation: u64,
    reason: String,
}

#[derive(Deserialize)]
#[serde(deny_unknown_fields)]
struct PreviewInput {
    account_group_id: String,
    public_model_id: String,
    service_tier: String,
    multiplier_bps: u32,
    usage: Vec<UsageInput>,
}

#[derive(Deserialize)]
#[serde(deny_unknown_fields)]
struct UsageInput {
    dimension: UsageDimension,
    quantity: u64,
}

impl PreviewInput {
    fn command(self) -> Result<PreviewRetailPrice, IdentityError> {
        if self.usage.len() > MAXIMUM_DIMENSIONS {
            return Err(IdentityError::Invalid);
        }
        let group =
            AccountGroupId::new(self.account_group_id).map_err(|_| IdentityError::Invalid)?;
        let mut quantities = BTreeMap::new();
        for usage in self.usage {
            if quantities.insert(usage.dimension, usage.quantity).is_some() {
                return Err(IdentityError::Invalid);
            }
        }
        let uncached = required_quantity(&mut quantities, UsageDimension::UncachedInputTokens)?;
        let cache_read = required_quantity(&mut quantities, UsageDimension::CacheReadInputTokens)?;
        let cache_write_5m =
            required_quantity(&mut quantities, UsageDimension::CacheWriteInputTokens5m)?;
        let cache_write_1h =
            required_quantity(&mut quantities, UsageDimension::CacheWriteInputTokens1h)?;
        let output = required_quantity(&mut quantities, UsageDimension::OutputTokens)?;
        let usage = BillableUsage::new(
            uncached,
            cache_read,
            cache_write_5m,
            cache_write_1h,
            output,
            quantities,
        )
        .map_err(|_| IdentityError::Invalid)?;
        PreviewRetailPrice::new(
            group,
            self.public_model_id,
            self.service_tier,
            usage,
            self.multiplier_bps,
        )
    }
}

fn required_quantity(
    quantities: &mut BTreeMap<UsageDimension, u64>,
    dimension: UsageDimension,
) -> Result<u64, IdentityError> {
    quantities.remove(&dimension).ok_or(IdentityError::Invalid)
}

#[derive(Serialize)]
struct CatalogView {
    generation: u64,
    published_revision_id: Option<String>,
}

impl From<PriceCatalogState> for CatalogView {
    fn from(catalog: PriceCatalogState) -> Self {
        Self {
            generation: catalog.generation,
            published_revision_id: catalog.published_revision_id.map(|id| id.to_string()),
        }
    }
}

#[derive(Serialize)]
struct SummaryView {
    id: String,
    revision_no: u64,
    row_version: u64,
    state: &'static str,
    checksum: Option<String>,
    effective_at: Option<DateTime<Utc>>,
    created_at: DateTime<Utc>,
    published_at: Option<DateTime<Utc>>,
    retired_at: Option<DateTime<Utc>>,
}

impl From<PriceRevisionSummary> for SummaryView {
    fn from(summary: PriceRevisionSummary) -> Self {
        Self {
            id: summary.id.to_string(),
            revision_no: summary.revision_no,
            row_version: summary.row_version,
            state: summary.state.as_str(),
            checksum: summary.checksum.map(checksum_hex),
            effective_at: (summary.state.as_str() != "draft").then_some(summary.effective_at),
            created_at: summary.created_at,
            published_at: summary.published_at,
            retired_at: summary.retired_at,
        }
    }
}

fn checksum_hex(checksum: [u8; 32]) -> String {
    const HEX: &[u8; 16] = b"0123456789abcdef";
    let mut encoded = String::with_capacity(64);
    for byte in checksum {
        encoded.push(char::from(HEX[usize::from(byte >> 4)]));
        encoded.push(char::from(HEX[usize::from(byte & 0x0f)]));
    }
    encoded
}

#[derive(Serialize)]
struct RevisionView {
    #[serde(flatten)]
    summary: SummaryView,
    document: serde_json::Value,
}

impl RevisionView {
    fn from_record(record: PriceRevisionRecord) -> Result<Self, IdentityError> {
        let document = record
            .document
            .canonical_document()
            .map_err(|_| IdentityError::Unavailable)?;
        Ok(Self {
            summary: record.summary.into(),
            document,
        })
    }
}

#[derive(Serialize)]
struct DetailView {
    currency: &'static str,
    scale: u8,
    catalog: CatalogView,
    revision: RevisionView,
}

impl DetailView {
    fn from_detail(detail: PriceRevisionDetail) -> Result<Self, IdentityError> {
        Ok(Self {
            currency: "USD",
            scale: 10,
            catalog: detail.catalog.into(),
            revision: RevisionView::from_record(detail.revision)?,
        })
    }
}

#[derive(Serialize)]
struct PageView {
    currency: &'static str,
    scale: u8,
    catalog: CatalogView,
    items: Vec<SummaryView>,
    next_cursor: Option<u64>,
}

impl From<PriceRevisionPage> for PageView {
    fn from(page: PriceRevisionPage) -> Self {
        Self {
            currency: "USD",
            scale: 10,
            catalog: page.catalog.into(),
            items: page.items.into_iter().map(Into::into).collect(),
            next_cursor: page.next_cursor,
        }
    }
}

#[derive(Serialize)]
struct FractionView {
    numerator: String,
    denominator: String,
}

#[derive(Serialize)]
struct ComponentView {
    dimension: UsageDimension,
    unit: RateDenominator,
    rate_usd_per_unit: String,
    quantity: u64,
    exact_subtotal_usd: FractionView,
}

#[derive(Serialize)]
struct PreviewView {
    currency: &'static str,
    scale: u8,
    catalog: CatalogView,
    revision: SummaryView,
    selected_account_group_id: Option<String>,
    public_model_id: String,
    service_tier: String,
    multiplier_bps: u32,
    components: Vec<ComponentView>,
    total_usd: String,
}

impl From<PriceRevisionPreview> for PreviewView {
    fn from(preview: PriceRevisionPreview) -> Self {
        let calculation = preview.calculation;
        Self {
            currency: "USD",
            scale: 10,
            catalog: preview.catalog.into(),
            revision: preview.revision.into(),
            selected_account_group_id: preview
                .selected_account_group_id
                .map(|group| group.to_string()),
            public_model_id: preview.public_model_id,
            service_tier: preview.service_tier,
            multiplier_bps: calculation.multiplier_bps(),
            components: calculation
                .components()
                .iter()
                .map(|component| {
                    let rate = component.rate();
                    ComponentView {
                        dimension: rate.dimension(),
                        unit: rate.denominator(),
                        rate_usd_per_unit: rate.usd_per_unit().canonical(),
                        quantity: component.quantity(),
                        exact_subtotal_usd: FractionView {
                            numerator: component.exact_usd_numerator().to_owned(),
                            denominator: component.exact_usd_denominator().to_owned(),
                        },
                    }
                })
                .collect(),
            total_usd: calculation.amount().canonical(),
        }
    }
}

fn id_from_path(
    request: &IdentityRequest,
    path: Result<Path<String>, PathRejection>,
) -> Result<Uuid, IdentityHttpError> {
    let Path(id) = path.map_err(|_| request.error(IdentityError::Invalid))?;
    Uuid::parse_str(&id).map_err(|_| request.error(IdentityError::Invalid))
}

fn etag_response(
    request: &IdentityRequest,
    view: impl Serialize,
    version: String,
) -> Result<Response, IdentityHttpError> {
    let mut response = Json(view).into_response();
    let etag = HeaderValue::from_str(&format!("\"{version}\""))
        .map_err(|_| request.error(IdentityError::Unavailable))?;
    response.headers_mut().insert(header::ETAG, etag);
    Ok(response)
}

fn detail_response(
    request: &IdentityRequest,
    detail: PriceRevisionDetail,
) -> Result<Response, IdentityHttpError> {
    let version = format!(
        "{}.{}",
        detail.catalog.generation, detail.revision.summary.row_version
    );
    let view = DetailView::from_detail(detail).map_err(|error| request.error(error))?;
    etag_response(request, view, version)
}

fn mutation_response(
    request: &IdentityRequest,
    mutation: PriceRevisionMutation,
) -> Result<Response, IdentityHttpError> {
    let mut response = detail_response(request, mutation.detail)?;
    response.headers_mut().insert(
        "idempotency-replayed",
        HeaderValue::from_static(if mutation.replayed { "true" } else { "false" }),
    );
    Ok(response)
}

async fn list<S: SessionState>(
    State(state): State<S>,
    request: IdentityRequest,
    query: Result<Query<ListQuery>, QueryRejection>,
) -> Result<Response, IdentityHttpError> {
    let Query(query) = query.map_err(|_| request.error(IdentityError::Invalid))?;
    let session = request
        .authenticate(state.admin_services().identity())
        .await?;
    let page = state
        .admin_services()
        .retail_pricing()
        .list(&session, query.cursor, query.limit.unwrap_or(50))
        .await
        .map_err(|error| request.error(error))?;
    let generation = page.catalog.generation;
    etag_response(&request, PageView::from(page), generation.to_string())
}

async fn item<S: SessionState>(
    State(state): State<S>,
    request: IdentityRequest,
    path: Result<Path<String>, PathRejection>,
) -> Result<Response, IdentityHttpError> {
    let id = id_from_path(&request, path)?;
    let session = request
        .authenticate(state.admin_services().identity())
        .await?;
    let detail = state
        .admin_services()
        .retail_pricing()
        .get(&session, id)
        .await
        .map_err(|error| request.error(error))?;
    detail_response(&request, detail)
}

async fn create<S: SessionState>(
    State(state): State<S>,
    request: IdentityRequest,
    payload: Result<Json<CreateInput>, JsonRejection>,
) -> Result<Response, IdentityHttpError> {
    request.require_csrf()?;
    let Json(input) = payload.map_err(|_| request.error(IdentityError::Invalid))?;
    let (document, reason) = input.document().map_err(|error| request.error(error))?;
    let command = CreatePriceRevision::new(
        request.revision()?,
        document,
        reason,
        request.idempotency_key()?,
    )
    .map_err(|error| request.error(error))?;
    let session = request
        .authenticate(state.admin_services().identity())
        .await?;
    let mutation = state
        .admin_services()
        .retail_pricing()
        .create(&session, command)
        .await
        .map_err(|error| request.error(error))?;
    mutation_response(&request, mutation)
}

async fn validate<S: SessionState>(
    State(state): State<S>,
    request: IdentityRequest,
    path: Result<Path<String>, PathRejection>,
    payload: Result<Json<serde_json::Map<String, serde_json::Value>>, JsonRejection>,
) -> Result<Response, IdentityHttpError> {
    request.require_csrf()?;
    let id = id_from_path(&request, path)?;
    let Json(input) = payload.map_err(|_| request.error(IdentityError::Invalid))?;
    if !input.is_empty() {
        return Err(request.error(IdentityError::Invalid));
    }
    let session = request
        .authenticate(state.admin_services().identity())
        .await?;
    let detail = state
        .admin_services()
        .retail_pricing()
        .validate(&session, id)
        .await
        .map_err(|error| request.error(error))?;
    detail_response(&request, detail)
}

async fn preview<S: SessionState>(
    State(state): State<S>,
    request: IdentityRequest,
    path: Result<Path<String>, PathRejection>,
    payload: Result<Json<PreviewInput>, JsonRejection>,
) -> Result<Response, IdentityHttpError> {
    request.require_csrf()?;
    let id = id_from_path(&request, path)?;
    let Json(input) = payload.map_err(|_| request.error(IdentityError::Invalid))?;
    let command = input.command().map_err(|error| request.error(error))?;
    let session = request
        .authenticate(state.admin_services().identity())
        .await?;
    let preview = state
        .admin_services()
        .retail_pricing()
        .preview(&session, id, command)
        .await
        .map_err(|error| request.error(error))?;
    Ok(Json(PreviewView::from(preview)).into_response())
}

async fn publish<S: SessionState>(
    State(state): State<S>,
    request: IdentityRequest,
    path: Result<Path<String>, PathRejection>,
    payload: Result<Json<ChangeInput>, JsonRejection>,
) -> Result<Response, IdentityHttpError> {
    request.require_csrf()?;
    let command = change_command(&request, path, payload)?;
    let session = request
        .authenticate(state.admin_services().identity())
        .await?;
    let mutation = state
        .admin_services()
        .retail_pricing()
        .publish(&session, command)
        .await
        .map_err(|error| request.error(error))?;
    mutation_response(&request, mutation)
}

async fn retire<S: SessionState>(
    State(state): State<S>,
    request: IdentityRequest,
    path: Result<Path<String>, PathRejection>,
    payload: Result<Json<ChangeInput>, JsonRejection>,
) -> Result<Response, IdentityHttpError> {
    request.require_csrf()?;
    let command = change_command(&request, path, payload)?;
    let session = request
        .authenticate(state.admin_services().identity())
        .await?;
    let mutation = state
        .admin_services()
        .retail_pricing()
        .retire(&session, command)
        .await
        .map_err(|error| request.error(error))?;
    mutation_response(&request, mutation)
}

fn change_command(
    request: &IdentityRequest,
    path: Result<Path<String>, PathRejection>,
    payload: Result<Json<ChangeInput>, JsonRejection>,
) -> Result<ChangePriceRevision, IdentityHttpError> {
    let id = id_from_path(request, path)?;
    let Json(input) = payload.map_err(|_| request.error(IdentityError::Invalid))?;
    let (catalog_generation, row_version) = pricing_revision(request)?;
    if catalog_generation != input.expected_catalog_generation {
        return Err(request.error(IdentityError::Invalid));
    }
    ChangePriceRevision::new(
        id,
        row_version,
        input.expected_catalog_generation,
        input.reason,
        request.idempotency_key()?,
    )
    .map_err(|error| request.error(error))
}

fn pricing_revision(request: &IdentityRequest) -> Result<(u64, u64), IdentityHttpError> {
    let raw = request
        .if_match()?
        .strip_prefix('"')
        .and_then(|raw| raw.strip_suffix('"'))
        .and_then(|raw| raw.split_once('.'))
        .ok_or_else(|| request.error(IdentityError::Invalid))?;
    let catalog_generation = pricing_version(raw.0);
    let row_version = pricing_version(raw.1);
    catalog_generation
        .zip(row_version)
        .ok_or_else(|| request.error(IdentityError::Invalid))
}

fn pricing_version(raw: &str) -> Option<u64> {
    if raw.is_empty()
        || raw.len() > 19
        || raw.starts_with('0')
        || !raw.bytes().all(|byte| byte.is_ascii_digit())
    {
        return None;
    }
    raw.parse::<u64>()
        .ok()
        .filter(|value| *value <= i64::MAX as u64)
}
