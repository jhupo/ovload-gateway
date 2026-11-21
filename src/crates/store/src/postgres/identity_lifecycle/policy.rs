use super::*;

const COLUMNS: &str = "revision,registration_enabled,verification_required,recovery_enabled,allowed_domains,default_user_concurrency,default_user_rpm,default_customer_concurrency,default_customer_rpm,enabled_providers,agreement,gift_usd::text as gift_usd";

pub(super) async fn read(store: &PgIdentityLifecycleStore) -> IdentityResult<RegistrationPolicy> {
    let mut query = sqlx::QueryBuilder::<Postgres>::new("select ");
    query
        .push(COLUMNS)
        .push(" from identity_registration_policy where singleton");
    let row = query
        .build()
        .fetch_one(&store.pool)
        .await
        .map_err(db_error)?;
    from_row(&row)
}
pub(super) async fn lock(tx: &mut Transaction<'_, Postgres>) -> IdentityResult<RegistrationPolicy> {
    let mut query = sqlx::QueryBuilder::<Postgres>::new("select ");
    query
        .push(COLUMNS)
        .push(" from identity_registration_policy where singleton for update");
    let row = query.build().fetch_one(&mut **tx).await.map_err(db_error)?;
    from_row(&row)
}
fn from_row(row: &PgRow) -> IdentityResult<RegistrationPolicy> {
    let value = RegistrationPolicy {
        enabled_providers: row.try_get("enabled_providers").map_err(db_error)?,
        agreement: serde_json::from_value(row.try_get("agreement").map_err(db_error)?)
            .map_err(|_| IdentityError::Unavailable)?,
        gift_usd: row.try_get("gift_usd").map_err(db_error)?,
        revision: positive(row.try_get("revision").map_err(db_error)?)?,
        registration_enabled: row.try_get("registration_enabled").map_err(db_error)?,
        verification_required: row.try_get("verification_required").map_err(db_error)?,
        recovery_enabled: row.try_get("recovery_enabled").map_err(db_error)?,
        allowed_domains: row.try_get("allowed_domains").map_err(db_error)?,
        default_user_concurrency: limit(row, "default_user_concurrency")?,
        default_user_rpm: limit(row, "default_user_rpm")?,
        default_customer_concurrency: limit(row, "default_customer_concurrency")?,
        default_customer_rpm: limit(row, "default_customer_rpm")?,
    };
    value.validate().map_err(|_| IdentityError::Unavailable)?;
    Ok(value)
}
pub(super) fn limit(row: &PgRow, column: &str) -> IdentityResult<u32> {
    u32::try_from(row.try_get::<i64, _>(column).map_err(db_error)?)
        .map_err(|_| IdentityError::Unavailable)
}

pub(super) async fn management(
    store: &PgIdentityLifecycleStore,
    actor: IdentityManagementActor,
) -> IdentityResult<RegistrationPolicy> {
    let mut tx = store.begin().await?;
    access::authorize(&mut tx, actor, Permission::SecuritySettingsManage, None).await?;
    let value = lock(&mut tx).await?;
    commit(tx).await?;
    Ok(value)
}
pub(super) async fn update(
    store: &PgIdentityLifecycleStore,
    actor: IdentityManagementActor,
    value: RegistrationPolicy,
) -> IdentityResult<RegistrationPolicy> {
    value.validate()?;
    let mut tx = store.begin().await?;
    access::authorize(&mut tx, actor, Permission::SecuritySettingsManage, None).await?;
    let current = lock(&mut tx).await?;
    if current.revision != value.revision {
        return Err(IdentityError::Conflict);
    }
    let revision = value
        .revision
        .checked_add(1)
        .and_then(|v| i64::try_from(v).ok())
        .ok_or(IdentityError::Unavailable)?;
    let agreement = serde_json::to_value(&value.agreement).map_err(|_| IdentityError::Invalid)?;
    sqlx::query("insert into identity_agreement_versions(revision,document) values($1,$2)")
        .bind(revision)
        .bind(&agreement)
        .execute(&mut *tx)
        .await
        .map_err(db_error)?;
    sqlx::query("update identity_registration_policy set revision=$1, registration_enabled=$2,verification_required=$3,recovery_enabled=$4,allowed_domains=$5,default_user_concurrency=$6,default_user_rpm=$7,default_customer_concurrency=$8,default_customer_rpm=$9,agreement=$10,gift_usd=$11::text::numeric,enabled_providers=$12 where singleton")
        .bind(revision).bind(value.registration_enabled).bind(value.verification_required).bind(value.recovery_enabled).bind(&value.allowed_domains)
        .bind(i64::from(value.default_user_concurrency)).bind(i64::from(value.default_user_rpm)).bind(i64::from(value.default_customer_concurrency)).bind(i64::from(value.default_customer_rpm)).bind(agreement).bind(&value.gift_usd).bind(&value.enabled_providers).execute(&mut *tx).await.map_err(db_error)?;
    audit(
        &mut tx,
        Some(&actor_session(actor)),
        None,
        "identity.registration_policy_updated",
        Uuid::nil(),
        None,
    )
    .await?;
    let result = lock(&mut tx).await?;
    commit(tx).await?;
    Ok(result)
}
