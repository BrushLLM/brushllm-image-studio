//! Cancelling drops the HTTP future, including response downloads. The server
//! may already have accepted the work; cancellation is not a billing rollback.
use std::{
    collections::{HashMap, VecDeque},
    future::Future,
    sync::{
        atomic::{AtomicBool, Ordering},
        Arc, Mutex,
    },
    task::{Poll, Waker},
};

#[derive(Default)]
struct Signal {
    cancelled: AtomicBool,
    waker: Mutex<Option<Waker>>,
}
#[derive(Default)]
struct Registry {
    active: HashMap<String, Arc<Signal>>,
    cancelled: VecDeque<String>,
}
#[derive(Default)]
pub struct AiRequests {
    registry: Mutex<Registry>,
}

impl AiRequests {
    pub fn cancel(&self, id: String) {
        let signal = {
            let mut registry = self.registry.lock().unwrap();
            if let Some(signal) = registry.active.remove(&id) {
                Some(signal)
            } else {
                // Handle cancellation arriving before the request IPC registers.
                if registry.cancelled.len() == 64 {
                    registry.cancelled.pop_front();
                }
                registry.cancelled.push_back(id);
                None
            }
        };
        if let Some(signal) = signal {
            signal.cancelled.store(true, Ordering::SeqCst);
            if let Some(waker) = signal.waker.lock().unwrap().take() {
                waker.wake();
            }
        }
    }

    pub async fn run<T>(
        &self,
        id: String,
        work: impl Future<Output = Result<T, String>>,
    ) -> Result<T, String> {
        let signal = Arc::new(Signal::default());
        {
            let mut registry = self.registry.lock().unwrap();
            if id.is_empty() || id.len() > 128 || registry.active.contains_key(&id) {
                return Err("invalid or duplicate request id".into());
            }
            if let Some(index) = registry.cancelled.iter().position(|key| key == &id) {
                registry.cancelled.remove(index);
                return Err("cancelled".into());
            }
            registry.active.insert(id.clone(), signal.clone());
        }
        let mut work = std::pin::pin!(work);
        let result = std::future::poll_fn(|cx| {
            *signal.waker.lock().unwrap() = Some(cx.waker().clone());
            if signal.cancelled.load(Ordering::SeqCst) {
                Poll::Ready(Err("cancelled".into()))
            } else {
                work.as_mut().poll(cx)
            }
        })
        .await;
        self.registry.lock().unwrap().active.remove(&id);
        result
    }
}

#[cfg(test)]
mod tests {
    use super::*;
    use std::{
        pin::Pin,
        task::{Context, Wake},
    };

    struct WakeFlag(AtomicBool);
    impl Wake for WakeFlag {
        fn wake(self: Arc<Self>) {
            self.0.store(true, Ordering::SeqCst);
        }
    }
    struct PendingRequest(Arc<AtomicBool>);
    impl Future for PendingRequest {
        type Output = Result<(), String>;
        fn poll(self: Pin<&mut Self>, _: &mut Context<'_>) -> Poll<Self::Output> {
            Poll::Pending
        }
    }
    impl Drop for PendingRequest {
        fn drop(&mut self) {
            self.0.store(true, Ordering::SeqCst);
        }
    }

    #[test]
    fn cancellation_wakes_and_drops_only_the_matching_request() {
        let requests = AiRequests::default();
        let dropped = Arc::new(AtomicBool::new(false));
        let other_dropped = Arc::new(AtomicBool::new(false));
        let wake = Arc::new(WakeFlag(AtomicBool::new(false)));
        let waker = Waker::from(wake.clone());
        let mut cx = Context::from_waker(&waker);
        let mut first = Box::pin(requests.run("first".into(), PendingRequest(dropped.clone())));
        let mut second =
            Box::pin(requests.run("second".into(), PendingRequest(other_dropped.clone())));
        assert!(first.as_mut().poll(&mut cx).is_pending());
        assert!(second.as_mut().poll(&mut cx).is_pending());
        requests.cancel("first".into());
        assert!(wake.0.load(Ordering::SeqCst));
        assert_eq!(
            first.as_mut().poll(&mut cx),
            Poll::Ready(Err("cancelled".into()))
        );
        assert!(dropped.load(Ordering::SeqCst));
        assert!(second.as_mut().poll(&mut cx).is_pending());
        assert!(!other_dropped.load(Ordering::SeqCst));
        requests.cancel("second".into());
        assert!(second.as_mut().poll(&mut cx).is_ready());
        assert!(requests.registry.lock().unwrap().active.is_empty());
    }

    #[test]
    fn cancellation_before_registration_never_polls_the_http_future() {
        let requests = AiRequests::default();
        requests.cancel("early".into());
        let result = tauri::async_runtime::block_on(requests.run("early".into(), async {
            panic!("cancelled request must not start");
            #[allow(unreachable_code)]
            Ok::<(), String>(())
        }));
        assert_eq!(result, Err("cancelled".into()));
    }
}
