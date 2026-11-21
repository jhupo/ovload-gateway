//! Customer creation and lifecycle changes retain ownership and audit atomically.

use ovload_admin::model::identity_access::{
    CustomerDirectoryQuery, CustomerDirectoryRecord, CustomerDirectorySort, CustomerIdentityPage,
    IdentityManagementActor, NewCustomerIdentity, SetCustomerActive,
};
use ovload_core::access::Permission;
use secrecy::ExposeSecret as _;
use sqlx::QueryBuilder;

use super::*;

pub(super) async fn customer_profile(
    store: &PgIdentityStore,
    current: &IdentitySession,
) -> IdentityResult<CustomerUserRecord> {
    let mut tx = store.begin().await?;
    let stored = access::lock_session(&mut tx, current).await?;
    let IdentityOwner::Customer { tenant_id, user_id } = stored.owner else {
        return Err(IdentityError::Forbidden);
    };
    let result = access::lock_target(&mut tx, tenant_id, user_id).await?;
    commit(tx).await?;
    Ok(result)
}

pub(super) async fn provision_customer(
    store: &PgIdentityStore,
    actor: IdentityManagementActor,
    command: NewCustomerIdentity,
) -> IdentityResult<CustomerUserRecord> {
    if !command
        .password_hash
        .expose_secret()
        .starts_with("$argon2id$")
    {
        return Err(IdentityError::Invalid);
    }
    let mut tx = store.begin().await?;
    access::authorize(&mut tx, actor, Permission::IdentityUsersManage, None).await?;
    ovload_admin::model::identity_lifecycle::limits(
        command.max_concurrency,
        command.requests_per_minute,
    )?;
    ovload_admin::model::identity_lifecycle::notes(&command.notes)?;
    sqlx::query("insert into identity_tenants (id,slug,display_name,max_concurrency,requests_per_minute) values ($1,$2,$3,$4,$5)")
        .bind(command.tenant_id.as_uuid())
        .bind(&command.slug)
        .bind(&command.display_name)
        .bind(i64::from(command.max_concurrency))
        .bind(i64::from(command.requests_per_minute))
        .execute(&mut *tx)
        .await
        .map_err(db_error)?;
    sqlx::query("insert into identity_tenant_wallets (tenant_id) values ($1)")
        .bind(command.tenant_id.as_uuid())
        .execute(&mut *tx)
        .await
        .map_err(db_error)?;
    let row = sqlx::query(
        "insert into identity_users (id,tenant_id,email,password_hash,display_name,max_concurrency,requests_per_minute,notes)
         values ($1,$2,$3,$4,$5,$6,$7,$8)
         returning id,tenant_id,email,display_name,status,revision,created_at,updated_at",
    )
    .bind(command.user_id.as_uuid())
    .bind(command.tenant_id.as_uuid())
    .bind(command.email)
    .bind(command.password_hash.expose_secret())
    .bind(command.display_name)
    .bind(i64::from(command.max_concurrency))
    .bind(i64::from(command.requests_per_minute))
    .bind(command.notes)
    .fetch_one(&mut *tx)
    .await
    .map_err(db_error)?;
    audit(
        &mut tx,
        AuditEvent {
            owner: Some(IdentityOwner::Management(actor.principal_id)),
            session_id: Some(actor.session_id),
            tenant_id: Some(command.tenant_id),
            action: "identity.customer_provisioned",
            target_kind: "customer_user",
            target_id: command.user_id.as_uuid(),
            reason: Some("System-generated event description: customer account created."),
        },
    )
    .await?;
    let result = customer_record(&row)?;
    commit(tx).await?;
    Ok(result)
}

