//! Customer-only usage HTTP views, with no upstream diagnostics or costs.

use axum::{
    Json, Router,
    extract::{
        Path, Query, State,
        rejection::{PathRejection, QueryRejection},
    },
    http::header,
    response::{IntoResponse, Response},
    routing::get,
};
use chrono::{DateTime, Utc};
use ovload_admin::model::{
    customer_usage::{CustomerUsageFilter, CustomerUsageRecord, CustomerUsageSummary},
    identity_access::{IdentityAudience, IdentityError},
};
use ovload_core::{
    engine::{ExecutionOutcome, ModelRequestId},
    policy::ClientApiKeyId,
    routing::PublicModelId,
};
use serde::Deserialize;
use serde_json::{Value, json};

use super::{extract::IdentityRequest, wire::IdentityHttpError};
use crate::auth::SessionState;

pub(super) fn router<S: SessionState + Clone + Send + Sync + 'static>(
    audience: IdentityAudience,
) -> Router<S> {
    if audience != IdentityAudience::Customer {
        return Router::new()
            .route("/usage/ranking", get(ranking::<S>))
            .route("/monitoring", get(monitoring::<S>));
    }
    Router::new()
        .route("/usage", get(list::<S>))
        .route("/usage/summary", get(summary::<S>))
        .route("/usage/trend", get(trend::<S>))
        .route("/usage/export", get(export::<S>))
        .route("/usage/{id}", get(detail::<S>))
}

#[derive(Deserialize)]
#[serde(rename_all = "camelCase", deny_unknown_fields)]
struct RankingQuery {
    start_time: Option<String>,
    end_time: Option<String>,
    period: Option<String>,
    as_of: Option<i64>,
    provider: Option<String>,
}

#[derive(Deserialize)]
#[serde(deny_unknown_fields)]
struct MonitoringQuery {
    from: DateTime<Utc>,
    to: DateTime<Utc>,
    provider: Option<String>,
    group_id: Option<String>,
    active_page: Option<usize>,
    active_page_size: Option<usize>,
}

async fn monitoring<S: SessionState>(
    State(state): State<S>,
    request: IdentityRequest,
    query: Result<Query<MonitoringQuery>, QueryRejection>,
) -> Result<Response, IdentityHttpError> {
    let Query(query) = query.map_err(|_| request.error(IdentityError::Invalid))?;
    let page = query.active_page.unwrap_or(1);
    let size = query.active_page_size.unwrap_or(20);
    if !(1..=100_000).contains(&page) || !(1..=100).contains(&size) {
        return Err(request.error(IdentityError::Invalid));
    }
    let filter = CustomerUsageFilter::new(query.from, query.to, None, None, None)
        .map_err(|e| request.error(e))?;
    let session = request
        .authenticate(state.admin_services().identity())
        .await?;
    let mut result = state
        .admin_services()
        .customer_usage()
        .monitoring(&session, &filter, query.provider, query.group_id)
        .await
        .map_err(|e| request.error(e))?;
    paginate_active(&mut result, page, size);
    Ok(Json(result).into_response())
}

fn paginate_active(result: &mut Value, page: usize, size: usize) {
    if let Some(rows) = result["active"].as_array() {
        let total = rows.len();
        let page = page.min(total.div_ceil(size).max(1));
        let users = rows
            .iter()
            .filter_map(|v| v["id"].as_str())
            .collect::<std::collections::BTreeSet<_>>()
            .len();
        let threads = rows
            .iter()
            .filter_map(|v| v["concurrent"].as_i64())
            .sum::<i64>();
        let items = rows
            .iter()
            .skip((page - 1) * size)
            .take(size)
            .cloned()
            .collect::<Vec<_>>();
        result["activeSummary"] =
            json!({"total":total,"users":users,"threads":threads,"page":page});
        result["active"] = json!(items);
    }
}

