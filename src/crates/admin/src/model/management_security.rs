//! Live platform operator records and explicit customer-partition scopes.

use chrono::{DateTime, Utc};
use ovload_core::access::{ManagementPrincipalId, Permission, TenantId};
use uuid::Uuid;

use super::identity_access::{IdentityError, IdentityResult};

#[derive(Debug, Clone, Copy, PartialEq, Eq)]
pub enum SecurityScope {
    Platform,
    Customer(TenantId),
}

impl SecurityScope {
    pub const fn tenant_id(self) -> Option<TenantId> {
        match self {
            Self::Platform => None,
            Self::Customer(id) => Some(id),
        }
    }

    pub const fn as_str(self) -> &'static str {
        match self {
            Self::Platform => "platform",
            Self::Customer(_) => "tenant",
        }
    }
}

#[derive(Debug, Clone)]
pub struct PrincipalRecord {
    pub id: ManagementPrincipalId,
    pub username: String,
    pub status: String,
    pub revision: u64,
    pub created_at: DateTime<Utc>,
    pub updated_at: DateTime<Utc>,
}

#[derive(Debug, Clone)]
pub struct GrantRecord {
    pub id: Uuid,
    pub principal_id: ManagementPrincipalId,
    pub scope: SecurityScope,
    pub permissions: Vec<Permission>,
    pub status: String,
    pub expires_at: Option<DateTime<Utc>>,
    pub revision: u64,
    pub created_at: DateTime<Utc>,
    pub updated_at: DateTime<Utc>,
}

pub fn validate_text(value: &str, maximum: usize) -> IdentityResult<()> {
    if value.is_empty()
        || value.len() > maximum
        || value.trim() != value
        || value.chars().any(char::is_control)
    {
        return Err(IdentityError::Invalid);
    }
    Ok(())
}
