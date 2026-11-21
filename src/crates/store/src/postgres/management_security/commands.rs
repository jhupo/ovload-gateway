//! Explicit offline operator provisioning with atomic grants and audit.

use super::*;

pub(super) async fn provision_operator(
    store: &PgManagementSecurityStore,
    username: String,
    password_hash: SecretString,
) -> IdentityResult<PrincipalRecord> {
    validate_text(&username, 128)?;
    if !password_hash.expose_secret().starts_with("$argon2id$") {
        return Err(IdentityError::Invalid);
    }
    let mut tx = store.begin().await?;
    mutex(&mut tx).await?;
    let exists: bool =
        sqlx::query_scalar("select exists(select 1 from identity_management_principals)")
            .fetch_one(&mut *tx)
            .await
            .map_err(db_error)?;
    if !exists {
        return Err(IdentityError::Conflict);
    }
    let id = Uuid::now_v7();
    let row=sqlx::query("insert into identity_management_principals(id,username,password_hash) values($1,$2,$3) returning id,username,status,revision,created_at,updated_at")
      .bind(id).bind(username).bind(password_hash.expose_secret()).fetch_one(&mut *tx).await.map_err(db_error)?;
    sqlx::query("insert into identity_grants(principal_id,permissions) values($1,array['identity.users.read','identity.users.manage','identity.keys.read','identity.keys.manage','security.settings.manage','provider_accounts.read','provider_accounts.manage','models.execute','usage.read','billing.read','billing.manage','plugins.manage'])")
      .bind(id).execute(&mut *tx).await.map_err(db_error)?;
    audit(
        &mut tx,
        None,
        SecurityScope::Platform,
        "identity.operator_provisioned",
        id,
        "explicit offline operator provisioning",
    )
    .await?;
    let result = read::principal_row(&row)?;
    tx.commit().await.map_err(db_error)?;
    Ok(result)
}

pub(super) async fn reset_password(
    store: &PgManagementSecurityStore,
    username: String,
    password_hash: SecretString,
) -> IdentityResult<PrincipalRecord> {
    validate_text(&username, 128)?;
    if !password_hash.expose_secret().starts_with("$argon2id$") {
        return Err(IdentityError::Invalid);
    }
    let mut tx = store.begin().await?;
    mutex(&mut tx).await?;
    let row = sqlx::query(
        "select id,username,status,revision,created_at,updated_at
         from identity_management_principals where username=$1 for update",
    )
    .bind(&username)
    .fetch_optional(&mut *tx)
    .await
    .map_err(db_error)?
    .ok_or(IdentityError::NotFound)?;
    let id: Uuid = row.try_get("id").map_err(db_error)?;
    let row = sqlx::query(
        "update identity_management_principals
         set password_hash=$2,revision=revision+1,updated_at=clock_timestamp()
         where id=$1
         returning id,username,status,revision,created_at,updated_at",
    )
    .bind(id)
    .bind(password_hash.expose_secret())
    .fetch_one(&mut *tx)
    .await
    .map_err(db_error)?;
    sqlx::query(
        "update identity_sessions set revoked_at=clock_timestamp()
         where principal_id=$1 and revoked_at is null",
    )
    .bind(id)
    .execute(&mut *tx)
    .await
    .map_err(db_error)?;
    audit(
        &mut tx,
        None,
        SecurityScope::Platform,
        "identity.password_reset_offline",
        id,
        "explicit offline password reset",
    )
    .await?;
    let result = read::principal_row(&row)?;
    tx.commit().await.map_err(db_error)?;
    Ok(result)
}

async fn mutex(tx: &mut Transaction<'_, Postgres>) -> IdentityResult<()> {
    sqlx::query("select id from identity_security_mutex where id=true for update")
        .fetch_one(&mut **tx)
        .await
        .map_err(db_error)?;
    Ok(())
}
