//! Strict structured persistence for bounded usage and complete quantities.

use std::collections::BTreeMap;

use serde::{Deserialize, Serialize};
use serde_json::Value;

use super::super::{BillableUsage, BillableUsageBounds, UsageDimension, VerifiedInputTokenBound};
use super::{RetailBillingError, RetailBillingResult};

#[derive(Serialize, Deserialize)]
#[serde(deny_unknown_fields)]
struct InputBoundFacts {
    maximum_tokens: u64,
    verifier: String,
    revision: String,
}

#[derive(Serialize, Deserialize)]
#[serde(deny_unknown_fields)]
struct AdditionalBoundFacts {
    dimension: UsageDimension,
    maximum: u64,
}

#[derive(Serialize, Deserialize)]
#[serde(deny_unknown_fields)]
struct UsageBoundsFacts {
    input_tokens: InputBoundFacts,
    output_tokens: u64,
    additional: Vec<AdditionalBoundFacts>,
}

impl BillableUsageBounds {
    /// Stable persistence facts; this serialization asserts no execution proof.
    pub fn canonical_facts(&self) -> RetailBillingResult<Value> {
        serde_json::to_value(UsageBoundsFacts {
            input_tokens: InputBoundFacts {
                maximum_tokens: self.input_tokens.maximum_tokens(),
                verifier: self.input_tokens.verifier().to_owned(),
                revision: self.input_tokens.revision().to_owned(),
            },
            output_tokens: self.output_tokens,
            additional: self
                .additional
                .iter()
                .map(|(dimension, maximum)| AdditionalBoundFacts {
                    dimension: *dimension,
                    maximum: *maximum,
                })
                .collect(),
        })
        .map_err(|_| RetailBillingError::Invalid)
    }

    pub fn from_facts(value: Value) -> RetailBillingResult<Self> {
        let facts: UsageBoundsFacts =
            serde_json::from_value(value).map_err(|_| RetailBillingError::Invalid)?;
        if facts.additional.len() > 9 {
            return Err(RetailBillingError::Invalid);
        }
        let input = VerifiedInputTokenBound::new(
            facts.input_tokens.maximum_tokens,
            facts.input_tokens.verifier,
            facts.input_tokens.revision,
        )
        .map_err(|_| RetailBillingError::Invalid)?;
        Self::new(
            input,
            facts.output_tokens,
            facts
                .additional
                .into_iter()
                .map(|bound| (bound.dimension, bound.maximum)),
        )
        .map_err(|_| RetailBillingError::Invalid)
    }
}

#[derive(Serialize, Deserialize)]
#[serde(deny_unknown_fields)]
struct UsageQuantityFacts {
    dimension: UsageDimension,
    quantity: u64,
}

#[derive(Serialize, Deserialize)]
#[serde(deny_unknown_fields)]
struct UsageFacts {
    quantities: Vec<UsageQuantityFacts>,
}

impl BillableUsage {
    pub fn canonical_facts(&self) -> RetailBillingResult<Value> {
        serde_json::to_value(UsageFacts {
            quantities: self
                .quantities()
                .iter()
                .map(|(dimension, quantity)| UsageQuantityFacts {
                    dimension: *dimension,
                    quantity: *quantity,
                })
                .collect(),
        })
        .map_err(|_| RetailBillingError::Invalid)
    }

    pub fn from_facts(value: Value) -> RetailBillingResult<Self> {
        let facts: UsageFacts =
            serde_json::from_value(value).map_err(|_| RetailBillingError::Invalid)?;
        if !(5..=14).contains(&facts.quantities.len()) {
            return Err(RetailBillingError::Invalid);
        }
        let mut quantities = BTreeMap::new();
        for fact in facts.quantities {
            if quantities.insert(fact.dimension, fact.quantity).is_some() {
                return Err(RetailBillingError::Invalid);
            }
        }
        let mut required = |dimension| {
            quantities
                .remove(&dimension)
                .ok_or(RetailBillingError::Invalid)
        };
        let input = required(UsageDimension::UncachedInputTokens)?;
        let cached = required(UsageDimension::CacheReadInputTokens)?;
        let cache_5m = required(UsageDimension::CacheWriteInputTokens5m)?;
        let cache_1h = required(UsageDimension::CacheWriteInputTokens1h)?;
        let output = required(UsageDimension::OutputTokens)?;
        Self::new(input, cached, cache_5m, cache_1h, output, quantities)
            .map_err(|_| RetailBillingError::Invalid)
    }
}
