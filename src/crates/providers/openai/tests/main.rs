// Modified for Ovload on 2026-10-27: workspace integration.

//! OpenAI Provider、凭据与上游传输的测试入口

mod admin;
mod config;
mod credential;
mod jitter;
mod provider;
mod support;
mod transport;

#[path = "../../../../../tests/support/model_keys.rs"]
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
