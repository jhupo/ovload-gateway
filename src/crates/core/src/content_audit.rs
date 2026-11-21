//! Protocol-independent audit boundary shared by HTTP, SSE and WebSocket execution.
use crate::{
    engine::{
        CommitRequirement, CoordinatedEvent, EngineError,
        authentication::ModelKeyIdentity,
        execution::{ExecutionSession, ResponseCommit},
    },
    error::GatewayError,
    event::{GatewayEvent, ProviderEvent, ProviderResponseHeader},
};
use futures::future::BoxFuture;
use serde_json::Value;
use std::sync::Arc;

#[derive(Clone)]
pub struct AuditContext {
    pub request_id: String,
    pub identity: ModelKeyIdentity,
    pub groups: Vec<String>,
    pub endpoint: String,
    pub model: String,
    pub key_name: String,
}
#[derive(Clone)]
pub struct AuditPlan {
    pub context: AuditContext,
    pub config: Value,
}
pub trait ContentAudit: Send + Sync {
    fn prepare(
        &self,
        context: AuditContext,
        input: String,
    ) -> BoxFuture<'_, Result<Option<AuditPlan>, GatewayError>>;
    fn evaluate<'a>(
        &'a self,
        plan: &'a AuditPlan,
        stage: &'a str,
        text: &'a str,
        overflow: bool,
    ) -> BoxFuture<'a, Result<(), GatewayError>>;
}

/// Extract human text while excluding inline images, URLs and credentials.
pub fn append_text(value: &Value, output: &mut String, maximum: usize) {
    let mut count = output.chars().count();
    append_text_counted(value, output, &mut count, maximum);
}
fn append_piece(piece: &str, output: &mut String, count: &mut usize, maximum: usize) {
    for character in piece
        .chars()
        .take(maximum.saturating_add(1).saturating_sub(*count))
    {
        output.push(character);
        *count += 1;
    }
}
fn append_text_counted(value: &Value, output: &mut String, count: &mut usize, maximum: usize) {
    if *count > maximum {
        return;
    }
    match value {
        Value::String(s) => {
            append_piece(s, output, count, maximum);
            append_piece("\n", output, count, maximum);
        }
        Value::Array(a) => {
            for v in a {
                append_text_counted(v, output, count, maximum);
            }
        }
        Value::Object(o) => {
            for (key, v) in o {
                if [
                    "messages",
                    "input",
                    "instructions",
                    "content",
                    "text",
                    "output_text",
                    "delta",
                    "output",
                    "choices",
                    "message",
                    "arguments",
                    "prompt",
                    "query",
                    "system",
                ]
                .contains(&key.as_str())
                {
                    append_text_counted(v, output, count, maximum);
                }
            }
        }
        _ => {}
    }
}
fn append_events(events: &[ProviderEvent], text: &mut String, count: &mut usize, max: usize) {
    for event in events {
        if *count > max {
            break;
        }
        let mut canonical = false;
        for fact in event.canonical_facts() {
            let piece = match fact {
                GatewayEvent::TextDelta(d) => Some(d.text.as_str()),
                GatewayEvent::ReasoningDelta(d) => Some(d.text.as_str()),
                GatewayEvent::ToolCallDelta(d) => Some(d.arguments_delta.as_str()),
                _ => None,
            };
            if let Some(piece) = piece {
                canonical = true;
                append_piece(piece, text, count, max);
            }
        }
        if !canonical && let Some(wire) = event.wire_event() {
            if wire.has_json_data() {
                append_text_counted(wire.data(), text, count, max);
            } else if let Some(bytes) = wire.raw_json_body().or(wire.raw_http_body_bytes()) {
                if let Ok(value) = serde_json::from_slice::<Value>(bytes) {
                    append_text_counted(&value, text, count, max);
                } else if let Ok(value) = std::str::from_utf8(bytes) {
                    append_piece(value, text, count, max);
                }
            }
        }
    }
}

