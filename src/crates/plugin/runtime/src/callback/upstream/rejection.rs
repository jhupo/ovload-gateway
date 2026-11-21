//! Keep the first host preparation rejection independent of plugin error handling.

use std::sync::Mutex;

use ovload_core::{
    error::{ProviderError, ProviderErrorKind},
    upstream::UpstreamSendState,
};
use ovload_plugin_sdk::{ErrorCode, PluginFault, SendState};
use tokio::sync::watch;

use super::ManagedUpstream;

pub(super) struct PreparationFailure {
    first: Mutex<Option<ProviderError>>,
    rejected: watch::Sender<bool>,
}

impl Default for PreparationFailure {
    fn default() -> Self {
        Self {
            first: Mutex::new(None),
            rejected: watch::channel(false).0,
        }
    }
}

impl ManagedUpstream {
    pub(crate) fn preparation_rejected(&self) -> bool {
        *self.preparation_failure.rejected.borrow()
    }

    pub(crate) fn ensure_preparation_allowed(&self) -> Result<(), PluginFault> {
        if self.preparation_rejected() {
            Err(rejection())
        } else {
            Ok(())
        }
    }

    pub(super) fn reject_preparation(&self, error: ProviderError) -> PluginFault {
        let mut first = self
            .preparation_failure
            .first
            .lock()
            .unwrap_or_else(std::sync::PoisonError::into_inner);
        if !self.preparation_rejected() {
            let mut fault = PluginFault::new(
                match error.kind() {
                    ProviderErrorKind::Cancelled => ErrorCode::Cancelled,
                    ProviderErrorKind::Timeout => ErrorCode::Timeout,
                    ProviderErrorKind::InvalidRequest | ProviderErrorKind::MessageTooBig => {
                        ErrorCode::InvalidInput
                    }
                    _ => ErrorCode::Rejected,
                },
                "managed upstream request preparation rejected",
            );
            fault.send_state = match self.send_state.get() {
                UpstreamSendState::NotSent => SendState::NotSent,
                UpstreamSendState::Sent => SendState::Sent,
                UpstreamSendState::Ambiguous => SendState::Ambiguous,
            };
            *first = Some(
                ProviderError::new(error.kind(), self.send_state.get())
                    .with_retry_prohibited()
                    .redact_sensitive_context("managed upstream request preparation rejected"),
            );
            self.preparation_failure.rejected.send_replace(true);
            return fault;
        }
        rejection()
    }

    pub(crate) fn take_preparation_failure(&self) -> Option<ProviderError> {
        if !self.preparation_rejected() {
            return None;
        }
        self.preparation_failure
            .first
            .lock()
            .unwrap_or_else(std::sync::PoisonError::into_inner)
            .take()
    }

    pub(crate) async fn wait_for_preparation_failure(&self) -> ProviderError {
        let mut changed = self.preparation_failure.rejected.subscribe();
        let _ = changed.wait_for(|rejected| *rejected).await;
        self.take_preparation_failure().unwrap_or_else(|| {
            ProviderError::new(
                ProviderErrorKind::RequestPolicyDenied,
                self.send_state.get(),
            )
            .with_retry_prohibited()
        })
    }

    pub(crate) async fn authorize_send(&self) -> Result<(), PluginFault> {
        self.ensure_preparation_allowed()?;
        self.ensure_attempt_live()?;
        self.context
            .revalidate_model_key()
            .await
            .map_err(|error| self.reject_preparation(error))?;
        self.ensure_attempt_live()?;
        self.ensure_preparation_allowed()
    }

    fn ensure_attempt_live(&self) -> Result<(), PluginFault> {
        let kind = if self.context.cancellation().is_cancelled() {
            Some(ProviderErrorKind::Cancelled)
        } else if self.context.deadline().is_elapsed() {
            Some(ProviderErrorKind::Timeout)
        } else {
            None
        };
        match kind {
            Some(kind) => {
                Err(self.reject_preparation(ProviderError::new(kind, self.send_state.get())))
            }
            None => Ok(()),
        }
    }
}

fn rejection() -> PluginFault {
    PluginFault::new(
        ErrorCode::Rejected,
        "managed upstream request preparation rejected",
    )
}
