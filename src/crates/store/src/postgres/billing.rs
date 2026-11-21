//! Tenant USD wallet projections and audited operator funding.

use std::str::FromStr;

use async_trait::async_trait;
use ovload_admin::{
    model::{
        billing::{CreditTenantWallet, WalletBalance, WalletCreditPage, WalletCreditReceipt},
        identity_access::{
            IdentityError, IdentityManagementActor, IdentityOwner, IdentityResult, IdentitySession,
        },
    },
    ports::billing::BillingStore,
};
use ovload_core::{access::TenantId, metering::Decimal};
use sha2::{Digest, Sha256};
use sqlx::{PgPool, Postgres, Row, Transaction};
use uuid::Uuid;

use super::identity::{self, access};

mod history;

#[derive(Clone)]
pub struct PgBillingStore {
    pool: PgPool,
}

impl PgBillingStore {
    #[must_use]
    pub const fn new(pool: PgPool) -> Self {
        Self { pool }
    }

    async fn begin(&self) -> IdentityResult<Transaction<'_, Postgres>> {
        let mut tx = self.pool.begin().await.map_err(identity::db_error)?;
        sqlx::query("set local statement_timeout = '5s'")
            .execute(&mut *tx)
            .await
            .map_err(identity::db_error)?;
        Ok(tx)
    }
}

#[async_trait]
impl BillingStore for PgBillingStore {
    async fn customer_wallet_balance(
        &self,
        current: &IdentitySession,
    ) -> IdentityResult<WalletBalance> {
        let mut tx = self.begin().await?;
        let current = access::lock_session(&mut tx, current).await?;
        let IdentityOwner::Customer { tenant_id, .. } = current.owner else {
            return Err(IdentityError::Forbidden);
        };
        let row = wallet_row(&mut tx, tenant_id, false).await?;
        let balance = wallet_balance(&row)?;
        tx.commit().await.map_err(identity::db_error)?;
        Ok(balance)
    }

    async fn management_wallet_balance(
        &self,
        actor: IdentityManagementActor,
        tenant_id: TenantId,
    ) -> IdentityResult<WalletBalance> {
        let mut tx = self.begin().await?;
        access::authorize(
            &mut tx,
            actor,
            ovload_core::access::Permission::BillingRead,
            Some(tenant_id),
        )
        .await?;
        let row = wallet_row(&mut tx, tenant_id, false).await?;
        let balance = wallet_balance(&row)?;
        tx.commit().await.map_err(identity::db_error)?;
        Ok(balance)
    }

