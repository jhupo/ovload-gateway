//! Owner locks precede session locks; grants remain locked through the command.

use ovload_admin::model::identity_access::IdentityManagementActor;
use ovload_core::access::Permission;

use super::*;

pub(super) async fn lock_owner(
    tx: &mut Transaction<'_, Postgres>,
    owner: IdentityOwner,
    expected_generation: u64,
) -> IdentityResult<()> {
    let row = match owner {
        IdentityOwner::Customer { tenant_id, user_id } => {
            let active: Option<bool> = sqlx::query_scalar(
                "select status = 'active' from identity_tenants where id=$1 for update",
            )
            .bind(tenant_id.as_uuid())
            .fetch_optional(&mut **tx)
            .await
            .map_err(db_error)?;
            if active != Some(true) {
                return Err(IdentityError::Unauthorized);
            }
            sqlx::query(
                "select status, authority_generation as revision from identity_users
                 where tenant_id=$1 and id=$2 for update",
            )
            .bind(tenant_id.as_uuid())
            .bind(user_id.as_uuid())
            .fetch_optional(&mut **tx)
            .await
            .map_err(db_error)?
        }
        IdentityOwner::Management(id) => sqlx::query(
            "select status, revision from identity_management_principals where id=$1 for update",
        )
        .bind(id.as_uuid())
        .fetch_optional(&mut **tx)
        .await
        .map_err(db_error)?,
    }
    .ok_or(IdentityError::Unauthorized)?;
    let status: String = row.try_get("status").map_err(db_error)?;
    let revision = positive(row.try_get("revision").map_err(db_error)?)?;
    if status != "active" || revision != expected_generation {
        return Err(IdentityError::Unauthorized);
    }
    Ok(())
}

pub(crate) async fn lock_session(
    tx: &mut Transaction<'_, Postgres>,
    current: &IdentitySession,
) -> IdentityResult<IdentitySession> {
    lock_owner(tx, current.owner, current.authority_generation).await?;
    let (tenant, user, principal) = owner_columns(current.owner);
    let row = sqlx::query(
        "select id, tenant_id, user_id, principal_id, authority_generation, expires_at
         from identity_sessions where id=$1 and audience=$2
         and tenant_id is not distinct from $3 and user_id is not distinct from $4
         and principal_id is not distinct from $5 and authority_generation=$6
         and revoked_at is null and expires_at > clock_timestamp() for update",
    )
    .bind(current.id.as_uuid())
    .bind(audience(current.owner).as_str())
    .bind(tenant)
    .bind(user)
    .bind(principal)
    .bind(generation(current.authority_generation)?)
    .fetch_optional(&mut **tx)
    .await
    .map_err(db_error)?
    .ok_or(IdentityError::Unauthorized)?;
    session_record(&row, audience(current.owner))
}

pub(crate) async fn authorize(
    tx: &mut Transaction<'_, Postgres>,
    actor: IdentityManagementActor,
    permission: Permission,
    tenant: Option<TenantId>,
) -> IdentityResult<()> {
    let current = IdentitySession {
        id: actor.session_id,
        owner: IdentityOwner::Management(actor.principal_id),
        authority_generation: actor.authority_generation,
        // The stored value, not this projection, controls expiry.
        expires_at: Utc::now(),
    };
    lock_session(tx, &current).await?;
    let grant = sqlx::query_scalar::<_, Uuid>(
        "select id from identity_grants
         where principal_id=$1 and status='active'
         and (expires_at is null or expires_at > clock_timestamp())
         and (tenant_id is null or ($2::uuid is not null and tenant_id=$2))
         and $3 = any(permissions)
         order by tenant_id nulls first limit 1 for share",
    )
    .bind(actor.principal_id.as_uuid())
    .bind(tenant.map(TenantId::as_uuid))
    .bind(permission.as_str())
    .fetch_optional(&mut **tx)
    .await
    .map_err(db_error)?;
    if grant.is_none() {
        return Err(IdentityError::Forbidden);
    }
    Ok(())
}

pub(super) struct DirectoryScopes {
    pub read: Option<Vec<Uuid>>,
    pub billing: Option<Vec<Uuid>>,
}

pub(super) async fn directory_scopes(
    tx: &mut Transaction<'_, Postgres>,
    actor: IdentityManagementActor,
    tenant: Option<TenantId>,
) -> IdentityResult<DirectoryScopes> {
    let current = IdentitySession {
        id: actor.session_id,
        owner: IdentityOwner::Management(actor.principal_id),
        authority_generation: actor.authority_generation,
        expires_at: Utc::now(),
    };
    lock_session(tx, &current).await?;
    let rows = sqlx::query(
        "select tenant_id,permissions from identity_grants where principal_id=$1 and status='active'
         and (expires_at is null or expires_at > clock_timestamp())
         and permissions && array['identity.users.read','billing.read']::text[]
         order by tenant_id nulls first for share",
    )
    .bind(actor.principal_id.as_uuid())
    .fetch_all(&mut **tx)
    .await
    .map_err(db_error)?;
    let mut read = Some(Vec::new());
    let mut billing = Some(Vec::new());
    for row in rows {
        let scope: Option<Uuid> = row.try_get("tenant_id").map_err(db_error)?;
        let permissions: Vec<String> = row.try_get("permissions").map_err(db_error)?;
        for (permission, scopes) in [
            ("identity.users.read", &mut read),
            ("billing.read", &mut billing),
        ] {
            if permissions.iter().any(|value| value == permission) {
                match (scope, scopes.as_mut()) {
                    (None, _) => *scopes = None,
                    (Some(id), Some(values)) => values.push(id),
                    (Some(_), None) => {}
                }
            }
        }
    }
    if let Some(tenant) = tenant {
        let id = tenant.as_uuid();
        if read.as_ref().is_some_and(|scopes| !scopes.contains(&id)) {
            return Err(IdentityError::Forbidden);
        }
        read = Some(vec![id]);
    } else if read.as_ref().is_some_and(Vec::is_empty) {
        return Err(IdentityError::Forbidden);
    }
    Ok(DirectoryScopes { read, billing })
}

pub(crate) async fn lock_target(
    tx: &mut Transaction<'_, Postgres>,
    tenant: TenantId,
    user: UserId,
) -> IdentityResult<CustomerUserRecord> {
    sqlx::query_scalar::<_, Uuid>("select id from identity_tenants where id=$1 for update")
        .bind(tenant.as_uuid())
        .fetch_optional(&mut **tx)
        .await
        .map_err(db_error)?
        .ok_or(IdentityError::NotFound)?;
    let row = sqlx::query(
        "select id, tenant_id, email, display_name, status, revision, created_at, updated_at
         from identity_users where tenant_id=$1 and id=$2 for update",
    )
    .bind(tenant.as_uuid())
    .bind(user.as_uuid())
    .fetch_optional(&mut **tx)
    .await
    .map_err(db_error)?
    .ok_or(IdentityError::NotFound)?;
    customer_record(&row)
}
