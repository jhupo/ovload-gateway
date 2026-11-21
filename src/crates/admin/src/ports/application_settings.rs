use crate::model::{
    application_settings::IntegrationDocument,
    identity_access::{IdentityError, IdentityResult, IdentitySession},
};
use async_trait::async_trait;
use serde_json::Value;

#[async_trait]
pub trait ApplicationSettingsStore: Send + Sync {
    async fn backup_storage(
        &self,
        _s: &IdentitySession,
        _revision: Option<u64>,
        _enabled: Option<bool>,
    ) -> IdentityResult<Value> {
        Err(IdentityError::Unavailable)
    }
    async fn claim_mail(
        &self,
    ) -> IdentityResult<Option<(uuid::Uuid, uuid::Uuid, String, String, Value)>> {
        Ok(None)
    }
    async fn finish_mail(
        &self,
        _id: uuid::Uuid,
        _lease: uuid::Uuid,
        _ok: bool,
    ) -> IdentityResult<()> {
        Ok(())
    }
    async fn load(
        &self,
        kind: &str,
        current: Option<&IdentitySession>,
    ) -> IdentityResult<IntegrationDocument>;
    async fn save(
        &self,
        kind: &str,
        current: &IdentitySession,
        revision: u64,
        values: Value,
        secrets: Value,
    ) -> IdentityResult<IntegrationDocument>;
    async fn audit_probe(&self, current: &IdentitySession, node: &str) -> IdentityResult<Value>;
    async fn payment_command(
        &self,
        current: &IdentitySession,
        input: Value,
        origin: &str,
    ) -> IdentityResult<Value>;
    async fn payment_notification(&self, input: Vec<(String, String)>) -> IdentityResult<()>;
}
pub struct UnavailableApplicationSettings;
#[async_trait]
impl ApplicationSettingsStore for UnavailableApplicationSettings {
    async fn load(
        &self,
        _: &str,
        _: Option<&IdentitySession>,
    ) -> IdentityResult<IntegrationDocument> {
        Err(IdentityError::Unavailable)
    }
    async fn save(
        &self,
        _: &str,
        _: &IdentitySession,
        _: u64,
        _: Value,
        _: Value,
    ) -> IdentityResult<IntegrationDocument> {
        Err(IdentityError::Unavailable)
    }
    async fn audit_probe(&self, _: &IdentitySession, _: &str) -> IdentityResult<Value> {
        Err(IdentityError::Unavailable)
    }
    async fn payment_command(
        &self,
        _: &IdentitySession,
        _: Value,
        _: &str,
    ) -> IdentityResult<Value> {
        Err(IdentityError::Unavailable)
    }
    async fn payment_notification(&self, _: Vec<(String, String)>) -> IdentityResult<()> {
        Err(IdentityError::Unavailable)
    }
}
