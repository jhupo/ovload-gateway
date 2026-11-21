//! Versioned feature/page settings under live platform authority.

use ovload_admin::model::{
    identity_access::{IdentityError, IdentityManagementActor, IdentityResult},
    workspace_settings::{
        WorkspaceSettings, WorkspaceSettingsKind, WorkspaceVisibility, visibility,
    },
};
use ovload_core::access::Permission;
use sqlx::{PgPool, Postgres, Row, Transaction};

use super::identity::{access, db_error};

async fn begin(pool: &PgPool) -> IdentityResult<Transaction<'_, Postgres>> {
    let mut tx = pool.begin().await.map_err(db_error)?;
    sqlx::query("set local statement_timeout='5s'")
        .execute(&mut *tx)
        .await
        .map_err(db_error)?;
    Ok(tx)
}

pub(super) async fn load(
    tx: &mut Transaction<'_, Postgres>,
    kind: WorkspaceSettingsKind,
    lock: bool,
) -> IdentityResult<WorkspaceSettings> {
    sqlx::query(
        "insert into workspace_settings(kind,values) values($1,$2) on conflict(kind) do nothing",
    )
    .bind(kind.as_str())
    .bind(kind.defaults())
    .execute(&mut **tx)
    .await
    .map_err(db_error)?;
    let sql = if lock {
        "select revision,values,updated_at from workspace_settings where kind=$1 for update"
    } else {
        "select revision,values,updated_at from workspace_settings where kind=$1"
    };
    let row = sqlx::query(sql)
        .bind(kind.as_str())
        .fetch_one(&mut **tx)
        .await
        .map_err(db_error)?;
    Ok(WorkspaceSettings {
        revision: u64::try_from(row.try_get::<i64, _>("revision").map_err(db_error)?)
            .map_err(|_| IdentityError::Unavailable)?,
        values: row.try_get("values").map_err(db_error)?,
        updated_at: row.try_get("updated_at").map_err(db_error)?,
    })
}

pub(super) async fn get(
    pool: &PgPool,
    actor: IdentityManagementActor,
    kind: WorkspaceSettingsKind,
) -> IdentityResult<WorkspaceSettings> {
    let mut tx = begin(pool).await?;
    access::authorize(&mut tx, actor, Permission::SecuritySettingsManage, None).await?;
    let settings = load(&mut tx, kind, false).await?;
    tx.commit().await.map_err(db_error)?;
    Ok(settings)
}

pub(super) async fn update(
    pool: &PgPool,
    actor: IdentityManagementActor,
    kind: WorkspaceSettingsKind,
    expected: u64,
    values: serde_json::Value,
) -> IdentityResult<WorkspaceSettings> {
    kind.validate(&values)?;
    let mut tx = begin(pool).await?;
    access::authorize(&mut tx, actor, Permission::SecuritySettingsManage, None).await?;
    let current = load(&mut tx, kind, true).await?;
    if current.revision != expected {
        return Err(IdentityError::Conflict);
    }
    // Group and customer selections must refer to existing records, not preview IDs.
    let group_ids = match kind {
        WorkspaceSettingsKind::Features => values["audit"]["shared"]["groupIds"].as_array(),
        WorkspaceSettingsKind::Pages => values["monitoring"]["groupIds"].as_array(),
    }
    .ok_or(IdentityError::Invalid)?;
    for id in group_ids {
        let id = id.as_str().ok_or(IdentityError::Invalid)?;
        let exists: bool =
            sqlx::query_scalar("select exists(select 1 from account_groups where id::text=$1)")
                .bind(id)
                .fetch_one(&mut *tx)
                .await
                .map_err(db_error)?;
        if !exists {
            return Err(IdentityError::Invalid);
        }
    }
    if let WorkspaceSettingsKind::Features = kind {
        let users = values["referral"]["overrides"]
            .as_array()
            .ok_or(IdentityError::Invalid)?;
        for item in users {
            let id = item["userId"].as_str().ok_or(IdentityError::Invalid)?;
            let exists: bool =
                sqlx::query_scalar("select exists(select 1 from identity_users where id::text=$1)")
                    .bind(id)
                    .fetch_one(&mut *tx)
                    .await
                    .map_err(db_error)?;
            if !exists {
                return Err(IdentityError::Invalid);
            }
            if let Some(code) = item["invitationCode"].as_str().filter(|c| !c.is_empty()) {
                sqlx::query(
                    "update referral_accounts set code=upper($2) where user_id=$1::text::uuid",
                )
                .bind(id)
                .bind(code)
                .execute(&mut *tx)
                .await
                .map_err(db_error)?;
            }
        }
    }
    let revision = i64::try_from(expected)
        .ok()
        .and_then(|v| v.checked_add(1))
        .ok_or(IdentityError::Conflict)?;
    sqlx::query("update workspace_settings set values=$1,revision=$2,updated_at=clock_timestamp() where kind=$3")
        .bind(values).bind(revision).bind(kind.as_str()).execute(&mut *tx).await.map_err(db_error)?;
    sqlx::query("insert into identity_audit_events(actor_kind,actor_id,session_id,action,target_kind,target_id,metadata) values('management_principal',$1,$2,$3,'workspace_settings',$4,$5)")
        .bind(actor.principal_id.as_uuid()).bind(actor.session_id.to_string()).bind(format!("workspace_settings.{}.updated",kind.as_str())).bind(uuid::Uuid::nil()).bind(serde_json::json!({"revision":revision,"kind":kind.as_str()})).execute(&mut *tx).await.map_err(db_error)?;
    let result = load(&mut tx, kind, false).await?;
    tx.commit().await.map_err(db_error)?;
    Ok(result)
}

pub(super) async fn public_visibility(pool: &PgPool) -> IdentityResult<WorkspaceVisibility> {
    let mut tx = begin(pool).await?;
    let features = load(&mut tx, WorkspaceSettingsKind::Features, false).await?;
    let pages = load(&mut tx, WorkspaceSettingsKind::Pages, false).await?;
    let result = visibility(&features.values, &pages.values);
    tx.commit().await.map_err(db_error)?;
    Ok(result)
}
