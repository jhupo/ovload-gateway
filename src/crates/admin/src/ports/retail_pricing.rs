//! Durable platform retail catalog; every method rechecks live authorization.

use async_trait::async_trait;
use uuid::Uuid;

use crate::model::{
    identity_access::{IdentityManagementActor, IdentityResult, IdentitySession},
    retail_pricing::{
        ChangePriceRevision, CreatePriceRevision, EffectiveRetailPrice, EffectiveRetailPriceQuery,
        PriceRevisionDetail, PriceRevisionMutation, PriceRevisionPage,
    },
};

#[async_trait]
pub trait RetailPricingStore: Send + Sync {
    async fn effective(
        &self,
        actor: &IdentitySession,
        query: EffectiveRetailPriceQuery,
    ) -> IdentityResult<EffectiveRetailPrice>;

    async fn list(
        &self,
        actor: IdentityManagementActor,
        cursor: Option<u64>,
        limit: u16,
    ) -> IdentityResult<PriceRevisionPage>;

    async fn get(
        &self,
        actor: IdentityManagementActor,
        id: Uuid,
    ) -> IdentityResult<PriceRevisionDetail>;

    async fn create(
        &self,
        actor: IdentityManagementActor,
        command: CreatePriceRevision,
    ) -> IdentityResult<PriceRevisionMutation>;

    async fn publish(
        &self,
        actor: IdentityManagementActor,
        command: ChangePriceRevision,
    ) -> IdentityResult<PriceRevisionMutation>;

    async fn retire(
        &self,
        actor: IdentityManagementActor,
        command: ChangePriceRevision,
    ) -> IdentityResult<PriceRevisionMutation>;
}