pub(super) async fn customer(
    store: &PgIdentityStore,
    actor: IdentityManagementActor,
    tenant_id: TenantId,
    user_id: UserId,
) -> IdentityResult<CustomerUserRecord> {
    let mut tx = store.begin().await?;
    access::authorize(
        &mut tx,
        actor,
        Permission::IdentityUsersRead,
        Some(tenant_id),
    )
    .await?;
    let row = sqlx::query(
        "select id,tenant_id,email,display_name,status,revision,created_at,updated_at
         from identity_users where tenant_id=$1 and id=$2",
    )
    .bind(tenant_id.as_uuid())
    .bind(user_id.as_uuid())
    .fetch_optional(&mut *tx)
    .await
    .map_err(db_error)?
    .ok_or(IdentityError::NotFound)?;
    let result = customer_record(&row)?;
    commit(tx).await?;
    Ok(result)
}

pub(super) async fn customers(
    store: &PgIdentityStore,
    actor: IdentityManagementActor,
    query: CustomerDirectoryQuery,
) -> IdentityResult<CustomerIdentityPage> {
    query.validate()?;
    let mut tx = store.begin().await?;
    sqlx::query("set transaction isolation level repeatable read")
        .execute(&mut *tx)
        .await
        .map_err(db_error)?;
    let scopes = access::directory_scopes(&mut tx, actor, query.tenant_id).await?;
    if query.sort == CustomerDirectorySort::BalanceUsd
        && scopes.billing.as_ref().is_some_and(|billing| {
            scopes
                .read
                .as_ref()
                .is_none_or(|read| read.iter().any(|id| !billing.contains(id)))
        })
    {
        return Err(IdentityError::Forbidden);
    }
    let statuses: Vec<&str> = query
        .statuses
        .iter()
        .map(|status| match status {
            IdentityStatus::Active => "active",
            IdentityStatus::Suspended => "suspended",
            IdentityStatus::Revoked => "revoked",
        })
        .collect();
    let total: i64 = sqlx::query_scalar("select count(*) from identity_users u where ($1::uuid[] is null or u.tenant_id=any($1))
        and ($2::text[]='{}' or u.status=any($2))
        and ($3='' or strpos(lower(u.id::text),lower($3))>0 or strpos(lower(u.display_name),lower($3))>0 or strpos(lower(u.email),lower($3))>0)")
        .bind(&scopes.read)
        .bind(&statuses)
        .bind(&query.query)
        .fetch_one(&mut *tx)
        .await
        .map_err(db_error)?;
    let sort = match query.sort {
        CustomerDirectorySort::Id => "u.id",
        CustomerDirectorySort::DisplayName => "lower(u.display_name)",
        CustomerDirectorySort::BalanceUsd => "(w.balance_usd-w.held_usd)",
        CustomerDirectorySort::CreatedAt => "u.created_at",
    };
    let direction = if query.descending { "desc" } else { "asc" };
    let mut statement = QueryBuilder::<Postgres>::new("select u.id,u.tenant_id,u.email,u.display_name,u.status,u.revision,u.created_at,u.updated_at,u.max_concurrency,u.requests_per_minute,u.notes,(w.balance_usd-w.held_usd)::text as wallet_balance,
        ($4::uuid[] is null or u.tenant_id=any($4)) as can_read_balance,
        (select s.created_at from identity_sessions s where s.tenant_id=u.tenant_id and s.user_id=u.id and s.audience='customer' order by s.created_at desc limit 1) as last_active_at,
        (select m.started_at from model_requests m where m.tenant_id=u.tenant_id and m.user_id=u.id and m.owns_client_admission order by m.started_at desc limit 1) as last_called_at
        from identity_users u join identity_tenant_wallets w on w.tenant_id=u.tenant_id
        where ($1::uuid[] is null or u.tenant_id=any($1)) and ($2::text[]='{}' or u.status=any($2))
        and ($3='' or strpos(lower(u.id::text),lower($3))>0 or strpos(lower(u.display_name),lower($3))>0 or strpos(lower(u.email),lower($3))>0)
        order by ");
    statement
        .push(sort)
        .push(" ")
        .push(direction)
        .push(",u.id ")
        .push(direction)
        .push(" limit $5 offset $6");
    let rows = statement
        .build()
        .bind(&scopes.read)
        .bind(&statuses)
        .bind(&query.query)
        .bind(&scopes.billing)
        .bind(i64::from(query.page_size))
        .bind(i64::from(query.page - 1) * i64::from(query.page_size))
        .fetch_all(&mut *tx)
        .await
        .map_err(db_error)?;
    let items: Vec<_> = rows
        .iter()
        .map(|row| {
            let can_read_balance: bool = row.try_get("can_read_balance").map_err(db_error)?;
            Ok(CustomerDirectoryRecord {
                customer: customer_record(row)?,
                max_concurrency: directory_limit(row, "max_concurrency")?,
                requests_per_minute: directory_limit(row, "requests_per_minute")?,
                notes: row.try_get("notes").map_err(db_error)?,
                balance_usd: if can_read_balance {
                    Some(row.try_get("wallet_balance").map_err(db_error)?)
                } else {
                    None
                },
                last_active_at: row.try_get("last_active_at").map_err(db_error)?,
                last_called_at: row.try_get("last_called_at").map_err(db_error)?,
            })
        })
        .collect::<IdentityResult<_>>()?;
    commit(tx).await?;
    Ok(CustomerIdentityPage {
        items,
        total: u64::try_from(total).map_err(|_| IdentityError::Unavailable)?,
        page: query.page,
        page_size: query.page_size,
    })
}

fn directory_limit(row: &PgRow, field: &str) -> IdentityResult<u32> {
    u32::try_from(row.try_get::<i64, _>(field).map_err(db_error)?)
        .map_err(|_| IdentityError::Unavailable)
}

pub(super) async fn set_customer_active(
    store: &PgIdentityStore,
    actor: IdentityManagementActor,
    command: SetCustomerActive,
) -> IdentityResult<CustomerUserRecord> {
    let mut tx = store.begin().await?;
    access::authorize(
        &mut tx,
        actor,
        Permission::IdentityUsersManage,
        Some(command.tenant_id),
    )
    .await?;
    let stored = access::lock_target(&mut tx, command.tenant_id, command.user_id).await?;
    if stored.revision != command.expected_revision || stored.status == IdentityStatus::Revoked {
        return Err(IdentityError::Conflict);
    }
    if (stored.status == IdentityStatus::Active) == command.active {
        commit(tx).await?;
        return Ok(stored);
    }
    if stored.revision >= i64::MAX as u64 {
        return Err(IdentityError::Conflict);
    }
    let row = sqlx::query(
        "update identity_users set status=$3,revision=revision+1,authority_generation=authority_generation+1,updated_at=clock_timestamp()
         where tenant_id=$1 and id=$2
         returning id,tenant_id,email,display_name,status,revision,created_at,updated_at",
    )
    .bind(command.tenant_id.as_uuid())
    .bind(command.user_id.as_uuid())
    .bind(if command.active {
        "active"
    } else {
        "suspended"
    })
    .fetch_one(&mut *tx)
    .await
    .map_err(db_error)?;
    // Only active sessions can affect future authorization; expiry is absolute.
    sqlx::query(
        "update identity_sessions set revoked_at=clock_timestamp()
         where tenant_id=$1 and user_id=$2 and revoked_at is null
         and expires_at > clock_timestamp()",
    )
    .bind(command.tenant_id.as_uuid())
    .bind(command.user_id.as_uuid())
    .execute(&mut *tx)
    .await
    .map_err(db_error)?;
    audit(
        &mut tx,
        AuditEvent {
            owner: Some(IdentityOwner::Management(actor.principal_id)),
            session_id: Some(actor.session_id),
            tenant_id: Some(command.tenant_id),
            action: if command.active {
                "identity.customer_activated"
            } else {
                "identity.customer_suspended"
            },
            target_kind: "customer_user",
            target_id: command.user_id.as_uuid(),
            reason: Some(if command.active {
                "System-generated event description: customer account activated."
            } else {
                "System-generated event description: customer account suspended."
            }),
        },
    )
    .await?;
    let result = customer_record(&row)?;
    commit(tx).await?;
    Ok(result)
}
