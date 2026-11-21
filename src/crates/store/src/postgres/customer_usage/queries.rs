//! Parameterized owner filters are applied before pagination and aggregation.

use chrono::{DateTime, Utc};
use ovload_admin::model::{
    customer_usage::{CustomerUsageFilter, CustomerUsageRecord},
    identity_access::{IdentityError, IdentityResult},
};
use ovload_core::{
    access::{TenantId, UserId},
    engine::ModelRequestId,
};
use sqlx::{Postgres, QueryBuilder, Row as _, Transaction, postgres::PgRow};

use super::{super::identity::db_error, mapping};

pub(super) const AGGREGATE_ROW_LIMIT: u64 = 100_000;

const RETAIL_JOIN: &str = " left join commerce_request_settlements b on b.operation_id=m.id
    and b.tenant_id=m.tenant_id and b.user_id=m.user_id and b.model_key_id=m.client_api_key_ref ";

fn scope(
    query: &mut QueryBuilder<Postgres>,
    tenant: TenantId,
    user: UserId,
    filter: Option<&CustomerUsageFilter>,
) {
    query
        .push(" where m.owns_client_admission and m.tenant_id=")
        .push_bind(tenant.as_uuid())
        .push(" and m.user_id=")
        .push_bind(user.as_uuid());
    if let Some(filter) = filter {
        query
            .push(" and m.started_at>=")
            .push_bind(filter.from())
            .push(" and m.started_at<")
            .push_bind(filter.to());
        if let Some(key) = filter.api_key_id() {
            query
                .push(" and m.client_api_key_ref=")
                .push_bind(key.as_str().to_owned());
        }
        if let Some(model) = filter.public_model_id() {
            query
                .push(" and m.requested_model_id=")
                .push_bind(model.as_str().to_owned());
        }
        if let Some(outcome) = filter.outcome() {
            query.push(" and m.outcome=").push_bind(outcome.as_str());
        }
    }
}

pub(super) async fn position(
    tx: &mut Transaction<'_, Postgres>,
    tenant: TenantId,
    user: UserId,
    filter: &CustomerUsageFilter,
    cursor: &ModelRequestId,
) -> IdentityResult<(DateTime<Utc>, String)> {
    let mut query = QueryBuilder::<Postgres>::new("select m.started_at,m.id from model_requests m");
    scope(&mut query, tenant, user, Some(filter));
    query.push(" and m.id=").push_bind(cursor.as_str());
    let row = query
        .build()
        .fetch_optional(&mut **tx)
        .await
        .map_err(db_error)?
        .ok_or(IdentityError::Invalid)?;
    Ok((
        row.try_get("started_at").map_err(db_error)?,
        row.try_get("id").map_err(db_error)?,
    ))
}

pub(super) async fn records(
    tx: &mut Transaction<'_, Postgres>,
    tenant: TenantId,
    user: UserId,
    filter: Option<&CustomerUsageFilter>,
    position: Option<(DateTime<Utc>, String)>,
    request: Option<&ModelRequestId>,
    limit: i64,
) -> IdentityResult<Vec<CustomerUsageRecord>> {
    let mut query = QueryBuilder::<Postgres>::new("select m.id,m.client_api_key_ref,m.requested_model_id,m.operation,m.outcome,m.client_status_code,m.started_at,m.completed_at,
        m.input_tokens,m.output_tokens,m.cached_input_tokens,m.cache_write_input_tokens,m.reasoning_output_tokens,m.total_tokens,
        (m.request_observation_json #>> '{timings,local,firstTokenMs}')::bigint as first_token_ms,
        (m.request_observation_json #>> '{timings,local,latencyMs}')::bigint as latency_ms,
        case when b.state='settled' then b.settled_usd::text end as retail_charge_usd,b.state as retail_state
        from model_requests m");
    query.push(RETAIL_JOIN);
    scope(&mut query, tenant, user, filter);
    if let Some((started, id)) = position {
        query
            .push(" and (m.started_at,m.id)<(")
            .push_bind(started)
            .push(",")
            .push_bind(id)
            .push(")");
    }
    if let Some(request) = request {
        query.push(" and m.id=").push_bind(request.as_str());
    }
    query
        .push(" order by m.started_at desc,m.id desc limit ")
        .push_bind(limit);
    query
        .build()
        .fetch_all(&mut **tx)
        .await
        .map_err(db_error)?
        .iter()
        .map(mapping::record)
        .collect()
}

pub(super) async fn aggregate(
    tx: &mut Transaction<'_, Postgres>,
    tenant: TenantId,
    user: UserId,
    filter: &CustomerUsageFilter,
    daily: bool,
) -> IdentityResult<Vec<PgRow>> {
    let mut query = QueryBuilder::<Postgres>::new("with bounded as (select m.id,m.tenant_id,m.user_id,m.client_api_key_ref,m.started_at,m.outcome,
        m.input_tokens,m.output_tokens,m.cached_input_tokens,m.cache_write_input_tokens,m.reasoning_output_tokens,m.total_tokens from model_requests m");
    scope(&mut query, tenant, user, Some(filter));
    query
        .push(" order by m.started_at desc,m.id desc limit ")
        .push_bind(i64::try_from(AGGREGATE_ROW_LIMIT + 1).map_err(|_| IdentityError::Unavailable)?)
        .push(") select ");
    if daily {
        query.push("(m.started_at at time zone 'UTC')::date as date,");
    }
    query.push("count(*) as requests,
        count(*) filter(where m.outcome='succeeded') as succeeded,
        count(*) filter(where m.outcome='failed') as failed,
        count(*) filter(where m.outcome='cancelled') as cancelled,
        count(*) filter(where m.outcome='incomplete') as incomplete,
        count(*) filter(where m.outcome='running') as running,
        count(*) filter(where m.input_tokens is not null or m.output_tokens is not null or m.total_tokens is not null) as usage_reported_requests,
        sum(m.input_tokens)::text as input_tokens,sum(m.output_tokens)::text as output_tokens,
        sum(m.cached_input_tokens)::text as cached_input_tokens,sum(m.cache_write_input_tokens)::text as cache_write_input_tokens,
        sum(m.reasoning_output_tokens)::text as reasoning_output_tokens,sum(m.total_tokens)::text as total_tokens,
        count(*) filter(where b.state='settled') as settled_requests,
        (sum(b.settled_usd) filter(where b.state='settled'))::text as retail_charge_usd
        from bounded m").push(RETAIL_JOIN);
    if daily {
        query.push(" group by (m.started_at at time zone 'UTC')::date order by date");
    }
    query.build().fetch_all(&mut **tx).await.map_err(db_error)
}
