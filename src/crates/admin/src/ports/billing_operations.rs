//! Tenant-scoped operation reads with authorization revalidated in the transaction.

use async_trait::async_trait;
use ovload_core::{access::TenantId, billing::BillingOperationRecord, engine::ModelRequestId};

use crate::model::{
    billing_operations::BillingOperationPage,
    identity_access::{IdentityManagementActor, IdentityResult, IdentitySession},
};

#[async_trait]
pub trait BillingOperationStore: Send + Sync {
    /// Revalidates the customer session and filters every row by its tenant.
    /// A cursor resolves only within that tenant; an unknown cursor is invalid.
    async fn customer_list(
        &self,
        current: &IdentitySession,
        cursor: Option<ModelRequestId>,
        limit: u16,
    ) -> IdentityResult<BillingOperationPage>;

    /// Returns not found for an operation outside the current customer's tenant.
    async fn customer_get(
        &self,
        current: &IdentitySession,
        operation_id: &ModelRequestId,
    ) -> IdentityResult<BillingOperationRecord>;

    /// Requires a live `billing.read` grant scoped to this tenant in the transaction.
    /// Resolves the exclusive cursor in the same tenant and read snapshot.
    async fn management_list(
        &self,
        actor: IdentityManagementActor,
        tenant_id: TenantId,
        cursor: Option<ModelRequestId>,
        limit: u16,
    ) -> IdentityResult<BillingOperationPage>;

    /// Revalidates the session/grant and filters by both tenant and operation ID.
    async fn management_get(
        &self,
        actor: IdentityManagementActor,
        tenant_id: TenantId,
        operation_id: &ModelRequestId,
    ) -> IdentityResult<BillingOperationRecord>;
}
