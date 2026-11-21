//! Per-customer group defaults. Overrides replace the group default, never other authority limits.
use serde::{Deserialize, Serialize};
use std::collections::BTreeMap;

#[derive(Debug, Clone, PartialEq, Eq, Serialize, Deserialize)]
#[serde(rename_all = "camelCase", deny_unknown_fields)]
pub struct GroupControls {
    #[serde(default = "default_allow_live")]
    pub allow_live: bool,
    #[serde(default)]
    pub requests_per_minute: u32,
    #[serde(default)]
    pub user_overrides: BTreeMap<String, GroupUserOverride>,
}

#[derive(Debug, Clone, Default, PartialEq, Eq, Serialize, Deserialize)]
#[serde(rename_all = "camelCase", deny_unknown_fields)]
pub struct GroupUserOverride {
    pub multiplier_bps: Option<u32>,
    pub requests_per_minute: Option<u32>,
}

const fn default_allow_live() -> bool {
    true
}
impl Default for GroupControls {
    fn default() -> Self {
        Self {
            allow_live: true,
            requests_per_minute: 0,
            user_overrides: BTreeMap::new(),
        }
    }
}
impl GroupControls {
    pub fn validate(&self, pricing: &super::GroupPricing) -> Result<(), &'static str> {
        if self.requests_per_minute > 1_000_000 || self.user_overrides.len() > 256 {
            return Err("invalid group limits");
        }
        for (owner, entry) in &self.user_overrides {
            let Some((tenant, user)) = owner.split_once('/') else {
                return Err("invalid override owner");
            };
            for id in [tenant, user] {
                if uuid::Uuid::parse_str(id)
                    .ok()
                    .is_none_or(|uuid| uuid.to_string() != id)
                {
                    return Err("invalid override owner");
                }
            }
            if entry.requests_per_minute.is_some_and(|rpm| rpm > 1_000_000)
                || (entry.multiplier_bps.is_none() && entry.requests_per_minute.is_none())
            {
                return Err("invalid group override");
            }
            if let Some(multiplier) = entry.multiplier_bps {
                pricing.validate(multiplier)?;
            }
        }
        Ok(())
    }

    pub fn for_user(
        &self,
        tenant: crate::access::TenantId,
        user: crate::access::UserId,
    ) -> GroupUserOverride {
        self.user_overrides
            .get(&format!("{tenant}/{user}"))
            .cloned()
            .unwrap_or_default()
    }
}

#[cfg(test)]
mod tests {
    use super::*;
    use crate::{
        access::{TenantId, UserId},
        account::scope::{ClientRoutingScope, FrozenAccountScope},
        metering::{GroupPricing, PeakPricing},
    };
    use std::sync::Arc;
    #[test]
    fn group_override_is_tenant_scoped_and_does_not_mutate_shared_prices() {
        let tenant = TenantId::new(uuid::Uuid::from_u128(1));
        let user = UserId::new(uuid::Uuid::from_u128(2));
        let controls = GroupControls {
            allow_live: false,
            requests_per_minute: 60,
            user_overrides: BTreeMap::from([(
                format!("{tenant}/{user}"),
                GroupUserOverride {
                    multiplier_bps: Some(5000),
                    requests_per_minute: Some(0),
                },
            )]),
        };
        let pricing = GroupPricing {
            peak: Some(PeakPricing {
                timezone: "UTC".parse().unwrap(),
                start_minute: 0,
                end_minute: 60,
                peak_multiplier_bps: 20000,
                off_peak_multiplier_bps: 10000,
            }),
            model_prices: BTreeMap::new(),
        };
        assert!(controls.validate(&pricing).is_ok());
        let scope = FrozenAccountScope::new(Arc::default(), ClientRoutingScope::all_accounts())
            .with_pricing(Some((15000, pricing)))
            .with_group_controls(controls.clone());
        assert!(!scope.allows_live());
        let effective = scope.for_user(tenant, user);
        let (base, prices) = effective.group_pricing().unwrap();
        assert_eq!(*base, 5000);
        assert_eq!(
            prices.multiplier_at(*base, "2026-11-11T00:30:00Z".parse().unwrap()),
            10000
        );
        assert_eq!(scope.group_pricing().unwrap().0, 15000);
        assert_eq!(
            scope
                .for_user(TenantId::new(uuid::Uuid::from_u128(3)), user)
                .group_pricing()
                .unwrap()
                .0,
            15000
        );
        assert_eq!(controls.for_user(tenant, user).requests_per_minute, Some(0));
    }
    #[test]
    fn group_controls_reject_invalid_owner_empty_override_and_overflow() {
        let mut controls = GroupControls::default();
        controls.user_overrides.insert(
            "bad/user".to_owned(),
            GroupUserOverride {
                multiplier_bps: Some(5000),
                requests_per_minute: None,
            },
        );
        assert!(controls.validate(&GroupPricing::default()).is_err());
        controls.user_overrides.clear();
        let key = format!("{}/{}", uuid::Uuid::from_u128(1), uuid::Uuid::from_u128(2));
        controls
            .user_overrides
            .insert(key.clone(), GroupUserOverride::default());
        assert!(controls.validate(&GroupPricing::default()).is_err());
        controls
            .user_overrides
            .get_mut(&key)
            .unwrap()
            .multiplier_bps = Some(1000001);
        assert!(controls.validate(&GroupPricing::default()).is_err());
    }
}
