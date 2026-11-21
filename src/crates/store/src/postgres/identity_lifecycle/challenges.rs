use sha2::{Digest as _, Sha256};

use super::*;

pub(super) async fn request_reset(
    store: &PgIdentityLifecycleStore,
    email: String,
    challenge: LifecycleChallenge,
) -> IdentityResult<()> {
    if normalize_email(&email)? != email
        || !matches!(challenge.purpose, ChallengePurpose::PasswordReset)
        || challenge.email_digest != <[u8; 32]>::from(Sha256::digest(email.as_bytes()))
    {
        return Err(IdentityError::Invalid);
    }
    let mut tx = store.begin().await?;
    let policy = policy::lock(&mut tx).await?;
    if !policy.recovery_enabled {
        return Err(IdentityError::Forbidden);
    }
    let owner=sqlx::query("select u.tenant_id,u.id from identity_users u join identity_tenants t on t.id=u.tenant_id where u.email=$1 and u.status='active' and t.status='active'")
        .bind(email).fetch_optional(&mut *tx).await.map_err(db_error)?;
    if let Some(row) = owner {
        let tenant = TenantId::new(row.try_get("tenant_id").map_err(db_error)?);
        let user = UserId::new(row.try_get("id").map_err(db_error)?);
        access::lock_target(&mut tx, tenant, user).await?;
        let generation=sqlx::query_scalar::<_,i64>("select u.authority_generation from identity_users u join identity_tenants t on t.id=u.tenant_id where u.tenant_id=$1 and u.id=$2 and u.status='active' and t.status='active'")
            .bind(tenant.as_uuid()).bind(user.as_uuid()).fetch_optional(&mut *tx).await.map_err(db_error)?;
        if let Some(generation) = generation {
            insert(
                &mut tx,
                &challenge,
                Some((tenant, user, positive(generation)?)),
            )
            .await?;
        }
    }
    commit(tx).await
}

pub(super) async fn insert(
    tx: &mut Transaction<'_, Postgres>,
    challenge: &LifecycleChallenge,
    owner: Option<(TenantId, UserId, u64)>,
) -> IdentityResult<()> {
    if challenge.id.is_nil()
        || !(29..=8192).contains(&challenge.encrypted_payload.len())
        || !(29..=8192).contains(&challenge.encrypted_notification.len())
    {
        return Err(IdentityError::Invalid);
    }
    // The caller holds the singleton policy lock, bounding all active intents.
    sqlx::query("update identity_lifecycle_challenges set consumed_at=clock_timestamp() where consumed_at is null and (expires_at<=clock_timestamp() or (purpose=$1 and email_digest=$2))")
        .bind(challenge.purpose.as_str()).bind(challenge.email_digest.as_slice()).execute(&mut **tx).await.map_err(db_error)?;
    sqlx::query("update identity_notification_outbox o set state=case when o.expires_at<=clock_timestamp() then 'expired' else 'cancelled' end where o.state='pending' and exists(select 1 from identity_lifecycle_challenges c where c.id=o.challenge_id and c.consumed_at is not null)")
        .execute(&mut **tx).await.map_err(db_error)?;
    let count: i64 = sqlx::query_scalar(
        "select count(*) from identity_notification_outbox where state='pending'",
    )
    .fetch_one(&mut **tx)
    .await
    .map_err(db_error)?;
    if count >= 1000 {
        return Err(IdentityError::Unavailable);
    }
    let (tenant, user, generation) = match owner {
        Some((tenant, user, generation)) => (
            Some(tenant.as_uuid()),
            Some(user.as_uuid()),
            Some(super::generation(generation)?),
        ),
        None => (None, None, None),
    };
    sqlx::query("with instant as materialized (select clock_timestamp() as at) insert into identity_lifecycle_challenges (id,purpose,token_digest,email_digest,tenant_id,user_id,authority_generation,encrypted_payload,created_at,expires_at) select $1,$2,$3,$4,$5,$6,$7,$8,at,at+case when $9 then make_interval(hours=>coalesce((select (policy->>'pendingIdentityHours')::int from authentication_security where singleton),24)) else interval '20 minutes' end from instant")
        .bind(challenge.id).bind(challenge.purpose.as_str()).bind(challenge.token_digest.as_slice()).bind(challenge.email_digest.as_slice())
        .bind(tenant).bind(user).bind(generation).bind(&challenge.encrypted_payload).bind(matches!(challenge.purpose,ChallengePurpose::Registration)).execute(&mut **tx).await.map_err(db_error)?;
    sqlx::query("insert into identity_notification_outbox (id,challenge_id,encrypted_payload,expires_at) select $1,id,$2,expires_at from identity_lifecycle_challenges where id=$1")
        .bind(challenge.id).bind(&challenge.encrypted_notification).execute(&mut **tx).await.map_err(db_error)?;
    audit(
        tx,
        None,
        owner.map(|(tenant, _, _)| tenant),
        "identity.challenge_requested",
        challenge.id,
        None,
    )
    .await
}

