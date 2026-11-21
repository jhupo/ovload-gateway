//! Bounded operator-funding history over the existing append-only ledger.

use chrono::{DateTime, Utc};
use ovload_admin::model::{
    billing::{WalletCreditEntry, WalletCreditPage},
    identity_access::{IdentityError, IdentityResult},
};
use ovload_core::access::{ManagementPrincipalId, TenantId};
use sqlx::{Postgres, Row as _, Transaction};
use uuid::Uuid;

use super::{decimal, identity};

pub(super) async fn list(
    tx: &mut Transaction<'_, Postgres>,
    tenant_id: TenantId,
    cursor: Option<Uuid>,
    limit: u16,
) -> IdentityResult<WalletCreditPage> {
    if !(1..=100).contains(&limit) {
        return Err(IdentityError::Invalid);
    }
    let position: Option<DateTime<Utc>> = if let Some(cursor) = cursor {
        Some(
            sqlx::query_scalar(
                "select entry.created_at
                 from wallet_ledger_entries entry
                 join wallet_credit_grants credit
                   on credit.tenant_id=entry.tenant_id and credit.ledger_entry_id=entry.id
                 where entry.tenant_id=$1 and entry.id=$2
                   and entry.entry_kind='operator_credit' and entry.direction='credit'",
            )
            .bind(tenant_id.as_uuid())
            .bind(cursor)
            .fetch_optional(&mut **tx)
            .await
            .map_err(identity::db_error)?
            .ok_or(IdentityError::Invalid)?,
        )
    } else {
        None
    };
    // Page and lifetime total share one SQL snapshot, including an empty page.
    let rows = sqlx::query(
        "with credits as not materialized (
           select entry.id as ledger_entry_id, entry.tenant_id, command.actor_principal_id,
                  credit.amount_usd, credit.reason, entry.created_at
           from wallet_ledger_entries entry
           join wallet_credit_grants credit
             on credit.tenant_id=entry.tenant_id and credit.ledger_entry_id=entry.id
           join wallet_credit_commands command
             on command.tenant_id=credit.tenant_id and command.id=credit.command_id
           where entry.tenant_id=$1 and entry.entry_kind='operator_credit'
             and entry.direction='credit'
         )
         select total.total_credited_usd, item.ledger_entry_id, item.tenant_id,
                item.actor_principal_id, item.amount_usd::text as amount_usd,
                item.reason, item.created_at
         from (select coalesce(sum(amount_usd),0)::text as total_credited_usd from credits) total
         left join lateral (
           select * from credits
           where ($2::timestamptz is null or (created_at,ledger_entry_id)<($2,$3::uuid))
           order by created_at desc, ledger_entry_id desc limit $4
         ) item on true
         order by item.created_at desc, item.ledger_entry_id desc",
    )
    .bind(tenant_id.as_uuid())
    .bind(position)
    .bind(cursor)
    .bind(i64::from(limit) + 1)
    .fetch_all(&mut **tx)
    .await
    .map_err(identity::db_error)?;
    let total_credited_usd = rows
        .first()
        .ok_or(IdentityError::Unavailable)?
        .try_get("total_credited_usd")
        .map_err(identity::db_error)?;
    let mut items = Vec::with_capacity(usize::from(limit) + 1);
    for row in rows {
        let Some(ledger_entry_id) = row
            .try_get::<Option<Uuid>, _>("ledger_entry_id")
            .map_err(identity::db_error)?
        else {
            continue;
        };
        items.push(WalletCreditEntry {
            ledger_entry_id,
            tenant_id: TenantId::new(row.try_get("tenant_id").map_err(identity::db_error)?),
            principal_id: ManagementPrincipalId::new(
                row.try_get("actor_principal_id")
                    .map_err(identity::db_error)?,
            ),
            amount_usd: decimal(&row, "amount_usd")?,
            reason: row.try_get("reason").map_err(identity::db_error)?,
            created_at: row.try_get("created_at").map_err(identity::db_error)?,
        });
    }
    let has_more = items.len() > usize::from(limit);
    items.truncate(usize::from(limit));
    let next_cursor = if has_more {
        Some(
            items
                .last()
                .ok_or(IdentityError::Unavailable)?
                .ledger_entry_id,
        )
    } else {
        None
    };
    Ok(WalletCreditPage {
        items,
        next_cursor,
        total_credited_usd,
    })
}
