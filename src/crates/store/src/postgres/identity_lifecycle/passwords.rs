use super::*;

pub(super) async fn credential(
    store: &PgIdentityLifecycleStore,
    current: &IdentitySession,
) -> IdentityResult<LifecycleCredential> {
    let mut tx = store.begin().await?;
    access::lock_session(&mut tx, current).await?;
    let (hash, revision) = credential_values(&mut tx, current.owner).await?;
    commit(tx).await?;
    Ok(LifecycleCredential {
        credential: IdentityCredential {
            owner: current.owner,
            password_hash: hash,
            authority_generation: current.authority_generation,
        },
        revision,
    })
}

pub(super) async fn change(
    store: &PgIdentityLifecycleStore,
    current: &IdentitySession,
    expected_revision: u64,
    verified_hash: SecretString,
    new_hash: SecretString,
) -> IdentityResult<()> {
    checked_hash(&new_hash)?;
    let mut tx = store.begin().await?;
    access::lock_session(&mut tx, current).await?;
    let (stored_hash, revision) = credential_values(&mut tx, current.owner).await?;
    if revision != expected_revision || stored_hash.expose_secret() != verified_hash.expose_secret()
    {
        return Err(IdentityError::Conflict);
    }
    write(&mut tx, current.owner, &new_hash).await?;
    revoke_all(&mut tx, current.owner).await?;
    let (tenant, target) = match current.owner {
        IdentityOwner::Customer { tenant_id, user_id } => (Some(tenant_id), user_id.as_uuid()),
        IdentityOwner::Management(id) => (None, id.as_uuid()),
    };
    audit(
        &mut tx,
        Some(current),
        tenant,
        "identity.password_changed",
        target,
        None,
    )
    .await?;
    commit(tx).await
}

pub(super) async fn reset(
    store: &PgIdentityLifecycleStore,
    challenge: ChallengeRecord,
    hash: SecretString,
) -> IdentityResult<()> {
    checked_hash(&hash)?;
    if !matches!(challenge.purpose, ChallengePurpose::PasswordReset) {
        return Err(IdentityError::Invalid);
    }
    let tenant = challenge.tenant_id.ok_or(IdentityError::Invalid)?;
    let user = challenge.user_id.ok_or(IdentityError::Invalid)?;
    let expected = challenge
        .authority_generation
        .ok_or(IdentityError::Invalid)?;
    let mut tx = store.begin().await?;
    let policy = policy::lock(&mut tx).await?;
    if !policy.recovery_enabled {
        return Err(IdentityError::Forbidden);
    }
    access::lock_target(&mut tx, tenant, user).await?;
    challenges::lock_current(&mut tx, &challenge).await?;
    let valid:bool=sqlx::query_scalar("select u.authority_generation=$3 and u.status='active' and t.status='active' from identity_users u join identity_tenants t on t.id=u.tenant_id where u.tenant_id=$1 and u.id=$2")
        .bind(tenant.as_uuid()).bind(user.as_uuid()).bind(generation(expected)?).fetch_one(&mut *tx).await.map_err(db_error)?;
    if !valid {
        return Err(IdentityError::Unauthorized);
    }
    let owner = IdentityOwner::Customer {
        tenant_id: tenant,
        user_id: user,
    };
    write(&mut tx, owner, &hash).await?;
    revoke_all(&mut tx, owner).await?;
    challenges::consume(&mut tx, challenge.id).await?;
    audit(
        &mut tx,
        None,
        Some(tenant),
        "identity.password_reset",
        user.as_uuid(),
        Some("single-use recovery challenge"),
    )
    .await?;
    commit(tx).await
}

async fn credential_values(
    tx: &mut Transaction<'_, Postgres>,
    owner: IdentityOwner,
) -> IdentityResult<(SecretString, u64)> {
    let row = match owner {
        IdentityOwner::Customer { tenant_id, user_id } => sqlx::query(
            "select password_hash,revision from identity_users where tenant_id=$1 and id=$2",
        )
        .bind(tenant_id.as_uuid())
        .bind(user_id.as_uuid())
        .fetch_one(&mut **tx)
        .await
        .map_err(db_error)?,
        IdentityOwner::Management(id) => sqlx::query(
            "select password_hash,revision from identity_management_principals where id=$1",
        )
        .bind(id.as_uuid())
        .fetch_one(&mut **tx)
        .await
        .map_err(db_error)?,
    };
    Ok((
        SecretString::from(
            row.try_get::<String, _>("password_hash")
                .map_err(db_error)?,
        ),
        positive(row.try_get("revision").map_err(db_error)?)?,
    ))
}
async fn write(
    tx: &mut Transaction<'_, Postgres>,
    owner: IdentityOwner,
    hash: &SecretString,
) -> IdentityResult<()> {
    match owner {
        IdentityOwner::Customer {tenant_id,user_id}=>sqlx::query("update identity_users set password_hash=$3,revision=revision+1,authority_generation=authority_generation+1,updated_at=clock_timestamp() where tenant_id=$1 and id=$2")
            .bind(tenant_id.as_uuid()).bind(user_id.as_uuid()).bind(hash.expose_secret()).execute(&mut **tx).await.map_err(db_error)?,
        IdentityOwner::Management(id)=>sqlx::query("update identity_management_principals set password_hash=$2,revision=revision+1,updated_at=clock_timestamp() where id=$1")
            .bind(id.as_uuid()).bind(hash.expose_secret()).execute(&mut **tx).await.map_err(db_error)?,
    };
    Ok(())
}
