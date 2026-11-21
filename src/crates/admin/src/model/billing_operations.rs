//! Tenant-safe financial operation pages with stable keyset cursors.

use ovload_core::{billing::BillingOperationRecord, engine::ModelRequestId};

/// Operations ordered by descending creation time and operation ID.
#[derive(Debug, Clone, PartialEq, Eq)]
pub struct BillingOperationPage {
    pub items: Vec<BillingOperationRecord>,
    pub next_cursor: Option<ModelRequestId>,
}
