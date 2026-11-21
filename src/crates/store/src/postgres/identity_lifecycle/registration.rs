use sha2::{Digest as _, Sha256};

use super::*;

pub(super) async fn register(
    store: &PgIdentityLifecycleStore,
    value: PreparedRegistration,
    challenge: Option<LifecycleChallenge>,
) -> IdentityResult<()> {
    validate(&value)?;
    let mut tx = store.begin().await?;
    let policy = policy::lock(&mut tx).await?;
    allowed(&mut tx, &policy, &value).await?;
    if policy.agreement.enabled && value.consent_revision != Some(policy.revision) {
        return Err(IdentityError::Conflict);
    }
    if (policy.verification_required || value.external_identity.is_some()) != challenge.is_some() {
        return Err(IdentityError::Conflict);
    }
    if !exists(&mut tx, &value.email).await? {
        if let Some(challenge) = challenge {
            if !matches!(challenge.purpose, ChallengePurpose::Registration)
                || challenge.email_digest
                    != <[u8; 32]>::from(Sha256::digest(value.email.as_bytes()))
            {
                return Err(IdentityError::Invalid);
            }
            challenges::insert(&mut tx, &challenge, None).await?;
        } else {
            create(&mut tx, value, &policy, false).await?;
        }
    }
    commit(tx).await
}

pub(super) async fn consume(
    store: &PgIdentityLifecycleStore,
    challenge: ChallengeRecord,
    value: PreparedRegistration,
) -> IdentityResult<()> {
    validate(&value)?;
    if !matches!(challenge.purpose, ChallengePurpose::Registration) {
        return Err(IdentityError::Invalid);
    }
    let mut tx = store.begin().await?;
    let policy = policy::lock(&mut tx).await?;
    allowed(&mut tx, &policy, &value).await?;
    if policy.agreement.enabled && value.consent_revision != Some(policy.revision) {
        return Err(IdentityError::Conflict);
    }
    challenges::lock_current(&mut tx, &challenge).await?;
    let matches: bool =
        sqlx::query_scalar("select email_digest=$2 from identity_lifecycle_challenges where id=$1")
            .bind(challenge.id)
            .bind(Sha256::digest(value.email.as_bytes()).as_slice())
            .fetch_one(&mut *tx)
            .await
            .map_err(db_error)?;
    if !matches {
        return Err(IdentityError::Unavailable);
    }
    if !exists(&mut tx, &value.email).await? {
        create(&mut tx, value, &policy, true).await?;
    }
    challenges::consume(&mut tx, challenge.id).await?;
    commit(tx).await
}

