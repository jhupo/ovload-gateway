//! Platform price administration and pure informational usage previews.

use std::sync::Arc;

use uuid::Uuid;

use crate::{
    model::{
        identity_access::{
            IdentityError, IdentityManagementActor, IdentityOwner, IdentityResult, IdentitySession,
        },
        retail_pricing::{
            ChangePriceRevision, CreatePriceRevision, EffectiveRetailPrice,
            EffectiveRetailPriceQuery, PreviewRetailPrice, PriceRevisionDetail,
            PriceRevisionMutation, PriceRevisionPage, PriceRevisionPreview,
        },
    },
    ports::retail_pricing::RetailPricingStore,
};

pub struct RetailPricingService {
    store: Arc<dyn RetailPricingStore>,
}

impl RetailPricingService {
    #[must_use]
    pub fn new(store: Arc<dyn RetailPricingStore>) -> Self {
        Self { store }
    }

    pub async fn effective(
        &self,
        session: &IdentitySession,
        query: EffectiveRetailPriceQuery,
    ) -> IdentityResult<EffectiveRetailPrice> {
        self.store.effective(session, query).await
    }

    pub async fn list(
        &self,
        session: &IdentitySession,
        cursor: Option<u64>,
        limit: u16,
    ) -> IdentityResult<PriceRevisionPage> {
        if !(1..=100).contains(&limit)
            || cursor.is_some_and(|value| value == 0 || i64::try_from(value).is_err())
        {
            return Err(IdentityError::Invalid);
        }
        self.store.list(actor(session)?, cursor, limit).await
    }

    pub async fn get(
        &self,
        session: &IdentitySession,
        id: Uuid,
    ) -> IdentityResult<PriceRevisionDetail> {
        if id.is_nil() {
            return Err(IdentityError::Invalid);
        }
        self.store.get(actor(session)?, id).await
    }

    pub async fn create(
        &self,
        session: &IdentitySession,
        command: CreatePriceRevision,
    ) -> IdentityResult<PriceRevisionMutation> {
        self.store.create(actor(session)?, command).await
    }

    pub async fn publish(
        &self,
        session: &IdentitySession,
        command: ChangePriceRevision,
    ) -> IdentityResult<PriceRevisionMutation> {
        self.store.publish(actor(session)?, command).await
    }

    pub async fn retire(
        &self,
        session: &IdentitySession,
        command: ChangePriceRevision,
    ) -> IdentityResult<PriceRevisionMutation> {
        self.store.retire(actor(session)?, command).await
    }

    pub async fn validate(
        &self,
        session: &IdentitySession,
        id: Uuid,
    ) -> IdentityResult<PriceRevisionDetail> {
        self.get(session, id).await
    }

    pub async fn preview(
        &self,
        session: &IdentitySession,
        id: Uuid,
        command: PreviewRetailPrice,
    ) -> IdentityResult<PriceRevisionPreview> {
        let detail = self.get(session, id).await?;
        let selected = detail
            .revision
            .document
            .select(command.group(), command.public_model(), command.tier())
            .map_err(|_| IdentityError::NotFound)?;
        let calculation = selected
            .rates()
            .preview(command.usage(), command.multiplier_bps())
            .map_err(|_| IdentityError::Invalid)?;
        Ok(PriceRevisionPreview {
            catalog: detail.catalog,
            revision: detail.revision.summary,
            selected_account_group_id: selected.account_group_id().cloned(),
            public_model_id: selected.public_model_id().to_owned(),
            service_tier: selected.service_tier().to_owned(),
            calculation,
        })
    }
}

fn actor(session: &IdentitySession) -> IdentityResult<IdentityManagementActor> {
    let IdentityOwner::Management(principal_id) = session.owner else {
        return Err(IdentityError::Forbidden);
    };
    Ok(IdentityManagementActor {
        session_id: session.id,
        principal_id,
        authority_generation: session.authority_generation,
    })
}
