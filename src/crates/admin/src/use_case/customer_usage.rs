//! Customer usage reads validate audience and bounded page commands.

use std::sync::Arc;

use ovload_core::engine::ModelRequestId;

use crate::{
    model::{
        customer_usage::{
            CustomerUsageDay, CustomerUsageFilter, CustomerUsagePage, CustomerUsageRecord,
            CustomerUsageSummary,
        },
        identity_access::{IdentityError, IdentityOwner, IdentityResult, IdentitySession},
    },
    ports::customer_usage::CustomerUsageStore,
};

pub struct CustomerUsageService {
    store: Arc<dyn CustomerUsageStore>,
}

impl CustomerUsageService {
    pub async fn monitoring(
        &self,
        current: &IdentitySession,
        filter: &CustomerUsageFilter,
        provider: Option<String>,
        group: Option<String>,
    ) -> IdentityResult<serde_json::Value> {
        if !matches!(current.owner, IdentityOwner::Management(_)) {
            return Err(IdentityError::Forbidden);
        }
        if provider.as_ref().is_some_and(|p| p.len() > 80)
            || group.as_ref().is_some_and(|g| g.len() > 64)
        {
            return Err(IdentityError::Invalid);
        }
        self.store
            .monitoring(current, filter, provider, group)
            .await
    }
    pub async fn ranking(
        &self,
        current: &IdentitySession,
        filter: &CustomerUsageFilter,
        provider: Option<String>,
    ) -> IdentityResult<Vec<crate::model::customer_usage::UserUsageRanking>> {
        if !matches!(current.owner, IdentityOwner::Management(_))
            || provider.as_ref().is_some_and(|p| p.len() > 80)
        {
            return Err(IdentityError::Forbidden);
        }
        self.store.ranking(current, filter, provider).await
    }
    #[must_use]
    pub fn new(store: Arc<dyn CustomerUsageStore>) -> Self {
        Self { store }
    }

    pub async fn list(
        &self,
        current: &IdentitySession,
        filter: &CustomerUsageFilter,
        cursor: Option<ModelRequestId>,
        limit: u16,
    ) -> IdentityResult<CustomerUsagePage> {
        require_customer(current)?;
        if !(1..=100).contains(&limit) {
            return Err(IdentityError::Invalid);
        }
        self.store.list(current, filter, cursor, limit).await
    }

    pub async fn get(
        &self,
        current: &IdentitySession,
        request_id: &ModelRequestId,
    ) -> IdentityResult<CustomerUsageRecord> {
        require_customer(current)?;
        self.store.get(current, request_id).await
    }

    pub async fn summary(
        &self,
        current: &IdentitySession,
        filter: &CustomerUsageFilter,
    ) -> IdentityResult<CustomerUsageSummary> {
        require_customer(current)?;
        self.store.summary(current, filter).await
    }

    pub async fn trend(
        &self,
        current: &IdentitySession,
        filter: &CustomerUsageFilter,
    ) -> IdentityResult<Vec<CustomerUsageDay>> {
        require_customer(current)?;
        self.store.trend(current, filter).await
    }

    pub async fn export(
        &self,
        current: &IdentitySession,
        filter: &CustomerUsageFilter,
    ) -> IdentityResult<Vec<CustomerUsageRecord>> {
        require_customer(current)?;
        self.store.export(current, filter).await
    }
}

fn require_customer(current: &IdentitySession) -> IdentityResult<()> {
    if !matches!(current.owner, IdentityOwner::Customer { .. }) {
        return Err(IdentityError::Forbidden);
    }
    Ok(())
}