    async fn credit_tenant_wallet(
        &self,
        actor: IdentityManagementActor,
        command: CreditTenantWallet,
    ) -> IdentityResult<WalletCreditReceipt> {
        let mut tx = self.begin().await?;
        access::authorize(
            &mut tx,
            actor,
            ovload_core::access::Permission::BillingManage,
            Some(command.tenant_id()),
        )
        .await?;

        let row = wallet_row(&mut tx, command.tenant_id(), true).await?;
        let current_balance = decimal(&row, "balance_usd")?;
        let held = decimal(&row, "held_usd")?;
        let fingerprint = credit_fingerprint(&command);
        let command_id = sqlx::query_scalar::<_, Uuid>(
            "insert into wallet_credit_commands
                 (tenant_id, actor_principal_id, session_id, idempotency_key, fingerprint, paid_cny)
             values ($1, $2, $3, $4, $5, $6::text::numeric)
             on conflict (tenant_id, actor_principal_id, idempotency_key) do nothing
             returning id",
        )
        .bind(command.tenant_id().as_uuid())
        .bind(actor.principal_id.as_uuid())
        .bind(actor.session_id.as_uuid())
        .bind(command.idempotency_key())
        .bind(fingerprint.as_slice())
        .bind(command.paid_cny())
        .fetch_optional(&mut *tx)
        .await
        .map_err(identity::db_error)?;

        let Some(command_id) = command_id else {
            let existing = sqlx::query(
                "select command.id, command.fingerprint, grant_row.ledger_entry_id,
                        grant_row.amount_usd::text as amount_usd,
                        grant_row.balance_after_usd::text as balance_after_usd,
                        grant_row.held_after_usd::text as held_after_usd,
                        grant_row.created_at, entry.id as ledger_id
                 from wallet_credit_commands command
                 join wallet_credit_grants grant_row
                   on grant_row.tenant_id=command.tenant_id and grant_row.command_id=command.id
                 join wallet_ledger_entries entry
                   on entry.tenant_id=command.tenant_id and entry.id=grant_row.ledger_entry_id
                 where command.tenant_id=$1 and command.actor_principal_id=$2
                   and command.idempotency_key=$3
                 for share of command, grant_row, entry",
            )
            .bind(command.tenant_id().as_uuid())
            .bind(actor.principal_id.as_uuid())
            .bind(command.idempotency_key())
            .fetch_optional(&mut *tx)
            .await
            .map_err(identity::db_error)?
            .ok_or(IdentityError::Unavailable)?;
            let existing_fingerprint: Vec<u8> = existing
                .try_get("fingerprint")
                .map_err(identity::db_error)?;
            if existing_fingerprint.as_slice() != fingerprint {
                return Err(IdentityError::Conflict);
            }
            let settled_after_credit = decimal(&existing, "balance_after_usd")?;
            let held_after_credit = decimal(&existing, "held_after_usd")?;
            let available_after_credit = checked_sub(settled_after_credit, held_after_credit)
                .ok_or(IdentityError::Unavailable)?;
            let amount = decimal(&existing, "amount_usd")?;
            let created_at = existing.try_get("created_at").map_err(identity::db_error)?;
            let balance = WalletBalance::new(
                command.tenant_id(),
                settled_after_credit,
                held_after_credit,
                available_after_credit,
            )?;
            let receipt = WalletCreditReceipt::new(
                existing.try_get("ledger_id").map_err(identity::db_error)?,
                command.tenant_id(),
                amount,
                balance,
                created_at,
            )?;
            tx.commit().await.map_err(identity::db_error)?;
            return Ok(receipt);
        };

        let balance_after = current_balance
            .checked_add(command.amount_usd())
            .filter(|balance| *balance >= held)
            .ok_or(IdentityError::Invalid)?;
        let ledger_id = Uuid::now_v7();
        sqlx::query(
            "insert into wallet_ledger_entries
                 (id, tenant_id, direction, entry_kind, amount_usd, source_id, idempotency_key)
             values ($1, $2, 'credit', 'operator_credit', $3::text::numeric, $4, $5)",
        )
        .bind(ledger_id)
        .bind(command.tenant_id().as_uuid())
        .bind(command.amount_usd().canonical())
        .bind(command_id)
        .bind(format!("operator-credit:{command_id}"))
        .execute(&mut *tx)
        .await
        .map_err(identity::db_error)?;

        let projected = wallet_row(&mut tx, command.tenant_id(), false).await?;
        let projected_balance = decimal(&projected, "balance_usd")?;
        let projected_held = decimal(&projected, "held_usd")?;
        if projected_balance != balance_after || projected_held != held {
            return Err(IdentityError::Unavailable);
        }
        sqlx::query(
            "insert into wallet_credit_grants
                 (tenant_id, command_id, ledger_entry_id, amount_usd,
                  balance_after_usd, held_after_usd, reason)
             values ($1, $2, $3, $4::text::numeric, $5::text::numeric, $6::text::numeric, $7)",
        )
        .bind(command.tenant_id().as_uuid())
        .bind(command_id)
        .bind(ledger_id)
        .bind(command.amount_usd().canonical())
        .bind(projected_balance.canonical())
        .bind(projected_held.canonical())
        .bind(command.reason())
        .execute(&mut *tx)
        .await
        .map_err(identity::db_error)?;

        sqlx::query(
            "insert into identity_audit_events
                 (tenant_id, actor_kind, actor_id, session_id, action, target_kind, target_id, reason, metadata)
             values ($1, 'management_principal', $2, $3, 'billing.wallet_credited',
                     'tenant_wallet', $1, $4, $5)",
        )
        .bind(command.tenant_id().as_uuid())
        .bind(actor.principal_id.as_uuid())
        .bind(actor.session_id.to_string())
        .bind(command.reason())
        .bind(serde_json::json!({
            "credit_command_id": command_id.to_string(),
            "ledger_entry_id": ledger_id.to_string(),
            "amount_usd": command.amount_usd().canonical(),
            "currency": "USD",
        }))
        .execute(&mut *tx)
        .await
        .map_err(identity::db_error)?;

        let resulting_balance = WalletBalance::new(
            command.tenant_id(),
            balance_after,
            held,
            checked_sub(balance_after, held).ok_or(IdentityError::Unavailable)?,
        )?;
        let created_at =
            sqlx::query_scalar("select created_at from wallet_credit_grants where command_id=$1")
                .bind(command_id)
                .fetch_one(&mut *tx)
                .await
                .map_err(identity::db_error)?;
        let receipt = WalletCreditReceipt::new(
            ledger_id,
            command.tenant_id(),
            command.amount_usd(),
            resulting_balance,
            created_at,
        )?;
        tx.commit().await.map_err(identity::db_error)?;
        Ok(receipt)
    }

