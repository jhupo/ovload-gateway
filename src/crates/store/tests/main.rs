// Modified for Ovload on 2026-10-27: workspace integration.

//! PostgreSQL、Redis 与备份存储的测试入口

mod backup;
mod bundle;
mod config;
mod lease_renewal;
mod postgres;
mod redis;
mod support;

use ovload_store::StoreResult;

#[derive(Default)]
struct RecordingDiagnostics(std::sync::Mutex<Vec<ovload_core::diagnostics::OperationalFailure>>);
#[async_trait::async_trait]
impl ovload_core::diagnostics::OperationalDiagnostics for RecordingDiagnostics {
    async fn record_failure(
        &self,
        failure: ovload_core::diagnostics::OperationalFailure,
    ) -> Result<(), ovload_core::error::StoreError> {
        self.0.lock().unwrap().push(failure);
        Ok(())
    }
}
