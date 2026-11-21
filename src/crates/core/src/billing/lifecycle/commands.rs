//! Validated reserve, dispatch evidence and completion commands.

use serde::{Deserialize, Serialize};
use serde_json::{Value, json};
use sha2::{Digest, Sha256};

use super::super::{BillableUsage, BillableUsageBounds};
use super::{
    BillingOperationRef, RETAIL_RESERVATION_TTL_SECONDS, RetailBillingError, RetailBillingResult,
    RetailBillingTarget, bounded_text, positive,
};
use crate::{
    account::ProviderAccountId,
    engine::{ModelRequestId, authentication::ModelKeyIdentity},
    identity::ProviderKind,
    routing::{ConfigRevision, UpstreamModelId},
};

/// Bounds remain caller assertions. The future execution adapter must prove
/// them against every frozen candidate and the final transformed request.
#[derive(Debug, Clone, PartialEq, Eq)]
pub struct ReserveRetailBilling {
    operation_id: ModelRequestId,
    identity: ModelKeyIdentity,
    target: RetailBillingTarget,
    bounds: BillableUsageBounds,
    route_revision: ConfigRevision,
    request_digest: [u8; 32],
}

impl ReserveRetailBilling {
    pub fn new(
        operation_id: ModelRequestId,
        identity: ModelKeyIdentity,
        target: RetailBillingTarget,
        bounds: BillableUsageBounds,
        route_revision: ConfigRevision,
        request_digest: [u8; 32],
    ) -> RetailBillingResult<Self> {
        validate_identity(&identity)?;
        BillingOperationRef::new(
            operation_id.clone(),
            identity.tenant_id,
            identity.user_id,
            identity.key_id.clone(),
        )?;
        positive(route_revision.get())?;
        Ok(Self {
            operation_id,
            identity,
            target,
            bounds,
            route_revision,
            request_digest,
        })
    }

    #[must_use]
    pub const fn operation_id(&self) -> &ModelRequestId {
        &self.operation_id
    }

    #[must_use]
    pub const fn identity(&self) -> &ModelKeyIdentity {
        &self.identity
    }

    #[must_use]
    pub const fn target(&self) -> &RetailBillingTarget {
        &self.target
    }

    #[must_use]
    pub const fn bounds(&self) -> &BillableUsageBounds {
        &self.bounds
    }

    #[must_use]
    pub const fn route_revision(&self) -> ConfigRevision {
        self.route_revision
    }

    #[must_use]
    pub const fn request_digest(&self) -> &[u8; 32] {
        &self.request_digest
    }

    pub fn fingerprint(&self) -> RetailBillingResult<[u8; 32]> {
        fingerprint(&json!({
            "format": "ovload.retail_reserve.v2",
            "operation_id": self.operation_id.as_str(),
            "identity": identity_facts(&self.identity),
            "target": self.target.facts(),
            "bounds": self.bounds.canonical_facts()?,
            "route_revision": self.route_revision.get(),
            "request_digest": self.request_digest,
            "pricing_policy": "persisted_group_multiplier",
            "expiry_seconds": RETAIL_RESERVATION_TTL_SECONDS,
        }))
    }
}

#[derive(Debug, Clone, PartialEq, Eq)]
pub struct RetailDispatchAttempt {
    number: u32,
    provider: ProviderKind,
    upstream_model: UpstreamModelId,
    provider_account: ProviderAccountId,
    request_profile_generation: u64,
    egress_generation: u64,
}

impl RetailDispatchAttempt {
    pub fn new(
        number: u32,
        provider: ProviderKind,
        upstream_model: UpstreamModelId,
        provider_account: ProviderAccountId,
        request_profile_generation: u64,
        egress_generation: u64,
    ) -> RetailBillingResult<Self> {
        validate_attempt(number)?;
        positive(request_profile_generation)?;
        positive(egress_generation)?;
        if !bounded_text(provider.as_str(), 64)
            || !bounded_text(upstream_model.as_str(), 256)
            || !bounded_text(provider_account.as_str(), 128)
        {
            return Err(RetailBillingError::Invalid);
        }
        Ok(Self {
            number,
            provider,
            upstream_model,
            provider_account,
            request_profile_generation,
            egress_generation,
        })
    }

    #[must_use]
    pub const fn number(&self) -> u32 {
        self.number
    }

    #[must_use]
    pub const fn provider(&self) -> &ProviderKind {
        &self.provider
    }

    #[must_use]
    pub const fn upstream_model(&self) -> &UpstreamModelId {
        &self.upstream_model
    }

    #[must_use]
    pub const fn provider_account(&self) -> &ProviderAccountId {
        &self.provider_account
    }

    #[must_use]
    pub const fn request_profile_generation(&self) -> u64 {
        self.request_profile_generation
    }

    #[must_use]
    pub const fn egress_generation(&self) -> u64 {
        self.egress_generation
    }