    async fn management_wallet_credits(
        &self,
        actor: IdentityManagementActor,
        tenant_id: TenantId,
        cursor: Option<Uuid>,
        limit: u16,
    ) -> IdentityResult<WalletCreditPage> {
        let mut tx = self.begin().await?;
        access::authorize(
            &mut tx,
            actor,
            ovload_core::access::Permission::BillingRead,
            Some(tenant_id),
        )
        .await?;
        let _wallet = wallet_row(&mut tx, tenant_id, false).await?;
        let page = history::list(&mut tx, tenant_id, cursor, limit).await?;
        tx.commit().await.map_err(identity::db_error)?;
        Ok(page)
    }
}

async fn wallet_row(
    tx: &mut Transaction<'_, Postgres>,
    tenant_id: TenantId,
    for_update: bool,
) -> IdentityResult<sqlx::postgres::PgRow> {
    let query = if for_update {
        "select tenant_id, balance_usd::text, held_usd::text from identity_tenant_wallets where tenant_id=$1 for update"
    } else {
        "select tenant_id, balance_usd::text, held_usd::text from identity_tenant_wallets where tenant_id=$1"
    };
    sqlx::query(query)
        .bind(tenant_id.as_uuid())
        .fetch_optional(&mut **tx)
        .await
        .map_err(identity::db_error)?
        .ok_or(IdentityError::NotFound)
}

fn wallet_balance(row: &sqlx::postgres::PgRow) -> IdentityResult<WalletBalance> {
    let settled = decimal(row, "balance_usd")?;
    let held = decimal(row, "held_usd")?;
    let available = checked_sub(settled, held).ok_or(IdentityError::Unavailable)?;
    let tenant = TenantId::new(row.try_get("tenant_id").map_err(identity::db_error)?);
    WalletBalance::new(tenant, settled, held, available)
}

fn checked_sub(left: Decimal, right: Decimal) -> Option<Decimal> {
    (left >= right)
        .then(|| Decimal::from_scaled(left.scaled() - right.scaled()).ok())
        .flatten()
}

fn decimal(row: &sqlx::postgres::PgRow, column: &str) -> IdentityResult<Decimal> {
    let value: String = row.try_get(column).map_err(identity::db_error)?;
    Decimal::from_str(&value).map_err(|_| IdentityError::Unavailable)
}

fn credit_fingerprint(command: &CreditTenantWallet) -> [u8; 32] {
    let mut hash = Sha256::new();
    hash.update(command.tenant_id().as_uuid().as_bytes());
    hash.update(command.amount_usd().scaled().to_be_bytes());
    hash.update(command.reason().as_bytes());
    if let Some(paid) = command.paid_cny() {
        hash.update(b"\0paid_cny:");
        hash.update(paid.as_bytes());
    }
    hash.finalize().into()
}
