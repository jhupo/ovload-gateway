//! Tenant and management authorization projections.
//!
//! PostgreSQL is the authority for these records. This module contains only
//! validated domain values and the conversion into the portable core access
//! context used by request, queue, and dispatch boundaries.

use chrono::{DateTime, Utc};
use ovload_core::access::{
    AccessContext, AccessSessionId, ManagementPrincipalId, Permission, Scope, TenantId, UserId,
};

use super::AdminModelError;

#[derive(Debug, Clone, Copy, PartialEq, Eq)]
pub enum IdentityStatus {
    Active,
    Suspended,
    Revoked,
}

#[derive(Debug, Clone, PartialEq, Eq)]
pub struct TenantRecord {
    pub id: TenantId,
    pub slug: String,
    pub display_name: String,
    pub status: IdentityStatus,
    pub revision: u64,
    pub created_at: DateTime<Utc>,
    pub updated_at: DateTime<Utc>,
}

#[derive(Debug, Clone, PartialEq, Eq)]
pub struct CustomerUserRecord {
    pub id: UserId,
    pub tenant_id: TenantId,
    pub email: String,
    pub display_name: String,
    pub status: IdentityStatus,
    pub revision: u64,
    pub created_at: DateTime<Utc>,
    pub updated_at: DateTime<Utc>,
}

/// A grant is evaluated on every request. The projection intentionally has no
/// wildcard permission: platform and tenant scope are separate variants.
#[derive(Debug, Clone, PartialEq, Eq)]
pub struct ManagementGrant {
    pub principal_id: ManagementPrincipalId,
    pub tenant_id: Option<TenantId>,
    pub permissions: Vec<Permission>,
    pub status: IdentityStatus,
    pub expires_at: Option<DateTime<Utc>>,
    pub authority_generation: u64,
}

impl ManagementGrant {
    #[must_use]
    pub fn is_active_at(&self, now: DateTime<Utc>) -> bool {
        self.status == IdentityStatus::Active
            && self.expires_at.is_none_or(|expires_at| expires_at > now)
    }

    pub fn access_context(
        &self,
        session_id: Option<AccessSessionId>,
        now: DateTime<Utc>,
    ) -> Result<AccessContext, AdminModelError> {
        if !self.is_active_at(now) {
            return Err(AdminModelError::IdentityGrantInactive);
        }
        let scope = self.tenant_id.map_or(Scope::Platform, Scope::Tenant);
        Ok(AccessContext::new(
            ovload_core::access::Principal::Management(self.principal_id),
            scope,
            session_id,
            self.permissions.iter().copied(),
            self.authority_generation,
        ))
    }
}

#[derive(Debug, Clone, Copy, PartialEq, Eq)]
pub struct CustomerAccess {
    pub user_id: UserId,
    pub tenant_id: TenantId,
    pub session_id: AccessSessionId,
    pub authority_generation: u64,
}

impl CustomerAccess {
    #[must_use]
    pub fn context(self, permissions: impl IntoIterator<Item = Permission>) -> AccessContext {
        AccessContext::new(
            ovload_core::access::Principal::Customer(self.user_id),
            Scope::Tenant(self.tenant_id),
            Some(self.session_id),
            permissions,
            self.authority_generation,
        )
    }
}
