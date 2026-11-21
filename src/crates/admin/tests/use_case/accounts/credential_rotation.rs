//! Stored account identity determines credential rotation dispatch.

use super::*;
use ovload_admin::model::provider_credentials::{CredentialMutation, RotateCredential};

fn rotation(account_id: &str) -> RotateCredential {
    RotateCredential {
        mutation: CredentialMutation {
            context: context("rotation-provider-dispatch"),
            account_id: ProviderAccountId::new(account_id).unwrap(),
        },
        provider_material: document(),
        settings: None,
    }
}

#[tokio::test]
async fn rotation_dispatches_to_the_persisted_provider() {
    for kind in ["openai_api", "xai"] {
        let log = events();
        let provider = FakeProviderAdmin::new(kind, log.clone());
        let store = FakeAccountStore::new(kind, log.clone());
        let services = accounts_service(provider, store.clone()).await;
        let result = services
            .credentials()
            .rotate(rotation("acct_test"))
            .await
            .unwrap();

        assert_eq!(result.account_id.as_str(), "acct_test");
        assert_eq!(result.config_revision, revision(2));
        let recorded = recorded(&log);
        assert!(recorded.contains(&"store.credential_details_by_id"));
        assert!(recorded.contains(&"provider.prepare_rotation"));
        assert!(recorded.contains(&"store.commit_rotation"));
        assert_eq!(store.audit_requests(), ["rotation-provider-dispatch"]);
    }
}

#[tokio::test]
async fn absent_or_unregistered_accounts_never_prepare_or_commit_rotation() {
    for (stored_kind, requested_id) in [
        ("openai_api", "acct_missing"),
        ("unregistered", "acct_test"),
    ] {
        let log = events();
        let provider = FakeProviderAdmin::new("openai_api", log.clone());
        let store = FakeAccountStore::new(stored_kind, log.clone());
        let services = accounts_service(provider, store.clone()).await;

        assert!(
            services
                .credentials()
                .rotate(rotation(requested_id))
                .await
                .is_err()
        );
        let recorded = recorded(&log);
        assert!(!recorded.contains(&"provider.prepare_rotation"));
        assert!(!recorded.contains(&"store.commit_rotation"));
        assert!(store.audit_requests().is_empty());
    }
}
