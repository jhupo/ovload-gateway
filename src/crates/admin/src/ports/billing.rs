//! Financial persistence port; implementations enforce live authorization in transactions.

use async_trait::async_trait;
use ovload_core::access::TenantId;

use crate::model::{
    billing::{CreditTenantWallet, WalletBalance, WalletCreditPage, WalletCreditReceipt},
    identity_access::{IdentityManagementActor, IdentityResult, IdentitySession},
};

#[async_trait]
pub trait BillingStore: Send + Sync {
    /// Revalidates the customer session and reads only its tenant wallet.
    async fn customer_wallet_balance(
        &self,
        current: &IdentitySession,
    ) -> IdentityResult<WalletBalance>;

    /// Requires a live `billing.read` grant scoped to this tenant in the transaction.
    async fn management_wallet_balance(
        &self,
        actor: IdentityManagementActor,
        tenant_id: TenantId,
    ) -> IdentityResult<WalletBalance>;

    /// Reads committed operator credits only, with live tenant-scoped `billing.read`.
    async fn management_wallet_credits(
        &self,
        actor: IdentityManagementActor,
        tenant_id: TenantId,
        cursor: Option<uuid::Uuid>,
        limit: u16,
    ) -> IdentityResult<WalletCreditPage>;

    /// Requires live `billing.manage` authorization; credit and audit commit together.
    /// An actor-scoped idempotency receipt binds the tenant, amount and reason.
    async fn credit_tenant_wallet(
        &self,
        actor: IdentityManagementActor,
        command: CreditTenantWallet,
    ) -> IdentityResult<WalletCreditReceipt>;
}
