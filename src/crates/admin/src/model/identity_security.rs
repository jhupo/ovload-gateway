//! Browser authentication policy; credential material has a separate encrypted owner.
use super::identity_access::{IdentityError, IdentityResult};
use serde::{Deserialize, Serialize};
use serde_json::{Value, json};

#[derive(Clone, Debug, Serialize, Deserialize)]
#[serde(default, deny_unknown_fields, rename_all = "camelCase")]
pub struct SecurityPolicy {
    pub access_token_minutes: u32,
    pub refresh_token_days: u32,
    pub step_up_verification: bool,
    pub human_verification: bool,
    pub captcha_site_key: String,
    pub auth_rate_limit: u32,
    pub invalid_auth_threshold: u32,
    pub invalid_auth_block_minutes: u32,
    pub invalid_auth_protection: bool,
    pub access_block: bool,
    pub identity_binding_enabled: bool,
    pub pending_identity_hours: u32,
    pub providers: Value,
}
impl Default for SecurityPolicy {
    fn default() -> Self {
        Self {
            access_token_minutes: 0,
            refresh_token_days: 30,
            step_up_verification: false,
            human_verification: false,
            captcha_site_key: String::new(),
            auth_rate_limit: 30,
            invalid_auth_threshold: 10,
            invalid_auth_block_minutes: 15,
            invalid_auth_protection: true,
            access_block: true,
            identity_binding_enabled: true,
            pending_identity_hours: 24,
            providers: json!({"github":{"clientId":"","callbackUrl":""},"google":{"clientId":"","callbackUrl":""},"linuxdo":{"clientId":"","callbackUrl":""}}),
        }
    }
}
impl SecurityPolicy {
    pub fn validate(&self) -> IdentityResult<()> {
        if self.access_token_minutes > 43200
            || !(1..=365).contains(&self.refresh_token_days)
            || !(1..=10000).contains(&self.auth_rate_limit)
            || !(1..=1000).contains(&self.invalid_auth_threshold)
            || !(1..=1440).contains(&self.invalid_auth_block_minutes)
            || !(1..=168).contains(&self.pending_identity_hours)
            || self.captcha_site_key.len() > 256
            || (self.human_verification && self.captcha_site_key.is_empty())
        {
            return Err(IdentityError::Invalid);
        }
        let providers = self.providers.as_object().ok_or(IdentityError::Invalid)?;
        if providers.len() != 3 {
            return Err(IdentityError::Invalid);
        }
        for name in ["github", "google", "linuxdo"] {
            let p = providers
                .get(name)
                .and_then(Value::as_object)
                .ok_or(IdentityError::Invalid)?;
            if p.len() != 2 {
                return Err(IdentityError::Invalid);
            }
            let id = p
                .get("clientId")
                .and_then(Value::as_str)
                .ok_or(IdentityError::Invalid)?;
            let callback = p
                .get("callbackUrl")
                .and_then(Value::as_str)
                .ok_or(IdentityError::Invalid)?;
            if id.len() > 200 || id.trim() != id || callback.len() > 2048 {
                return Err(IdentityError::Invalid);
            }
            if !callback.is_empty() {
                let u = url::Url::parse(callback).map_err(|_| IdentityError::Invalid)?;
                if u.scheme() != "https"
                    || u.host_str().is_none()
                    || !u.username().is_empty()
                    || u.password().is_some()
                    || u.query().is_some()
                    || u.fragment().is_some()
                    || u.path() != format!("/api/v1/auth/oauth/{name}/callback")
                {
                    return Err(IdentityError::Invalid);
                }
            }
        }
        Ok(())
    }
}
#[derive(Clone)]
pub struct SecurityDocument {
    pub revision: u64,
    pub policy: SecurityPolicy,
    pub encrypted: Vec<u8>,
}

#[derive(Clone, Debug, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct AdminKeyStatus {
    pub exists: bool,
    pub expires_at: Option<chrono::DateTime<chrono::Utc>>,
}
