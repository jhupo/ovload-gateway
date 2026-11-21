// Modified for Ovload on 2026-10-27: workspace integration.

//! 多 Provider 网关的 PostgreSQL 持久化与 Redis 协调 adapter
//!
//! 业务规则与 port 由 `ovload-core` / `ovload-admin` 拥有
//! 本 crate 只负责把 PostgreSQL 业务表
//! 和可丢失 Redis 状态映射为明确的基础设施操作

use std::sync::Arc;
use std::time::{Duration, SystemTime};
use std::{fmt, num::NonZeroU64};

use ovload_admin::model::auth::{AdminAuditEvent as AdminAuditModel, AuthSession, SessionSubject};
use ovload_admin::model::settings::{
    AdminApiKey, AdminApiKeyMutation, ModelMappings, ReplaceRuntimeSettings,
    RotationStrategy as AdminRotationStrategy, RuntimeSettings as AdminRuntimeSettings,
};
use ovload_admin::model::{MutationContext, Revision as AdminRevision};
use ovload_admin::ports::backup::BackupStorePorts;
use ovload_admin::ports::store::{
    AdminAccountStorePorts, AdminStoreError, AdminStoreErrorKind, AdminStorePorts,
    AdminStoreResult, AuthStore, SettingsStore,
};
use ovload_core::CoreStorePorts;
use ovload_core::health::{HealthProbe, HealthState};
use ovload_core::provider_ports::ProviderStorePorts;
use ovload_core::task::{
    DaemonRestartPolicy, ScheduledTask, WorkerContribution, WorkerCycleContext, WorkerId,
    WorkerKind, WorkerLeaderLeasePort, WorkerLeaseRequest, WorkerRegistration, WorkerRunnable,
    WorkerSchedule, WorkerTaskError,
};
use serde::Deserialize;
use serde_json::{Map, Value};

mod admin_adapter;
mod bundle;
mod config;
mod lease_renewal;
mod value;
mod workers;

pub mod backup;
pub mod postgres;
pub mod redis;

pub(crate) use admin_adapter::*;
pub use bundle::*;
pub use config::*;
pub use value::*;
pub(crate) use workers::*;
pub use workers::{CommandStoreDrainError, PostgresHealthProbe, RequestAnalyticsCycle};