pub struct AuditedSession {
    inner: Box<dyn ExecutionSession>,
    port: Arc<dyn ContentAudit>,
    plan: AuditPlan,
    checked: bool,
    text: String,
    text_chars: usize,
    buffered: Option<Vec<ProviderEvent>>,
}
impl AuditedSession {
    pub fn new(
        inner: Box<dyn ExecutionSession>,
        port: Arc<dyn ContentAudit>,
        plan: AuditPlan,
    ) -> Self {
        Self {
            inner,
            port,
            plan,
            checked: false,
            text: String::new(),
            text_chars: 0,
            buffered: None,
        }
    }
    fn limit(&self) -> usize {
        self.plan.config["content"]["maxOutputChars"]
            .as_str()
            .and_then(|s| s.parse().ok())
            .unwrap_or(100000)
    }
    async fn inspect(&mut self, overflow: bool) -> Result<(), EngineError> {
        if self.checked {
            return Ok(());
        }
        self.checked = true;
        if let Err(error) = self
            .port
            .evaluate(&self.plan, "output", &self.text, overflow)
            .await
        {
            let _ = self.inner.discard_pending_delivery();
            let status = self.plan.config["content"]["blockStatus"]
                .as_str()
                .and_then(|s| s.parse().ok())
                .unwrap_or(403);
            let _ = self.inner.record_client_status(status).await;
            self.inner.cancel();
            return Err(EngineError::ContentAudit(error));
        }
        Ok(())
    }
    async fn buffer(&mut self) -> Result<Vec<ProviderEvent>, EngineError> {
        let max = self.limit();
        let events = match self
            .inner
            .collect_uncommitted_bounded(max.saturating_mul(32).saturating_add(1048576))
            .await
        {
            Ok(events) => events,
            Err(EngineError::AuditBufferExceeded) => {
                self.inspect(true).await?;
                return Err(EngineError::AuditBufferExceeded);
            }
            Err(e) => return Err(e),
        };
        append_events(&events, &mut self.text, &mut self.text_chars, max);
        self.inspect(self.text_chars > max).await?;
        Ok(events)
    }
}
impl ExecutionSession for AuditedSession {
    fn response_commit(&self) -> ResponseCommit {
        self.inner.response_commit()
    }
    fn trace(&self) -> crate::diagnostics::TraceContext {
        self.inner.trace()
    }
    fn next_event(&mut self) -> BoxFuture<'_, Result<Option<CoordinatedEvent>, EngineError>> {
        Box::pin(async move {
            if self.plan.config["content"]["delivery"] == "buffered" {
                if !self.checked {
                    self.buffered = Some(self.buffer().await?);
                }
                if let Some(events) = self.buffered.take() {
                    return CoordinatedEvent::try_batch(
                        events,
                        CommitRequirement::CommitBeforeDelivery,
                    )
                    .map(Some);
                }
                return self.inner.next_event().await;
            }
            let event = self.inner.next_event().await?;
            if let Some(event) = event {
                let requirement = event.commit_requirement();
                let events = event.into_provider_events();
                let max = self.limit();
                append_events(&events, &mut self.text, &mut self.text_chars, max);
                Ok(Some(CoordinatedEvent::try_batch(events, requirement)?))
            } else {
                self.inspect(self.text_chars > self.limit()).await?;
                Ok(None)
            }
        })
    }
    fn collect_uncommitted(&mut self) -> BoxFuture<'_, Result<Vec<ProviderEvent>, EngineError>> {
        Box::pin(async move { self.buffer().await })
    }
    fn response_headers(&self) -> &[ProviderResponseHeader] {
        self.inner.response_headers()
    }
    fn response_status_code(&self) -> Option<u16> {
        self.inner.response_status_code()
    }
    fn discard_pending_delivery(&mut self) -> Result<(), EngineError> {
        self.buffered = None;
        self.inner.discard_pending_delivery()
    }
    fn commit_downstream(&mut self, status: Option<u16>) -> BoxFuture<'_, Result<(), EngineError>> {
        self.inner.commit_downstream(status)
    }
    fn record_client_status(&mut self, status: u16) -> BoxFuture<'_, Result<(), EngineError>> {
        self.inner.record_client_status(status)
    }
    fn is_finalized(&self) -> bool {
        self.checked && self.inner.is_finalized()
    }
    fn cancel(&self) {
        self.inner.cancel();
    }
    fn detach_finalize(mut self: Box<Self>) -> BoxFuture<'static, ()> {
        Box::pin(async move {
            if !self.checked && !self.text.is_empty() {
                let overflow = self.text_chars > self.limit();
                let _ = self.inspect(overflow).await;
            }
            self.inner.detach_finalize().await;
        })
    }
}

