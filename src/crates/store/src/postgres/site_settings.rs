//! Singleton site metadata with live platform authority and atomic audit records.

use ovload_admin::{
    model::{
        identity_access::{IdentityError, IdentityManagementActor, IdentityResult},
        identity_lifecycle::version,
        image_asset::ImageAsset,
        site_settings::{SiteSettings, UpdateSiteSettings},
    },
    ports::site_settings::SiteSettingsStore,
};
use ovload_core::access::Permission;
use sqlx::{PgPool, Postgres, QueryBuilder, Row, Transaction, postgres::PgRow};
use uuid::Uuid;

use super::identity::{access, db_error};

const SELECT_SETTINGS: &str = "select revision,name,subtitle,support,endpoint,logo_png,logo_width,logo_height,updated_at from site_settings where singleton";

#[derive(Clone)]
pub struct PgSiteSettingsStore {
    pool: PgPool,
}

impl PgSiteSettingsStore {
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
impl SiteSettingsStore for PgSiteSettingsStore {
    async fn engagement_view(
        &self,
        session: &ovload_admin::model::identity_access::IdentitySession,
        view: &str,
    ) -> IdentityResult<serde_json::Value> {
        super::engagement::view(&self.pool, session, view).await
    }
    async fn engagement_command(
        &self,
        session: &ovload_admin::model::identity_access::IdentitySession,
        command: ovload_admin::model::engagement::EngagementCommand,
    ) -> IdentityResult<serde_json::Value> {
        super::engagement::command(&self.pool, session, command).await
    }
    async fn workspace_get(
        &self,
        actor: IdentityManagementActor,
        kind: ovload_admin::model::workspace_settings::WorkspaceSettingsKind,
    ) -> IdentityResult<ovload_admin::model::workspace_settings::WorkspaceSettings> {
        super::workspace_settings::get(&self.pool, actor, kind).await
    }

    async fn workspace_update(
        &self,
        actor: IdentityManagementActor,
        kind: ovload_admin::model::workspace_settings::WorkspaceSettingsKind,
        revision: u64,
        values: serde_json::Value,
    ) -> IdentityResult<ovload_admin::model::workspace_settings::WorkspaceSettings> {
        super::workspace_settings::update(&self.pool, actor, kind, revision, values).await
    }

    async fn workspace_visibility(
        &self,
    ) -> IdentityResult<ovload_admin::model::workspace_settings::WorkspaceVisibility> {
        super::workspace_settings::public_visibility(&self.pool).await
    }
    async fn public_get(&self) -> IdentityResult<SiteSettings> {
        let mut tx = self.begin().await?;
        let settings = load(&mut tx, false).await?;
        tx.commit().await.map_err(db_error)?;
        Ok(settings)
    }

    async fn get(&self, actor: IdentityManagementActor) -> IdentityResult<SiteSettings> {
        let mut tx = self.begin().await?;
        authorize(&mut tx, actor).await?;
        let settings = load(&mut tx, false).await?;
        tx.commit().await.map_err(db_error)?;
        Ok(settings)
    }

    async fn update(
        &self,
        actor: IdentityManagementActor,
        expected_revision: u64,
        input: UpdateSiteSettings,
    ) -> IdentityResult<SiteSettings> {
        version(expected_revision)?;
        input.validate()?;
        let mut tx = self.begin().await?;
        authorize(&mut tx, actor).await?;
        let current = load(&mut tx, true).await?;
        let revision = next_revision(&current, expected_revision)?;
        sqlx::query("update site_settings set name=$1,subtitle=$2,support=$3,endpoint=$4,revision=$5,updated_at=clock_timestamp() where singleton")
            .bind(input.name)
            .bind(input.subtitle)
            .bind(input.support)
            .bind(input.endpoint)
            .bind(revision)
            .execute(&mut *tx)
            .await
            .map_err(db_error)?;
        audit(&mut tx, actor, "site_settings.updated", revision).await?;
        let settings = load(&mut tx, false).await?;
        tx.commit().await.map_err(db_error)?;
        Ok(settings)
    }

