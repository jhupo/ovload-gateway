// Modified for Ovload on 2026-10-27: workspace integration.

//! 验证上游发送状态保留发送不确定与已发送的区别

use ovload_core::upstream::UpstreamSendState;

#[test]
fn upstream_send_state_should_keep_ambiguous_distinct_from_sent() {
    assert_ne!(UpstreamSendState::Ambiguous, UpstreamSendState::Sent);
}
