//! Live tenant-scoped reads of durable retail operation projections.

use async_trait::async_trait;
use chrono::{DateTime, Utc};
use ovload_admin::{
    model::{
        billing_operations::BillingOperationPage,
        identity_access::{
            IdentityError, IdentityManagementActor, IdentityOwner, IdentityResult, IdentitySession,
        },
    },
    ports::billing_operations::BillingOperationStore,
};
use ovload_core::{
    access::{Permission, TenantId},
    billing::BillingOperationRecord,
    engine::ModelRequestId,
};
use sqlx::{PgPool, Postgres, QueryBuilder, Row as _, Transaction};

use super::{
    identity::{access, db_error},
    retail_billing::{RECORD_COLUMNS, record_from_row},
};

#[derive(Clone)]
pub struct PgBillingOperationStore {
    pool: PgPool,
}

impl PgBillingOperationStore {
    #[must_use]
    pub const fn new(pool: PgPool) -> Self {
        Self { pool }
    }

    async fn begin(&self) -> IdentityResult<Transaction<'_, Postgres>> {
        let mut tx = self.pool.begin().await.map_err(db_error)?;
        sqlx::query("set local statement_timeout = '5s'")
            .execute(&mut *tx)
            .await
            .map_err(db_error)?;
        Ok(tx)
    }
}

#[async_trait]
impl BillingOperationStore for PgBillingOperationStore {
    async fn customer_list(
        &self,
        current: &IdentitySession,
        cursor: Option<ModelRequestId>,
        limit: u16,
    ) -> IdentityResult<BillingOperationPage> {
        let mut tx = self.begin().await?;
        let current = access::lock_session(&mut tx, current).await?;
        let IdentityOwner::Customer { tenant_id, .. } = current.owner else {
            return Err(IdentityError::Forbidden);
        };
        let page = list(&mut tx, tenant_id, cursor, limit).await?;
        tx.commit().await.map_err(db_error)?;
        Ok(page)
    }

    async fn customer_get(
        &self,
        current: &IdentitySession,
        operation_id: &ModelRequestId,
    ) -> IdentityResult<BillingOperationRecord> {
        let mut tx = self.begin().await?;
        let current = access::lock_session(&mut tx, current).await?;
        let IdentityOwner::Customer { tenant_id, .. } = current.owner else {
            return Err(IdentityError::Forbidden);
        };
        let record = get(&mut tx, tenant_id, operation_id).await?;
        tx.commit().await.map_err(db_error)?;
        Ok(record)
    }

    async fn management_list(
        &self,
        actor: IdentityManagementActor,
        tenant_id: TenantId,
        cursor: Option<ModelRequestId>,
        limit: u16,
    ) -> IdentityResult<BillingOperationPage> {
        let mut tx = self.begin().await?;
        access::authorize(&mut tx, actor, Permission::BillingRead, Some(tenant_id)).await?;
        let page = list(&mut tx, tenant_id, cursor, limit).await?;
        tx.commit().await.map_err(db_error)?;
        Ok(page)
    }

    async fn management_get(
        &self,
        actor: IdentityManagementActor,
        tenant_id: TenantId,
        operation_id: &ModelRequestId,
    ) -> IdentityResult<BillingOperationRecord> {
        let mut tx = self.begin().await?;
        access::authorize(&mut tx, actor, Permission::BillingRead, Some(tenant_id)).await?;
        let record = get(&mut tx, tenant_id, operation_id).await?;
        tx.commit().await.map_err(db_error)?;
        Ok(record)
    }
}

async fn get(
    tx: &mut Transaction<'_, Postgres>,
    tenant_id: TenantId,
    operation_id: &ModelRequestId,
) -> IdentityResult<BillingOperationRecord> {
    let mut query = QueryBuilder::<Postgres>::new("select ");
    query
        .push(RECORD_COLUMNS)
        .push(" from billing_reservations where tenant_id = ")
        .push_bind(tenant_id.as_uuid())
        .push(" and operation_id = ")
        .push_bind(operation_id.as_str());
    let row = query
        .build()
        .fetch_optional(&mut **tx)
        .await
        .map_err(db_error)?
        .ok_or(IdentityError::NotFound)?;
    record_from_row(&row).map_err(|_| IdentityError::Unavailable)
}

async fn list(
    tx: &mut Transaction<'_, Postgres>,
    tenant_id: TenantId,
    cursor: Option<ModelRequestId>,
    limit: u16,
) -> IdentityResult<BillingOperationPage> {
    if !(1..=100).contains(&limit) {
        return Err(IdentityError::Invalid);
    }
    let position = if let Some(cursor) = cursor.as_ref() {
        let row = sqlx::query(
            "select created_at, operation_id from billing_reservations
             where tenant_id=$1 and operation_id=$2",
        )
        .bind(tenant_id.as_uuid())
        .bind(cursor.as_str())
        .fetch_optional(&mut **tx)
        .await
        .map_err(db_error)?
        .ok_or(IdentityError::Invalid)?;
        Some((
            row.try_get::<DateTime<Utc>, _>("created_at")
                .map_err(db_error)?,
            row.try_get::<String, _>("operation_id").map_err(db_error)?,
        ))
    } else {
        None
    };
    let mut query = QueryBuilder::<Postgres>::new("select ");
    query
        .push(RECORD_COLUMNS)
        .push(" from billing_reservations where tenant_id = ")
        .push_bind(tenant_id.as_uuid());
    if let Some((created_at, operation_id)) = position {
        query
            .push(" and (created_at, operation_id) < (")
            .push_bind(created_at)
            .push(", ")
            .push_bind(operation_id)
            .push(")");
    }
    query
        .push(" order by created_at desc, operation_id desc limit ")
        .push_bind(i64::from(limit) + 1);
    let rows = query.build().fetch_all(&mut **tx).await.map_err(db_error)?;
    let mut items = rows
        .iter()
        .map(|row| record_from_row(row).map_err(|_| IdentityError::Unavailable))
        .collect::<IdentityResult<Vec<_>>>()?;
    let has_more = items.len() > usize::from(limit);
    items.truncate(usize::from(limit));
    let next_cursor = if has_more {
        Some(
            items
                .last()
                .ok_or(IdentityError::Unavailable)?
                .operation()
                .operation_id()
                .clone(),
        )
    } else {
        None
    };
    Ok(BillingOperationPage { items, next_cursor })
}
