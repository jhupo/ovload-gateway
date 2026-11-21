//! PostgreSQL authority for immutable retail revisions and catalog publication.

use async_trait::async_trait;
use ovload_admin::{
    model::{
        identity_access::{
            IdentityError, IdentityManagementActor, IdentityOwner, IdentityResult, IdentitySession,
        },
        retail_pricing::{
            ChangePriceRevision, CreatePriceRevision, EffectiveRetailPrice,
            EffectiveRetailPriceQuery, PriceCatalogState, PriceRevisionDetail,
            PriceRevisionMutation, PriceRevisionPage,
        },
    },
    ports::retail_pricing::RetailPricingStore,
};
use ovload_core::access::Permission;
use sqlx::{PgPool, Postgres, Row as _, Transaction};
use uuid::Uuid;

use super::identity::{access, db_error};

mod commands;
mod effective;
pub(crate) mod read;

#[derive(Clone)]
pub struct PgRetailPricingStore {
    pool: PgPool,
}

impl PgRetailPricingStore {
    #[must_use]
    pub const fn new(pool: PgPool) -> Self {
        Self { pool }
    }

    async fn authorized(
        &self,
        actor: IdentityManagementActor,
        permission: Permission,
    ) -> IdentityResult<Transaction<'_, Postgres>> {
        let mut tx = self.pool.begin().await.map_err(db_error)?;
        sqlx::query("set local statement_timeout = '5s'")
            .execute(&mut *tx)
            .await
            .map_err(db_error)?;
        access::authorize(&mut tx, actor, permission, None).await?;
        Ok(tx)
    }
}

#[async_trait]
impl RetailPricingStore for PgRetailPricingStore {
    async fn effective(
        &self,
        actor: &IdentitySession,
        query: EffectiveRetailPriceQuery,
    ) -> IdentityResult<EffectiveRetailPrice> {
        effective::get(self, actor, query).await
    }

    async fn list(
        &self,
        actor: IdentityManagementActor,
        cursor: Option<u64>,
        limit: u16,
    ) -> IdentityResult<PriceRevisionPage> {
        let mut tx = self.authorized(actor, Permission::BillingRead).await?;
        let catalog = load_catalog(&mut tx, false).await?;
        let (items, next_cursor) = read::load_summaries(&mut tx, cursor, limit).await?;
        tx.commit().await.map_err(db_error)?;
        Ok(PriceRevisionPage {
            catalog,
            items,
            next_cursor,
        })
    }

    async fn get(
        &self,
        actor: IdentityManagementActor,
        id: Uuid,
    ) -> IdentityResult<PriceRevisionDetail> {
        let mut tx = self.authorized(actor, Permission::BillingRead).await?;
        let catalog = load_catalog(&mut tx, false).await?;
        let revision = read::load_revision(&mut tx, id, false).await?;
        tx.commit().await.map_err(db_error)?;
        Ok(PriceRevisionDetail { catalog, revision })
    }

    async fn create(
        &self,
        actor: IdentityManagementActor,
        command: CreatePriceRevision,
    ) -> IdentityResult<PriceRevisionMutation> {
        commands::create(self, actor, command).await
    }

    async fn publish(
        &self,
        actor: IdentityManagementActor,
        command: ChangePriceRevision,
    ) -> IdentityResult<PriceRevisionMutation> {
        commands::publish(self, actor, command).await
    }

    async fn retire(
        &self,
        actor: IdentityManagementActor,
        command: ChangePriceRevision,
    ) -> IdentityResult<PriceRevisionMutation> {
        commands::retire(self, actor, command).await
    }
}

pub(crate) async fn load_catalog(
    tx: &mut Transaction<'_, Postgres>,
    for_update: bool,
) -> IdentityResult<PriceCatalogState> {
    let query = if for_update {
        "select generation, published_revision_id from retail_price_catalog where singleton for update"
    } else {
        "select generation, published_revision_id from retail_price_catalog where singleton for share"
    };
    let row = sqlx::query(query)
        .fetch_optional(&mut **tx)
        .await
        .map_err(db_error)?
        .ok_or(IdentityError::Unavailable)?;
    let generation = u64::try_from(row.try_get::<i64, _>("generation").map_err(db_error)?)
        .ok()
        .filter(|value| *value > 0)
        .ok_or(IdentityError::Unavailable)?;
    let published_revision_id: Option<Uuid> =
        row.try_get("published_revision_id").map_err(db_error)?;
    // A new statement sees commits that completed while the catalog lock waited.
    let publication = sqlx::query(
        "select count(*) as published_count,
                coalesce(bool_or(id=$1 and checksum is not null and effective_at <= clock_timestamp()),false) as effective
         from retail_price_book_revisions where status='published'",
    )
    .bind(published_revision_id)
    .fetch_one(&mut **tx)
    .await
    .map_err(db_error)?;
    let published_count: i64 = publication.try_get("published_count").map_err(db_error)?;
    let effective: bool = publication.try_get("effective").map_err(db_error)?;
    if published_revision_id.is_some() && (!effective || published_count != 1)
        || published_revision_id.is_none() && published_count != 0
    {
        return Err(IdentityError::Unavailable);
    }
    Ok(PriceCatalogState {
        generation,
        published_revision_id,
    })
}
