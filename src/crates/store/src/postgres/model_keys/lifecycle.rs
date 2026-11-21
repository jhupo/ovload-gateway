//! Owned key reads and lifecycle changes; secret material never enters storage.

use super::*;

pub(super) async fn list(
    store: &PgModelKeyStore,
    actor: &IdentitySession,
    owner: ModelKeyOwner,
    cursor: Option<ClientApiKeyId>,
    limit: u16,
) -> IdentityResult<ModelKeyPage> {
    page_limit(limit)?;
    let mut tx = store.begin().await?;
    authorize(&mut tx, actor, owner, false, false).await?;
    let revision = current_revision(&mut tx).await?;
    let rows=sqlx::query("select * from client_api_keys where tenant_id=$1 and user_id=$2 and ($3::text is null or id>$3) order by id limit $4")
        .bind(owner.tenant_id.as_uuid()).bind(owner.user_id.as_uuid()).bind(cursor.as_ref().map(ClientApiKeyId::as_str)).bind(i64::from(limit)+1)
        .fetch_all(&mut *tx).await.map_err(db_error)?;
    let more = rows.len() > usize::from(limit);
    let items: Vec<_> = rows
        .iter()
        .take(usize::from(limit))
        .map(|row| record(row, revision))
        .collect::<IdentityResult<_>>()?;
    let next_cursor = if more {
        items.last().map(|row| row.id.clone())
    } else {
        None
    };
    if matches!(actor.owner, IdentityOwner::Management(_)) {
        audit(
            &mut tx,
            actor,
            Some(owner),
            "model_key.list",
            None,
            None,
            "management_read",
        )
        .await?;
    }
    tx.commit().await.map_err(db_error)?;
    Ok(ModelKeyPage { items, next_cursor })
}

pub(super) async fn get(
    store: &PgModelKeyStore,
    actor: &IdentitySession,
    owner: ModelKeyOwner,
    id: &ClientApiKeyId,
) -> IdentityResult<ModelKeyRecord> {
    let mut tx = store.begin().await?;
    authorize(&mut tx, actor, owner, false, false).await?;
    let result = load(&mut tx, owner, id, false).await?;
    if matches!(actor.owner, IdentityOwner::Management(_)) {
        audit(
            &mut tx,
            actor,
            Some(owner),
            "model_key.read",
            Some(id),
            None,
            "management_read",
        )
        .await?;
    }
    tx.commit().await.map_err(db_error)?;
    Ok(result)
}

pub(super) async fn create(
    store: &PgModelKeyStore,
    actor: &IdentitySession,
    owner: ModelKeyOwner,
    command: NewModelKey,
) -> IdentityResult<ModelKeyWrite> {
    idempotency(&command.idempotency_key)?;
    let mut tx = store.begin().await?;
    authorize(&mut tx, actor, owner, true, true).await?;
    if let Some(record) = receipt(
        &mut tx,
        actor,
        owner,
        "create",
        &command.idempotency_key,
        command.fingerprint,
    )
    .await?
    {
        tx.commit().await.map_err(db_error)?;
        return Ok(ModelKeyWrite {
            record,
            replayed: true,
        });
    }
    validate(&command.name, command.limits, command.expires_at)?;
    reason(&command.reason)?;
    text(&command.prefix, 16)?;
    if command.prefix.len() < 3 {
        return Err(IdentityError::Invalid);
    }
    // Runtime configuration always precedes key/group locks, matching imported writes.
    bump_revision(&mut tx).await?;
    grants::require(&mut tx, owner, &command.group_id).await?;
    sqlx::query("insert into client_api_keys(id,name,key_digest,key_prefix,tenant_id,user_id,account_group_id,wallet_tenant_id,max_concurrency,requests_per_minute,created_at,updated_at) values($1,$2,$3,$4,$5,$6,$7,$5,$8,$9,now(),now())")
        .bind(command.id.as_str()).bind(&command.name).bind(command.digest.as_slice()).bind(&command.prefix)
        .bind(owner.tenant_id.as_uuid()).bind(owner.user_id.as_uuid()).bind(command.group_id.as_str())
        .bind(integer(command.limits.max_concurrency)?).bind(integer(command.limits.requests_per_minute)?)
        .execute(&mut *tx).await.map_err(db_error)?;
    sqlx::query("update client_api_keys set expires_at=$2 where id=$1")
        .bind(command.id.as_str())
        .bind(command.expires_at)
        .execute(&mut *tx)
        .await
        .map_err(db_error)?;
    save_receipt(
        &mut tx,
        actor,
        owner,
        "create",
        &command.idempotency_key,
        command.fingerprint,
        &command.id,
    )
    .await?;
    audit(
        &mut tx,
        actor,
        Some(owner),
        "model_key.created",
        Some(&command.id),
        Some(&command.group_id),
        &command.reason,
    )
    .await?;
    let record = load(&mut tx, owner, &command.id, false).await?;
    tx.commit().await.map_err(db_error)?;
    Ok(ModelKeyWrite {
        record,
        replayed: false,
    })
}