    async fn replace_logo(
        &self,
        actor: IdentityManagementActor,
        expected_revision: u64,
        logo: Option<ImageAsset>,
    ) -> IdentityResult<SiteSettings> {
        version(expected_revision)?;
        if let Some(logo) = &logo {
            logo.validate()?;
        }
        let mut tx = self.begin().await?;
        authorize(&mut tx, actor).await?;
        let current = load(&mut tx, true).await?;
        let revision = next_revision(&current, expected_revision)?;
        let (png, width, height) = match &logo {
            Some(logo) => (
                Some(logo.png.as_slice()),
                Some(i32::try_from(logo.width).map_err(|_| IdentityError::Invalid)?),
                Some(i32::try_from(logo.height).map_err(|_| IdentityError::Invalid)?),
            ),
            None => (None, None, None),
        };
        sqlx::query("update site_settings set logo_png=$1,logo_width=$2,logo_height=$3,revision=$4,updated_at=clock_timestamp() where singleton")
            .bind(png)
            .bind(width)
            .bind(height)
            .bind(revision)
            .execute(&mut *tx)
            .await
            .map_err(db_error)?;
        let action = if logo.is_some() {
            "site_settings.logo_updated"
        } else {
            "site_settings.logo_removed"
        };
        audit(&mut tx, actor, action, revision).await?;
        let settings = load(&mut tx, false).await?;
        tx.commit().await.map_err(db_error)?;
        Ok(settings)
    }
}

async fn authorize(
    tx: &mut Transaction<'_, Postgres>,
    actor: IdentityManagementActor,
) -> IdentityResult<()> {
    access::authorize(tx, actor, Permission::SecuritySettingsManage, None).await
}

async fn load(
    tx: &mut Transaction<'_, Postgres>,
    for_update: bool,
) -> IdentityResult<SiteSettings> {
    let mut query = QueryBuilder::<Postgres>::new(SELECT_SETTINGS);
    if for_update {
        query.push(" for update");
    }
    let row = query.build().fetch_one(&mut **tx).await.map_err(db_error)?;
    from_row(&row)
}

fn from_row(row: &PgRow) -> IdentityResult<SiteSettings> {
    let png: Option<Vec<u8>> = row.try_get("logo_png").map_err(db_error)?;
    let width: Option<i32> = row.try_get("logo_width").map_err(db_error)?;
    let height: Option<i32> = row.try_get("logo_height").map_err(db_error)?;
    let logo = match (png, width, height) {
        (Some(png), Some(width), Some(height)) => Some(ImageAsset {
            png,
            width: u32::try_from(width).map_err(|_| IdentityError::Unavailable)?,
            height: u32::try_from(height).map_err(|_| IdentityError::Unavailable)?,
        }),
        (None, None, None) => None,
        _ => return Err(IdentityError::Unavailable),
    };
    let revision: i64 = row.try_get("revision").map_err(db_error)?;
    let settings = SiteSettings {
        revision: u64::try_from(revision).map_err(|_| IdentityError::Unavailable)?,
        name: row.try_get("name").map_err(db_error)?,
        subtitle: row.try_get("subtitle").map_err(db_error)?,
        support: row.try_get("support").map_err(db_error)?,
        endpoint: row.try_get("endpoint").map_err(db_error)?,
        logo,
        updated_at: row.try_get("updated_at").map_err(db_error)?,
    };
    settings
        .validate()
        .map_err(|_| IdentityError::Unavailable)?;
    Ok(settings)
}

fn next_revision(current: &SiteSettings, expected: u64) -> IdentityResult<i64> {
    if current.revision != expected {
        return Err(IdentityError::Conflict);
    }
    expected
        .checked_add(1)
        .and_then(|revision| i64::try_from(revision).ok())
        .ok_or(IdentityError::Unavailable)
}

async fn audit(
    tx: &mut Transaction<'_, Postgres>,
    actor: IdentityManagementActor,
    action: &str,
    revision: i64,
) -> IdentityResult<()> {
    sqlx::query("insert into identity_audit_events(actor_kind,actor_id,session_id,action,target_kind,target_id,metadata) values('management_principal',$1,$2,$3,'site_settings',$4,$5)")
        .bind(actor.principal_id.as_uuid())
        .bind(actor.session_id.to_string())
        .bind(action)
        .bind(Uuid::nil())
        .bind(serde_json::json!({ "revision": revision }))
        .execute(&mut **tx)
        .await
        .map_err(db_error)?;
    Ok(())
}
