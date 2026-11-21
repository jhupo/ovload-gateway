//! Migration quarantine is reportable and can only be resolved by an operator.

use super::*;

pub(super) async fn pending(
    store: &PgModelKeyStore,
    actor: &IdentitySession,
    cursor: Option<ClientApiKeyId>,
    limit: u16,
) -> IdentityResult<PendingModelKeyPage> {
    page_limit(limit)?;
    let mut tx = store.begin().await?;
    access::authorize(
        &mut tx,
        management(actor)?,
        Permission::IdentityKeysManage,
        None,
    )
    .await?;
    let rows=sqlx::query("select id,name,key_prefix,former_enabled from client_api_keys where tenant_id is null and ($1::text is null or id>$1) order by id limit $2")
        .bind(cursor.as_ref().map(ClientApiKeyId::as_str)).bind(i64::from(limit)+1).fetch_all(&mut *tx).await.map_err(db_error)?;
    let more = rows.len() > usize::from(limit);
    let items: Vec<_> = rows
        .iter()
        .take(usize::from(limit))
        .map(|row| {
            Ok(PendingModelKey {
                id: key_id(row.try_get("id").map_err(db_error)?)?,
                name: row.try_get("name").map_err(db_error)?,
                prefix: row.try_get("key_prefix").map_err(db_error)?,
                former_enabled: row.try_get("former_enabled").map_err(db_error)?,
            })
        })
        .collect::<IdentityResult<_>>()?;
    let next_cursor = if more {
        items.last().map(|row| row.id.clone())
    } else {
        None
    };
    audit(
        &mut tx,
        actor,
        None,
        "model_key.pending_read",
        None,
        None,
        "operator_assignment_report",
    )
    .await?;
    tx.commit().await.map_err(db_error)?;
    Ok(PendingModelKeyPage { items, next_cursor })
}

pub(super) async fn assign(
    store: &PgModelKeyStore,
    actor: &IdentitySession,
    owner: ModelKeyOwner,
    command: AssignPendingModelKey,
) -> IdentityResult<ModelKeyRecord> {
    management(actor)?;
    reason(&command.reason)?;
    text(&command.name, 128)?;
    validate_limits(command.limits)?;
    let mut tx = store.begin().await?;
    access::authorize(
        &mut tx,
        management(actor)?,
        Permission::IdentityKeysManage,
        None,
    )
    .await?;
    authorize(&mut tx, actor, owner, true, true).await?;
    bump_revision(&mut tx).await?;
    grants::require(&mut tx, owner, &command.group_id).await?;
    let pending: Option<bool> =
        sqlx::query_scalar("select tenant_id is null from client_api_keys where id=$1 for update")
            .bind(command.id.as_str())
            .fetch_optional(&mut *tx)
            .await
            .map_err(db_error)?;
    if pending.is_none() {
        return Err(IdentityError::NotFound);
    }
    if pending != Some(true) {
        return Err(IdentityError::Conflict);
    }
    sqlx::query("update client_api_keys set tenant_id=$2,user_id=$3,account_group_id=$4,wallet_tenant_id=$2,enabled=$5,max_concurrency=$6,requests_per_minute=$7,name=$8,quarantined_at=null,revision=revision+1,authority_generation=authority_generation+1,updated_at=clock_timestamp() where id=$1")
        .bind(command.id.as_str()).bind(owner.tenant_id.as_uuid()).bind(owner.user_id.as_uuid()).bind(command.group_id.as_str()).bind(command.enabled)
        .bind(integer(command.limits.max_concurrency)?).bind(integer(command.limits.requests_per_minute)?).bind(&command.name)
        .execute(&mut *tx).await.map_err(db_error)?;
    audit(
        &mut tx,
        actor,
        Some(owner),
        "model_key.assigned",
        Some(&command.id),
        Some(&command.group_id),
        &command.reason,
    )
    .await?;
    let result = load(&mut tx, owner, &command.id, false).await?;
    tx.commit().await.map_err(db_error)?;
    Ok(result)
}
