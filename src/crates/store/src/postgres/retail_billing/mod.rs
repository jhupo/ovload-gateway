//! Direct durable retail-funds transactions, independent of execution observations.

use async_trait::async_trait;
use ovload_core::billing::{
    BeginRetailDispatch, BillingOperationRecord, CompleteRetailBilling, RecordRetailDispatch,
    ReserveRetailBilling, RetailBillingError, RetailBillingPort,
};
use sqlx::{PgPool, Postgres, Transaction};

mod attempts;
mod commands;
mod read;
mod reconciliation;
mod reserve;
mod settlement;
mod tariff;

pub(crate) use read::{RECORD_COLUMNS, record_from_row};

#[derive(Clone)]
pub struct PgRetailBillingStore {
    pool: PgPool,
}

impl PgRetailBillingStore {
    #[must_use]
    pub const fn new(pool: PgPool) -> Self {
        Self { pool }
    }

    async fn begin(&self) -> Result<Transaction<'_, Postgres>, RetailBillingError> {
        let mut tx = self.pool.begin().await.map_err(db_error)?;
        sqlx::query("set local statement_timeout = '5s'")
            .execute(&mut *tx)
            .await
            .map_err(db_error)?;
        Ok(tx)
    }

    pub(crate) async fn recover_expired(&self, limit: u16) -> Result<u64, RetailBillingError> {
        reconciliation::recover_expired(self, limit).await
    }
}

#[async_trait]
impl RetailBillingPort for PgRetailBillingStore {
    async fn reserve(
        &self,
        command: ReserveRetailBilling,
    ) -> Result<BillingOperationRecord, RetailBillingError> {
        reserve::reserve(self, command).await
    }

    async fn begin_dispatch(&self, command: BeginRetailDispatch) -> Result<(), RetailBillingError> {
        attempts::begin(self, command).await
    }

    async fn record_dispatch(
        &self,
        command: RecordRetailDispatch,
    ) -> Result<(), RetailBillingError> {
        attempts::record(self, command).await
    }

    async fn complete(
        &self,
        command: CompleteRetailBilling,
    ) -> Result<BillingOperationRecord, RetailBillingError> {
        settlement::complete(self, command).await
    }
}

fn db_error(error: sqlx::Error) -> RetailBillingError {
    match error
        .as_database_error()
        .and_then(|error| error.code())
        .as_deref()
    {
        Some("23505" | "40001" | "40P01") => RetailBillingError::Conflict,
        _ => RetailBillingError::Unavailable,
    }
}

fn bigint(value: u64) -> Result<i64, RetailBillingError> {
    i64::try_from(value).map_err(|_| RetailBillingError::Invalid)
}

fn authority_error(
    error: ovload_core::engine::authentication::ModelKeyAuthorityError,
) -> RetailBillingError {
    match error {
        ovload_core::engine::authentication::ModelKeyAuthorityError::InvalidKey => {
            RetailBillingError::Unauthorized
        }
        ovload_core::engine::authentication::ModelKeyAuthorityError::Unavailable => {
            RetailBillingError::Unavailable
        }
    }
}