#[cfg(test)]
mod monitoring_pagination_tests {
    use super::*;
    #[test]
    fn counts_include_all_rows_and_pages_clamp_after_requests_finish() {
        let mut result = json!({"active":(0..130).map(|i|json!({"id":format!("user-{i}"),"concurrent":2})).collect::<Vec<_>>()});
        paginate_active(&mut result, 3, 50);
        assert_eq!(result["activeSummary"]["total"], 130);
        assert_eq!(result["activeSummary"]["users"], 130);
        assert_eq!(result["activeSummary"]["threads"], 260);
        assert_eq!(result["active"].as_array().unwrap().len(), 30);
        let mut smaller = json!({"active":[{"id":"user-a","concurrent":1}]});
        paginate_active(&mut smaller, 3, 50);
        assert_eq!(smaller["activeSummary"]["page"], 1);
        assert_eq!(smaller["active"].as_array().unwrap().len(), 1);
    }
}

async fn ranking<S: SessionState>(
    State(state): State<S>,
    request: IdentityRequest,
    query: Result<Query<RankingQuery>, QueryRejection>,
) -> Result<Response, IdentityHttpError> {
    let Query(query) = query.map_err(|_| request.error(IdentityError::Invalid))?;
    let range = crate::time::query_range(
        query.start_time.as_deref(),
        query.end_time.as_deref(),
        query.period.as_deref(),
        query.as_of,
        state.admin_services().timezone(),
        "today",
    )
    .map_err(|_| request.error(IdentityError::Invalid))?;
    let filter = CustomerUsageFilter::new(range.start, range.end, None, None, None)
        .map_err(|e| request.error(e))?;
    let session = request
        .authenticate(state.admin_services().identity())
        .await?;
    let items = state
        .admin_services()
        .customer_usage()
        .ranking(&session, &filter, query.provider)
        .await
        .map_err(|e| request.error(e))?;
    Ok(Json(json!({"items":items})).into_response())
}

#[derive(Deserialize)]
#[serde(deny_unknown_fields)]
struct UsageQuery {
    from: DateTime<Utc>,
    to: DateTime<Utc>,
    api_key_id: Option<String>,
    public_model_id: Option<String>,
    outcome: Option<String>,
    cursor: Option<String>,
    limit: Option<u16>,
}

impl UsageQuery {
    fn filter(&self, pagination: bool) -> Result<CustomerUsageFilter, IdentityError> {
        if !pagination && (self.cursor.is_some() || self.limit.is_some()) {
            return Err(IdentityError::Invalid);
        }
        let key = self
            .api_key_id
            .as_ref()
            .map(|key| ClientApiKeyId::new(key.clone()).map_err(|_| IdentityError::Invalid))
            .transpose()?;
        let model = self
            .public_model_id
            .as_ref()
            .map(|model| PublicModelId::new(model.clone()).map_err(|_| IdentityError::Invalid))
            .transpose()?;
        let outcome = self
            .outcome
            .as_deref()
            .map(|outcome| match outcome {
                "running" => Ok(ExecutionOutcome::Running),
                "succeeded" => Ok(ExecutionOutcome::Succeeded),
                "failed" => Ok(ExecutionOutcome::Failed),
                "cancelled" => Ok(ExecutionOutcome::Cancelled),
                "incomplete" => Ok(ExecutionOutcome::Incomplete),
                _ => Err(IdentityError::Invalid),
            })
            .transpose()?;
        CustomerUsageFilter::new(self.from, self.to, key, model, outcome)
    }
}

fn record_view(record: CustomerUsageRecord) -> Value {
    json!({
        "request_id":record.request_id.as_str(),"api_key_id":record.api_key_id.as_str(),
        "public_model_id":record.public_model_id.as_ref().map(PublicModelId::as_str),
        "operation":record.operation,"outcome":record.outcome.as_str(),"client_status_code":record.client_status_code,
        "started_at":record.started_at,"completed_at":record.completed_at,
        "input_tokens":record.input_tokens,"output_tokens":record.output_tokens,"cached_input_tokens":record.cached_input_tokens,
        "cache_write_input_tokens":record.cache_write_input_tokens,"reasoning_output_tokens":record.reasoning_output_tokens,"total_tokens":record.total_tokens,
        "first_token_ms":record.first_token_ms,"latency_ms":record.latency_ms,
        "retail_charge_usd":record.retail_charge_usd.map(|amount|amount.canonical()),"retail_state":record.retail_state.map(|state|state.as_str()),
        "currency":"USD","scale":10,
    })
}

