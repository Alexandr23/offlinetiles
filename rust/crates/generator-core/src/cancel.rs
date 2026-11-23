//! Cooperative cancellation shared by every stage of the pipeline.

use std::sync::atomic::{AtomicBool, Ordering};
use std::sync::Arc;

use tokio::sync::Notify;

#[derive(Debug, Clone, Default)]
pub struct CancelToken {
    inner: Arc<Inner>,
}

#[derive(Debug, Default)]
struct Inner {
    flag: AtomicBool,
    notify: Notify,
}

impl CancelToken {
    pub fn new() -> Self {
        Self::default()
    }

    /// Request cancellation. Idempotent.
    pub fn cancel(&self) {
        self.inner.flag.store(true, Ordering::SeqCst);
        self.inner.notify.notify_waiters();
    }

    pub fn is_cancelled(&self) -> bool {
        self.inner.flag.load(Ordering::SeqCst)
    }

    /// Resolve once cancellation has been requested.
    pub async fn cancelled(&self) {
        if self.is_cancelled() {
            return;
        }
        let notified = self.inner.notify.notified();
        tokio::pin!(notified);
        notified.as_mut().enable();
        if self.is_cancelled() {
            return;
        }
        notified.await;
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    #[tokio::test]
    async fn cancel_wakes_waiters() {
        let token = CancelToken::new();
        let t2 = token.clone();
        let waiter = tokio::spawn(async move {
            t2.cancelled().await;
            true
        });
        tokio::task::yield_now().await;
        assert!(!token.is_cancelled());
        token.cancel();
        assert!(waiter.await.unwrap());
        assert!(token.is_cancelled());
        // already cancelled → returns immediately
        token.cancelled().await;
    }
}