pub(super) async fn get(
    store: &PgIdentityLifecycleStore,
    purpose: ChallengePurpose,
    digest: [u8; 32],
) -> IdentityResult<ChallengeRecord> {
    let row=sqlx::query("select id,purpose,token_digest,encrypted_payload,tenant_id,user_id,authority_generation,expires_at from identity_lifecycle_challenges where purpose=$1 and token_digest=$2 and consumed_at is null and expires_at>clock_timestamp()")
        .bind(purpose.as_str()).bind(digest.as_slice()).fetch_optional(&store.pool).await.map_err(db_error)?.ok_or(IdentityError::Unauthorized)?;
    Ok(ChallengeRecord {
        id: row.try_get("id").map_err(db_error)?,
        purpose,
        token_digest: digest,
        encrypted_payload: row.try_get("encrypted_payload").map_err(db_error)?,
        tenant_id: row
            .try_get::<Option<Uuid>, _>("tenant_id")
            .map_err(db_error)?
            .map(TenantId::new),
        user_id: row
            .try_get::<Option<Uuid>, _>("user_id")
            .map_err(db_error)?
            .map(UserId::new),
        authority_generation: row
            .try_get::<Option<i64>, _>("authority_generation")
            .map_err(db_error)?
            .map(positive)
            .transpose()?,
        expires_at: row.try_get("expires_at").map_err(db_error)?,
    })
}

pub(super) async fn lock_current(
    tx: &mut Transaction<'_, Postgres>,
    challenge: &ChallengeRecord,
) -> IdentityResult<()> {
    let found:Option<Uuid>=sqlx::query_scalar("select id from identity_lifecycle_challenges where id=$1 and purpose=$2 and token_digest=$3 and encrypted_payload=$4 and tenant_id is not distinct from $5 and user_id is not distinct from $6 and authority_generation is not distinct from $7 and expires_at=$8 and consumed_at is null and expires_at>clock_timestamp() for update")
        .bind(challenge.id).bind(challenge.purpose.as_str()).bind(challenge.token_digest.as_slice()).bind(&challenge.encrypted_payload)
        .bind(challenge.tenant_id.map(TenantId::as_uuid)).bind(challenge.user_id.map(UserId::as_uuid)).bind(challenge.authority_generation.map(generation).transpose()?).bind(challenge.expires_at)
        .fetch_optional(&mut **tx).await.map_err(db_error)?;
    if found.is_none() {
        return Err(IdentityError::Unauthorized);
    }
    Ok(())
}

pub(super) async fn consume(tx: &mut Transaction<'_, Postgres>, id: Uuid) -> IdentityResult<()> {
    let count=sqlx::query("update identity_lifecycle_challenges set consumed_at=clock_timestamp() where id=$1 and consumed_at is null and expires_at>clock_timestamp()")
        .bind(id).execute(&mut **tx).await.map_err(db_error)?.rows_affected();
    if count != 1 {
        return Err(IdentityError::Unauthorized);
    }
    sqlx::query("update identity_notification_outbox set state='cancelled' where challenge_id=$1 and state='pending'")
        .bind(id).execute(&mut **tx).await.map_err(db_error)?;
    audit(tx, None, None, "identity.challenge_consumed", id, None).await
}
