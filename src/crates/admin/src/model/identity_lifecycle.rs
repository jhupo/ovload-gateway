//! Independent customer lifecycle commands and encrypted notification facts.

use chrono::{DateTime, Utc};
use ovload_core::access::{TenantId, UserId};
use secrecy::SecretString;
use serde::{Deserialize, Serialize};
use uuid::Uuid;

use super::{
    identity::CustomerUserRecord,
    identity_access::{IdentityCredential, IdentityError, IdentityResult},
};

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(deny_unknown_fields)]
pub struct RegistrationPolicy {
    pub revision: u64,
    pub agreement: LoginAgreement,
    pub gift_usd: String,
    pub enabled_providers: Vec<String>,
    pub registration_enabled: bool,
    pub verification_required: bool,
    pub recovery_enabled: bool,
    pub allowed_domains: Vec<String>,
    pub default_user_concurrency: u32,
    pub default_user_rpm: u32,
    pub default_customer_concurrency: u32,
    pub default_customer_rpm: u32,
}

impl RegistrationPolicy {
    pub fn validate(&self) -> IdentityResult<()> {
        version(self.revision)?;
        self.agreement.validate()?;
        if self.enabled_providers.len() > 3
            || self.enabled_providers.windows(2).any(|p| p[0] >= p[1])
            || self
                .enabled_providers
                .iter()
                .any(|p| !matches!(p.as_str(), "github" | "google" | "linuxdo"))
        {
            return Err(IdentityError::Invalid);
        }
        let gift = self
            .gift_usd
            .parse::<ovload_core::metering::Decimal>()
            .map_err(|_| IdentityError::Invalid)?;
        if gift.scaled() > 99999999999999999999 {
            return Err(IdentityError::Invalid);
        }
        limits(self.default_user_concurrency, self.default_user_rpm)?;
        limits(self.default_customer_concurrency, self.default_customer_rpm)?;
        if self.allowed_domains.len() > 100
            || self
                .allowed_domains
                .windows(2)
                .any(|pair| pair[0] >= pair[1])
            || self.allowed_domains.iter().any(|domain| {
                domain.len() > 253
                    || domain != &domain.to_ascii_lowercase()
                    || !email_address::EmailAddress::is_valid(&format!("validation@{domain}"))
                    || domain.split('.').count() < 2
            })
        {
            return Err(IdentityError::Invalid);
        }
        Ok(())
    }
    pub fn permits_email(&self, email: &str) -> bool {
        self.allowed_domains.is_empty()
            || email.rsplit_once('@').is_some_and(|(_, domain)| {
                self.allowed_domains.iter().any(|allowed| allowed == domain)
            })
    }
}

#[derive(Debug, Clone, Default, Serialize, Deserialize)]
#[serde(deny_unknown_fields)]
pub struct LoginAgreement {
    pub enabled: bool,
    pub mode: String,
    pub updated: String,
    pub documents: Vec<AgreementDocument>,
}
#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(deny_unknown_fields)]
pub struct AgreementDocument {
    pub id: String,
    pub title: String,
    pub slug: String,
    pub content: String,
}
impl LoginAgreement {
    pub fn validate(&self) -> IdentityResult<()> {
        if !matches!(self.mode.as_str(), "modal" | "checkbox")
            || self.documents.len() > 10
            || (self.enabled && self.documents.is_empty())
            || (!self.updated.is_empty()
                && chrono::NaiveDate::parse_from_str(&self.updated, "%Y-%m-%d").is_err())
        {
            return Err(IdentityError::Invalid);
        }
        let mut ids = std::collections::HashSet::new();
        let mut slugs = std::collections::HashSet::new();
        for d in &self.documents {
            text(&d.title, 80)?;
            if d.id.is_empty()
                || d.id.len() > 80
                || !ids.insert(&d.id)
                || !slugs.insert(&d.slug)
                || d.slug.is_empty()
                || d.slug.len() > 80
                || !d
                    .slug
                    .bytes()
                    .all(|c| c.is_ascii_lowercase() || c.is_ascii_digit() || c == b'-' || c == b'_')
                || d.content.trim().is_empty()
                || d.content.chars().count() > 30000
                || d.content
                    .chars()
                    .any(|c| c.is_control() && !matches!(c, '\n' | '\r' | '\t'))
            {
                return Err(IdentityError::Invalid);
            }
        }
        Ok(())
    }
}

