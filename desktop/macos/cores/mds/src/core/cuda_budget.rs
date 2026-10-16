//! Absolute-time CUDA pacing: an overslept dispatch must not be charged again.
use std::{sync::atomic::{AtomicBool, Ordering}, time::{Duration, Instant}};

pub(super) fn debt(duty: f32, compute: Duration, wall: Duration) -> Duration {
    if duty >= 0.999 { return Duration::ZERO; }
    compute.mul_f64(1.0 / duty as f64).saturating_sub(wall)
}

pub(super) struct Budget { start: Instant, compute: Duration }
impl Budget {
    pub fn new() -> Self { Self { start: Instant::now(), compute: Duration::ZERO } }
    pub fn pace(&mut self, elapsed: Duration, duty: f32, cancel: &AtomicBool) -> Duration {
        self.compute += elapsed;
        let begin = Instant::now();
        loop {
            let wait = debt(duty, self.compute, self.start.elapsed());
            // Amortize sub-millisecond sleeps and compensate OS oversleep on
            // following dispatches. No busy-wait or global timer changes.
            if wait < Duration::from_millis(2) || cancel.load(Ordering::Relaxed) { break; }
            std::thread::sleep(wait.min(Duration::from_millis(10)));
        }
        begin.elapsed()
    }
}

#[cfg(test)] mod tests {
    use super::*;
    #[test] fn oversleep_is_repaid_instead_of_repeated() {
        assert_eq!(debt(0.5, Duration::from_millis(10), Duration::from_millis(15)), Duration::from_millis(5));
        assert_eq!(debt(0.5, Duration::from_millis(12), Duration::from_millis(25)), Duration::ZERO);
        assert_eq!(debt(0.5, Duration::from_millis(15), Duration::from_millis(27)), Duration::from_millis(3));
    }
    #[test] fn unthrottled_has_no_debt() {
        assert_eq!(debt(1.0, Duration::from_secs(10), Duration::from_secs(5)), Duration::ZERO);
    }
    #[test] fn cancellation_does_not_wait_for_budget() {
        let mut b=Budget::new();
        assert!(b.pace(Duration::from_secs(10),0.1,&AtomicBool::new(true)) < Duration::from_millis(100));
    }
}
