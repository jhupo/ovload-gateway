//! Request-local queue leases. Dropping a cancelled wait removes its live observation.
use serde_json::Value;
use std::{
    collections::BTreeMap,
    sync::{Mutex, OnceLock},
};
fn registry() -> &'static Mutex<BTreeMap<String, Value>> {
    static ITEMS: OnceLock<Mutex<BTreeMap<String, Value>>> = OnceLock::new();
    ITEMS.get_or_init(Mutex::default)
}
pub struct QueueGuard(String);
impl QueueGuard {
    pub fn enter(id: String, data: Value) -> Self {
        registry()
            .lock()
            .unwrap_or_else(|e| e.into_inner())
            .insert(id.clone(), data);
        Self(id)
    }
}
impl Drop for QueueGuard {
    fn drop(&mut self) {
        registry()
            .lock()
            .unwrap_or_else(|e| e.into_inner())
            .remove(&self.0);
    }
}
pub fn snapshot() -> BTreeMap<String, Value> {
    registry().lock().unwrap_or_else(|e| e.into_inner()).clone()
}

#[cfg(test)]
mod tests {
    use super::*;
    #[test]
    fn dropping_wait_removes_request() {
        let guard = QueueGuard::enter(
            "queue-drop-test".into(),
            serde_json::json!({"layer":"account"}),
        );
        assert!(snapshot().contains_key("queue-drop-test"));
        drop(guard);
        assert!(!snapshot().contains_key("queue-drop-test"));
    }
    #[test]
    fn cancelling_a_pending_capacity_wait_removes_its_observation() {
        use crate::concurrency::{
            CapacityWait, ConcurrencyQueuePolicy, ConcurrencyWaitBudget, ConcurrencyWaitQueue,
        };
        use std::{future::Future, task::Context, time::Duration};
        let queue = ConcurrencyWaitQueue::<u32>::default();
        let budget = ConcurrencyWaitBudget::default();
        let mut task = Box::pin(async {
            let mut wait = CapacityWait::new(
                &queue,
                ConcurrencyQueuePolicy {
                    max_waiting: 1,
                    timeout: Duration::from_secs(5),
                },
                None,
                &budget,
            )
            .with_periodic_recheck(true)
            .with_monitoring(
                "queue-cancel-test".into(),
                serde_json::json!({"layer":"client"}),
            );
            wait.wait(&[1]).await
        });
        let mut cx = Context::from_waker(futures::task::noop_waker_ref());
        assert!(task.as_mut().poll(&mut cx).is_pending());
        assert!(snapshot().contains_key("queue-cancel-test"));
        drop(task);
        assert!(!snapshot().contains_key("queue-cancel-test"));
    }
}
