//! Bounded telemetry. Never captures OAuth recovery or raw request dump channels.
use chrono::Utc;
use ovload_admin::ports::monitoring::{LogConfig, MonitoringStore, RuntimeMonitoring};
use ovload_core::{
    health::{WorkerHealthSource, WorkerRuntimeState},
    task::*,
};
use serde_json::{Value, json};
use std::{
    collections::VecDeque,
    sync::{
        Arc, Mutex,
        atomic::{AtomicU64, Ordering},
    },
    time::Duration,
};
use tracing::{
    Event, Subscriber,
    field::{Field, Visit},
};
use tracing_subscriber::{Layer, layer::Context, registry::LookupSpan};

#[derive(Default)]
pub struct Capture {
    records: Mutex<VecDeque<Value>>,
    config: Mutex<LogConfig>,
    sequence: AtomicU64,
    dropped: AtomicU64,
    written: AtomicU64,
    failures: AtomicU64,
}
#[derive(Clone)]
pub(crate) struct CaptureLayer(pub Arc<Capture>);
#[derive(Default, Clone)]
struct Fields(serde_json::Map<String, Value>);
impl Visit for Fields {
    fn record_debug(&mut self, field: &Field, value: &dyn std::fmt::Debug) {
        self.record_str(field, &format!("{value:?}"));
    }
    fn record_str(&mut self, field: &Field, value: &str) {
        if matches!(
            field.name(),
            "message"
                | "request_id"
                | "model_request_id"
                | "provider"
                | "provider_kind"
                | "account_id"
                | "queue_layer"
                | "worker"
                | "operation"
                | "status"
                | "elapsed_milliseconds"
                | "error"
                | "reason"
                | "failure_class"
                | "stage"
                | "method"
                | "uri"
                | "headers_ms"
                | "event"
        ) {
            self.0.insert(field.name().into(), json!(redact(value)));
        }
    }
}
fn redact(value: &str) -> String {
    // Also suppress free-form credential text; explicit fields use an allowlist above.
    let lower = value.to_ascii_lowercase();
    if [
        "bearer ",
        "password=",
        "password:",
        "access_token",
        "refresh_token",
        "client_secret",
        "api_key=",
        "api_key:",
        "x-api-key",
        "sk-",
        "authorization:",
        "cookie:",
    ]
    .iter()
    .any(|v| lower.contains(v))
        || value.contains("://") && value.contains('@')
    {
        return "[redacted sensitive log message]".into();
    }
    value.chars().take(2048).collect()
}
impl<S: Subscriber + for<'a> LookupSpan<'a>> Layer<S> for CaptureLayer {
    fn on_new_span(
        &self,
        attrs: &tracing::span::Attributes<'_>,
        id: &tracing::Id,
        ctx: Context<'_, S>,
    ) {
        let mut fields = Fields::default();
        attrs.record(&mut fields);
        if let Some(span) = ctx.span(id) {
            span.extensions_mut().insert(fields);
        }
    }
    fn on_record(&self, id: &tracing::Id, values: &tracing::span::Record<'_>, ctx: Context<'_, S>) {
        if let Some(span) = ctx.span(id) {
            if let Some(fields) = span.extensions_mut().get_mut::<Fields>() {
                values.record(fields);
            }
        }
    }
    fn on_event(&self, event: &Event<'_>, ctx: Context<'_, S>) {
        let meta = event.metadata();
        if !(meta.target().starts_with("ovload_")
            || meta.target().starts_with("provider_")
            || matches!(
                meta.target(),
                "gateway_startup"
                    | "gateway_shutdown"
                    | "gateway_probe"
                    | "gateway_plugin"
                    | "plugin.maintenance"
                    | "request_trace"
                    | "xai_admin"
            ))
        {
            return;
        }
        let level = meta.level().as_str();
        let rank = |s: &str| match s {
            "ERROR" => 4,
            "WARN" => 3,
            "INFO" => 2,
            "DEBUG" => 1,
            _ => 0,
        };
        {
            let cfg = self.0.config.lock().unwrap_or_else(|e| e.into_inner());
            if !cfg.enabled || rank(level) < rank(&cfg.level) {
                return;
            }
        }
        let mut fields = Fields::default();
        if let Some(scope) = ctx.event_scope(event) {
            for span in scope.from_root() {
                if let Some(v) = span.extensions().get::<Fields>() {
                    fields.0.extend(v.0.clone());
                }
            }
        }
        event.record(&mut fields);
        let now = Utc::now();
        let seq = self.0.sequence.fetch_add(1, Ordering::Relaxed);
        let row = json!({"id":format!("{}-{}-{seq}",now.timestamp_nanos_opt().unwrap_or_default(),std::process::id()),"occurredAt":now,"level":level,"component":meta.target(),"message":fields.0.get("message").and_then(Value::as_str).unwrap_or(meta.name()),"requestId":fields.0.get("request_id").or_else(||fields.0.get("model_request_id")),"provider":fields.0.get("provider").or_else(||fields.0.get("provider_kind")),"accountId":fields.0.get("account_id"),"fields":fields.0});
        let mut rows = self.0.records.lock().unwrap_or_else(|e| e.into_inner());
        if rows.len() >= 4096 {
            self.0.dropped.fetch_add(1, Ordering::Relaxed);
            return;
        }
        rows.push_back(row);
    }
}

