//! Bounded, filtered monitoring snapshots from execution facts.

use super::super::identity::{access, db_error};
use super::super::provider_filter::provider_filter_kinds;
use ovload_admin::model::{
    customer_usage::CustomerUsageFilter,
    identity_access::{
        IdentityError, IdentityManagementActor, IdentityOwner, IdentityResult, IdentitySession,
    },
};
use ovload_core::access::Permission;
use serde_json::{Value, json};
use sqlx::{PgPool, Row};

pub(super) async fn read(
    pool: &PgPool,
    current: &IdentitySession,
    filter: &CustomerUsageFilter,
    provider: Option<String>,
    group: Option<String>,
) -> IdentityResult<Value> {
    let IdentityOwner::Management(principal_id) = current.owner else {
        return Err(IdentityError::Forbidden);
    };
    let mut tx = pool.begin().await.map_err(db_error)?;
    sqlx::query("set local statement_timeout='5s'")
        .execute(&mut *tx)
        .await
        .map_err(db_error)?;
    access::authorize(
        &mut tx,
        IdentityManagementActor {
            session_id: current.id,
            principal_id,
            authority_generation: current.authority_generation,
        },
        Permission::UsageRead,
        None,
    )
    .await?;
    let seconds = filter
        .to()
        .signed_duration_since(filter.from())
        .num_seconds();
    let bucket = if seconds <= 3600 {
        60
    } else if seconds <= 86400 {
        3600
    } else {
        86400
    };
    let rows = sqlx::query("select to_timestamp(floor(extract(epoch from m.started_at)::double precision/$5::double precision)*$5::double precision) as bucket,
        count(*)::bigint as requests,count(*) filter(where m.outcome='succeeded')::bigint as succeeded,
        count(*) filter(where m.outcome='failed')::bigint as failed,
        case when count(m.total_tokens)=count(*) then sum(m.total_tokens)::bigint end as tokens,
        count(m.request_observation_json #>> '{timings,local,latencyMs}')::bigint as latency_samples,
        count(m.request_observation_json #>> '{timings,local,firstTokenMs}')::bigint as first_token_samples,
        avg((m.request_observation_json #>> '{timings,local,latencyMs}')::double precision) as latency_ms,
        avg((m.request_observation_json #>> '{timings,local,firstTokenMs}')::double precision) as first_token_ms
        from model_requests m where m.owns_client_admission and m.started_at >= $1 and m.started_at < $2
        and ($3::text[] is null or m.provider_kind=any($3)) and ($4::text is null or (m.request_observation_json #> '{routing,groupRefs}') ? $4)
        group by bucket order by bucket")
        .bind(filter.from()).bind(filter.to()).bind(provider.as_deref().map(provider_filter_kinds)).bind(&group).bind(f64::from(bucket)).fetch_all(&mut *tx).await.map_err(db_error)?;
    let mut observed = std::collections::BTreeMap::new();
    for row in rows {
        let bucket_at: chrono::DateTime<chrono::Utc> = row.try_get("bucket").map_err(db_error)?;
        observed.insert(bucket_at.timestamp(),json!({"bucket":bucket_at,"seconds":bucket,"requests":row.try_get::<i64,_>("requests").map_err(db_error)?,"succeeded":row.try_get::<i64,_>("succeeded").map_err(db_error)?,"failed":row.try_get::<i64,_>("failed").map_err(db_error)?,"tokens":row.try_get::<Option<i64>,_>("tokens").map_err(db_error)?,"latencyMs":row.try_get::<Option<f64>,_>("latency_ms").map_err(db_error)?,"firstTokenMs":row.try_get::<Option<f64>,_>("first_token_ms").map_err(db_error)?,"latencySamples":row.try_get::<i64,_>("latency_samples").map_err(db_error)?,"firstTokenSamples":row.try_get::<i64,_>("first_token_samples").map_err(db_error)?}));
    }
    // Include idle buckets so an old observation is not presented as current throughput.
    let width = i64::from(bucket);
    let mut cursor = filter.from().timestamp().div_euclid(width) * width;
    let mut points = Vec::new();
    loop {
        let start = chrono::DateTime::from_timestamp(cursor, 0).ok_or(IdentityError::Invalid)?;
        if start >= filter.to() {
            break;
        }
        let end = start + chrono::Duration::seconds(width);
        let seconds = (end.min(filter.to()) - start.max(filter.from()))
            .num_milliseconds()
            .max(1) as f64
            / 1000.0;
        let mut point = observed.remove(&cursor).unwrap_or_else(|| json!({"bucket":start,"requests":0,"succeeded":0,"failed":0,"tokens":0,"latencyMs":null,"firstTokenMs":null,"latencySamples":0,"firstTokenSamples":0}));
        point["seconds"] = json!(seconds);
        points.push(point);
        cursor += width;
    }
    let queued = ovload_core::monitoring_queue::snapshot();
    let account_waits = queued
        .iter()
        .filter(|(_, v)| v["layer"] == "account")
        .map(|(id, _)| id.clone())
        .collect::<Vec<_>>();
    let rows = sqlx::query("select m.user_id::text,u.display_name,m.provider_kind,count(*)::bigint as concurrent,u.max_concurrency,case when m.id=any($3) then 'queued' else 'processing' end as wait_state
        from model_requests m join identity_users u on u.id=m.user_id and u.tenant_id=m.tenant_id
        where m.owns_client_admission and m.outcome='running'
        and ($1::text[] is null or m.provider_kind=any($1)) and ($2::text is null or (m.request_observation_json #> '{routing,groupRefs}') ? $2)
        group by m.user_id,u.display_name,m.provider_kind,u.max_concurrency,wait_state order by concurrent desc,m.user_id")
        .bind(provider.as_deref().map(provider_filter_kinds)).bind(&group).bind(&account_waits).fetch_all(&mut *tx).await.map_err(db_error)?;
    let mut active = Vec::new();
    for row in rows {
        active.push(json!({"id":row.try_get::<String,_>("user_id").map_err(db_error)?,"user":row.try_get::<String,_>("display_name").map_err(db_error)?,"provider":row.try_get::<Option<String>,_>("provider_kind").map_err(db_error)?,"concurrent":row.try_get::<i64,_>("concurrent").map_err(db_error)?,"limit":row.try_get::<i32,_>("max_concurrency").map_err(db_error)?,"status":row.try_get::<String,_>("wait_state").map_err(db_error)?}));
    }
    // Key admission waits precede model_requests insertion and must be joined by owner.
    if provider.is_none() {
        let mut counts = std::collections::BTreeMap::<String, i64>::new();
        for value in queued.values().filter(|v| v["layer"] == "client") {
            if group.as_ref().is_some_and(|g| {
                !value["groups"]
                    .as_array()
                    .is_some_and(|a| a.iter().any(|v| v.as_str() == Some(g)))
            }) {
                continue;
            }
            if let Some(user) = value["userId"].as_str() {
                *counts.entry(user.to_owned()).or_default() += 1;
            }
        }
        if !counts.is_empty() {
            let users=sqlx::query("select id::text,display_name,max_concurrency from identity_users where id::text=any($1)")
                .bind(counts.keys().cloned().collect::<Vec<_>>()).fetch_all(&mut *tx).await.map_err(db_error)?;
            for row in users {
                let id: String = row.try_get("id").map_err(db_error)?;
                active.push(json!({"id":id,"user":row.try_get::<String,_>("display_name").map_err(db_error)?,"provider":null,"concurrent":counts[&id],"limit":row.try_get::<i32,_>("max_concurrency").map_err(db_error)?,"status":"queued"}));
            }
        }
    }
    tx.commit().await.map_err(db_error)?;
    Ok(json!({"from":filter.from(),"to":filter.to(),"points":points,"active":active}))
}
