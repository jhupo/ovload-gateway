// Modified for Ovload on 2026-10-27: workspace integration.

//! 验证原生续接标识的脱敏、账号绑定与 Client Key 隔离

use ovload_core::account::ProviderAccountId;
use ovload_core::engine::continuation::{
    ContinuationBinding, NativeContinuationPin, PreviousResponseId,
};
use ovload_core::routing::ProviderKind;

fn pin() -> NativeContinuationPin {
    NativeContinuationPin::new(
        PreviousResponseId::new("response-private"),
        PreviousResponseId::new("upstream-private"),
        crate::model_keys::identity("key_client"),
        ProviderKind::new("openai").expect("valid provider"),
        ProviderAccountId::new("acct_codex").expect("valid account"),
    )
}

#[test]
fn native_pin_debug_should_redact_previous_response_id() {
    let debug = format!("{:?}", pin());
    assert!(!debug.contains("response-private"));
    assert!(!debug.contains("upstream-private"));
}

#[test]
fn external_binding_debug_should_redact_previous_response_id() {
    let binding = ContinuationBinding::External(PreviousResponseId::new("external-private"));

    assert!(!format!("{binding:?}").contains("external-private"));
}

#[test]
fn opaque_response_id_preserves_any_codex_string_without_debug_disclosure() {
    let value = format!("resp_{}\0opaque", "x".repeat(257));
    let response_id = PreviousResponseId::new(value.clone());

    assert_eq!(response_id.as_str(), value);
    assert!(!format!("{response_id:?}").contains(&value));
}

#[test]
fn native_pin_should_reject_different_account() {
    assert!(!pin().matches(
        &ProviderKind::new("openai").expect("valid provider"),
        &ProviderAccountId::new("acct_other").expect("valid account"),
    ));
}

#[test]
fn native_pin_should_reject_different_client_api_key() {
    assert!(!pin().matches_identity(&crate::model_keys::identity("key_other")));
}

#[test]
fn native_pin_rejects_owner_and_generation_changes() {
    let mut owner = crate::model_keys::identity("key_client");
    owner.tenant_generation += 1;
    assert!(!pin().matches_identity(&owner));
    owner = crate::model_keys::identity("key_client");
    owner.user_generation += 1;
    assert!(!pin().matches_identity(&owner));
    owner = crate::model_keys::identity("key_client");
    owner.key_generation += 1;
    assert!(!pin().matches_identity(&owner));
    owner = crate::model_keys::identity("key_client");
    owner.tenant_id = ovload_core::access::TenantId::new(uuid::Uuid::from_u128(3));
    assert!(!pin().matches_identity(&owner));
}
