//! Bounded delivery of customer lifecycle notifications.
use crate::model::identity_access::IdentityResult;
use async_trait::async_trait;
use secrecy::SecretString;
pub struct IdentityNotification {
    pub email: String,
    pub purpose: String,
    pub token: SecretString,
    pub variables: serde_json::Value,
}
#[async_trait]
pub trait IdentityNotificationSender: Send + Sync {
    async fn available(&self) -> bool {
        true
    }
    async fn test(&self, _recipient: Option<String>) -> IdentityResult<()> {
        Err(crate::model::identity_access::IdentityError::Unavailable)
    }
    async fn send(&self, message: IdentityNotification) -> IdentityResult<()>;
}
