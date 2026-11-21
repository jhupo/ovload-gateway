// Modified for Ovload on 2026-10-27: workspace integration.

//! 核心领域、执行引擎与运行时模块的测试入口

mod account;
mod concurrency;
mod diagnostics;
mod engine;
mod error;
mod event;
mod health;
mod lifecycle;
mod live;
mod metering;
mod middleware;
mod operation;
mod policy;
mod provider_ports;
mod routing;
mod runtime;
mod task;
mod upstream;

mod time;

#[path = "../../../../tests/support/model_keys.rs"]
pub mod model_keys;

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
