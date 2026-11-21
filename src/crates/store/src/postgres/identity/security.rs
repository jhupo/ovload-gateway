use super::*;
use ovload_admin::model::identity_security::{SecurityDocument, SecurityPolicy};
use ovload_core::access::Permission;
use sha2::{Digest as _, Sha256};
use std::net::IpAddr;

pub(crate) async fn policy(pool: &PgPool) -> IdentityResult<SecurityPolicy> {
    let value: serde_json::Value =
        sqlx::query_scalar("select policy from authentication_security where singleton")
            .fetch_one(pool)
            .await
            .map_err(db_error)?;
    serde_json::from_value(value).map_err(|_| IdentityError::Unavailable)
}
pub(crate) async fn document(
    pool: &PgPool,
    session: Option<&IdentitySession>,
) -> IdentityResult<SecurityDocument> {
    let mut tx = pool.begin().await.map_err(db_error)?;
    if let Some(s) = session {
        authorize(&mut tx, s).await?;
    }
    let row = sqlx::query(
        "select revision,policy,encrypted from authentication_security where singleton",
    )
    .fetch_one(&mut *tx)
    .await
    .map_err(db_error)?;
    let result = SecurityDocument {
        revision: positive(row.try_get("revision").map_err(db_error)?)?,
        policy: serde_json::from_value(row.try_get("policy").map_err(db_error)?)
            .map_err(|_| IdentityError::Unavailable)?,
        encrypted: row.try_get("encrypted").map_err(db_error)?,
    };
    tx.commit().await.map_err(db_error)?;
    Ok(result)
}
async fn authorize(tx: &mut Transaction<'_, Postgres>, s: &IdentitySession) -> IdentityResult<()> {
    let IdentityOwner::Management(principal_id) = s.owner else {
        return Err(IdentityError::Forbidden);
    };
    access::authorize(
        tx,
        IdentityManagementActor {
            principal_id,
            session_id: s.id,
            authority_generation: s.authority_generation,
        },
        Permission::SecuritySettingsManage,
        None,
    )
    .await
}
pub(crate) async fn save(
    pool: &PgPool,
    s: &IdentitySession,
    d: SecurityDocument,
) -> IdentityResult<()> {
    d.policy.validate()?;
    let mut tx = pool.begin().await.map_err(db_error)?;
    authorize(&mut tx, s).await?;
    let changed=sqlx::query("update authentication_security set revision=revision+1,policy=$1,encrypted=$2 where singleton and revision=$3")
        .bind(serde_json::to_value(d.policy).map_err(|_|IdentityError::Invalid)?).bind(d.encrypted).bind(generation(d.revision)?).execute(&mut *tx).await.map_err(db_error)?.rows_affected();
    if changed != 1 {
        return Err(IdentityError::Conflict);
    }
    sqlx::query("insert into identity_audit_events(actor_kind,actor_id,session_id,action,target_kind) values('management_principal',$1,$2,'security.settings.updated','authentication_security')").bind(owner_columns(s.owner).2).bind(s.id.to_string()).execute(&mut *tx).await.map_err(db_error)?;
    tx.commit().await.map_err(db_error)
}
pub(crate) async fn outcome(pool: &PgPool, source: IpAddr, success: bool) -> IdentityResult<()> {
    let p = policy(pool).await?;
    let digest = Sha256::digest(source.to_canonical().to_string().as_bytes());
    if success {
        sqlx::query("delete from authentication_failures where source_digest=$1")
            .bind(digest.as_slice())
            .execute(pool)
            .await
            .map_err(db_error)?;
    } else if p.invalid_auth_protection {
        sqlx::query("insert into authentication_failures(source_digest,failures,blocked_until) values($1,1,case when $2=1 then clock_timestamp()+make_interval(mins=>$3) end) on conflict(source_digest) do update set failures=case when authentication_failures.window_start<clock_timestamp()-interval '15 minutes' then 1 else least(authentication_failures.failures+1,1001) end,window_start=case when authentication_failures.window_start<clock_timestamp()-interval '15 minutes' then clock_timestamp() else authentication_failures.window_start end,blocked_until=case when (case when authentication_failures.window_start<clock_timestamp()-interval '15 minutes' then 1 else authentication_failures.failures+1 end)>=$2 then clock_timestamp()+make_interval(mins=>$3) else authentication_failures.blocked_until end")
        .bind(digest.as_slice()).bind(p.invalid_auth_threshold as i32).bind(p.invalid_auth_block_minutes as i32).execute(pool).await.map_err(db_error)?;
    }
    sqlx::query("delete from authentication_failures where window_start<clock_timestamp()-interval '1 day' and (blocked_until is null or blocked_until<clock_timestamp())").execute(pool).await.map_err(db_error)?;
    Ok(())
}
pub(crate) async fn step_up(
    pool: &PgPool,
    s: &IdentitySession,
    verified: bool,
) -> IdentityResult<bool> {
    let mut tx = pool.begin().await.map_err(db_error)?;
    access::lock_session(&mut tx, s).await?;
    if verified {
        sqlx::query("update identity_sessions set step_up_at=clock_timestamp() where id=$1")
            .bind(s.id.as_uuid())
            .execute(&mut *tx)
            .await
            .map_err(db_error)?;
    }
    let ok:bool=sqlx::query_scalar("select coalesce(step_up_at>clock_timestamp()-interval '10 minutes',false) from identity_sessions where id=$1").bind(s.id.as_uuid()).fetch_one(&mut *tx).await.map_err(db_error)?;
    tx.commit().await.map_err(db_error)?;
    Ok(ok)
}
pub(crate) async fn rotate_key(
    store: &PgIdentityStore,
    s: &IdentitySession,
    c: NewIdentitySession,
) -> IdentityResult<()> {
    let mut tx = store.begin().await?;
    authorize(&mut tx, s).await?;
    sqlx::query("update identity_sessions set revoked_at=clock_timestamp() where principal_id=$1 and is_admin_key and revoked_at is null").bind(owner_columns(s.owner).2).execute(&mut *tx).await.map_err(db_error)?;
    super::sessions::insert(&mut tx, &c).await?;
    sqlx::query("update identity_sessions set is_admin_key=true where id=$1")
        .bind(c.session.id.as_uuid())
        .execute(&mut *tx)
        .await
        .map_err(db_error)?;
    sqlx::query("insert into identity_audit_events(actor_kind,actor_id,session_id,action,target_kind) values('management_principal',$1,$2,'security.admin_key.rotated','authentication_security')").bind(owner_columns(s.owner).2).bind(s.id.to_string()).execute(&mut *tx).await.map_err(db_error)?;
    tx.commit().await.map_err(db_error)
}

