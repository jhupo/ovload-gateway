//! Explicitly unavailable billing for unrelated control-plane fixtures.

use async_trait::async_trait;
use ovload_admin::{
    model::{
        billing::{CreditTenantWallet, WalletBalance, WalletCreditPage, WalletCreditReceipt},
        identity_access::{
            IdentityError, IdentityManagementActor, IdentityResult, IdentitySession,
        },
    },
    ports::billing::BillingStore,
};
use ovload_core::access::TenantId;

#[async_trait]
impl BillingStore for super::TestPluginPorts {
    async fn customer_wallet_balance(&self, _: &IdentitySession) -> IdentityResult<WalletBalance> {
        Err(IdentityError::Unavailable)
    }

    async fn management_wallet_balance(
        &self,
        _: IdentityManagementActor,
        _: TenantId,
    ) -> IdentityResult<WalletBalance> {
        Err(IdentityError::Unavailable)
    }

    async fn credit_tenant_wallet(
        &self,
        _: IdentityManagementActor,
        _: CreditTenantWallet,
    ) -> IdentityResult<WalletCreditReceipt> {
        Err(IdentityError::Unavailable)
    }

    async fn management_wallet_credits(
        &self,
        _: IdentityManagementActor,
        _: TenantId,
        _: Option<uuid::Uuid>,
        _: u16,
    ) -> IdentityResult<WalletCreditPage> {
        Err(IdentityError::Unavailable)
    }
}
