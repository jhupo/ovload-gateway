//! Live customer entitlements and group policy are checked before price lookup.

use super::*;

pub(super) async fn get(
    store: &PgRetailPricingStore,
    actor: &IdentitySession,
    query: EffectiveRetailPriceQuery,
) -> IdentityResult<EffectiveRetailPrice> {
    let mut tx = store.pool.begin().await.map_err(db_error)?;
    sqlx::query("set local statement_timeout = '5s'")
        .execute(&mut *tx)
        .await
        .map_err(db_error)?;
    access::lock_session(&mut tx, actor).await?;
    if let IdentityOwner::Management(principal_id) = actor.owner {
        access::authorize(
            &mut tx,
            IdentityManagementActor {
                session_id: actor.id,
                principal_id,
                authority_generation: actor.authority_generation,
            },
            Permission::BillingRead,
            None,
        )
        .await?;
    }
    let group = sqlx::query(
        "select retail_multiplier_bps, visibility, model_routes_json from account_groups where id=$1 and enabled for share",
    ).bind(query.group().as_str()).fetch_optional(&mut *tx).await.map_err(db_error)?
        .ok_or(IdentityError::NotFound)?;
    if let IdentityOwner::Customer { tenant_id, user_id } = actor.owner {
        let explicit: Option<bool> = sqlx::query_scalar(
            "select granted from model_key_group_grants where tenant_id=$1 and user_id=$2 and account_group_id=$3 for share",
        ).bind(tenant_id.as_uuid()).bind(user_id.as_uuid()).bind(query.group().as_str())
            .fetch_optional(&mut *tx).await.map_err(db_error)?;
        let visibility: String = group.try_get("visibility").map_err(db_error)?;
        if !explicit.unwrap_or(visibility == "public") {
            return Err(IdentityError::Forbidden);
        }
    }
    let multiplier_bps = u32::try_from(
        group
            .try_get::<i32, _>("retail_multiplier_bps")
            .map_err(db_error)?,
    )
    .ok()
    .filter(|value| *value <= 1_000_000)
    .ok_or(IdentityError::Unavailable)?;
    let catalog = load_catalog(&mut tx, false).await?;
    let revision_id = catalog
        .published_revision_id
        .ok_or(IdentityError::NotFound)?;
    let revision = read::load_revision(&mut tx, revision_id, false).await?;
    let card = revision
        .document
        .select(query.group(), query.public_model(), query.tier())
        .map_err(|_| IdentityError::NotFound)?;
    let result = EffectiveRetailPrice {
        catalog,
        revision_id,
        account_group_id: query.group().clone(),
        selected_account_group_id: card.account_group_id().cloned(),
        public_model_id: card.public_model_id().to_owned(),
        service_tier: card.service_tier().to_owned(),
        multiplier_bps,
        rates: card.rates().clone(),
    };
    tx.commit().await.map_err(db_error)?;
    Ok(result)
}