fn summary_view(summary: CustomerUsageSummary) -> Value {
    json!({
        "requests":summary.requests,"succeeded":summary.succeeded,"failed":summary.failed,"cancelled":summary.cancelled,"incomplete":summary.incomplete,"running":summary.running,
        "usage_reported_requests":summary.usage_reported_requests,"input_tokens":summary.input_tokens,"output_tokens":summary.output_tokens,"cached_input_tokens":summary.cached_input_tokens,
        "cache_write_input_tokens":summary.cache_write_input_tokens,"reasoning_output_tokens":summary.reasoning_output_tokens,"total_tokens":summary.total_tokens,
        "settled_requests":summary.settled_requests,"retail_charge_usd":summary.retail_charge_usd.map(|amount|amount.canonical()),"currency":"USD","scale":10,
    })
}

async fn list<S: SessionState>(
    State(state): State<S>,
    request: IdentityRequest,
    query: Result<Query<UsageQuery>, QueryRejection>,
) -> Result<Response, IdentityHttpError> {
    let Query(query) = query.map_err(|_| request.error(IdentityError::Invalid))?;
    let filter = query.filter(true).map_err(|error| request.error(error))?;
    let cursor = query
        .cursor
        .map(|cursor| {
            ModelRequestId::new(cursor).map_err(|_| request.error(IdentityError::Invalid))
        })
        .transpose()?;
    let session = request
        .authenticate(state.admin_services().identity())
        .await?;
    let page = state
        .admin_services()
        .customer_usage()
        .list(&session, &filter, cursor, query.limit.unwrap_or(50))
        .await
        .map_err(|error| request.error(error))?;
    Ok(Json(json!({"items":page.items.into_iter().map(record_view).collect::<Vec<_>>(),"next_cursor":page.next_cursor.map(|cursor|cursor.to_string())})).into_response())
}

async fn detail<S: SessionState>(
    State(state): State<S>,
    request: IdentityRequest,
    path: Result<Path<String>, PathRejection>,
) -> Result<Response, IdentityHttpError> {
    let Path(id) = path.map_err(|_| request.error(IdentityError::Invalid))?;
    let id = ModelRequestId::new(id).map_err(|_| request.error(IdentityError::Invalid))?;
    let session = request
        .authenticate(state.admin_services().identity())
        .await?;
    let record = state
        .admin_services()
        .customer_usage()
        .get(&session, &id)
        .await
        .map_err(|error| request.error(error))?;
    Ok(Json(record_view(record)).into_response())
}

async fn summary<S: SessionState>(
    State(state): State<S>,
    request: IdentityRequest,
    query: Result<Query<UsageQuery>, QueryRejection>,
) -> Result<Response, IdentityHttpError> {
    let Query(query) = query.map_err(|_| request.error(IdentityError::Invalid))?;
    let filter = query.filter(false).map_err(|error| request.error(error))?;
    let session = request
        .authenticate(state.admin_services().identity())
        .await?;
    let summary = state
        .admin_services()
        .customer_usage()
        .summary(&session, &filter)
        .await
        .map_err(|error| request.error(error))?;
    Ok(Json(summary_view(summary)).into_response())
}

