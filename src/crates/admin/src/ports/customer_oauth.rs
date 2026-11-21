//! Fixed-provider browser login exchange, independent of upstream accounts.
use crate::model::identity_access::IdentityResult;
use async_trait::async_trait;
use secrecy::SecretString;
pub struct ExternalSubject {
    pub provider: String,
    pub subject: String,
}
#[async_trait]
pub trait CustomerOAuth: Send + Sync {
    fn public_configuration(&self) -> serde_json::Value {
        serde_json::json!({})
    }
    fn configured(
        &self,
        _config: serde_json::Value,
    ) -> IdentityResult<std::sync::Arc<dyn CustomerOAuth>> {
        Err(crate::model::identity_access::IdentityError::Unavailable)
    }
    fn providers(&self) -> Vec<String>;
    fn authorization_url(
        &self,
        provider: &str,
        state: &str,
        challenge: &str,
    ) -> IdentityResult<String>;
    async fn exchange(
        &self,
        provider: &str,
        code: SecretString,
        verifier: SecretString,
    ) -> IdentityResult<ExternalSubject>;
}