pub struct RegistrationInput {
    pub invitation_code: Option<String>,
    pub consent_revision: Option<u64>,
    pub email: String,
    pub display_name: String,
    pub password: SecretString,
}

pub struct PreparedRegistration {
    pub invitation_code: Option<String>,
    pub external_identity: Option<(String, String)>,
    pub consent_revision: Option<u64>,
    pub email: String,
    pub display_name: String,
    pub password_hash: SecretString,
}

pub struct LifecycleChallenge {
    pub id: Uuid,
    pub purpose: ChallengePurpose,
    pub token_digest: [u8; 32],
    pub email_digest: [u8; 32],
    pub encrypted_payload: Vec<u8>,
    pub encrypted_notification: Vec<u8>,
}

#[derive(Debug, Clone, Copy, Serialize, Deserialize)]
#[serde(rename_all = "snake_case")]
pub enum ChallengePurpose {
    Registration,
    PasswordReset,
}
impl ChallengePurpose {
    pub const fn as_str(self) -> &'static str {
        match self {
            Self::Registration => "registration",
            Self::PasswordReset => "password_reset",
        }
    }
}

pub struct ChallengeRecord {
    pub id: Uuid,
    pub purpose: ChallengePurpose,
    pub token_digest: [u8; 32],
    pub encrypted_payload: Vec<u8>,
    pub tenant_id: Option<TenantId>,
    pub user_id: Option<UserId>,
    pub authority_generation: Option<u64>,
    pub expires_at: DateTime<Utc>,
}

pub struct LifecycleCredential {
    pub credential: IdentityCredential,
    pub revision: u64,
}

pub struct UpdateOwnProfile {
    pub expected_revision: u64,
    pub display_name: String,
}

pub struct UpdateCustomerAccount {
    pub changes: CustomerAccountChanges,
    pub password: Option<SecretString>,
}

pub struct PreparedCustomerAccountUpdate {
    pub changes: CustomerAccountChanges,
    pub password_hash: Option<SecretString>,
}

pub struct CustomerAccountChanges {
    pub tenant_id: TenantId,
    pub user_id: UserId,
    pub expected_revision: u64,
    pub email: String,
    pub display_name: String,
    pub max_concurrency: u32,
    pub requests_per_minute: u32,
    pub notes: String,
}

pub struct CustomerAccountRecord {
    pub customer: CustomerUserRecord,
    pub max_concurrency: u32,
    pub requests_per_minute: u32,
    pub customer_max_concurrency: u32,
    pub customer_requests_per_minute: u32,
    pub email_verified_at: Option<DateTime<Utc>>,
    pub notes: String,
}

pub fn version(value: u64) -> IdentityResult<()> {
    if value == 0 || value > i64::MAX as u64 {
        return Err(IdentityError::Invalid);
    }
    Ok(())
}
pub fn text(value: &str, max: usize) -> IdentityResult<()> {
    if value.is_empty()
        || value.len() > max
        || value.trim() != value
        || value.chars().any(char::is_control)
    {
        return Err(IdentityError::Invalid);
    }
    Ok(())
}
pub fn limits(concurrency: u32, rpm: u32) -> IdentityResult<()> {
    if !(1..=100000).contains(&concurrency) || !(1..=10000000).contains(&rpm) {
        return Err(IdentityError::Invalid);
    }
    Ok(())
}
pub fn notes(value: &str) -> IdentityResult<()> {
    if value.len() > 1000
        || value
            .chars()
            .any(|character| character.is_control() && character != '\n' && character != '\t')
    {
        return Err(IdentityError::Invalid);
    }
    Ok(())
}
pub fn normalize_email(email: &str) -> IdentityResult<String> {
    let email = email.trim().to_lowercase();
    text(&email, 320)?;
    if !email_address::EmailAddress::is_valid(&email) {
        return Err(IdentityError::Invalid);
    }
    Ok(email)
}

pub struct PendingIdentityNotification {
    pub id: Uuid,
    pub lease: Uuid,
    pub encrypted: Vec<u8>,
}

pub struct OAuthAttempt {
    pub digest: [u8; 32],
    pub browser_digest: [u8; 32],
    pub encrypted: Vec<u8>,
}
