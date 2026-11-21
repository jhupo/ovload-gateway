//! Database restore and generated-image storage contracts.

use async_trait::async_trait;
use serde::{Deserialize, Serialize};
use serde_json::Value;

use crate::model::{AdminError, MutationContext, backup::ConnectionTestResult};

#[derive(Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase", deny_unknown_fields)]
pub struct ImageStorageUpdate {
    pub enabled: bool,
    pub endpoint: String,
    pub region: String,
    pub bucket: String,
    pub prefix: String,
    #[serde(default)]
    pub access_key_id: Option<String>,
    #[serde(default)]
    pub secret_access_key: Option<String>,
    pub force_path_style: bool,
    pub public_domain: String,
    pub presigned_expiry_hours: u32,
}

#[derive(Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct ImageStorageSettings {
    pub enabled: bool,
    pub endpoint: String,
    pub region: String,
    pub bucket: String,
    pub prefix: String,
    pub has_access_key: bool,
    pub has_secret: bool,
    pub force_path_style: bool,
    pub public_domain: String,
    pub presigned_expiry_hours: u32,
    pub verified: bool,
}

#[derive(Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct ImageJob {
    pub id: String,
    pub status: String,
    pub created_at: chrono::DateTime<chrono::Utc>,
    pub expires_at: chrono::DateTime<chrono::Utc>,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub result: Option<Value>,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub error: Option<String>,
}

#[derive(Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct RestoreStatus {
    pub id: String,
    pub status: String,
    pub message: String,
}

#[derive(Serialize)]
#[serde(rename_all = "camelCase")]
pub struct RestoreAccepted {
    pub id: String,
    pub ticket: String,
}

#[async_trait]
pub trait BackupExtensionsPort: Send + Sync {
    fn bind_shutdown(&self, _token: ovload_core::lifecycle::CancellationToken) {}
    async fn image_settings(&self) -> Result<ImageStorageSettings, AdminError>;
    async fn update_image_settings(
        &self,
        command: ImageStorageUpdate,
        context: &MutationContext,
    ) -> Result<ImageStorageSettings, AdminError>;
    async fn test_image_storage(
        &self,
        context: &MutationContext,
    ) -> Result<ConnectionTestResult, AdminError>;
    async fn create_image_job(&self, owner: &str) -> Result<ImageJob, AdminError>;
    async fn finish_image_job(
        &self,
        id: &str,
        response: Result<Value, String>,
    ) -> Result<(), AdminError>;
    async fn cleanup_images(&self) -> Result<(), AdminError> {
        Ok(())
    }
    async fn image_job(&self, owner: &str, id: &str) -> Result<ImageJob, AdminError>;
    async fn request_restore(
        &self,
        backup_id: &str,
        context: &MutationContext,
    ) -> Result<RestoreAccepted, AdminError>;
    async fn restore_status(&self, id: &str, ticket: &str) -> Result<RestoreStatus, AdminError>;
}

pub struct UnavailableBackupExtensions;

fn unavailable() -> AdminError {
    AdminError::bad_gateway("Storage service is unavailable")
}

#[async_trait]
impl BackupExtensionsPort for UnavailableBackupExtensions {
    async fn image_settings(&self) -> Result<ImageStorageSettings, AdminError> {
        Err(unavailable())
    }
    async fn update_image_settings(
        &self,
        _: ImageStorageUpdate,
        _: &MutationContext,
    ) -> Result<ImageStorageSettings, AdminError> {
        Err(unavailable())
    }
    async fn test_image_storage(
        &self,
        _: &MutationContext,
    ) -> Result<ConnectionTestResult, AdminError> {
        Err(unavailable())
    }
    async fn create_image_job(&self, _: &str) -> Result<ImageJob, AdminError> {
        Err(unavailable())
    }
    async fn finish_image_job(&self, _: &str, _: Result<Value, String>) -> Result<(), AdminError> {
        Err(unavailable())
    }
    async fn image_job(&self, _: &str, _: &str) -> Result<ImageJob, AdminError> {
        Err(unavailable())
    }
    async fn request_restore(
        &self,
        _: &str,
        _: &MutationContext,
    ) -> Result<RestoreAccepted, AdminError> {
        Err(unavailable())
    }
    async fn restore_status(&self, _: &str, _: &str) -> Result<RestoreStatus, AdminError> {
        Err(unavailable())
    }
}
