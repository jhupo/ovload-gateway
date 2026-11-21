//! Explicitly unavailable retail pricing for unrelated control-plane fixtures.

use async_trait::async_trait;
use ovload_admin::{
    model::{
        identity_access::{IdentityError, IdentityManagementActor, IdentityResult},
        retail_pricing::{
            ChangePriceRevision, CreatePriceRevision, PriceRevisionDetail, PriceRevisionMutation,
            PriceRevisionPage,
        },
    },
    ports::retail_pricing::RetailPricingStore,
};
use uuid::Uuid;

#[async_trait]
impl RetailPricingStore for super::TestPluginPorts {
    async fn effective(
        &self,
        _: &ovload_admin::model::identity_access::IdentitySession,
        _: ovload_admin::model::retail_pricing::EffectiveRetailPriceQuery,
    ) -> IdentityResult<ovload_admin::model::retail_pricing::EffectiveRetailPrice> {
        Err(IdentityError::Unavailable)
    }

    async fn list(
        &self,
        _: IdentityManagementActor,
        _: Option<u64>,
        _: u16,
    ) -> IdentityResult<PriceRevisionPage> {
        Err(IdentityError::Unavailable)
    }

    async fn get(
        &self,
        _: IdentityManagementActor,
        _: Uuid,
    ) -> IdentityResult<PriceRevisionDetail> {
        Err(IdentityError::Unavailable)
    }

    async fn create(
        &self,
        _: IdentityManagementActor,
        _: CreatePriceRevision,
    ) -> IdentityResult<PriceRevisionMutation> {
        Err(IdentityError::Unavailable)
    }

    async fn publish(
        &self,
        _: IdentityManagementActor,
        _: ChangePriceRevision,
    ) -> IdentityResult<PriceRevisionMutation> {
        Err(IdentityError::Unavailable)
    }

    async fn retire(
        &self,
        _: IdentityManagementActor,
        _: ChangePriceRevision,
    ) -> IdentityResult<PriceRevisionMutation> {
        Err(IdentityError::Unavailable)
    }
}
