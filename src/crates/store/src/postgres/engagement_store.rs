//! PostgreSQL adapter for commerce transactions.

use ovload_admin::{
    model::{
        commerce::CommerceCommand,
        identity_access::{IdentityResult, IdentitySession},
    },
    ports::commerce::{CommerceQuery, CommerceStore},
};
use sqlx::PgPool;

use super::engagement;

#[derive(Clone)]
pub struct PgCommerceStore {
    pool: PgPool,
}

impl PgCommerceStore {
    pub const fn new(pool: PgPool) -> Self {
        Self { pool }
    }
}

#[async_trait::async_trait]
impl CommerceStore for PgCommerceStore {
    async fn query(
        &self,
        session: &IdentitySession,
        query: CommerceQuery,
    ) -> IdentityResult<serde_json::Value> {
        engagement::commerce_query(&self.pool, session, query).await
    }

    async fn execute(
        &self,
        session: &IdentitySession,
        key: String,
        command: CommerceCommand,
    ) -> IdentityResult<serde_json::Value> {
        engagement::commerce_command(&self.pool, session, key, command).await
    }
}
