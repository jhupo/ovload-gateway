//! Customer-owned observations and authoritative retail projections only.

mod mapping;
mod monitoring;
mod queries;

use super::provider_filter::provider_filter_kinds;

use async_trait::async_trait;
use ovload_admin::{
    model::{
        customer_usage::{
            CustomerUsageDay, CustomerUsageFilter, CustomerUsagePage, CustomerUsageRecord,
            CustomerUsageSummary,
        },
        identity_access::{IdentityError, IdentityOwner, IdentityResult, IdentitySession},
    },
    ports::customer_usage::CustomerUsageStore,
};
use ovload_core::{
    access::{TenantId, UserId},
    engine::ModelRequestId,
};
use sqlx::{PgPool, Postgres, Transaction};

use super::identity::{access, db_error};

#[derive(Clone)]
pub struct PgCustomerUsageStore {
    pool: PgPool,
}

impl PgCustomerUsageStore {
    #[must_use]
    pub const fn new(pool: PgPool) -> Self {
        Self { pool }
    }

    async fn begin(
        &self,
        current: &IdentitySession,
    ) -> IdentityResult<(Transaction<'_, Postgres>, TenantId, UserId)> {
        let mut tx = self.pool.begin().await.map_err(db_error)?;
        sqlx::query("set local statement_timeout = '5s'")
            .execute(&mut *tx)
            .await
            .map_err(db_error)?;
        let current = access::lock_session(&mut tx, current).await?;
        let IdentityOwner::Customer { tenant_id, user_id } = current.owner else {
            return Err(IdentityError::Forbidden);
        };
        Ok((tx, tenant_id, user_id))
    }
}

