//! Single use browser-bound OAuth attempts and subject lookup.
use super::*;
pub(super) async fn save(store: &PgIdentityLifecycleStore, a: OAuthAttempt) -> IdentityResult<()> {
    let mut tx = store.begin().await?;
    // Serialize bounded admission across processes.
    sqlx::query("select pg_advisory_xact_lock(7015001)")
        .execute(&mut *tx)
        .await
        .map_err(db_error)?;
    sqlx::query("delete from identity_oauth_attempts where expires_at<clock_timestamp()")
        .execute(&mut *tx)
        .await
        .map_err(db_error)?;
    let count: i64 = sqlx::query_scalar("select count(*) from identity_oauth_attempts")
        .fetch_one(&mut *tx)
        .await
        .map_err(db_error)?;
    if count >= 1000 {
        return Err(IdentityError::RateLimited);
    }
    sqlx::query("insert into identity_oauth_attempts(state_digest,browser_digest,encrypted) values($1,$2,$3)").bind(a.digest.as_slice()).bind(a.browser_digest.as_slice()).bind(a.encrypted).execute(&mut *tx).await.map_err(db_error)?;
    commit(tx).await
}
pub(super) async fn take(
    store: &PgIdentityLifecycleStore,
    state: [u8; 32],
    browser: [u8; 32],
) -> IdentityResult<Vec<u8>> {
    sqlx::query_scalar("delete from identity_oauth_attempts where state_digest=$1 and browser_digest=$2 and expires_at>clock_timestamp() returning encrypted")
 .bind(state.as_slice()).bind(browser.as_slice()).fetch_optional(&store.pool).await.map_err(db_error)?.ok_or(IdentityError::Unauthorized)
}
pub(super) async fn credential(
    store: &PgIdentityLifecycleStore,
    provider: &str,
    subject: &str,
) -> IdentityResult<Option<IdentityCredential>> {
    let row=sqlx::query("select u.id,u.tenant_id,u.password_hash,u.authority_generation from identity_external_identities e join identity_users u on u.id=e.user_id join identity_tenants t on t.id=u.tenant_id where e.provider=$1 and e.subject=$2 and u.status='active' and t.status='active'")
 .bind(provider).bind(subject).fetch_optional(&store.pool).await.map_err(db_error)?;
    row.map(|r| {
        Ok(IdentityCredential {
            owner: IdentityOwner::Customer {
                tenant_id: TenantId::new(r.try_get("tenant_id").map_err(db_error)?),
                user_id: UserId::new(r.try_get("id").map_err(db_error)?),
            },
            password_hash: SecretString::from(
                r.try_get::<String, _>("password_hash").map_err(db_error)?,
            ),
            authority_generation: positive(r.try_get("authority_generation").map_err(db_error)?)?,
        })
    })
    .transpose()
}
