//! Portable identity and authorization contracts shared by adapters.
//!
//! The data plane must receive a verified access context. It must never infer
//! tenant ownership from a provider account, a request header, or a mutable
//! runtime snapshot.

use std::{collections::BTreeSet, fmt, str::FromStr};

use uuid::Uuid;

macro_rules! opaque_id {
    ($name:ident, $label:literal) => {
        #[derive(Debug, Clone, Copy, PartialEq, Eq, PartialOrd, Ord, Hash)]
        pub struct $name(Uuid);

        impl $name {
            #[must_use]
            pub const fn new(value: Uuid) -> Self {
                Self(value)
            }

            #[must_use]
            pub const fn as_uuid(self) -> Uuid {
                self.0
            }
        }

        impl From<Uuid> for $name {
            fn from(value: Uuid) -> Self {
                Self::new(value)
            }
        }

        impl FromStr for $name {
            type Err = AccessIdError;

            fn from_str(value: &str) -> Result<Self, Self::Err> {
                Uuid::parse_str(value.trim())
                    .map(Self::new)
                    .map_err(|_| AccessIdError::Invalid { kind: $label })
            }
        }

        impl fmt::Display for $name {
            fn fmt(&self, formatter: &mut fmt::Formatter<'_>) -> fmt::Result {
                self.0.fmt(formatter)
            }
        }
    };
}

opaque_id!(TenantId, "tenant");
opaque_id!(UserId, "user");
opaque_id!(ManagementPrincipalId, "management principal");
opaque_id!(ModelKeyId, "model key");
opaque_id!(AccessSessionId, "access session");

/// Stable permission names evaluated by the management and customer services.
#[derive(Debug, Clone, Copy, PartialEq, Eq, PartialOrd, Ord, Hash)]
pub enum Permission {
    IdentityUsersRead,
    IdentityUsersManage,
    IdentityKeysRead,
    IdentityKeysManage,
    SecuritySettingsManage,
    ProviderAccountsRead,
    ProviderAccountsManage,
    ModelsExecute,
    UsageRead,
    BillingRead,
    BillingManage,
    PluginsManage,
}

impl Permission {
    #[must_use]
    pub const fn as_str(self) -> &'static str {
        match self {
            Self::IdentityUsersRead => "identity.users.read",
            Self::IdentityUsersManage => "identity.users.manage",
            Self::IdentityKeysRead => "identity.keys.read",
            Self::IdentityKeysManage => "identity.keys.manage",
            Self::SecuritySettingsManage => "security.settings.manage",
            Self::ProviderAccountsRead => "provider_accounts.read",
            Self::ProviderAccountsManage => "provider_accounts.manage",
            Self::ModelsExecute => "models.execute",
            Self::UsageRead => "usage.read",
            Self::BillingRead => "billing.read",
            Self::BillingManage => "billing.manage",
            Self::PluginsManage => "plugins.manage",
        }
    }

    pub fn parse(value: &str) -> Result<Self, AccessPermissionError> {
        match value {
            "identity.users.read" => Ok(Self::IdentityUsersRead),
            "identity.users.manage" => Ok(Self::IdentityUsersManage),
            "identity.keys.read" => Ok(Self::IdentityKeysRead),
            "identity.keys.manage" => Ok(Self::IdentityKeysManage),
            "security.settings.manage" => Ok(Self::SecuritySettingsManage),
            "provider_accounts.read" => Ok(Self::ProviderAccountsRead),
            "provider_accounts.manage" => Ok(Self::ProviderAccountsManage),
            "models.execute" => Ok(Self::ModelsExecute),
            "usage.read" => Ok(Self::UsageRead),
            "billing.read" => Ok(Self::BillingRead),
            "billing.manage" => Ok(Self::BillingManage),
            "plugins.manage" => Ok(Self::PluginsManage),
            _ => Err(AccessPermissionError::Unknown {
                value: value.to_owned(),
            }),
        }
    }
}

#[derive(Debug, Clone, PartialEq, Eq, thiserror::Error)]
pub enum AccessIdError {
    #[error("invalid {kind} identifier")]
    Invalid { kind: &'static str },
}

#[derive(Debug, Clone, PartialEq, Eq, thiserror::Error)]
pub enum AccessPermissionError {
    #[error("unknown permission {value}")]
    Unknown { value: String },
}

/// The principal that was authenticated for this operation.
#[derive(Debug, Clone, Copy, PartialEq, Eq)]
pub enum Principal {
    Customer(UserId),
    Management(ManagementPrincipalId),
    ModelKey(ModelKeyId),
    Plugin(Uuid),
}

/// Explicit ownership boundary for authorization checks.
#[derive(Debug, Clone, Copy, PartialEq, Eq)]
pub enum Scope {
    Platform,
    Tenant(TenantId),
}

/// Verified authorization facts carried with a request or queued operation.
#[derive(Debug, Clone, PartialEq, Eq)]
pub struct AccessContext {
    principal: Principal,
    scope: Scope,
    session_id: Option<AccessSessionId>,
    permissions: BTreeSet<Permission>,
    authority_generation: u64,
}

impl AccessContext {
    #[must_use]
    pub fn new(
        principal: Principal,
        scope: Scope,
        session_id: Option<AccessSessionId>,
        permissions: impl IntoIterator<Item = Permission>,
        authority_generation: u64,
    ) -> Self {
        Self {
            principal,
            scope,
            session_id,
            permissions: permissions.into_iter().collect(),
            authority_generation,
        }
    }

    #[must_use]
    pub fn principal(&self) -> Principal {
        self.principal
    }

    #[must_use]
    pub const fn scope(&self) -> Scope {
        self.scope
    }

    #[must_use]
    pub const fn session_id(&self) -> Option<AccessSessionId> {
        self.session_id
    }

    #[must_use]
    pub const fn authority_generation(&self) -> u64 {
        self.authority_generation
    }

    #[must_use]
    pub fn has_permission(&self, permission: Permission) -> bool {
        self.permissions.contains(&permission)
    }

    pub fn permissions(&self) -> impl Iterator<Item = Permission> + '_ {
        self.permissions.iter().copied()
    }

    /// Platform scope is explicit and may target a named tenant. A tenant grant
    /// cannot authorize a platform operation, and a request for a different
    /// tenant is always rejected.
    #[must_use]
    pub fn allows(&self, permission: Permission, tenant: Option<TenantId>) -> bool {
        self.has_permission(permission)
            && match (self.scope, tenant) {
                (Scope::Platform, _) => true,
                (Scope::Tenant(granted), Some(requested)) => granted == requested,
                _ => false,
            }
    }
}