#[async_trait]
impl CustomerUsageStore for PgCustomerUsageStore {
    async fn monitoring(
        &self,
        current: &IdentitySession,
        filter: &CustomerUsageFilter,
        provider: Option<String>,
        group: Option<String>,
    ) -> IdentityResult<serde_json::Value> {
        monitoring::read(&self.pool, current, filter, provider, group).await
    }
    async fn ranking(
        &self,
        current: &IdentitySession,
        filter: &CustomerUsageFilter,
        provider: Option<String>,
    ) -> IdentityResult<Vec<ovload_admin::model::customer_usage::UserUsageRanking>> {
        use ovload_admin::model::identity_access::IdentityManagementActor;
        use sqlx::Row as _;
        let IdentityOwner::Management(principal_id) = current.owner else {
            return Err(IdentityError::Forbidden);
        };
        let mut tx = self.pool.begin().await.map_err(db_error)?;
        sqlx::query("set local statement_timeout='5s'")
            .execute(&mut *tx)
            .await
            .map_err(db_error)?;
        let actor = IdentityManagementActor {
            session_id: current.id,
            principal_id,
            authority_generation: current.authority_generation,
        };
        access::authorize(
            &mut tx,
            actor,
            ovload_core::access::Permission::UsageRead,
            None,
        )
        .await?;
        access::authorize(
            &mut tx,
            actor,
            ovload_core::access::Permission::IdentityUsersRead,
            None,
        )
        .await?;
        access::authorize(
            &mut tx,
            actor,
            ovload_core::access::Permission::BillingRead,
            None,
        )
        .await?;
        let rows = sqlx::query("select m.user_id::text,m.tenant_id::text,u.display_name,u.email,count(*)::bigint as requests,
            case when count(m.total_tokens)=count(*) then sum(m.total_tokens)::bigint end as tokens,
            case when count(b.settled_usd) filter(where b.state='settled')=count(*) then sum(b.settled_usd)::text end as charge_usd
            from model_requests m join identity_users u on u.id=m.user_id and u.tenant_id=m.tenant_id
            left join commerce_request_settlements b on b.operation_id=m.id and b.tenant_id=m.tenant_id and b.user_id=m.user_id and b.model_key_id=m.client_api_key_ref
            where m.owns_client_admission and m.started_at >= $1 and m.started_at < $2 and ($3::text[] is null or m.provider_kind=any($3))
            group by m.user_id,m.tenant_id,u.display_name,u.email order by requests desc,m.tenant_id,m.user_id limit 1000")
            .bind(filter.from()).bind(filter.to()).bind(provider.as_deref().map(provider_filter_kinds)).fetch_all(&mut *tx).await.map_err(db_error)?;
        let mut result = Vec::with_capacity(rows.len());
        for row in rows {
            result.push(ovload_admin::model::customer_usage::UserUsageRanking {
                user_id: row.try_get("user_id").map_err(db_error)?,
                tenant_id: row.try_get("tenant_id").map_err(db_error)?,
                user: row.try_get("display_name").map_err(db_error)?,
                email: row.try_get("email").map_err(db_error)?,
                requests: row.try_get("requests").map_err(db_error)?,
                tokens: row.try_get("tokens").map_err(db_error)?,
                charge_usd: row.try_get("charge_usd").map_err(db_error)?,
                cost_usd: None,
            });
        }
        tx.commit().await.map_err(db_error)?;
        Ok(result)
    }
    async fn list(
        &self,
        current: &IdentitySession,
        filter: &CustomerUsageFilter,
        cursor: Option<ModelRequestId>,
        limit: u16,
    ) -> IdentityResult<CustomerUsagePage> {
        if !(1..=100).contains(&limit) {
            return Err(IdentityError::Invalid);
        }
        let (mut tx, tenant, user) = self.begin(current).await?;
        let position = if let Some(cursor) = cursor.as_ref() {
            Some(queries::position(&mut tx, tenant, user, filter, cursor).await?)
        } else {
            None
        };
        let mut items = queries::records(
            &mut tx,
            tenant,
            user,
            Some(filter),
            position,
            None,
            i64::from(limit) + 1,
        )
        .await?;
        let extra = items.len() > usize::from(limit);
        items.truncate(usize::from(limit));
        let next_cursor = if extra {
            items.last().map(|record| record.request_id.clone())
        } else {
            None
        };
        tx.commit().await.map_err(db_error)?;
        Ok(CustomerUsagePage { items, next_cursor })
    }

    async fn get(
        &self,
        current: &IdentitySession,
        request_id: &ModelRequestId,
    ) -> IdentityResult<CustomerUsageRecord> {
        let (mut tx, tenant, user) = self.begin(current).await?;
        let mut records =
            queries::records(&mut tx, tenant, user, None, None, Some(request_id), 1).await?;
        let record = records.pop().ok_or(IdentityError::NotFound)?;
        tx.commit().await.map_err(db_error)?;
        Ok(record)
    }

    async fn summary(
        &self,
        current: &IdentitySession,
        filter: &CustomerUsageFilter,
    ) -> IdentityResult<CustomerUsageSummary> {
        let (mut tx, tenant, user) = self.begin(current).await?;
        let rows = queries::aggregate(&mut tx, tenant, user, filter, false).await?;
        let row = rows.first().ok_or(IdentityError::Unavailable)?;
        let summary = mapping::summary(row)?;
        if summary.requests > queries::AGGREGATE_ROW_LIMIT {
            return Err(IdentityError::Invalid);
        }
        tx.commit().await.map_err(db_error)?;
        Ok(summary)
    }

    async fn trend(
        &self,
        current: &IdentitySession,
        filter: &CustomerUsageFilter,
    ) -> IdentityResult<Vec<CustomerUsageDay>> {
        let (mut tx, tenant, user) = self.begin(current).await?;
        let rows = queries::aggregate(&mut tx, tenant, user, filter, true).await?;
        let mut count = 0_u64;
        let mut items = Vec::with_capacity(rows.len());
        for row in rows {
            use sqlx::Row as _;
            let summary = mapping::summary(&row)?;
            count = count
                .checked_add(summary.requests)
                .ok_or(IdentityError::Unavailable)?;
            if count > queries::AGGREGATE_ROW_LIMIT {
                return Err(IdentityError::Invalid);
            }
            items.push(CustomerUsageDay {
                date: row.try_get("date").map_err(db_error)?,
                summary,
            });
        }
        tx.commit().await.map_err(db_error)?;
        Ok(items)
    }

    async fn export(
        &self,
        current: &IdentitySession,
        filter: &CustomerUsageFilter,
    ) -> IdentityResult<Vec<CustomerUsageRecord>> {
        let (mut tx, tenant, user) = self.begin(current).await?;
        let records =
            queries::records(&mut tx, tenant, user, Some(filter), None, None, 1_001).await?;
        if records.len() > 1_000 {
            return Err(IdentityError::Invalid);
        }
        tx.commit().await.map_err(db_error)?;
        Ok(records)
    }
}
