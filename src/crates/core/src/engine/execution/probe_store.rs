//! 诊断探测使用的脱敏观测事实

use crate::{account::ProviderAccountId, identity::ProviderKind, routing::UpstreamModelId};

pub(super) struct ProbeObservation {
    pub(super) provider_kind: ProviderKind,
    pub(super) account_id: ProviderAccountId,
    pub(super) upstream_model: UpstreamModelId,
}