pub struct ProcessMetrics {
    workers: Arc<dyn WorkerHealthSource>,
    capture: Arc<Capture>,
    cpu: Mutex<Option<(u64, u64)>>,
}
impl ProcessMetrics {
    pub fn new(workers: Arc<dyn WorkerHealthSource>, capture: Arc<Capture>) -> Self {
        let metrics = Self {
            workers,
            capture,
            cpu: Mutex::new(None),
        };
        let _ = metrics.snapshot();
        metrics
    }
}
impl RuntimeMonitoring for ProcessMetrics {
    fn snapshot(&self) -> Value {
        let cpu = std::fs::read_to_string("/proc/stat").ok().and_then(|s| {
            let parts = s
                .lines()
                .next()?
                .split_whitespace()
                .skip(1)
                .take(8)
                .map(str::parse::<u64>)
                .collect::<Result<Vec<_>, _>>()
                .ok()?;
            if parts.len() < 5 {
                return None;
            }
            let total = parts.iter().sum();
            let idle = parts[3] + parts[4];
            let mut last = self.cpu.lock().unwrap_or_else(|e| e.into_inner());
            let prev = last.replace((total, idle));
            prev.and_then(|(t, i)| {
                (total > t)
                    .then(|| 100.0 * (1.0 - (idle.saturating_sub(i) as f64) / (total - t) as f64))
            })
        });
        let mem = std::fs::read_to_string("/proc/meminfo").unwrap_or_default();
        let memory = |key: &str| {
            mem.lines().find_map(|s| {
                s.strip_prefix(key)
                    .and_then(|v| v.split_whitespace().next()?.parse::<u64>().ok())
                    .map(|n| n * 1024)
            })
        };
        let total = memory("MemTotal:");
        let available = memory("MemAvailable:");
        let workers = self.workers.snapshot();
        let jobs=workers.iter().map(|w| json!({"id":format!("{:?}",w.key),"state":format!("{:?}",w.state),"failures":w.consecutive_failures,"cycles":w.completed_cycles,"lastSuccess":w.last_success_at.map(chrono::DateTime::<Utc>::from),"lastFailure":w.last_failure_at.map(chrono::DateTime::<Utc>::from)})).collect::<Vec<_>>();
        json!({"sampledAt":Utc::now(),"cpuPercent":cpu,"memory":{"total":total,"used":total.zip(available).map(|(t,a)|t.saturating_sub(a))},"jobs":{"total":workers.len(),"running":workers.iter().filter(|w|w.state==WorkerRuntimeState::Running).count(),"failed":workers.iter().filter(|w|w.consecutive_failures>0).count(),"items":jobs},"logs":{"queued":self.capture.records.lock().unwrap_or_else(|e|e.into_inner()).len(),"written":self.capture.written.load(Ordering::Relaxed),"dropped":self.capture.dropped.load(Ordering::Relaxed),"writeFailures":self.capture.failures.load(Ordering::Relaxed)}})
    }
}

