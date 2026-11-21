//! Explicitly unavailable financial operation reads for unrelated fixtures.

use async_trait::async_trait;
use ovload_admin::{
    model::{
        billing_operations::BillingOperationPage,
        identity_access::{
            IdentityError, IdentityManagementActor, IdentityResult, IdentitySession,
        },
    },
    ports::billing_operations::BillingOperationStore,
};
use ovload_core::{access::TenantId, billing::BillingOperationRecord, engine::ModelRequestId};

#[async_trait]
impl BillingOperationStore for super::TestPluginPorts {
    async fn customer_list(
        &self,
        _: &IdentitySession,
        _: Option<ModelRequestId>,
        _: u16,
    ) -> IdentityResult<BillingOperationPage> {
        Err(IdentityError::Unavailable)
    }

    async fn customer_get(
        &self,
        _: &IdentitySession,
        _: &ModelRequestId,
    ) -> IdentityResult<BillingOperationRecord> {
        Err(IdentityError::Unavailable)
    }

    async fn management_list(
        &self,
        _: IdentityManagementActor,
        _: TenantId,
        _: Option<ModelRequestId>,
        _: u16,
    ) -> IdentityResult<BillingOperationPage> {
        Err(IdentityError::Unavailable)
    }

    async fn management_get(
        &self,
        _: IdentityManagementActor,
        _: TenantId,
        _: &ModelRequestId,
    ) -> IdentityResult<BillingOperationRecord> {
        Err(IdentityError::Unavailable)
    }
}