pub(super) async fn update(
    store: &PgModelKeyStore,
    actor: &IdentitySession,
    owner: ModelKeyOwner,
    command: UpdateModelKey,
) -> IdentityResult<ModelKeyRecord> {
    validate(&command.name, command.limits, command.expires_at)?;
    reason(&command.reason)?;
    let mut tx = store.begin().await?;
    authorize(&mut tx, actor, owner, true, command.enabled).await?;
    bump_revision(&mut tx).await?;
    let existing = load(&mut tx, owner, &command.id, true).await?;
    if existing.revision != command.expected_revision || existing.revoked_at.is_some() {
        return Err(IdentityError::Conflict);
    }
    if command.enabled {
        grants::require(&mut tx, owner, &existing.group_id).await?;
    }
    sqlx::query("update client_api_keys set name=$2,enabled=$3,max_concurrency=$4,requests_per_minute=$5,expires_at=$6,revision=revision+1,authority_generation=authority_generation+1,updated_at=clock_timestamp() where id=$1")
        .bind(command.id.as_str()).bind(&command.name).bind(command.enabled).bind(integer(command.limits.max_concurrency)?)
        .bind(integer(command.limits.requests_per_minute)?).bind(command.expires_at).execute(&mut *tx).await.map_err(db_error)?;
    audit(
        &mut tx,
        actor,
        Some(owner),
        "model_key.updated",
        Some(&command.id),
        Some(&existing.group_id),
        &command.reason,
    )
    .await?;
    let result = load(&mut tx, owner, &command.id, false).await?;
    tx.commit().await.map_err(db_error)?;
    Ok(result)
}

pub(super) async fn revoke(
    store: &PgModelKeyStore,
    actor: &IdentitySession,
    owner: ModelKeyOwner,
    command: RevokeModelKey,
) -> IdentityResult<ModelKeyRecord> {
    reason(&command.reason)?;
    let mut tx = store.begin().await?;
    authorize(&mut tx, actor, owner, true, false).await?;
    bump_revision(&mut tx).await?;
    let existing = load(&mut tx, owner, &command.id, true).await?;
    if existing.revision != command.expected_revision {
        return Err(IdentityError::Conflict);
    }
    if existing.revoked_at.is_none() {
        revoke_row(&mut tx, &command.id).await?;
        audit(
            &mut tx,
            actor,
            Some(owner),
            "model_key.revoked",
            Some(&command.id),
            Some(&existing.group_id),
            &command.reason,
        )
        .await?;
    }
    let result = load(&mut tx, owner, &command.id, false).await?;
    tx.commit().await.map_err(db_error)?;
    Ok(result)
}