async fn trend<S: SessionState>(
    State(state): State<S>,
    request: IdentityRequest,
    query: Result<Query<UsageQuery>, QueryRejection>,
) -> Result<Response, IdentityHttpError> {
    let Query(query) = query.map_err(|_| request.error(IdentityError::Invalid))?;
    let filter = query.filter(false).map_err(|error| request.error(error))?;
    let session = request
        .authenticate(state.admin_services().identity())
        .await?;
    let items = state
        .admin_services()
        .customer_usage()
        .trend(&session, &filter)
        .await
        .map_err(|error| request.error(error))?;
    Ok(Json(json!({"items":items.into_iter().map(|item|json!({"date":item.date,"summary":summary_view(item.summary)})).collect::<Vec<_>>()})).into_response())
}

async fn export<S: SessionState>(
    State(state): State<S>,
    request: IdentityRequest,
    query: Result<Query<UsageQuery>, QueryRejection>,
) -> Result<Response, IdentityHttpError> {
    let Query(query) = query.map_err(|_| request.error(IdentityError::Invalid))?;
    let filter = query.filter(false).map_err(|error| request.error(error))?;
    let session = request
        .authenticate(state.admin_services().identity())
        .await?;
    let records = state
        .admin_services()
        .customer_usage()
        .export(&session, &filter)
        .await
        .map_err(|error| request.error(error))?;
    let body = csv_export(records).map_err(|error| request.error(error))?;
    Ok((
        [
            (header::CONTENT_TYPE, "text/csv; charset=utf-8"),
            (
                header::CONTENT_DISPOSITION,
                "attachment; filename=usage.csv",
            ),
        ],
        body,
    )
        .into_response())
}

fn csv_export(records: Vec<CustomerUsageRecord>) -> Result<Vec<u8>, IdentityError> {
    let mut writer = csv::WriterBuilder::new()
        .terminator(csv::Terminator::CRLF)
        .from_writer(Vec::new());
    writer
        .write_record([
            "request_id",
            "api_key_id",
            "public_model_id",
            "operation",
            "outcome",
            "client_status_code",
            "started_at",
            "completed_at",
            "input_tokens",
            "output_tokens",
            "cached_input_tokens",
            "cache_write_input_tokens",
            "reasoning_output_tokens",
            "total_tokens",
            "first_token_ms",
            "latency_ms",
            "retail_charge_usd",
            "retail_state",
            "currency",
            "scale",
        ])
        .map_err(|_| IdentityError::Unavailable)?;
    for record in records {
        let cells = [
            record.request_id.to_string(),
            record.api_key_id.to_string(),
            record
                .public_model_id
                .map(|model| model.to_string())
                .unwrap_or_default(),
            record.operation,
            record.outcome.as_str().to_owned(),
            record
                .client_status_code
                .map(|value| value.to_string())
                .unwrap_or_default(),
            record.started_at.to_rfc3339(),
            record
                .completed_at
                .map(|value| value.to_rfc3339())
                .unwrap_or_default(),
            cell_number(record.input_tokens),
            cell_number(record.output_tokens),
            cell_number(record.cached_input_tokens),
            cell_number(record.cache_write_input_tokens),
            cell_number(record.reasoning_output_tokens),
            cell_number(record.total_tokens),
            cell_number(record.first_token_ms),
            cell_number(record.latency_ms),
            record
                .retail_charge_usd
                .map(|amount| amount.canonical())
                .unwrap_or_default(),
            record
                .retail_state
                .map(|state| state.as_str().to_owned())
                .unwrap_or_default(),
            "USD".to_owned(),
            "10".to_owned(),
        ];
        writer
            .write_record(cells.into_iter().map(formula_safe))
            .map_err(|_| IdentityError::Unavailable)?;
    }
    writer.into_inner().map_err(|_| IdentityError::Unavailable)
}

fn cell_number(value: Option<u64>) -> String {
    value.map(|value| value.to_string()).unwrap_or_default()
}

fn formula_safe(value: String) -> String {
    let first = value.trim_start_matches(char::is_whitespace).chars().next();
    if first.is_some_and(|first| matches!(first, '=' | '+' | '-' | '@'))
        || value.starts_with(['\t', '\r', '\n'])
    {
        format!("'{value}")
    } else {
        value
    }
}
