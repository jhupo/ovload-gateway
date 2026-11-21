use crate::{
    model::identity_access::{IdentityError, IdentityResult, IdentitySession},
    ports::{
        application_settings::ApplicationSettingsStore,
        identity_notification::IdentityNotificationSender,
    },
};
use serde_json::{Value, json};
use std::sync::Arc;

pub struct ApplicationSettingsService {
    store: Arc<dyn ApplicationSettingsStore>,
    mail: Option<Arc<dyn IdentityNotificationSender>>,
}
impl ApplicationSettingsService {
    pub async fn backup_storage(
        &self,
        s: &IdentitySession,
        revision: Option<u64>,
        enabled: Option<bool>,
    ) -> IdentityResult<Value> {
        self.store.backup_storage(s, revision, enabled).await
    }
    pub async fn deliver_mail(&self) -> IdentityResult<()> {
        let Some(mail) = &self.mail else {
            return Ok(());
        };
        if !mail.available().await {
            return Ok(());
        }
        let Some((id, lease, email, purpose, variables)) = self.store.claim_mail().await? else {
            return Ok(());
        };
        let result = tokio::time::timeout(
            std::time::Duration::from_secs(30),
            mail.send(crate::ports::identity_notification::IdentityNotification {
                email,
                purpose,
                variables,
                token: secrecy::SecretString::from(String::new()),
            }),
        )
        .await
        .map_err(|_| IdentityError::Unavailable)
        .and_then(|r| r);
        self.store.finish_mail(id, lease, result.is_ok()).await?;
        result
    }
    pub fn new(
        store: Arc<dyn ApplicationSettingsStore>,
        mail: Option<Arc<dyn IdentityNotificationSender>>,
    ) -> Self {
        Self { store, mail }
    }
    pub async fn load(&self, kind: &str, s: &IdentitySession) -> IdentityResult<Value> {
        Ok(self.store.load(kind, Some(s)).await?.public())
    }
    pub async fn save(
        &self,
        kind: &str,
        s: &IdentitySession,
        revision: u64,
        values: Value,
        secrets: Value,
    ) -> IdentityResult<Value> {
        crate::model::application_settings::validate(kind, &values)?;
        Ok(self
            .store
            .save(kind, s, revision, values, secrets)
            .await?
            .public())
    }
    pub async fn test_mail(
        &self,
        s: &IdentitySession,
        recipient: Option<String>,
    ) -> IdentityResult<Value> {
        self.store.load("mail", Some(s)).await?;
        self.mail
            .as_ref()
            .ok_or(IdentityError::Unavailable)?
            .test(recipient)
            .await?;
        Ok(json!({"ok":true}))
    }
    pub async fn audit_probe(&self, s: &IdentitySession, id: &str) -> IdentityResult<Value> {
        self.store.audit_probe(s, id).await
    }
    pub async fn payment(
        &self,
        s: &IdentitySession,
        input: Value,
        origin: &str,
    ) -> IdentityResult<Value> {
        self.store.payment_command(s, input, origin).await
    }
    pub async fn notify(&self, input: Vec<(String, String)>) -> IdentityResult<()> {
        self.store.payment_notification(input).await
    }
}
