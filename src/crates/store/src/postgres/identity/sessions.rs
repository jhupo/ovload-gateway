//! Durable sessions serialize with owner suspension and other session writes.

use ovload_admin::model::identity_access::NewIdentitySession;

use super::{access::lock_session, *};

pub(super) async fn create_session(
    store: &PgIdentityStore,
    command: NewIdentitySession,
) -> IdentityResult<()> {
    let mut tx = store.begin().await?;
    access::lock_owner(
        &mut tx,
        command.session.owner,
        command.session.authority_generation,
    )
    .await?;
    if let IdentityOwner::Customer { user_id, .. } = command.session.owner {
        let row = sqlx::query("select revision,agreement->>'enabled' = 'true' as enabled from identity_registration_policy where singleton for share")
            .fetch_one(&mut *tx).await.map_err(db_error)?;
        let revision: i64 = row.try_get("revision").map_err(db_error)?;
        if row.try_get::<bool, _>("enabled").map_err(db_error)? {
            if command.consent_revision.and_then(|v| i64::try_from(v).ok()) != Some(revision) {
                return Err(IdentityError::Conflict);
            }
            sqlx::query("insert into identity_agreement_acceptances(user_id,revision,event) values($1,$2,'login')")
                .bind(user_id.as_uuid()).bind(revision).execute(&mut *tx).await.map_err(db_error)?;
        }
    }
    if let Some(previous) = command.previous_session {
        if previous == command.session.id {
            return Err(IdentityError::Invalid);
        }
        revoke_owned(&mut tx, command.session.owner, previous).await?;
    }
    if let IdentityOwner::Customer { tenant_id, user_id } = command.session.owner {
        let count: i64 = sqlx::query_scalar(
            "select count(*) from identity_sessions where audience='customer'
             and tenant_id=$1 and user_id=$2 and revoked_at is null and not is_admin_key
             and expires_at > clock_timestamp()",
        )
        .bind(tenant_id.as_uuid())
        .bind(user_id.as_uuid())
        .fetch_one(&mut *tx)
        .await
        .map_err(db_error)?;
        if count >= 10 {
            return Err(IdentityError::RateLimited);
        }
    }
    insert(&mut tx, &command).await?;
    audit(
        &mut tx,
        session_audit(
            &command.session,
            "identity.authentication",
            Some("accepted"),
        ),
    )
    .await?;
    commit(tx).await
}

pub(super) async fn session(
    store: &PgIdentityStore,
    audience: IdentityAudience,
    access_digest: [u8; 32],
) -> IdentityResult<Option<IdentitySession>> {
    let row = match audience {
        IdentityAudience::Customer => sqlx::query(
            "select s.id,s.tenant_id,s.user_id,s.principal_id,s.authority_generation,s.expires_at,s.is_admin_key
             from identity_sessions s
             join identity_users u on u.tenant_id=s.tenant_id and u.id=s.user_id
             join identity_tenants t on t.id=u.tenant_id
             where s.audience='customer' and s.access_digest=$1 and s.revoked_at is null
             and s.expires_at > clock_timestamp() and u.status='active' and t.status='active'
             and u.authority_generation=s.authority_generation",
        ),
        IdentityAudience::Management => sqlx::query(
            "select s.id,s.tenant_id,s.user_id,s.principal_id,s.authority_generation,s.expires_at,s.is_admin_key
             from identity_sessions s
             join identity_management_principals p on p.id=s.principal_id
             where s.audience='management' and s.access_digest=$1 and s.revoked_at is null
             and s.expires_at > clock_timestamp() and p.status='active'
             and p.revision=s.authority_generation",
        ),
    }
    .bind(access_digest.as_slice())
    .fetch_optional(&store.pool)
    .await
    .map_err(db_error)?;
    let Some(row) = row else {
        return Ok(None);
    };
    let session = session_record(&row, audience)?;
    if row.try_get("is_admin_key").map_err(db_error)? {
        return Ok(Some(session));
    }
    let minutes = super::security::policy(&store.pool)
        .await?
        .access_token_minutes;
    if minutes > 0 {
        let valid: Option<bool> = sqlx::query_scalar(
            "update identity_sessions s set
             revoked_at=case when greatest(last_seen_at, a.idle_timeout_enabled_at)
               <=clock_timestamp()-make_interval(mins=>$2) then clock_timestamp() else null end,
             last_seen_at=clock_timestamp()
             from authentication_security a
             where a.singleton and s.id=$1 and s.revoked_at is null and s.expires_at>clock_timestamp()
             returning revoked_at is null",
        )
        .bind(session.id.as_uuid()).bind(minutes as i32).fetch_optional(&store.pool).await.map_err(db_error)?;
        if valid != Some(true) {
            return Ok(None);
        }
    }
    Ok(Some(session))
}

pub(super) async fn revoke_session(
    store: &PgIdentityStore,
    current: &IdentitySession,
) -> IdentityResult<()> {
    let mut tx = store.begin().await?;
    let stored = lock_session(&mut tx, current).await?;
    revoke_owned(&mut tx, stored.owner, stored.id).await?;
    audit(
        &mut tx,
        session_audit(&stored, "identity.session_revoked", None),
    )
    .await?;
    commit(tx).await
}

pub(super) async fn insert(
    tx: &mut Transaction<'_, Postgres>,
    command: &NewIdentitySession,
) -> IdentityResult<()> {
    let session = &command.session;
    let (tenant, user, principal) = owner_columns(session.owner);
    let count = sqlx::query(
        "insert into identity_sessions
         (id,access_digest,audience,tenant_id,user_id,principal_id,
          csrf_digest,authority_generation,expires_at)
         select $1,$2,$3,$4,$5,$6,$7,$8,$9 where $9 > clock_timestamp()",
    )
    .bind(session.id.as_uuid())
    .bind(command.access_digest.as_slice())
    .bind(audience(session.owner).as_str())
    .bind(tenant)
    .bind(user)
    .bind(principal)
    .bind(command.csrf_digest.as_slice())
    .bind(generation(session.authority_generation)?)
    .bind(session.expires_at)
    .execute(&mut **tx)
    .await
    .map_err(db_error)?
    .rows_affected();
    if count == 0 {
        return Err(IdentityError::Unauthorized);
    }
    Ok(())
}

async fn revoke_owned(
    tx: &mut Transaction<'_, Postgres>,
    owner: IdentityOwner,
    target: AccessSessionId,
) -> IdentityResult<u64> {
    let (tenant, user, principal) = owner_columns(owner);
    Ok(sqlx::query(
        "update identity_sessions set revoked_at=clock_timestamp() where id=$1 and audience=$2
         and tenant_id is not distinct from $3 and user_id is not distinct from $4
         and principal_id is not distinct from $5 and revoked_at is null
         and expires_at > clock_timestamp()",
    )
    .bind(target.as_uuid())
    .bind(audience(owner).as_str())
    .bind(tenant)
    .bind(user)
    .bind(principal)
    .execute(&mut **tx)
    .await
    .map_err(db_error)?
    .rows_affected())
}

fn session_audit<'a>(
    session: &IdentitySession,
    action: &'static str,
    reason: Option<&'a str>,
) -> AuditEvent<'a> {
    AuditEvent {
        owner: Some(session.owner),
        session_id: Some(session.id),
        tenant_id: None,
        action,
        target_kind: "identity_session",
        target_id: session.id.as_uuid(),
        reason,
    }
}
