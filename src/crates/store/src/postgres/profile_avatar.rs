//! Avatar replacement locks the live owner and session before its independent CAS.

use ovload_admin::{
    model::{
        identity_access::{IdentityError, IdentityOwner, IdentityResult, IdentitySession},
        identity_lifecycle::version,
        image_asset::ImageAsset,
        profile_avatar::ProfileAvatar,
    },
    ports::profile_avatar::ProfileAvatarStore,
};
use sqlx::{PgPool, Postgres, Row as _, Transaction, postgres::PgRow};
use uuid::Uuid;

use super::identity::{access::lock_session, db_error};

#[derive(Clone)]
pub struct PgProfileAvatarStore {
    pool: PgPool,
}

impl PgProfileAvatarStore {
    #[must_use]
    pub const fn new(pool: PgPool) -> Self {
        Self { pool }
    }

    async fn begin(&self) -> IdentityResult<Transaction<'_, Postgres>> {
        let mut tx = self.pool.begin().await.map_err(db_error)?;
        sqlx::query("set local statement_timeout='5s'")
            .execute(&mut *tx)
            .await
            .map_err(db_error)?;
        Ok(tx)
    }
}

#[async_trait::async_trait]
impl ProfileAvatarStore for PgProfileAvatarStore {
    async fn read(&self, current: &IdentitySession) -> IdentityResult<ProfileAvatar> {
        let mut tx = self.begin().await?;
        let current = lock_session(&mut tx, current).await?;
        let result = locked_avatar(&mut tx, current.owner).await?;
        tx.commit().await.map_err(db_error)?;
        Ok(result)
    }

    async fn replace(
        &self,
        current: &IdentitySession,
        expected_revision: u64,
        asset: Option<ImageAsset>,
    ) -> IdentityResult<ProfileAvatar> {
        version(expected_revision)?;
        if let Some(asset) = &asset {
            asset.validate()?;
        }
        let mut tx = self.begin().await?;
        let current = lock_session(&mut tx, current).await?;
        let previous = locked_avatar(&mut tx, current.owner).await?;
        if previous.revision != expected_revision {
            return Err(IdentityError::Conflict);
        }
        let next_revision = expected_revision
            .checked_add(1)
            .and_then(|revision| i64::try_from(revision).ok())
            .ok_or(IdentityError::Conflict)?;
        let owner = OwnerColumns::new(current.owner);
        let row = sqlx::query(
            "update identity_profile_avatars
             set revision=$5,image_png=$6,width=$7,height=$8,updated_at=clock_timestamp()
             where owner_id=$1 and tenant_id is not distinct from $2
             and user_id is not distinct from $3 and principal_id is not distinct from $4
             returning revision,image_png,width,height,updated_at",
        )
        .bind(owner.id)
        .bind(owner.tenant)
        .bind(owner.user)
        .bind(owner.principal)
        .bind(next_revision)
        .bind(asset.as_ref().map(|asset| asset.png.as_slice()))
        .bind(asset.as_ref().map(|asset| asset.width as i32))
        .bind(asset.as_ref().map(|asset| asset.height as i32))
        .fetch_one(&mut *tx)
        .await
        .map_err(db_error)?;
        let result = record(&row)?;
        audit(&mut tx, &current, asset.is_some(), result.revision).await?;
        tx.commit().await.map_err(db_error)?;
        Ok(result)
    }
}

struct OwnerColumns {
    id: Uuid,
    tenant: Option<Uuid>,
    user: Option<Uuid>,
    principal: Option<Uuid>,
}

impl OwnerColumns {
    fn new(owner: IdentityOwner) -> Self {
        match owner {
            IdentityOwner::Customer { tenant_id, user_id } => Self {
                id: user_id.as_uuid(),
                tenant: Some(tenant_id.as_uuid()),
                user: Some(user_id.as_uuid()),
                principal: None,
            },
            IdentityOwner::Management(principal) => Self {
                id: principal.as_uuid(),
                tenant: None,
                user: None,
                principal: Some(principal.as_uuid()),
            },
        }
    }
}

async fn locked_avatar(
    tx: &mut Transaction<'_, Postgres>,
    identity_owner: IdentityOwner,
) -> IdentityResult<ProfileAvatar> {
    let owner = OwnerColumns::new(identity_owner);
    sqlx::query(
        "insert into identity_profile_avatars
         (owner_id,tenant_id,user_id,principal_id,revision,updated_at)
         values ($1,$2,$3,$4,1,clock_timestamp()) on conflict (owner_id) do nothing",
    )
    .bind(owner.id)
    .bind(owner.tenant)
    .bind(owner.user)
    .bind(owner.principal)
    .execute(&mut **tx)
    .await
    .map_err(db_error)?;
    let row = sqlx::query(
        "select revision,image_png,width,height,updated_at from identity_profile_avatars
         where owner_id=$1 and tenant_id is not distinct from $2
         and user_id is not distinct from $3 and principal_id is not distinct from $4
         for update",
    )
    .bind(owner.id)
    .bind(owner.tenant)
    .bind(owner.user)
    .bind(owner.principal)
    .fetch_optional(&mut **tx)
    .await
    .map_err(db_error)?
    .ok_or(IdentityError::Unavailable)?;
    record(&row)
}

fn record(row: &PgRow) -> IdentityResult<ProfileAvatar> {
    let revision: i64 = row.try_get("revision").map_err(db_error)?;
    let png: Option<Vec<u8>> = row.try_get("image_png").map_err(db_error)?;
    let width: Option<i32> = row.try_get("width").map_err(db_error)?;
    let height: Option<i32> = row.try_get("height").map_err(db_error)?;
    let asset = match (png, width, height) {
        (None, None, None) => None,
        (Some(png), Some(width), Some(height)) => {
            let asset = ImageAsset {
                png,
                width: u32::try_from(width).map_err(|_| IdentityError::Unavailable)?,
                height: u32::try_from(height).map_err(|_| IdentityError::Unavailable)?,
            };
            asset.validate().map_err(|_| IdentityError::Unavailable)?;
            Some(asset)
        }
        _ => return Err(IdentityError::Unavailable),
    };
    Ok(ProfileAvatar {
        revision: u64::try_from(revision)
            .ok()
            .filter(|value| *value > 0)
            .ok_or(IdentityError::Unavailable)?,
        asset,
        updated_at: row.try_get("updated_at").map_err(db_error)?,
    })
}

async fn audit(
    tx: &mut Transaction<'_, Postgres>,
    current: &IdentitySession,
    has_avatar: bool,
    revision: u64,
) -> IdentityResult<()> {
    let owner = OwnerColumns::new(current.owner);
    let actor_kind = match current.owner {
        IdentityOwner::Customer { .. } => "customer_user",
        IdentityOwner::Management(_) => "management_principal",
    };
    let action = if has_avatar {
        "identity.profile_avatar_updated"
    } else {
        "identity.profile_avatar_deleted"
    };
    sqlx::query(
        "insert into identity_audit_events
         (id,tenant_id,actor_kind,actor_id,session_id,action,target_kind,target_id,metadata)
         values ($1,$2,$3,$4,$5,$6,'profile_avatar',$4,$7)",
    )
    .bind(Uuid::now_v7())
    .bind(owner.tenant)
    .bind(actor_kind)
    .bind(owner.id)
    .bind(current.id.to_string())
    .bind(action)
    .bind(serde_json::json!({"revision":revision}))
    .execute(&mut **tx)
    .await
    .map_err(db_error)?;
    Ok(())
}