pub fn worker(
    store: Arc<dyn MonitoringStore>,
    capture: Arc<Capture>,
) -> Result<WorkerContribution, WorkerDefinitionError> {
    let id = WorkerId::try_new(WorkerKind::OpsFlush, "system-logs")?;
    let schedule = WorkerSchedule::try_new(
        Duration::from_secs(2),
        Duration::from_secs(1),
        Duration::from_secs(5),
        Duration::from_secs(60),
        Duration::from_secs(30),
    )?;
    Ok(WorkerContribution::Registration(
        WorkerRegistration::try_new(
            id,
            WorkerRunnable::Scheduled {
                schedule,
                lease: None,
                task: Box::new(LogTask { store, capture }),
            },
        )?,
    ))
}
struct LogTask {
    store: Arc<dyn MonitoringStore>,
    capture: Arc<Capture>,
}
impl ScheduledTask for LogTask {
    fn run_cycle(
        &self,
        _context: WorkerCycleContext,
    ) -> futures::future::BoxFuture<'_, Result<(), WorkerTaskError>> {
        Box::pin(async move {
            // Clone until commit, preserving queued events on write failure or cancellation.
            let rows = self
                .capture
                .records
                .lock()
                .unwrap_or_else(|e| e.into_inner())
                .iter()
                .take(250)
                .cloned()
                .collect::<Vec<_>>();
            match self.store.ingest(&rows).await {
                Ok(cfg) => {
                    let written = if cfg.enabled { rows.len() as u64 } else { 0 };
                    *self
                        .capture
                        .config
                        .lock()
                        .unwrap_or_else(|e| e.into_inner()) = cfg;
                    self.capture
                        .records
                        .lock()
                        .unwrap_or_else(|e| e.into_inner())
                        .drain(..rows.len());
                    self.capture.written.fetch_add(written, Ordering::Relaxed);
                    Ok(())
                }
                Err(_) => {
                    self.capture.failures.fetch_add(1, Ordering::Relaxed);
                    Err(WorkerTaskError::safe("system log persistence failed"))
                }
            }
        })
    }
}

#[cfg(test)]
mod tests {
    use super::*;
    use tracing_subscriber::layer::SubscriberExt;
    #[test]
    fn capture_inherits_correlation_and_excludes_sensitive_channels() {
        let capture = Arc::new(Capture::default());
        let subscriber = tracing_subscriber::registry().with(CaptureLayer(capture.clone()));
        tracing::subscriber::with_default(subscriber, || {
            let span = tracing::info_span!("request", request_id = "monitoring-unit-request");
            let _entered = span.enter();
            tracing::info!(target:"ovload_test",password="should-not-be-captured","request completed");
            tracing::info!(target:"gateway_startup","gateway ready");
            tracing::info!(target:"request_dump","raw request secret");
            tracing::info!(target:"oauth_recovery","raw OAuth secret");
        });
        let rows = capture.records.lock().unwrap();
        assert_eq!(rows.len(), 2);
        assert_eq!(rows[0]["requestId"], "monitoring-unit-request");
        assert!(!rows[0].to_string().contains("should-not-be-captured"));
    }
    #[test]
    fn credentials_are_not_indexed() {
        for text in [
            "Bearer secret",
            "https://user:secret@host",
            "access_token=secret",
        ] {
            assert!(!redact(text).contains("secret"));
        }
        assert_eq!(redact("worker cycle completed"), "worker cycle completed");
    }
}
