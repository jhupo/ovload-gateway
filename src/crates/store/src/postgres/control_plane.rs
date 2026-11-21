//! 控制面设置与 Key 修改的 revision 锁、条件写入和同事务审计

use async_trait::async_trait;
use sqlx::PgPool;

use crate::{Revision, StoreError, StoreResult, postgres_unavailable};

use super::{
    AdminAuditEvent, RuntimeSettings, RuntimeSettingsUpdate,
    append_admin_audit_event_in_transaction, bump_config_revision_in_transaction,
    load_runtime_settings_from_pool, load_runtime_settings_in_transaction,
    update_admin_api_key_in_transaction, update_runtime_settings_in_transaction,
};

#[derive(Debug, Clone, PartialEq, Eq)]
pub struct ControlPlaneSnapshot {
    pub settings: RuntimeSettings,
}

#[derive(Debug, Clone)]
pub struct ControlPlaneReplacement {
    pub expected_revision: Revision,
    pub settings: RuntimeSettingsUpdate,
    pub audit: AdminAuditEvent,
}

#[async_trait]
pub trait ControlPlaneRepository: Send + Sync {
    async fn load_control_plane(&self) -> StoreResult<ControlPlaneSnapshot>;

    async fn replace_control_plane(
        &self,
        replacement: ControlPlaneReplacement,
    ) -> StoreResult<ControlPlaneSnapshot>;

    /// 更新 admin_api_key 字段并推进 config revision
    async fn replace_admin_api_key(
        &self,
        admin_api_key: Option<String>,
        audit: AdminAuditEvent,
    ) -> StoreResult<Revision>;
}

#[derive(Clone)]
pub struct PgControlPlaneRepository {
    pub(super) pool: PgPool,
}

impl PgControlPlaneRepository {
    #[must_use]
    pub const fn new(pool: PgPool) -> Self {
        Self { pool }
    }
}

#[async_trait]
impl ControlPlaneRepository for PgControlPlaneRepository {
    async fn load_control_plane(&self) -> StoreResult<ControlPlaneSnapshot> {
        let settings = load_runtime_settings_from_pool(&self.pool).await?;
        Ok(ControlPlaneSnapshot { settings })
    }

    async fn replace_control_plane(
        &self,
        replacement: ControlPlaneReplacement,
    ) -> StoreResult<ControlPlaneSnapshot> {
        replacement.settings.validate()?;
        let mut transaction =
            self.pool.begin().await.map_err(|source| {
                postgres_unavailable("begin control plane replacement", source)
            })?;
        let result: StoreResult<_> = async {
            // 锁住所有配置写入共同使用的行，版本检查与修改不能被其他事务穿插
            let current = sqlx::query_scalar::<_, i64>(
                "select config_revision from runtime_settings where id = 1 for update",
            )
            .fetch_one(&mut *transaction)
            .await
            .map_err(|source| postgres_unavailable("lock control plane revision", source))?;
            if u64::try_from(current).ok() != Some(replacement.expected_revision.get()) {
                return Err(StoreError::Conflict {
                    source: None,
                    entity: "runtime settings",
                    id: "1".to_owned(),
                    kind: crate::ConflictKind::StaleRevision,
                });
            }
            let revision =
                update_runtime_settings_in_transaction(&mut transaction, &replacement.settings)
                    .await?;
            append_admin_audit_event_in_transaction(&mut transaction, replacement.audit, revision)
                .await?;
            load_control_plane_in_transaction(&mut transaction).await
        }
        .await;
        match result {
            Ok(snapshot) => {
                transaction.commit().await.map_err(|source| {
                    postgres_unavailable("commit control plane replacement", source)
                })?;
                Ok(snapshot)
            }
            Err(error) => {
                let error = match transaction.rollback().await {
                    Ok(()) => error,
                    Err(cleanup) => error.with_cleanup(cleanup),
                };
                Err(error)
            }
        }
    }

    async fn replace_admin_api_key(
        &self,
        admin_api_key: Option<String>,
        audit: AdminAuditEvent,
    ) -> StoreResult<Revision> {
        self.apply_targeted_mutation(admin_api_key, audit).await
    }
}

impl PgControlPlaneRepository {
    async fn apply_targeted_mutation(
        &self,
        admin_api_key: Option<String>,
        audit: AdminAuditEvent,
    ) -> StoreResult<Revision> {
        let mut transaction = self.pool.begin().await.map_err(|source| {
            postgres_unavailable("begin targeted control plane mutation", source)
        })?;
        let result: StoreResult<_> = async {
            let revision = bump_config_revision_in_transaction(&mut transaction).await?;
            update_admin_api_key_in_transaction(&mut transaction, admin_api_key).await?;
            append_admin_audit_event_in_transaction(&mut transaction, audit, revision).await?;
            Ok(revision)
        }
        .await;
        match result {
            Ok(revision) => {
                transaction.commit().await.map_err(|source| {
                    postgres_unavailable("commit targeted control plane mutation", source)
                })?;
                Ok(revision)
            }
            Err(error) => {
                let error = match transaction.rollback().await {
                    Ok(()) => error,
                    Err(cleanup) => error.with_cleanup(cleanup),
                };
                Err(error)
            }
        }
    }
}

async fn load_control_plane_in_transaction(
    transaction: &mut sqlx::Transaction<'_, sqlx::Postgres>,
) -> StoreResult<ControlPlaneSnapshot> {
    let settings = load_runtime_settings_in_transaction(transaction).await?;
    Ok(ControlPlaneSnapshot { settings })
}