pub(crate) async fn key_status(
    pool: &PgPool,
    session: &IdentitySession,
) -> IdentityResult<ovload_admin::model::identity_security::AdminKeyStatus> {
    let mut tx = pool.begin().await.map_err(db_error)?;
    authorize(&mut tx, session).await?;
    let expires_at: Option<DateTime<Utc>> = sqlx::query_scalar(
        "select expires_at from identity_sessions where principal_id=$1 and is_admin_key
         and revoked_at is null and expires_at>clock_timestamp()",
    )
    .bind(owner_columns(session.owner).2)
    .fetch_optional(&mut *tx)
    .await
    .map_err(db_error)?;
    tx.commit().await.map_err(db_error)?;
    Ok(ovload_admin::model::identity_security::AdminKeyStatus {
        exists: expires_at.is_some(),
        expires_at,
    })
}

pub(crate) async fn revoke_key(pool: &PgPool, session: &IdentitySession) -> IdentityResult<()> {
    let mut tx = pool.begin().await.map_err(db_error)?;
    authorize(&mut tx, session).await?;
    sqlx::query("update identity_sessions set revoked_at=clock_timestamp() where principal_id=$1 and is_admin_key and revoked_at is null")
        .bind(owner_columns(session.owner).2).execute(&mut *tx).await.map_err(db_error)?;
    sqlx::query("insert into identity_audit_events(actor_kind,actor_id,session_id,action,target_kind) values('management_principal',$1,$2,'security.admin_key.revoked','authentication_security')")
        .bind(owner_columns(session.owner).2).bind(session.id.to_string()).execute(&mut *tx).await.map_err(db_error)?;
    tx.commit().await.map_err(db_error)
}
