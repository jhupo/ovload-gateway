//! Application values for authoritative identity and browser-session workflows.

use chrono::{DateTime, Utc};
use ovload_core::access::{AccessSessionId, ManagementPrincipalId, TenantId, UserId};
use secrecy::SecretString;

use super::identity::{CustomerUserRecord, IdentityStatus};

#[derive(Debug, Clone, Copy, PartialEq, Eq)]
pub enum IdentityAudience {
    Customer,
    Management,
}

impl IdentityAudience {
    pub const fn as_str(self) -> &'static str {
        match self {
            Self::Customer => "customer",
            Self::Management => "management",
        }
    }
}

#[derive(Debug, Clone, Copy, PartialEq, Eq)]
pub enum IdentityOwner {
    Customer {
        tenant_id: TenantId,
        user_id: UserId,
    },
    Management(ManagementPrincipalId),
}

#[derive(Debug, Clone, PartialEq, Eq)]
pub struct IdentitySession {
    pub id: AccessSessionId,
    pub owner: IdentityOwner,
    pub authority_generation: u64,
    pub expires_at: DateTime<Utc>,
}

#[derive(Debug, Clone)]
pub struct IdentityCredential {
    pub owner: IdentityOwner,
    pub password_hash: SecretString,
    pub authority_generation: u64,
}

#[derive(Debug, Clone)]
pub struct NewIdentitySession {
    pub consent_revision: Option<u64>,
    pub session: IdentitySession,
    pub access_digest: [u8; 32],
    pub csrf_digest: [u8; 32],
    pub previous_session: Option<AccessSessionId>,
}

#[derive(Debug, Clone)]
pub struct IdentitySessionGrant {
    pub session: IdentitySession,
    pub access_token: SecretString,
    pub csrf_token: SecretString,
}

#[derive(Debug, Clone, Copy)]
pub struct IdentityManagementActor {
    pub session_id: AccessSessionId,
    pub principal_id: ManagementPrincipalId,
    pub authority_generation: u64,
}

#[derive(Debug)]
pub struct ProvisionCustomer {
    pub email: String,
    pub display_name: String,
    pub password: SecretString,
    pub max_concurrency: u32,
    pub requests_per_minute: u32,
    pub notes: String,
}

#[derive(Debug)]
pub struct NewCustomerIdentity {
    pub tenant_id: TenantId,
    pub user_id: UserId,
    pub slug: String,
    pub email: String,
    pub display_name: String,
    pub password_hash: SecretString,
    pub max_concurrency: u32,
    pub requests_per_minute: u32,
    pub notes: String,
}

#[derive(Debug)]
pub struct SetCustomerActive {
    pub tenant_id: TenantId,
    pub user_id: UserId,
    pub expected_revision: u64,
    pub active: bool,
}

#[derive(Debug, thiserror::Error)]
pub enum IdentityError {
    #[error("invalid credentials or expired session")]
    Unauthorized,
    #[error("permission denied")]
    Forbidden,
    #[error("invalid identity input")]
    Invalid,
    #[error("identity record not found")]
    NotFound,
    #[error("identity changed; reload and retry")]
    Conflict,
    #[error("authentication capacity exceeded")]
    RateLimited,
    #[error("identity service unavailable")]
    Unavailable,
}

pub type IdentityResult<T> = Result<T, IdentityError>;

#[derive(Debug, Clone)]
pub struct CustomerIdentityPage {
    pub items: Vec<CustomerDirectoryRecord>,
    pub total: u64,
    pub page: u32,
    pub page_size: u16,
}

#[derive(Debug, Clone)]
pub struct CustomerDirectoryRecord {
    pub customer: CustomerUserRecord,
    pub max_concurrency: u32,
    pub requests_per_minute: u32,
    pub notes: String,
    pub balance_usd: Option<String>,
    pub last_active_at: Option<DateTime<Utc>>,
    pub last_called_at: Option<DateTime<Utc>>,
}

#[derive(Debug, Clone, Copy, PartialEq, Eq)]
pub enum CustomerDirectorySort {
    Id,
    DisplayName,
    BalanceUsd,
    CreatedAt,
}

#[derive(Debug, Clone)]
pub struct CustomerDirectoryQuery {
    pub tenant_id: Option<TenantId>,
    pub page: u32,
    pub page_size: u16,
    pub query: String,
    pub statuses: Vec<IdentityStatus>,
    pub sort: CustomerDirectorySort,
    pub descending: bool,
}

impl CustomerDirectoryQuery {
    pub fn validate(&self) -> IdentityResult<()> {
        if self.page == 0
            || !(1..=100).contains(&self.page_size)
            || self.query.len() > 200
            || self.query.chars().any(char::is_control)
            || self.statuses.len() > 3
        {
            return Err(IdentityError::Invalid);
        }
        Ok(())
    }
}
