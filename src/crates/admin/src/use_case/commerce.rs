//! Commerce application service.

use std::sync::Arc;

use crate::{
    model::{
        commerce::CommerceCommand,
        identity_access::{IdentityResult, IdentitySession},
    },
    ports::commerce::{CommerceQuery, CommerceStore},
};

pub struct CommerceService {
    store: Arc<dyn CommerceStore>,
}

impl CommerceService {
    pub(crate) fn new(store: Arc<dyn CommerceStore>) -> Self {
        Self { store }
    }

    pub async fn query(
        &self,
        session: &IdentitySession,
        query: CommerceQuery,
    ) -> IdentityResult<serde_json::Value> {
        self.store.query(session, query).await
    }

    pub async fn execute(
        &self,
        session: &IdentitySession,
        key: String,
        command: CommerceCommand,
    ) -> IdentityResult<serde_json::Value> {
        self.store.execute(session, key, command).await
    }
}
