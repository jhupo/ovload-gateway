use super::*;

pub(super) async fn management_get(
    store: &PgIdentityLifecycleStore,
    actor: IdentityManagementActor,
    tenant: TenantId,
    user: UserId,
) -> IdentityResult<CustomerAccountRecord> {
    let mut tx = store.begin().await?;
    access::authorize(&mut tx, actor, Permission::IdentityUsersRead, Some(tenant)).await?;
    access::lock_target(&mut tx, tenant, user).await?;
    let result = record(&mut tx, tenant, user).await?;
    commit(tx).await?;
    Ok(result)
}

pub(super) async fn get(
    store: &PgIdentityLifecycleStore,
    current: &IdentitySession,
) -> IdentityResult<CustomerAccountRecord> {
    let (tenant, user) = customer(current.owner)?;
    let mut tx = store.begin().await?;
    access::lock_session(&mut tx, current).await?;
    let result = record(&mut tx, tenant, user).await?;
    commit(tx).await?;
    Ok(result)
}
pub(super) async fn update(
    store: &PgIdentityLifecycleStore,
    current: &IdentitySession,
    command: UpdateOwnProfile,
) -> IdentityResult<CustomerAccountRecord> {
    version(command.expected_revision)?;
    text(&command.display_name, 160)?;
    let (tenant, user) = customer(current.owner)?;
    let mut tx = store.begin().await?;
    access::lock_session(&mut tx, current).await?;
    let old = record(&mut tx, tenant, user).await?;
    if old.customer.revision != command.expected_revision {
        return Err(IdentityError::Conflict);
    }
    sqlx::query("update identity_users set display_name=$3,revision=revision+1,updated_at=clock_timestamp() where tenant_id=$1 and id=$2")
        .bind(tenant.as_uuid()).bind(user.as_uuid()).bind(command.display_name).execute(&mut *tx).await.map_err(db_error)?;
    audit(
        &mut tx,
        Some(current),
        Some(tenant),
        "identity.profile_updated",
        user.as_uuid(),
        None,
    )
    .await?;
    let result = record(&mut tx, tenant, user).await?;
    commit(tx).await?;
    Ok(result)
}
pub(super) async fn management_update(
    store: &PgIdentityLifecycleStore,
    actor: IdentityManagementActor,
    prepared: PreparedCustomerAccountUpdate,
) -> IdentityResult<CustomerAccountRecord> {
    let PreparedCustomerAccountUpdate {
        changes: command,
        password_hash,
    } = prepared;
    version(command.expected_revision)?;
    text(&command.display_name, 160)?;
    notes(&command.notes)?;
    if normalize_email(&command.email)? != command.email {
        return Err(IdentityError::Invalid);
    }
    if let Some(hash) = &password_hash {
        checked_hash(hash)?;
    }
    limits(command.max_concurrency, command.requests_per_minute)?;
    let tenant = command.tenant_id;
    let user = command.user_id;
    let mut tx = store.begin().await?;
    access::authorize(
        &mut tx,
        actor,
        Permission::IdentityUsersManage,
        Some(tenant),
    )
    .await?;
    access::lock_target(&mut tx, tenant, user).await?;
    access::authorize(
        &mut tx,
        actor,
        Permission::IdentityUsersManage,
        Some(tenant),
    )
    .await?;
    let old = record(&mut tx, tenant, user).await?;
    if old.customer.revision != command.expected_revision
        || old.customer.status == ovload_admin::model::identity::IdentityStatus::Revoked
    {
        return Err(IdentityError::Conflict);
    }
    let email_changed = old.customer.email != command.email;
    let changed = old.max_concurrency != command.max_concurrency
        || old.requests_per_minute != command.requests_per_minute
        || old.customer_max_concurrency != command.max_concurrency
        || old.customer_requests_per_minute != command.requests_per_minute
        || email_changed
        || password_hash.is_some();
    sqlx::query("update identity_users set display_name=$3,max_concurrency=$4,requests_per_minute=$5,revision=revision+1,authority_generation=authority_generation+case when $6 then 1 else 0 end,updated_at=clock_timestamp(),email=$7,notes=$8,password_hash=coalesce($9,password_hash),email_verified_at=case when $10 then null else email_verified_at end where tenant_id=$1 and id=$2")
        .bind(tenant.as_uuid()).bind(user.as_uuid()).bind(command.display_name).bind(i64::from(command.max_concurrency)).bind(i64::from(command.requests_per_minute)).bind(changed)
        .bind(command.email).bind(command.notes).bind(password_hash.as_ref().map(|hash| hash.expose_secret())).bind(email_changed)
        .execute(&mut *tx).await.map_err(db_error)?;
    if old.customer_max_concurrency != command.max_concurrency
        || old.customer_requests_per_minute != command.requests_per_minute
    {
        sqlx::query("update identity_tenants set max_concurrency=$2,requests_per_minute=$3,revision=revision+1,updated_at=clock_timestamp() where id=$1")
            .bind(tenant.as_uuid()).bind(i64::from(command.max_concurrency)).bind(i64::from(command.requests_per_minute)).execute(&mut *tx).await.map_err(db_error)?;
    }
    if changed {
        revoke_all(
            &mut tx,
            IdentityOwner::Customer {
                tenant_id: tenant,
                user_id: user,
            },
        )
        .await?;
    }
    audit(
        &mut tx,
        Some(&actor_session(actor)),
        Some(tenant),
        "identity.customer_updated",
        user.as_uuid(),
        Some("System-generated event description: customer account updated."),
    )
    .await?;
    let result = record(&mut tx, tenant, user).await?;
    commit(tx).await?;
    Ok(result)
}
async fn record(
    tx: &mut Transaction<'_, Postgres>,
    tenant: TenantId,
    user: UserId,
) -> IdentityResult<CustomerAccountRecord> {
    let row=sqlx::query("select u.id,u.tenant_id,u.email,u.display_name,u.status,u.revision,u.created_at,u.updated_at,u.max_concurrency,u.requests_per_minute,u.email_verified_at,u.notes,t.max_concurrency as customer_max_concurrency,t.requests_per_minute as customer_requests_per_minute from identity_users u join identity_tenants t on t.id=u.tenant_id where u.tenant_id=$1 and u.id=$2")
        .bind(tenant.as_uuid()).bind(user.as_uuid()).fetch_optional(&mut **tx).await.map_err(db_error)?.ok_or(IdentityError::NotFound)?;
    let value = CustomerAccountRecord {
        customer: super::super::identity::customer_record(&row)?,
        max_concurrency: policy::limit(&row, "max_concurrency")?,
        requests_per_minute: policy::limit(&row, "requests_per_minute")?,
        customer_max_concurrency: policy::limit(&row, "customer_max_concurrency")?,
        customer_requests_per_minute: policy::limit(&row, "customer_requests_per_minute")?,
        email_verified_at: row.try_get("email_verified_at").map_err(db_error)?,
        notes: row.try_get("notes").map_err(db_error)?,
    };
    limits(value.max_concurrency, value.requests_per_minute)
        .map_err(|_| IdentityError::Unavailable)?;
    limits(
        value.customer_max_concurrency,
        value.customer_requests_per_minute,
    )
    .map_err(|_| IdentityError::Unavailable)?;
    Ok(value)
}
