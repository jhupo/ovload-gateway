//! Leased outbox attempts; challenge validity remains the authority.
use super::*;
pub(super) async fn claim(
    store: &PgIdentityLifecycleStore,
) -> IdentityResult<Option<PendingIdentityNotification>> {
    let lease = Uuid::now_v7();
    let row=sqlx::query("with candidate as (select o.id from identity_notification_outbox o join identity_lifecycle_challenges c on c.id=o.challenge_id where o.state='pending' and c.consumed_at is null and o.expires_at>clock_timestamp() and o.delivered_at is null and o.attempts<5 and o.next_attempt_at<=clock_timestamp() and (o.lease_until is null or o.lease_until<clock_timestamp()) order by o.created_at for update of o skip locked limit 1) update identity_notification_outbox o set lease_id=$1,lease_until=clock_timestamp()+interval '60 seconds',attempts=attempts+1 from candidate where o.id=candidate.id returning o.id,o.encrypted_payload")
 .bind(lease).fetch_optional(&store.pool).await.map_err(db_error)?;
    row.map(|r| {
        Ok(PendingIdentityNotification {
            id: r.try_get("id").map_err(db_error)?,
            lease,
            encrypted: r.try_get("encrypted_payload").map_err(db_error)?,
        })
    })
    .transpose()
}
pub(super) async fn finish(
    store: &PgIdentityLifecycleStore,
    id: Uuid,
    lease: Uuid,
    delivered: bool,
) -> IdentityResult<()> {
    sqlx::query("update identity_notification_outbox set delivered_at=case when $3 then clock_timestamp() else null end,lease_id=null,lease_until=null,next_attempt_at=clock_timestamp()+interval '60 seconds'*attempts where id=$1 and lease_id=$2 and delivered_at is null")
 .bind(id).bind(lease).bind(delivered).execute(&store.pool).await.map_err(db_error)?;
    Ok(())
}