    fn facts(&self) -> Value {
        json!({
            "number": self.number,
            "provider": self.provider.as_str(),
            "upstream_model": self.upstream_model.as_str(),
            "provider_account": self.provider_account.as_str(),
            "request_profile_generation": self.request_profile_generation,
            "egress_generation": self.egress_generation,
        })
    }
}

/// A fresh intent is never replay permission, even for identical arguments.
#[derive(Debug, Clone, PartialEq, Eq)]
pub struct BeginRetailDispatch {
    operation: BillingOperationRef,
    identity: ModelKeyIdentity,
    attempt: RetailDispatchAttempt,
}

impl BeginRetailDispatch {
    pub fn new(
        operation: BillingOperationRef,
        identity: ModelKeyIdentity,
        attempt: RetailDispatchAttempt,
    ) -> RetailBillingResult<Self> {
        validate_identity(&identity)?;
        if !operation.matches(&identity) {
            return Err(RetailBillingError::Invalid);
        }
        Ok(Self {
            operation,
            identity,
            attempt,
        })
    }

    #[must_use]
    pub const fn operation(&self) -> &BillingOperationRef {
        &self.operation
    }

    #[must_use]
    pub const fn identity(&self) -> &ModelKeyIdentity {
        &self.identity
    }

    #[must_use]
    pub const fn attempt(&self) -> &RetailDispatchAttempt {
        &self.attempt
    }

    pub fn fingerprint(&self) -> RetailBillingResult<[u8; 32]> {
        fingerprint(&json!({
            "format": "ovload.retail_dispatch_intent.v1",
            "operation": self.operation.facts(),
            "identity": identity_facts(&self.identity),
            "attempt": self.attempt.facts(),
        }))
    }
}

#[derive(Debug, Clone, Copy, PartialEq, Eq, Serialize, Deserialize)]
#[serde(rename_all = "snake_case")]
pub enum BillingDispatchEvidence {
    NotSent,
    Sent,
    Ambiguous,
}

impl BillingDispatchEvidence {
    #[must_use]
    pub const fn as_str(self) -> &'static str {
        match self {
            Self::NotSent => "not_sent",
            Self::Sent => "sent",
            Self::Ambiguous => "ambiguous",
        }
    }
}

#[derive(Debug, Clone, PartialEq, Eq)]
pub struct RecordRetailDispatch {
    operation: BillingOperationRef,
    attempt: u32,
    idempotency_key: String,
    evidence: BillingDispatchEvidence,
    reference: String,
}

impl RecordRetailDispatch {
    /// `reference` names durable evidence; it must never contain a credential,
    /// provider payload, prompt or other secret.
    pub fn new(
        operation: BillingOperationRef,
        attempt: u32,
        idempotency_key: String,
        evidence: BillingDispatchEvidence,
        reference: String,
    ) -> RetailBillingResult<Self> {
        validate_attempt(attempt)?;
        opaque_reference(&idempotency_key)?;
        opaque_reference(&reference)?;
        Ok(Self {
            operation,
            attempt,
            idempotency_key,
            evidence,
            reference,
        })
    }

    #[must_use]
    pub const fn operation(&self) -> &BillingOperationRef {
        &self.operation
    }

    #[must_use]
    pub const fn attempt(&self) -> u32 {
        self.attempt
    }

    #[must_use]
    pub fn idempotency_key(&self) -> &str {
        &self.idempotency_key
    }

    #[must_use]
    pub const fn evidence(&self) -> BillingDispatchEvidence {
        self.evidence
    }

    #[must_use]
    pub fn reference(&self) -> &str {
        &self.reference
    }

    pub fn fingerprint(&self) -> RetailBillingResult<[u8; 32]> {
        fingerprint(&json!({
            "format": "ovload.retail_dispatch_evidence.v1",
            "operation": self.operation.facts(),
            "attempt": self.attempt,
            "evidence": self.evidence,
            "reference": self.reference,
        }))
    }
}

#[derive(Debug, Clone, Copy, PartialEq, Eq, Serialize, Deserialize)]
#[serde(rename_all = "snake_case")]
pub enum RetailUsageAuthority {
    ProviderReported,
    ProviderNative,
    OperatorReconciled,
}

impl RetailUsageAuthority {
    #[must_use]
    pub const fn as_str(self) -> &'static str {
        match self {
            Self::ProviderReported => "provider_reported",
            Self::ProviderNative => "provider_native",
            Self::OperatorReconciled => "operator_reconciled",
        }
    }
}

#[derive(Debug, Clone, PartialEq, Eq)]
pub struct RetailUsageEvidence {
    usage: BillableUsage,
    authority: RetailUsageAuthority,
    reference: String,
}

