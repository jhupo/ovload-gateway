//! Every read revalidates the customer session in its scoped transaction.

use async_trait::async_trait;
use ovload_core::engine::ModelRequestId;

use crate::model::{
    customer_usage::{
        CustomerUsageDay, CustomerUsageFilter, CustomerUsagePage, CustomerUsageRecord,
        CustomerUsageSummary,
    },
    identity_access::{IdentityResult, IdentitySession},
};

#[async_trait]
pub trait CustomerUsageStore: Send + Sync {
    async fn monitoring(
        &self,
        _current: &IdentitySession,
        _filter: &CustomerUsageFilter,
        _provider: Option<String>,
        _group: Option<String>,
    ) -> IdentityResult<serde_json::Value> {
        Err(crate::model::identity_access::IdentityError::Unavailable)
    }
    async fn ranking(
        &self,
        _current: &IdentitySession,
        _filter: &CustomerUsageFilter,
        _provider: Option<String>,
    ) -> IdentityResult<Vec<crate::model::customer_usage::UserUsageRanking>> {
        Err(crate::model::identity_access::IdentityError::Unavailable)
    }
    async fn list(
        &self,
        current: &IdentitySession,
        filter: &CustomerUsageFilter,
        cursor: Option<ModelRequestId>,
        limit: u16,
    ) -> IdentityResult<CustomerUsagePage>;
    async fn get(
        &self,
        current: &IdentitySession,
        request_id: &ModelRequestId,
    ) -> IdentityResult<CustomerUsageRecord>;
    async fn summary(
        &self,
        current: &IdentitySession,
        filter: &CustomerUsageFilter,
    ) -> IdentityResult<CustomerUsageSummary>;
    async fn trend(
        &self,
        current: &IdentitySession,
        filter: &CustomerUsageFilter,
    ) -> IdentityResult<Vec<CustomerUsageDay>>;
    async fn export(
        &self,
        current: &IdentitySession,
        filter: &CustomerUsageFilter,
    ) -> IdentityResult<Vec<CustomerUsageRecord>>;
}
