//! Customer wallet reads and audited management funding.

use std::sync::Arc;

use ovload_core::access::TenantId;

use crate::{
    model::{
        billing::{CreditTenantWallet, WalletBalance, WalletCreditPage, WalletCreditReceipt},
        identity_access::{
            IdentityError, IdentityManagementActor, IdentityOwner, IdentityResult, IdentitySession,
        },
    },
    ports::billing::BillingStore,
};

pub struct BillingService {
    store: Arc<dyn BillingStore>,
}

impl BillingService {
    #[must_use]
    pub fn new(store: Arc<dyn BillingStore>) -> Self {
        Self { store }
    }

    pub async fn customer_wallet_balance(
        &self,
        current: &IdentitySession,
    ) -> IdentityResult<WalletBalance> {
        if !matches!(current.owner, IdentityOwner::Customer { .. }) {
            return Err(IdentityError::Forbidden);
        }
        self.store.customer_wallet_balance(current).await
    }

    pub async fn management_wallet_balance(
        &self,
        current: &IdentitySession,
        tenant_id: TenantId,
    ) -> IdentityResult<WalletBalance> {
        self.store
            .management_wallet_balance(management_actor(current)?, tenant_id)
            .await
    }

    pub async fn credit_tenant_wallet(
        &self,
        current: &IdentitySession,
        command: CreditTenantWallet,
    ) -> IdentityResult<WalletCreditReceipt> {
        self.store
            .credit_tenant_wallet(management_actor(current)?, command)
            .await
    }

    pub async fn management_wallet_credits(
        &self,
        current: &IdentitySession,
        tenant_id: TenantId,
        cursor: Option<uuid::Uuid>,
        limit: u16,
    ) -> IdentityResult<WalletCreditPage> {
        if !(1..=100).contains(&limit) {
            return Err(IdentityError::Invalid);
        }
        self.store
            .management_wallet_credits(management_actor(current)?, tenant_id, cursor, limit)
            .await
    }
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
