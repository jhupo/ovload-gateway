//! Customer and management financial operation history without mutation capabilities.

use std::sync::Arc;

use ovload_core::{access::TenantId, billing::BillingOperationRecord, engine::ModelRequestId};

use crate::{
    model::{
        billing_operations::BillingOperationPage,
        identity_access::{
            IdentityError, IdentityManagementActor, IdentityOwner, IdentityResult, IdentitySession,
        },
    },
    ports::billing_operations::BillingOperationStore,
};

pub struct BillingOperationsService {
    store: Arc<dyn BillingOperationStore>,
}

impl BillingOperationsService {
    #[must_use]
    pub fn new(store: Arc<dyn BillingOperationStore>) -> Self {
        Self { store }
    }

    pub async fn customer_list(
        &self,
        current: &IdentitySession,
        cursor: Option<ModelRequestId>,
        limit: u16,
    ) -> IdentityResult<BillingOperationPage> {
        require_customer(current)?;
        validate_limit(limit)?;
        self.store.customer_list(current, cursor, limit).await
    }

    pub async fn customer_get(
        &self,
        current: &IdentitySession,
        operation_id: &ModelRequestId,
    ) -> IdentityResult<BillingOperationRecord> {
        require_customer(current)?;
        self.store.customer_get(current, operation_id).await
    }

    pub async fn management_list(
        &self,
        current: &IdentitySession,
        tenant_id: TenantId,
        cursor: Option<ModelRequestId>,
        limit: u16,
    ) -> IdentityResult<BillingOperationPage> {
        let actor = management_actor(current)?;
        validate_limit(limit)?;
        self.store
            .management_list(actor, tenant_id, cursor, limit)
            .await
    }

    pub async fn management_get(
        &self,
        current: &IdentitySession,
        tenant_id: TenantId,
        operation_id: &ModelRequestId,
    ) -> IdentityResult<BillingOperationRecord> {
        self.store
            .management_get(management_actor(current)?, tenant_id, operation_id)
            .await
    }
}

fn require_customer(session: &IdentitySession) -> IdentityResult<()> {
    if !matches!(session.owner, IdentityOwner::Customer { .. }) {
        return Err(IdentityError::Forbidden);
    }
    Ok(())
}

fn management_actor(session: &IdentitySession) -> IdentityResult<IdentityManagementActor> {
    let IdentityOwner::Management(principal_id) = session.owner else {
        return Err(IdentityError::Forbidden);
    };
    Ok(IdentityManagementActor {
        session_id: session.id,
        principal_id,
        authority_generation: session.authority_generation,
    })
}

fn validate_limit(limit: u16) -> IdentityResult<()> {
    if !(1..=100).contains(&limit) {
        return Err(IdentityError::Invalid);
    }
    Ok(())
}
