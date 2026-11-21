//! Conditional state promotion must not overwrite a concurrent credential failure.

use super::*;
use ovload_core::error::StoreErrorKind as CoreStoreErrorKind;

#[tokio::test]
async fn delayed_unknown_promotion_conflicts_after_invalid_and_explicit_recovery_succeeds() {
    let Some(database) = TestDatabase::create("provider_account_state_fence").await else {
        return;
    };
    let repository = PgProviderAccountRepository::new(
        database.pool.clone(),
        crate::postgres::credential_cipher(),
    );
    let anchor = Utc::now() + TimeDelta::hours(1);

    for (suffix, recovery_expected_state) in [
        ("unconditional", None),
        ("conditional", Some(CredentialState::Invalid)),
    ] {
        let account_id =
            ProviderAccountId::new(format!("acct_state_fence_{suffix}")).expect("account ID");
        let mut seed = account(account_id.as_str(), &format!("user-state-fence-{suffix}"));
        seed.credential_state = CredentialState::Unknown;
        seed.credential_observed_at = anchor;
        repository
            .insert_provider_account(seed)
            .await
            .expect("seed unknown account");

        let observed = repository
            .get_account(&account_id)
            .await
            .expect("pre-read account for promotion")
            .expect("account");
        assert_eq!(observed.credential_state(), CredentialState::Unknown);
        let revision = observed.revision();
        assert_eq!(revision.get(), 1);
        let late_promotion = AccountStateChange {
            account_id: account_id.clone(),
            expected_revision: revision,
            expected_state: Some(observed.credential_state()),
            credential_state: CredentialState::Ready,
            observed_at: SystemTime::from(anchor + TimeDelta::seconds(3)),
            error_reason: None,
            message: None,
        };

        repository
            .apply_state_change(AccountStateChange {
                account_id: account_id.clone(),
                expected_revision: revision,
                expected_state: None,
                credential_state: CredentialState::Invalid,
                observed_at: SystemTime::from(anchor + TimeDelta::seconds(1)),
                error_reason: Some(AccountErrorReason::CredentialInvalid),
                message: Some("Synthetic upstream 401.".to_owned()),
            })
            .await
            .expect("persist 401 failure using the same credential revision");
        let error = repository
            .apply_state_change(late_promotion)
            .await
            .expect_err("a later timestamp cannot bypass the expected-state predicate");
        assert_eq!(error.kind(), CoreStoreErrorKind::Conflict);
        let invalid = repository
            .load_provider_account(account_id.as_str())
            .await
            .expect("load account after rejected promotion")
            .expect("account");
        assert_eq!(invalid.summary.credential_state, CredentialState::Invalid);
        assert_eq!(invalid.summary.credential_revision.get(), revision.get());
        assert_eq!(
            invalid.summary.credential_observed_at.timestamp_micros(),
            (anchor + TimeDelta::seconds(1)).timestamp_micros()
        );
        assert_eq!(
            invalid.summary.last_error_message.as_deref(),
            Some("Synthetic upstream 401.")
        );

        repository
            .apply_state_change(AccountStateChange {
                account_id: account_id.clone(),
                expected_revision: revision,
                expected_state: recovery_expected_state,
                credential_state: CredentialState::Ready,
                observed_at: SystemTime::from(anchor + TimeDelta::seconds(4)),
                error_reason: None,
                message: None,
            })
            .await
            .expect("explicit recovery may restore the invalid credential");
        let recovered = repository
            .load_provider_account(account_id.as_str())
            .await
            .expect("load recovered account")
            .expect("account");
        assert_eq!(recovered.summary.credential_state, CredentialState::Ready);
        assert_eq!(recovered.summary.credential_revision.get(), revision.get());
        assert!(recovered.summary.last_error_reason.is_none());
        assert!(recovered.summary.last_error_message.is_none());

        let rotated_revision = repository
            .compare_and_swap_credentials(credential_update(
                account_id.as_str(),
                revision.get(),
                "synthetic-state-fence-rotation",
            ))
            .await
            .expect("rotate credential before stale observation");
        assert_eq!(rotated_revision.get(), 2);
        let stale = repository
            .apply_state_change(AccountStateChange {
                account_id: account_id.clone(),
                expected_revision: revision,
                expected_state: Some(CredentialState::Ready),
                credential_state: CredentialState::Invalid,
                observed_at: SystemTime::from(anchor + TimeDelta::seconds(6)),
                error_reason: Some(AccountErrorReason::CredentialInvalid),
                message: Some("Synthetic stale credential failure.".to_owned()),
            })
            .await
            .expect_err("matching state and a later observation cannot bypass credential revision");
        assert_eq!(stale.kind(), CoreStoreErrorKind::Conflict);
        let current = repository
            .load_provider_account(account_id.as_str())
            .await
            .expect("load account after rejected stale observation")
            .expect("account");
        assert_eq!(current.summary.credential_state, CredentialState::Ready);
        assert_eq!(current.summary.credential_revision, rotated_revision);
        assert!(current.summary.last_error_message.is_none());
    }

    database.close().await;
}
