use super::identity::{access, db_error};
use super::provider_filter::provider_filter_kinds;
use async_trait::async_trait;
use chrono::{DateTime, Utc};
use ovload_admin::{model::identity_access::*, ports::monitoring::*};
use ovload_core::access::Permission;
use serde_json::{Value, json};
use sqlx::{PgPool, Postgres, Row, Transaction};

pub(crate) struct PgMonitoring {
    pub pool: PgPool,
    pub redis: ::redis::aio::ConnectionManager,
}
impl PgMonitoring {
    async fn authorized(
        &self,
        session: &IdentitySession,
        write: bool,
    ) -> IdentityResult<Transaction<'_, Postgres>> {
        let IdentityOwner::Management(principal_id) = session.owner else {
            return Err(IdentityError::Forbidden);
        };
        let mut tx = self.pool.begin().await.map_err(db_error)?;
        sqlx::query("set local statement_timeout='5s'")
            .execute(&mut *tx)
            .await
            .map_err(db_error)?;
        access::authorize(
            &mut tx,
            IdentityManagementActor {
                session_id: session.id,
                principal_id,
                authority_generation: session.authority_generation,
            },
            if write {
                Permission::SecuritySettingsManage
            } else {
                Permission::UsageRead
            },
            None,
        )
        .await?;
        Ok(tx)
    }
}
fn config(row: sqlx::postgres::PgRow) -> IdentityResult<LogConfig> {
    Ok(LogConfig {
        revision: row.try_get("revision").map_err(db_error)?,
        enabled: row.try_get("enabled").map_err(db_error)?,
        level: row.try_get("level").map_err(db_error)?,
        retention_days: row.try_get("retention_days").map_err(db_error)?,
    })
}
async fn audit(
    tx: &mut Transaction<'_, Postgres>,
    session: &IdentitySession,
    action: &str,
    details: Value,
) -> IdentityResult<()> {
    let IdentityOwner::Management(id) = session.owner else {
        return Err(IdentityError::Forbidden);
    };
    sqlx::query("insert into system_log_changes(principal_id,action,details) values($1,$2,$3)")
        .bind(id.as_uuid())
        .bind(action)
        .bind(details)
        .execute(&mut **tx)
        .await
        .map_err(db_error)?;
    Ok(())
}
#[async_trait]
impl MonitoringStore for PgMonitoring {
    async fn logs(&self, session: &IdentitySession, q: &LogQuery) -> IdentityResult<Value> {
        if !q.valid() {
            return Err(IdentityError::Invalid);
        }
        let mut tx = self.authorized(session, false).await?;

        let page = q.page.unwrap_or(1);
        let size = q.page_size.unwrap_or(20);
        let total: i64 = sqlx::query_scalar("select count(*) from system_logs l where l.occurred_at >= $1 and l.occurred_at < $2
          and ($3::text is null or l.level=$3) and ($4::text is null or l.component ilike '%'||$4||'%')
          and ($5::text is null or l.message ilike '%'||$5||'%') and ($6::text is null or l.request_id=$6)
          and ($7::text[] is null or l.provider=any($7) or exists(select 1 from model_requests m where m.id=l.request_id and m.provider_kind=any($7)))
          and ($8::text is null or exists(select 1 from model_requests m where m.id=l.request_id and (m.request_observation_json #> '{routing,groupRefs}') ? $8))
          and ($9::text is null or l.account_id=$9)")
            .bind(q.from)
            .bind(q.to)
            .bind(&q.level)
            .bind(&q.component)
            .bind(&q.search)
            .bind(&q.request_id)
            .bind(q.provider.as_deref().map(provider_filter_kinds))
            .bind(&q.group_id)
            .bind(&q.account_id)
            .fetch_one(&mut *tx)
            .await
            .map_err(db_error)?;
        let rows = sqlx::query("select l.* from system_logs l where l.occurred_at >= $1 and l.occurred_at < $2
          and ($3::text is null or l.level=$3) and ($4::text is null or l.component ilike '%'||$4||'%')
          and ($5::text is null or l.message ilike '%'||$5||'%') and ($6::text is null or l.request_id=$6)
          and ($7::text[] is null or l.provider=any($7) or exists(select 1 from model_requests m where m.id=l.request_id and m.provider_kind=any($7)))
          and ($8::text is null or exists(select 1 from model_requests m where m.id=l.request_id and (m.request_observation_json #> '{routing,groupRefs}') ? $8))
          and ($9::text is null or l.account_id=$9) order by l.occurred_at desc,l.id desc limit $10 offset $11")
            .bind(q.from)
            .bind(q.to)
            .bind(&q.level)
            .bind(&q.component)
            .bind(&q.search)
            .bind(&q.request_id)
            .bind(q.provider.as_deref().map(provider_filter_kinds))
            .bind(&q.group_id)
            .bind(&q.account_id)
            .bind(size)
            .bind((page - 1) * size)
            .fetch_all(&mut *tx)
            .await
            .map_err(db_error)?;
        let mut items = Vec::new();
        for r in rows {
            items.push(json!({"id":r.try_get::<String,_>("id").map_err(db_error)?,"occurredAt":r.try_get::<DateTime<Utc>,_>("occurred_at").map_err(db_error)?,"level":r.try_get::<String,_>("level").map_err(db_error)?,"component":r.try_get::<String,_>("component").map_err(db_error)?,"message":r.try_get::<String,_>("message").map_err(db_error)?,"requestId":r.try_get::<Option<String>,_>("request_id").map_err(db_error)?,"provider":r.try_get::<Option<String>,_>("provider").map_err(db_error)?,"accountId":r.try_get::<Option<String>,_>("account_id").map_err(db_error)?,"fields":r.try_get::<Value,_>("fields").map_err(db_error)?}));
        }
        tx.commit().await.map_err(db_error)?;
        Ok(json!({"items":items,"total":total,"page":page,"pageSize":size}))
    }
    async fn config(&self, session: &IdentitySession) -> IdentityResult<LogConfig> {
        let mut tx = self.authorized(session, false).await?;
        let result = config(
            sqlx::query("select * from system_log_config where singleton")
                .fetch_one(&mut *tx)
                .await
                .map_err(db_error)?,
        )?;
        tx.commit().await.map_err(db_error)?;
        Ok(result)
    }
    async fn save_config(
        &self,
        session: &IdentitySession,
        value: LogConfig,
    ) -> IdentityResult<LogConfig> {
        if !value.valid() {
            return Err(IdentityError::Invalid);
        }
        let mut tx = self.authorized(session, true).await?;
        let row = sqlx::query("update system_log_config set revision=revision+1,enabled=$1,level=$2,retention_days=$3 where singleton and revision=$4 returning *")
            .bind(value.enabled).bind(&value.level).bind(value.retention_days).bind(value.revision).fetch_optional(&mut *tx).await.map_err(db_error)?.ok_or(IdentityError::Conflict)?;
        let result = config(row)?;
        audit(&mut tx, session, "configure", json!(result)).await?;
        tx.commit().await.map_err(db_error)?;
        Ok(result)
    }
    async fn cleanup(
        &self,
        session: &IdentitySession,
        before: DateTime<Utc>,
    ) -> IdentityResult<u64> {
        if before > Utc::now() {
            return Err(IdentityError::Invalid);
        }
        let mut tx = self.authorized(session, true).await?;
        let deleted = sqlx::query("delete from system_logs where id in(select id from system_logs where occurred_at<$1 order by occurred_at limit 10000)").bind(before).execute(&mut *tx).await.map_err(db_error)?.rows_affected();
        audit(
            &mut tx,
            session,
            "cleanup",
            json!({"before":before,"deleted":deleted}),
        )
        .await?;
        tx.commit().await.map_err(db_error)?;
        Ok(deleted)
    }
    async fn resources(&self, session: &IdentitySession) -> IdentityResult<Value> {
        self.authorized(session, false)
            .await?
            .commit()
            .await
            .map_err(db_error)?;
        let mut redis = self.redis.clone();
        let info = tokio::time::timeout(
            std::time::Duration::from_secs(2),
            ::redis::cmd("INFO")
                .arg("clients")
                .query_async::<String>(&mut redis),
        )
        .await
        .ok()
        .and_then(Result::ok);
        let field = |name: &str| {
            info.as_ref().and_then(|s| {
                s.lines().find_map(|l| {
                    l.strip_prefix(&format!("{name}:"))
                        .and_then(|v| v.trim().parse::<u64>().ok())
                })
            })
        };
        Ok(
            json!({"database":{"size":self.pool.size(),"idle":self.pool.num_idle(),"max":self.pool.options().get_max_connections()},"redis":{"connected":field("connected_clients"),"blocked":field("blocked_clients"),"max":field("maxclients")}}),
        )
    }
    async fn ingest(&self, records: &[Value]) -> IdentityResult<LogConfig> {
        let mut tx = self.pool.begin().await.map_err(db_error)?;
        sqlx::query("set local statement_timeout='5s'")
            .execute(&mut *tx)
            .await
            .map_err(db_error)?;
        let cfg = config(
            sqlx::query("select * from system_log_config where singleton")
                .fetch_one(&mut *tx)
                .await
                .map_err(db_error)?,
        )?;
        if cfg.enabled && !records.is_empty() {
            sqlx::query("insert into system_logs(id,occurred_at,level,component,message,request_id,provider,account_id,fields) select id,\"occurredAt\",level,component,message,\"requestId\",provider,\"accountId\",fields from jsonb_to_recordset($1) as x(id text,\"occurredAt\" timestamptz,level text,component text,message text,\"requestId\" text,provider text,\"accountId\" text,fields jsonb) on conflict(id) do nothing")
                .bind(json!(records)).execute(&mut *tx).await.map_err(db_error)?;
        }
        sqlx::query("delete from system_logs where id in(select id from system_logs where occurred_at < now()-make_interval(days=>$1) order by occurred_at limit 1000)").bind(cfg.retention_days).execute(&mut *tx).await.map_err(db_error)?;
        tx.commit().await.map_err(db_error)?;
        Ok(cfg)
    }
}
