//! Explicit owner/group entitlements; grants never imply global routing access.

use super::*;

pub(super) async fn require(
    tx: &mut Transaction<'_, Postgres>,
    owner: ModelKeyOwner,
    group: &AccountGroupId,
) -> IdentityResult<()> {
    let group_policy: Option<(bool, String)> =
        sqlx::query_as("select enabled,visibility from account_groups where id=$1 for share")
            .bind(group.as_str())
            .fetch_optional(&mut **tx)
            .await
            .map_err(db_error)?;
    if !group_policy.as_ref().is_some_and(|(enabled, _)| *enabled) {
        return Err(IdentityError::Forbidden);
    }
    let allowed:Option<bool>=sqlx::query_scalar("select granted from model_key_group_grants where tenant_id=$1 and user_id=$2 and account_group_id=$3 for share")
        .bind(owner.tenant_id.as_uuid()).bind(owner.user_id.as_uuid()).bind(group.as_str()).fetch_optional(&mut **tx).await.map_err(db_error)?;
    if !allowed.unwrap_or_else(|| {
        group_policy
            .as_ref()
            .is_some_and(|(_, visibility)| visibility == "public")
    }) {
        return Err(IdentityError::Forbidden);
    }
    Ok(())
}

pub(super) async fn list(
    store: &PgModelKeyStore,
    actor: &IdentitySession,
    owner: ModelKeyOwner,
) -> IdentityResult<Vec<ModelKeyGroup>> {
    let mut tx = store.begin().await?;
    authorize(&mut tx, actor, owner, false, false).await?;
    let rows=sqlx::query("select g.id,g.name from account_groups g left join model_key_group_grants grants on grants.account_group_id=g.id and grants.tenant_id=$1 and grants.user_id=$2 where g.enabled and coalesce(grants.granted,g.visibility='public') order by g.id limit 1001")
        .bind(owner.tenant_id.as_uuid()).bind(owner.user_id.as_uuid()).fetch_all(&mut *tx).await.map_err(db_error)?;
    if rows.len() > 1000 {
        return Err(IdentityError::Unavailable);
    }
    let result = rows
        .iter()
        .map(|row| {
            Ok(ModelKeyGroup {
                id: AccountGroupId::new(row.try_get::<String, _>("id").map_err(db_error)?)
                    .map_err(|_| IdentityError::Unavailable)?,
                name: row.try_get("name").map_err(db_error)?,
            })
        })
        .collect::<IdentityResult<Vec<_>>>()?;
    if matches!(actor.owner, IdentityOwner::Management(_)) {
        audit(
            &mut tx,
            actor,
            Some(owner),
            "model_key.grants_read",
            None,
            None,
            "management_read",
        )
        .await?;
    }
    tx.commit().await.map_err(db_error)?;
    Ok(result)
}

pub(super) async fn set(
    store: &PgModelKeyStore,
    actor: &IdentitySession,
    owner: ModelKeyOwner,
    command: SetModelKeyGroupGrant,
) -> IdentityResult<Revision> {
    management(actor)?;
    reason(&command.reason)?;
    let mut tx = store.begin().await?;
    authorize(&mut tx, actor, owner, true, command.granted).await?;
    let revision = bump_revision(&mut tx).await?;
    let group_enabled: Option<bool> =
        sqlx::query_scalar("select enabled from account_groups where id=$1 for share")
            .bind(command.group_id.as_str())
            .fetch_optional(&mut *tx)
            .await
            .map_err(db_error)?;
    if group_enabled.is_none() {
        return Err(IdentityError::NotFound);
    }
    if command.granted && group_enabled != Some(true) {
        return Err(IdentityError::Conflict);
    }
    let count:i64=sqlx::query_scalar("select count(*) from model_key_group_grants where tenant_id=$1 and user_id=$2 and granted and account_group_id<>$3")
        .bind(owner.tenant_id.as_uuid()).bind(owner.user_id.as_uuid()).bind(command.group_id.as_str()).fetch_one(&mut *tx).await.map_err(db_error)?;
    if command.granted && count >= 1000 {
        return Err(IdentityError::Conflict);
    }
    sqlx::query("insert into model_key_group_grants(tenant_id,user_id,account_group_id,granted) values($1,$2,$3,$4) on conflict(tenant_id,user_id,account_group_id) do update set granted=excluded.granted,revision=model_key_group_grants.revision+1,updated_at=clock_timestamp()")
        .bind(owner.tenant_id.as_uuid()).bind(owner.user_id.as_uuid()).bind(command.group_id.as_str()).bind(command.granted).execute(&mut *tx).await.map_err(db_error)?;
    if !command.granted {
        sqlx::query("update client_api_keys set enabled=false,revoked_at=clock_timestamp(),authority_generation=authority_generation+1,revision=revision+1,updated_at=clock_timestamp() where tenant_id=$1 and user_id=$2 and account_group_id=$3 and revoked_at is null")
            .bind(owner.tenant_id.as_uuid()).bind(owner.user_id.as_uuid()).bind(command.group_id.as_str()).execute(&mut *tx).await.map_err(db_error)?;
    }
    audit(
        &mut tx,
        actor,
        Some(owner),
        if command.granted {
            "model_key.group_granted"
        } else {
            "model_key.group_revoked"
        },
        None,
        Some(&command.group_id),
        &command.reason,
    )
    .await?;
    tx.commit().await.map_err(db_error)?;
    Ok(revision)
}
