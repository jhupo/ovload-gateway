//! Group overrides are frozen into each request; absent models inherit gateway prices.
use super::TokenPriceOverride;
use chrono::{DateTime, Timelike, Utc};
use serde::{Deserialize, Serialize};
use std::collections::BTreeMap;

#[derive(Debug, Clone, Default, PartialEq, Eq, Serialize, Deserialize)]
#[serde(rename_all = "camelCase", deny_unknown_fields)]
pub struct GroupPricing {
    #[serde(default)]
    pub peak: Option<PeakPricing>,
    #[serde(default)]
    pub model_prices: BTreeMap<String, TokenPriceOverride>,
}

#[derive(Debug, Clone, PartialEq, Eq, Serialize, Deserialize)]
#[serde(rename_all = "camelCase", deny_unknown_fields)]
pub struct PeakPricing {
    pub timezone: crate::time::DeploymentTimeZone,
    pub start_minute: u16,
    pub end_minute: u16,
    pub peak_multiplier_bps: u32,
    pub off_peak_multiplier_bps: u32,
}

impl GroupPricing {
    pub fn validate(&self, multiplier: u32) -> Result<(), &'static str> {
        if multiplier > 1_000_000
            || self.model_prices.len() > 256
            || self.model_prices.keys().any(|model| {
                model.is_empty()
                    || model.len() > 128
                    || model.chars().any(|c| c.is_whitespace() || c.is_control())
            })
        {
            return Err("invalid group pricing");
        }
        if let Some(peak) = &self.peak {
            if peak.start_minute >= 1440
                || peak.end_minute >= 1440
                || peak.start_minute == peak.end_minute
                || [peak.peak_multiplier_bps, peak.off_peak_multiplier_bps]
                    .into_iter()
                    .any(|rate| {
                        rate > 1_000_000 || u64::from(rate) * u64::from(multiplier) > 10_000_000_000
                    })
            {
                return Err("invalid peak pricing");
            }
        }
        Ok(())
    }

    pub fn multiplier_at(&self, base: u32, now: DateTime<Utc>) -> u32 {
        let Some(peak) = &self.peak else { return base };
        let local = peak.timezone.local(now);
        let minute = (local.hour() * 60 + local.minute()) as u16;
        let high = if peak.start_minute < peak.end_minute {
            minute >= peak.start_minute && minute < peak.end_minute
        } else {
            minute >= peak.start_minute || minute < peak.end_minute
        };
        let rate = if high {
            peak.peak_multiplier_bps
        } else {
            peak.off_peak_multiplier_bps
        };
        ((u64::from(base) * u64::from(rate) + 5000) / 10000) as u32
    }
}

#[cfg(test)]
mod tests {
    use super::*;
    #[test]
    fn peak_boundaries_overnight_and_timezone_are_half_open() {
        let mut pricing = GroupPricing {
            peak: Some(PeakPricing {
                timezone: "Asia/Shanghai".parse().unwrap(),
                start_minute: 22 * 60,
                end_minute: 6 * 60,
                peak_multiplier_bps: 15000,
                off_peak_multiplier_bps: 5000,
            }),
            model_prices: Default::default(),
        };
        for (instant, expected) in [
            ("2026-11-04T13:59:59Z", 10000),
            ("2026-11-04T14:00:00Z", 30000),
            ("2026-11-04T21:59:59Z", 30000),
            ("2026-11-04T22:00:00Z", 10000),
        ] {
            assert_eq!(
                pricing.multiplier_at(20000, instant.parse().unwrap()),
                expected
            );
        }
        pricing.peak.as_mut().unwrap().end_minute = 22 * 60;
        assert!(pricing.validate(10000).is_err());
    }
    #[test]
    fn combined_multiplier_cannot_overflow_billing_limit() {
        let pricing = GroupPricing {
            peak: Some(PeakPricing {
                timezone: Default::default(),
                start_minute: 0,
                end_minute: 60,
                peak_multiplier_bps: 1000000,
                off_peak_multiplier_bps: 10000,
            }),
            model_prices: Default::default(),
        };
        assert!(pricing.validate(10000).is_ok());
        assert!(pricing.validate(10001).is_err());
    }
}