pub(super) async fn rotate(
    store: &PgModelKeyStore,
    actor: &IdentitySession,
    owner: ModelKeyOwner,
    command: RotateModelKey,
) -> IdentityResult<ModelKeyWrite> {
    idempotency(&command.idempotency_key)?;
    let mut tx = store.begin().await?;
    authorize(&mut tx, actor, owner, true, true).await?;
    if let Some(record) = receipt(
        &mut tx,
        actor,
        owner,
        "rotate",
        &command.idempotency_key,
        command.fingerprint,
    )
    .await?
    {
        tx.commit().await.map_err(db_error)?;
        return Ok(ModelKeyWrite {
            record,
            replayed: true,
        });
    }
    reason(&command.reason)?;
    text(&command.prefix, 16)?;
    if command.prefix.len() < 3 {
        return Err(IdentityError::Invalid);
    }
    bump_revision(&mut tx).await?;
    let old = load(&mut tx, owner, &command.id, true).await?;
    if old.revision != command.expected_revision
        || old.revoked_at.is_some()
        || old.expires_at.is_some_and(|v| v <= Utc::now())
    {
        return Err(IdentityError::Conflict);
    }
    grants::require(&mut tx, owner, &old.group_id).await?;
    revoke_row(&mut tx, &command.id).await?;
    sqlx::query("insert into client_api_keys(id,name,label,key_digest,key_prefix,tenant_id,user_id,account_group_id,wallet_tenant_id,enabled,max_concurrency,requests_per_minute,daily_limit_usd,weekly_limit_usd,provider_request_profiles_json,expires_at,supersedes_key_id,created_at,updated_at) select $2,name,label,$3,$4,tenant_id,user_id,account_group_id,wallet_tenant_id,$5,max_concurrency,requests_per_minute,daily_limit_usd,weekly_limit_usd,provider_request_profiles_json,expires_at,id,now(),now() from client_api_keys where id=$1")
        .bind(command.id.as_str()).bind(command.replacement_id.as_str()).bind(command.digest.as_slice()).bind(&command.prefix)
        .bind(old.enabled)
        .execute(&mut *tx).await.map_err(db_error)?;
    save_receipt(
        &mut tx,
        actor,
        owner,
        "rotate",
        &command.idempotency_key,
        command.fingerprint,
        &command.replacement_id,
    )
    .await?;
    audit(
        &mut tx,
        actor,
        Some(owner),
        "model_key.rotated",
        Some(&command.replacement_id),
        Some(&old.group_id),
        &command.reason,
    )
    .await?;
    let record = load(&mut tx, owner, &command.replacement_id, false).await?;
    tx.commit().await.map_err(db_error)?;
    Ok(ModelKeyWrite {
        record,
        replayed: false,
    })
}

async fn revoke_row(tx: &mut Transaction<'_, Postgres>, id: &ClientApiKeyId) -> IdentityResult<()> {
    sqlx::query("update client_api_keys set enabled=false,revoked_at=clock_timestamp(),revision=revision+1,authority_generation=authority_generation+1,updated_at=clock_timestamp() where id=$1 and revoked_at is null")
        .bind(id.as_str()).execute(&mut **tx).await.map_err(db_error)?;
    Ok(())
}

fn validate(
    name: &str,
    limits: RateLimits,
    expires_at: Option<DateTime<Utc>>,
) -> IdentityResult<()> {
    text(name, 128)?;
    validate_limits(limits)?;
    if expires_at.is_some_and(|value| value <= Utc::now()) {
        return Err(IdentityError::Invalid);
    }
    Ok(())
}

async fn receipt(
    tx: &mut Transaction<'_, Postgres>,
    actor: &IdentitySession,
    owner: ModelKeyOwner,
    command: &str,
    idempotency_key: &str,
    fingerprint: [u8; 32],
) -> IdentityResult<Option<ModelKeyRecord>> {
    let (kind, id) = actor_columns(actor);
    let row=sqlx::query("select fingerprint,key_id,tenant_id,user_id from model_key_command_receipts where actor_kind=$1 and actor_id=$2 and command=$3 and idempotency_key=$4")
        .bind(kind).bind(id).bind(command).bind(idempotency_key)
        .fetch_optional(&mut **tx).await.map_err(db_error)?;
    let Some(row) = row else { return Ok(None) };
    let stored: Vec<u8> = row.try_get("fingerprint").map_err(db_error)?;
    let tenant: Uuid = row.try_get("tenant_id").map_err(db_error)?;
    let user: Uuid = row.try_get("user_id").map_err(db_error)?;
    if stored != fingerprint
        || tenant != owner.tenant_id.as_uuid()
        || user != owner.user_id.as_uuid()
    {
        return Err(IdentityError::Conflict);
    }
    let id = key_id(row.try_get("key_id").map_err(db_error)?)?;
    load(tx, owner, &id, false).await.map(Some)
}

async fn save_receipt(
    tx: &mut Transaction<'_, Postgres>,
    actor: &IdentitySession,
    owner: ModelKeyOwner,
    command: &str,
    idempotency_key: &str,
    fingerprint: [u8; 32],
    key: &ClientApiKeyId,
) -> IdentityResult<()> {
    let (kind, id) = actor_columns(actor);
    sqlx::query("insert into model_key_command_receipts(actor_kind,actor_id,tenant_id,user_id,command,idempotency_key,fingerprint,key_id) values($1,$2,$3,$4,$5,$6,$7,$8)")
        .bind(kind).bind(id).bind(owner.tenant_id.as_uuid()).bind(owner.user_id.as_uuid()).bind(command).bind(idempotency_key).bind(fingerprint.as_slice()).bind(key.as_str())
        .execute(&mut **tx).await.map_err(db_error)?;
    Ok(())
}
