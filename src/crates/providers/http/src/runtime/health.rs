//! Revision-fenced public API credential health and transient rate-limit feedback.

use super::PublicApiProvider;
use ovload_core::{
    account::{AccountErrorReason, AccountStateChange, CredentialState, ProviderAccount},
    error::{ProviderError, ProviderErrorKind},
    provider_ports::ProviderCooldown,
};
use std::time::{Duration, SystemTime};

pub(super) fn cooldown_delay(error: &ProviderError) -> Duration {
    error
        .retry_after()
        .unwrap_or(Duration::from_secs(1))
        .clamp(Duration::from_secs(1), Duration::from_secs(3_600))
}

impl PublicApiProvider {
    pub(super) async fn record_failure(&self, account: &ProviderAccount, failure: &ProviderError) {
        if failure.send_state() == ovload_core::upstream::UpstreamSendState::NotSent {
            return;
        }
        let update = async {
            match failure.kind() {
                ProviderErrorKind::Unauthorized => self
                    .write_state(account, CredentialState::Invalid, false)
                    .await
                    .map(|_| ()),
                ProviderErrorKind::RateLimited => {
                    let until = SystemTime::now()
                        .checked_add(cooldown_delay(failure))
                        .ok_or(())?;
                    self.ports
                        .cooldowns()
                        .put_if_later(ProviderCooldown::new(
                            account.id().clone(),
                            account.revision(),
                            until,
                        ))
                        .await
                        .map_err(|_| ())?;
                    Ok(())
                }
                _ => Ok(()),
            }
        };
        if !matches!(
            tokio::time::timeout(Duration::from_secs(2), update).await,
            Ok(Ok(()))
        ) {
            tracing::warn!(account_id = %account.id(), "Standard API failure feedback could not be persisted");
        }
    }

    pub(super) async fn record_success(&self, account: &ProviderAccount, diagnostic: bool) {
        let update = async {
            if !self
                .write_state(account, CredentialState::Ready, diagnostic)
                .await?
            {
                return Ok(());
            }
            self.ports
                .cooldowns()
                .clear_after_success(account.id(), account.revision())
                .await
                .map_err(|_| ())?;
            Ok::<(), ()>(())
        };
        if !matches!(
            tokio::time::timeout(Duration::from_secs(2), update).await,
            Ok(Ok(()))
        ) {
            tracing::warn!(account_id = %account.id(), "Standard API success feedback could not be persisted");
        }
    }

    async fn write_state(
        &self,
        account: &ProviderAccount,
        state: CredentialState,
        diagnostic: bool,
    ) -> Result<bool, ()> {
        let current = self.account(account.id()).await.map_err(|_| ())?;
        if current.revision() != account.revision() || !current.enabled() {
            return Ok(false);
        }
        if state == CredentialState::Ready
            && !diagnostic
            && !matches!(
                current.credential_state(),
                CredentialState::Unknown | CredentialState::Ready
            )
        {
            return Ok(false);
        }
        let observed_at = SystemTime::now();
        if current.credential_state() != state {
            self.ports
                .accounts()
                .apply_state_change(AccountStateChange {
                    account_id: current.id().clone(),
                    expected_revision: current.revision(),
                    expected_state: (state == CredentialState::Ready && !diagnostic)
                        .then_some(current.credential_state()),
                    credential_state: state,
                    observed_at,
                    error_reason: (state == CredentialState::Invalid)
                        .then_some(AccountErrorReason::CredentialInvalid),
                    message: None,
                })
                .await
                .map_err(|_| ())?;
        }
        let updated = self.account(account.id()).await.map_err(|_| ())?;
        if updated.revision() != account.revision() || updated.credential_state() != state {
            return Ok(false);
        }
        Ok(true)
    }
}