#[cfg(test)]
mod tests {
    use super::*;
    use crate::{
        access::{TenantId, UserId},
        error::GatewayErrorKind,
        event::TextDelta,
        policy::ClientApiKeyId,
    };
    use serde_json::json;
    use std::sync::{
        Mutex,
        atomic::{AtomicUsize, Ordering},
    };
    struct Audit {
        seen: Mutex<Vec<(String, bool)>>,
    }
    impl ContentAudit for Audit {
        fn prepare(
            &self,
            _: AuditContext,
            _: String,
        ) -> BoxFuture<'_, Result<Option<AuditPlan>, GatewayError>> {
            Box::pin(async { Ok(None) })
        }
        fn evaluate<'a>(
            &'a self,
            _: &'a AuditPlan,
            _: &'a str,
            text: &'a str,
            overflow: bool,
        ) -> BoxFuture<'a, Result<(), GatewayError>> {
            Box::pin(async move {
                self.seen.lock().unwrap().push((text.to_owned(), overflow));
                if text.contains("secret") || overflow {
                    Err(GatewayError::new(GatewayErrorKind::PolicyDenied, "blocked"))
                } else {
                    Ok(())
                }
            })
        }
    }
    struct Session {
        events: Vec<ProviderEvent>,
        committed: Arc<AtomicUsize>,
        cancelled: Arc<AtomicUsize>,
    }
    impl ExecutionSession for Session {
        fn next_event(&mut self) -> BoxFuture<'_, Result<Option<CoordinatedEvent>, EngineError>> {
            Box::pin(async move {
                if self.events.is_empty() {
                    Ok(None)
                } else {
                    Ok(Some(CoordinatedEvent::try_batch(
                        std::mem::take(&mut self.events),
                        CommitRequirement::CommitBeforeDelivery,
                    )?))
                }
            })
        }
        fn collect_uncommitted(
            &mut self,
        ) -> BoxFuture<'_, Result<Vec<ProviderEvent>, EngineError>> {
            Box::pin(async move { Ok(std::mem::take(&mut self.events)) })
        }
        fn response_headers(&self) -> &[ProviderResponseHeader] {
            &[]
        }
        fn discard_pending_delivery(&mut self) -> Result<(), EngineError> {
            Ok(())
        }
        fn commit_downstream(&mut self, _: Option<u16>) -> BoxFuture<'_, Result<(), EngineError>> {
            Box::pin(async move {
                self.committed.fetch_add(1, Ordering::SeqCst);
                Ok(())
            })
        }
        fn record_client_status(&mut self, _: u16) -> BoxFuture<'_, Result<(), EngineError>> {
            Box::pin(async { Ok(()) })
        }
        fn is_finalized(&self) -> bool {
            self.events.is_empty()
        }
        fn cancel(&self) {
            self.cancelled.fetch_add(1, Ordering::SeqCst);
        }
        fn detach_finalize(self: Box<Self>) -> BoxFuture<'static, ()> {
            Box::pin(async {})
        }
    }
    fn session(
        text: &str,
        delivery: &str,
    ) -> (
        AuditedSession,
        Arc<Audit>,
        Arc<AtomicUsize>,
        Arc<AtomicUsize>,
    ) {
        let audit = Arc::new(Audit {
            seen: Mutex::new(vec![]),
        });
        let committed = Arc::new(AtomicUsize::new(0));
        let cancelled = Arc::new(AtomicUsize::new(0));
        let plan = AuditPlan {
            context: AuditContext {
                request_id: "audit-test".into(),
                identity: ModelKeyIdentity {
                    key_id: ClientApiKeyId::new("audit-test").unwrap(),
                    tenant_id: TenantId::new(uuid::Uuid::now_v7()),
                    user_id: UserId::new(uuid::Uuid::now_v7()),
                    key_generation: 1,
                    user_generation: 1,
                    tenant_generation: 1,
                },
                groups: vec![],
                endpoint: "test".into(),
                model: "test".into(),
                key_name: "test".into(),
            },
            config: json!({"content":{"delivery":delivery,"maxOutputChars":"128","blockStatus":"403"}}),
        };
        let inner = Session {
            events: vec![ProviderEvent::canonical(GatewayEvent::TextDelta(
                TextDelta {
                    content_index: 0,
                    text: text.into(),
                },
            ))],
            committed: committed.clone(),
            cancelled: cancelled.clone(),
        };
        (
            AuditedSession::new(Box::new(inner), audit.clone(), plan),
            audit,
            committed,
            cancelled,
        )
    }
    #[test]
    fn unicode_limits_exclude_image_urls_and_credentials() {
        let value = json!({"messages":[{"content":[{"text":"中文"},{"image_url":{"url":"secret-image-url"}}]}],"api_key":"private-key"});
        let mut text = String::new();
        append_text(&value, &mut text, 128);
        assert_eq!(text, "中文\n");
        let mut text = String::new();
        append_text(&json!({"input":"你好世界"}), &mut text, 2);
        assert_eq!(text, "你好世");
    }
    #[test]
    fn buffered_block_checks_before_any_delivery_or_commit() {
        futures::executor::block_on(async {
            let (mut s, audit, committed, cancelled) = session("a secret response", "buffered");
            assert!(matches!(
                s.next_event().await,
                Err(EngineError::ContentAudit(_))
            ));
            assert_eq!(committed.load(Ordering::SeqCst), 0);
            assert_eq!(cancelled.load(Ordering::SeqCst), 1);
            assert_eq!(audit.seen.lock().unwrap()[0].0, "a secret response");
        });
    }
    #[test]
    fn approved_stream_retains_commit_barrier_and_exact_events() {
        futures::executor::block_on(async {
            let (mut s, audit, committed, _) = session("hello", "buffered");
            let batch = s.next_event().await.unwrap().unwrap();
            assert_eq!(
                batch.commit_requirement(),
                CommitRequirement::CommitBeforeDelivery
            );
            let facts = batch.into_provider_events();
            assert!(
                matches!(&facts[0].canonical_facts()[0],GatewayEvent::TextDelta(d) if d.text=="hello")
            );
            s.commit_downstream(Some(200)).await.unwrap();
            assert!(s.next_event().await.unwrap().is_none());
            assert_eq!(committed.load(Ordering::SeqCst), 1);
            assert_eq!(audit.seen.lock().unwrap().len(), 1);
        });
    }
    #[test]
    fn json_delivery_and_overflow_use_the_same_policy_gate() {
        futures::executor::block_on(async {
            let (mut s, _, committed, _) = session("secret", "buffered");
            assert!(matches!(
                s.collect_uncommitted().await,
                Err(EngineError::ContentAudit(_))
            ));
            assert_eq!(committed.load(Ordering::SeqCst), 0);
            let (mut s, audit, _, _) = session(&"a".repeat(200), "buffered");
            assert!(s.collect_uncommitted().await.is_err());
            assert!(audit.seen.lock().unwrap()[0].1);
        });
    }
    #[test]
    fn observe_stream_is_delivered_then_evaluated_once() {
        futures::executor::block_on(async {
            let (mut s, audit, _, _) = session("hello", "observe");
            assert!(s.next_event().await.unwrap().is_some());
            assert!(audit.seen.lock().unwrap().is_empty());
            assert!(!s.is_finalized());
            s.commit_downstream(Some(200)).await.unwrap();
            assert!(s.next_event().await.unwrap().is_none());
            assert_eq!(audit.seen.lock().unwrap().len(), 1);
            assert!(s.is_finalized());
        });
    }
}
