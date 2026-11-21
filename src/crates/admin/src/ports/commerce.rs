//! Commerce persistence boundary.
//!
//! The commerce use case owns subscription, redemption, order and payment
//! queries.  The store keeps their transaction, idempotency and audit
//! semantics behind this narrow port.

use std::collections::BTreeMap;

use async_trait::async_trait;
use chrono::NaiveDate;
use serde_json::Value;

use crate::model::{
    commerce::CommerceCommand,
    identity_access::{IdentityError, IdentityResult, IdentitySession},
};

#[derive(Debug, Clone)]
pub struct CommercePageQuery {
    pub scope: String,
    pub params: BTreeMap<String, String>,
}

#[derive(Debug, Clone)]
pub enum CommerceQuery {
    Overview,
    Scope(String),
    Page(CommercePageQuery),
    PaymentSummary {
        from: NaiveDate,
        to: NaiveDate,
        timezone: String,
    },
}

#[async_trait]
pub trait CommerceStore: Send + Sync {
    async fn query(&self, session: &IdentitySession, query: CommerceQuery)
    -> IdentityResult<Value>;

    async fn execute(
        &self,
        session: &IdentitySession,
        key: String,
        command: CommerceCommand,
    ) -> IdentityResult<Value>;
}

/// Test and offline compositions still receive a concrete, unavailable
/// commerce port instead of silently falling back to another domain store.
pub struct UnavailableCommerceStore;

#[async_trait]
impl CommerceStore for UnavailableCommerceStore {
    async fn query(
        &self,
        _session: &IdentitySession,
        _query: CommerceQuery,
    ) -> IdentityResult<Value> {
        Err(IdentityError::Unavailable)
    }

    async fn execute(
        &self,
        _session: &IdentitySession,
        _key: String,
        _command: CommerceCommand,
    ) -> IdentityResult<Value> {
        Err(IdentityError::Unavailable)
    }
}