impl RetailUsageEvidence {
    /// The caller owns completeness and source authority; syntactic validation
    /// does not turn sample quantities into provider evidence.
    pub fn new(
        usage: BillableUsage,
        authority: RetailUsageAuthority,
        reference: String,
    ) -> RetailBillingResult<Self> {
        opaque_reference(&reference)?;
        Ok(Self {
            usage,
            authority,
            reference,
        })
    }

    #[must_use]
    pub const fn usage(&self) -> &BillableUsage {
        &self.usage
    }

    #[must_use]
    pub const fn authority(&self) -> RetailUsageAuthority {
        self.authority
    }

    #[must_use]
    pub fn reference(&self) -> &str {
        &self.reference
    }
}

#[derive(Debug, Clone, Copy, PartialEq, Eq, Serialize, Deserialize)]
#[serde(rename_all = "snake_case")]
pub enum BillingUnresolvedReason {
    DispatchUnknown,
    UsageIncomplete,
    ChargeExceedsHold,
    SettlementUnavailable,
}

impl BillingUnresolvedReason {
    #[must_use]
    pub const fn as_str(self) -> &'static str {
        match self {
            Self::DispatchUnknown => "dispatch_unknown",
            Self::UsageIncomplete => "usage_incomplete",
            Self::ChargeExceedsHold => "charge_exceeds_hold",
            Self::SettlementUnavailable => "settlement_unavailable",
        }
    }
}

#[derive(Debug, Clone, PartialEq, Eq)]
pub enum RetailBillingCompletion {
    ProvenNotSent,
    AuthoritativeUsage(RetailUsageEvidence),
    Unresolved(BillingUnresolvedReason),
}

impl RetailBillingCompletion {
    fn facts(&self) -> RetailBillingResult<Value> {
        Ok(match self {
            Self::ProvenNotSent => json!({ "outcome": "proven_not_sent" }),
            Self::AuthoritativeUsage(evidence) => json!({
                "outcome": "authoritative_usage",
                "usage": evidence.usage.canonical_facts()?,
                "authority": evidence.authority,
                "reference": evidence.reference,
            }),
            Self::Unresolved(reason) => json!({
                "outcome": "unresolved",
                "reason": reason,
            }),
        })
    }
}

#[derive(Debug, Clone, PartialEq, Eq)]
pub struct CompleteRetailBilling {
    operation: BillingOperationRef,
    idempotency_key: String,
    completion: RetailBillingCompletion,
}

impl CompleteRetailBilling {
    pub fn new(
        operation: BillingOperationRef,
        idempotency_key: String,
        completion: RetailBillingCompletion,
    ) -> RetailBillingResult<Self> {
        opaque_reference(&idempotency_key)?;
        Ok(Self {
            operation,
            idempotency_key,
            completion,
        })
    }

    #[must_use]
    pub const fn operation(&self) -> &BillingOperationRef {
        &self.operation
    }

    #[must_use]
    pub fn idempotency_key(&self) -> &str {
        &self.idempotency_key
    }

    #[must_use]
    pub const fn completion(&self) -> &RetailBillingCompletion {
        &self.completion
    }

    pub fn fingerprint(&self) -> RetailBillingResult<[u8; 32]> {
        fingerprint(&json!({
            "format": "ovload.retail_complete.v1",
            "operation": self.operation.facts(),
            "completion": self.completion.facts()?,
        }))
    }
}

fn identity_facts(identity: &ModelKeyIdentity) -> Value {
    json!({
        "key_id": identity.key_id.as_str(),
        "tenant_id": identity.tenant_id.as_uuid().to_string(),
        "user_id": identity.user_id.as_uuid().to_string(),
        "key_generation": identity.key_generation,
        "user_generation": identity.user_generation,
        "tenant_generation": identity.tenant_generation,
    })
}

fn validate_identity(identity: &ModelKeyIdentity) -> RetailBillingResult<()> {
    if identity.tenant_id.as_uuid().is_nil()
        || identity.user_id.as_uuid().is_nil()
        || !bounded_text(identity.key_id.as_str(), 128)
    {
        return Err(RetailBillingError::Invalid);
    }
    positive(identity.key_generation)?;
    positive(identity.user_generation)?;
    positive(identity.tenant_generation)
}

fn validate_attempt(number: u32) -> RetailBillingResult<()> {
    if !(1..=100).contains(&number) {
        return Err(RetailBillingError::Invalid);
    }
    Ok(())
}

fn opaque_reference(value: &str) -> RetailBillingResult<()> {
    if value.is_empty()
        || value.len() > 128
        || !value.bytes().all(|byte| (0x21..=0x7e).contains(&byte))
    {
        return Err(RetailBillingError::Invalid);
    }
    Ok(())
}

fn fingerprint(value: &Value) -> RetailBillingResult<[u8; 32]> {
    let encoded = serde_json::to_vec(value).map_err(|_| RetailBillingError::Invalid)?;
    Ok(Sha256::digest(encoded).into())
}