fn validate(value: &PreparedRegistration) -> IdentityResult<()> {
    if normalize_email(&value.email)? != value.email {
        return Err(IdentityError::Invalid);
    }
    text(&value.display_name, 160)?;
    checked_hash(&value.password_hash)
}
async fn allowed(
    tx: &mut Transaction<'_, Postgres>,
    policy: &RegistrationPolicy,
    value: &PreparedRegistration,
) -> IdentityResult<()> {
    let invitation: bool = sqlx::query_scalar("select exists(select 1 from commerce_codes c where code=upper($1) and kind='invitation' and not disabled and not deleted and (expires_at is null or expires_at>now()) and (max_uses=0 or (select count(*) from commerce_redemptions where code_id=c.id)<max_uses))")
        .bind(value.invitation_code.as_deref().unwrap_or("").trim()).fetch_one(&mut **tx).await.map_err(db_error)?;
    if (!policy.registration_enabled && !invitation) || !policy.permits_email(&value.email) {
        return Err(IdentityError::Forbidden);
    }
    Ok(())
}
async fn exists(tx: &mut Transaction<'_, Postgres>, email: &str) -> IdentityResult<bool> {
    sqlx::query_scalar("select exists(select 1 from identity_users where email=$1)")
        .bind(email)
        .fetch_one(&mut **tx)
        .await
        .map_err(db_error)
}
async fn create(
    tx: &mut Transaction<'_, Postgres>,
    value: PreparedRegistration,
    policy: &RegistrationPolicy,
    verified: bool,
) -> IdentityResult<()> {
    let tenant = TenantId::new(Uuid::now_v7());
    let user = UserId::new(Uuid::now_v7());
    sqlx::query("insert into identity_tenants (id,slug,display_name,max_concurrency,requests_per_minute) values ($1,$2,$3,$4,$5)")
        .bind(tenant.as_uuid()).bind(format!("customer-{}",tenant.as_uuid().simple())).bind(&value.display_name)
        .bind(i64::from(policy.default_customer_concurrency)).bind(i64::from(policy.default_customer_rpm)).execute(&mut **tx).await.map_err(db_error)?;
    sqlx::query("insert into identity_tenant_wallets (tenant_id) values ($1)")
        .bind(tenant.as_uuid())
        .execute(&mut **tx)
        .await
        .map_err(db_error)?;
    sqlx::query("insert into identity_users (id,tenant_id,email,password_hash,display_name,authority_generation,max_concurrency,requests_per_minute,email_verified_at) values ($1,$2,$3,$4,$5,1,$6,$7,case when $8 then clock_timestamp() else null end)")
        .bind(user.as_uuid()).bind(tenant.as_uuid()).bind(&value.email).bind(value.password_hash.expose_secret()).bind(&value.display_name)
        .bind(i64::from(policy.default_user_concurrency)).bind(i64::from(policy.default_user_rpm)).bind(verified).execute(&mut **tx).await.map_err(db_error)?;
    if let Some((provider, subject)) = &value.external_identity {
        sqlx::query(
            "insert into identity_external_identities(provider,subject,user_id) values($1,$2,$3)",
        )
        .bind(provider)
        .bind(subject)
        .bind(user.as_uuid())
        .execute(&mut **tx)
        .await
        .map_err(db_error)?;
    }
    if let Some(code) = value
        .invitation_code
        .as_deref()
        .filter(|v| !v.trim().is_empty())
    {
        if code.len() > 32
            || !code
                .bytes()
                .all(|c| c.is_ascii_alphanumeric() || b"_-".contains(&c))
        {
            return Err(IdentityError::Invalid);
        }
        let invitation: Option<Uuid> = sqlx::query_scalar(
            "select id from commerce_codes where code=upper($1) and kind='invitation' for update",
        )
        .bind(code.trim())
        .fetch_optional(&mut **tx)
        .await
        .map_err(db_error)?;
        if let Some(id) = invitation {
            let valid: bool=sqlx::query_scalar("select not disabled and not deleted and (expires_at is null or expires_at>now()) and (max_uses=0 or (select count(*) from commerce_redemptions where code_id=$1)<max_uses) from commerce_codes where id=$1")
                .bind(id).fetch_one(&mut **tx).await.map_err(db_error)?;
            if !valid {
                return Err(IdentityError::Invalid);
            }
            sqlx::query("insert into commerce_redemptions(id,code_id,tenant_id,user_id) values($1,$2,$3,$4)")
                .bind(Uuid::now_v7()).bind(id).bind(tenant.as_uuid()).bind(user.as_uuid()).execute(&mut **tx).await.map_err(db_error)?;
        } else {
            let inviter: Option<Uuid> = sqlx::query_scalar("select a.user_id from referral_accounts a join identity_users u on u.id=a.user_id join identity_tenants t on t.id=u.tenant_id where a.code=upper($1) and u.status='active' and t.status='active' and exists(select 1 from workspace_settings where kind='features' and values->'referral'->>'enabled'='true')")
            .bind(code).fetch_optional(&mut **tx).await.map_err(db_error)?;
            let inviter = inviter.ok_or(IdentityError::Invalid)?;
            sqlx::query(
            "insert into referral_invitations(invitee_id,inviter_id,code) values($1,$2,upper($3))",
        )
        .bind(user.as_uuid())
        .bind(inviter)
        .bind(code)
        .execute(&mut **tx)
        .await
        .map_err(db_error)?;
        }
    }
    if policy.agreement.enabled {
        sqlx::query("insert into identity_agreement_acceptances(user_id,revision,event) values($1,$2,'registration')")
            .bind(user.as_uuid()).bind(generation(policy.revision)?).execute(&mut **tx).await.map_err(db_error)?;
    }
    if policy
        .gift_usd
        .parse::<ovload_core::metering::Decimal>()
        .map_err(|_| IdentityError::Invalid)?
        .scaled()
        > 0
    {
        sqlx::query("insert into wallet_ledger_entries(id,tenant_id,direction,entry_kind,amount_usd,source_id,idempotency_key) values($1,$2,'credit','registration_gift',$3::text::numeric,$4,'registration-gift')")
            .bind(Uuid::now_v7()).bind(tenant.as_uuid()).bind(&policy.gift_usd).bind(user.as_uuid()).execute(&mut **tx).await.map_err(db_error)?;
    }
    audit(
        tx,
        None,
        Some(tenant),
        "identity.customer_registered",
        user.as_uuid(),
        None,
    )
    .await
}
