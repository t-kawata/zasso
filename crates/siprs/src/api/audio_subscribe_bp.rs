// ============================================================================
// Initial Design Artifact — RFC-driven Implementation
// !!! NEVER DELETE OR EDIT THIS COMMENT — it is the heart of design traceability and the bloodstream of provenance information !!!
// ============================================================================
// "Node" refers to a design fragment bounded by safe I/O boundaries in the Original RFC. Each node captures a distinct architectural concern that must be carefully implemented with attention to its relationships.
//
// Graph:        ../../RFC-ROOT-GRAPH.json
// Directory:    ../../RFC-ROOT-Dirs-Tree.json
// Original RFC: ../../RFC-ROOT.md
//
// Mapped node(s):
//   - NODE_ID=N0031:  §22 Audio Subscribe API & Backpressure Policy
//     → To show details: (cd ../.. && node .claude/scripts/rfc-graph/query.js --graph="RFC-ROOT-GRAPH.json" --source="RFC-ROOT.md" --dirs-tree="RFC-ROOT-Dirs-Tree.json" --id=N0031 --hops=2)
//
// Full graph exploration:
//   (cd ../.. && node .claude/scripts/rfc-graph/show-graph-summary-markdown.js --graph="RFC-ROOT-GRAPH.json" --source="RFC-ROOT.md")
//   (cd ../.. && node .claude/scripts/rfc-graph/query.js --graph="RFC-ROOT-GRAPH.json" --source="RFC-ROOT.md" --dirs-tree="RFC-ROOT-Dirs-Tree.json" --id=Nxxxx (e.g. N0001) --hops=<N> (hop count: 1=direct edges only, 2+=includes grandchildren, etc.)
// ============================================================================

use std::collections::VecDeque;
use std::sync::{Arc, Mutex};

use tokio::sync::{mpsc, Notify};

use crate::error::{SipError, SipErrorKind};
use crate::model::AudioChunkPair;

/// Minimum valid tap channel capacity (RFC §22.1: capacity == 0 cannot carry a pair).
pub const MIN_TAP_CAPACITY: usize = 1;

/// Tap behavior policy (RFC §22.1).
///
/// `Realtime` is the default: it prefers the newest frame and never blocks the
/// audio pipeline. `Lossless` prefers integrity: it backpressures the producer
/// instead of dropping a frame (best-effort guarantee).
#[derive(Debug, Clone, Copy, PartialEq, Eq)]
pub enum AudioTapMode {
    /// Real-time priority — oldest-drop on overflow, no pipeline impact.
    Realtime,
    /// Integrity priority — producer backpressure, no frame dropped.
    Lossless,
}

// [::TICKET::] P9-2 changes. Details: `node .claude/scripts/tickets/show-ticket-context.js --ticket-key=P9-2 --for-spec --no-implementation-order`.
impl Default for AudioTapMode {
    // [::TICKET::] P9-2 changes. Details: `node .claude/scripts/tickets/show-ticket-context.js --ticket-key=P9-2 --for-spec --no-implementation-order`.
    fn default() -> Self {
        Self::Realtime
    }
}

/// Bounded frame queue shared by the tap producer and consumer.
///
/// A `tokio::sync::mpsc::Sender` cannot evict the oldest frame from a full
/// channel, so Realtime oldest-drop needs a bounded deque the producer can pop
/// from. The `mpsc` pair is kept for RFC §22 conformance and as the
/// producer-lifetime (close) signal: when every `AudioTapSender` is dropped the
/// receiver reports closed and `recv()` yields `None`.
// [::TICKET::] P9-2 changes. Details: `node .claude/scripts/tickets/show-ticket-context.js --ticket-key=P9-2 --for-spec --no-implementation-order`.
struct TapQueue {
    capacity: usize,
    frames: Mutex<VecDeque<AudioChunkPair>>,
    frame_available: Notify,
    space_available: Notify,
}

// [::TICKET::] P9-2 changes. Details: `node .claude/scripts/tickets/show-ticket-context.js --ticket-key=P9-2 --for-spec --no-implementation-order`.
impl TapQueue {
    // [::TICKET::] P9-2 changes. Details: `node .claude/scripts/tickets/show-ticket-context.js --ticket-key=P9-2 --for-spec --no-implementation-order`.
    fn new(capacity: usize) -> Self {
        Self {
            capacity,
            frames: Mutex::new(VecDeque::with_capacity(capacity)),
            frame_available: Notify::new(),
            space_available: Notify::new(),
        }
    }
}

/// Lock the tap's frame queue, recovering from a poisoned mutex.
///
/// Poisoning only happens if a task panicked while holding the lock; the queue
/// contents remain valid, so recovering the guard is safe.
// [::TICKET::] P9-2 changes. Details: `node .claude/scripts/tickets/show-ticket-context.js --ticket-key=P9-2 --for-spec --no-implementation-order`.
fn lock_queue(queue: &TapQueue) -> std::sync::MutexGuard<'_, VecDeque<AudioChunkPair>> {
    queue
        .frames
        .lock()
        .unwrap_or_else(|poisoned| poisoned.into_inner())
}

/// Single-consumer handle to a call's audio stream (RFC §22).
pub struct AudioTapHandle {
    rx: mpsc::Receiver<AudioChunkPair>,
    queue: Arc<TapQueue>,
}

// [::TICKET::] P9-2 changes. Details: `node .claude/scripts/tickets/show-ticket-context.js --ticket-key=P9-2 --for-spec --no-implementation-order`.
impl AudioTapHandle {
    // [::TICKET::] P9-2 changes. Details: `node .claude/scripts/tickets/show-ticket-context.js --ticket-key=P9-2 --for-spec --no-implementation-order`.
    fn new(rx: mpsc::Receiver<AudioChunkPair>, queue: Arc<TapQueue>) -> Self {
        Self { rx, queue }
    }

    /// Receive the next audio frame; `None` when the producer has closed.
    pub async fn recv(&mut self) -> Option<AudioChunkPair> {
        loop {
            let mut frames = lock_queue(&self.queue);
            if let Some(pair) = frames.pop_front() {
                self.queue.space_available.notify_one();
                return Some(pair);
            }
            if self.rx.is_closed() {
                return None;
            }
            drop(frames);
            self.queue.frame_available.notified().await;
        }
    }
}

// [::TICKET::] P9-2 changes. Details: `node .claude/scripts/tickets/show-ticket-context.js --ticket-key=P9-2 --for-spec --no-implementation-order`.
impl std::fmt::Debug for AudioTapHandle {
    // [::TICKET::] P9-2 changes. Details: `node .claude/scripts/tickets/show-ticket-context.js --ticket-key=P9-2 --for-spec --no-implementation-order`.
    fn fmt(&self, f: &mut std::fmt::Formatter<'_>) -> std::fmt::Result {
        f.debug_struct("AudioTapHandle").finish_non_exhaustive()
    }
}

/// Producer-side tap sender applying the mode's backpressure policy (RFC §22.1).
///
/// A tap has exactly one producer (the backend media task), so the sender is
/// intentionally not `Clone`: when it is dropped the tap channel is closed and
/// `AudioTapHandle::recv()` yields `None`.
pub struct AudioTapSender {
    tx: mpsc::Sender<AudioChunkPair>,
    queue: Arc<TapQueue>,
    mode: AudioTapMode,
}

// [::TICKET::] P9-2 changes. Details: `node .claude/scripts/tickets/show-ticket-context.js --ticket-key=P9-2 --for-spec --no-implementation-order`.
impl Drop for AudioTapSender {
    // [::TICKET::] P9-2 changes. Details: `node .claude/scripts/tickets/show-ticket-context.js --ticket-key=P9-2 --for-spec --no-implementation-order`.
    fn drop(&mut self) {
        // Dropping this sender closes the mpsc channel once the last sender is
        // gone. Wake a still-listening consumer so it re-checks `rx.is_closed()`
        // and returns `None`; if the consumer already dropped, there is nobody
        // to wake.
        if !self.tx.is_closed() {
            self.queue.frame_available.notify_waiters();
        }
    }
}

// [::TICKET::] P9-2 changes. Details: `node .claude/scripts/tickets/show-ticket-context.js --ticket-key=P9-2 --for-spec --no-implementation-order`.
impl AudioTapSender {
    // [::TICKET::] P9-2 changes. Details: `node .claude/scripts/tickets/show-ticket-context.js --ticket-key=P9-2 --for-spec --no-implementation-order`.
    fn new(tx: mpsc::Sender<AudioChunkPair>, queue: Arc<TapQueue>, mode: AudioTapMode) -> Self {
        Self { tx, queue, mode }
    }

    /// Push one frame into the tap.
    ///
    /// In Realtime mode, a full queue evicts the oldest frame and returns it as
    /// the overflow report; the newest frame is always admitted and the producer
    /// never blocks. In Lossless mode the producer awaits queue space
    /// (backpressure) and no frame is ever evicted, so `None` is returned.
    pub async fn push(&self, pair: AudioChunkPair) -> Option<AudioChunkPair> {
        match self.mode {
            AudioTapMode::Realtime => {
                let mut frames = lock_queue(&self.queue);
                let dropped = if frames.len() >= self.queue.capacity {
                    frames.pop_front()
                } else {
                    None
                };
                frames.push_back(pair);
                self.queue.frame_available.notify_one();
                dropped
            }
            AudioTapMode::Lossless => {
                // `pair` moves into the queue exactly once, on the admitting
                // iteration; holding it in an Option lets the loop body re-run
                // (when the queue is full) without a second move.
                let mut pending = Some(pair);
                loop {
                    let admitted = {
                        let mut frames = lock_queue(&self.queue);
                        match pending.take() {
                            Some(frame) if frames.len() < self.queue.capacity => {
                                frames.push_back(frame);
                                self.queue.frame_available.notify_one();
                                true
                            }
                            pending_again => {
                                // Queue is full: restore the frame for the next
                                // iteration after a consumer frees space.
                                pending = pending_again;
                                false
                            }
                        }
                    };
                    if admitted {
                        return None;
                    }
                    self.queue.space_available.notified().await;
                }
            }
        }
    }
}

/// Create a tap channel pair (producer + consumer) with the given mode policy.
///
/// Panics if `capacity == 0`; callers must validate via
/// [`validate_tap_capacity`] before constructing (RFC §22.1).
pub fn tap_channel(capacity: usize, mode: AudioTapMode) -> (AudioTapSender, AudioTapHandle) {
    assert!(
        capacity >= MIN_TAP_CAPACITY,
        "tap capacity must be at least {MIN_TAP_CAPACITY}"
    );
    let (tx, rx) = mpsc::channel::<AudioChunkPair>(capacity);
    let queue = Arc::new(TapQueue::new(capacity));
    (
        AudioTapSender::new(tx, queue.clone(), mode),
        AudioTapHandle::new(rx, queue),
    )
}

/// Validate the tap capacity bound (RFC §22.1: capacity must be at least 1).
pub fn validate_tap_capacity(capacity: usize) -> Result<(), SipError> {
    if capacity < MIN_TAP_CAPACITY {
        return Err(SipError::new(
            SipErrorKind::InvalidConfig,
            format!("tap capacity must be at least {MIN_TAP_CAPACITY}"),
        ));
    }
    Ok(())
}

#[cfg(test)]
mod tests {
    use super::*;
    use crate::model::id_design_newtype::IdError;
    use crate::model::{AccountId, AudioChunk, CallId};
    use std::time::SystemTime;

    /// A synthetic `AudioChunkPair` whose in/out samples encode `seed`.
    // [::TICKET::] P9-2 changes. Details: `node .claude/scripts/tickets/show-ticket-context.js --ticket-key=P9-2 --for-spec --no-implementation-order`.
    fn synthetic_pair(seed: u16) -> Result<AudioChunkPair, IdError> {
        Ok(AudioChunkPair {
            call_id: CallId::from_u64(1)?,
            account_id: AccountId::from_u64(1)?,
            timestamp: SystemTime::now(),
            in_chunk: AudioChunk::I16(vec![seed as i16; 160]),
            out_chunk: AudioChunk::I16(vec![(seed + 1) as i16; 160]),
        })
    }

    #[test]
    // @verifies C032
    // [::TICKET::] P9-2 changes. Details: `node .claude/scripts/tickets/show-ticket-context.js --ticket-key=P9-2 --for-spec --no-implementation-order`.
    fn audio_tap_mode_defaults_to_realtime() {
        assert_eq!(AudioTapMode::default(), AudioTapMode::Realtime);
    }

    #[test]
    // @verifies C032
    // [::TICKET::] P9-2 changes. Details: `node .claude/scripts/tickets/show-ticket-context.js --ticket-key=P9-2 --for-spec --no-implementation-order`.
    fn audio_tap_mode_is_copyable_and_comparable() {
        // [::TICKET::] P9-2 changes. Details: `node .claude/scripts/tickets/show-ticket-context.js --ticket-key=P9-2 --for-spec --no-implementation-order`.
        fn assert_traits<T: Clone + Copy + std::fmt::Debug + PartialEq + Eq>() {}
        // [::TICKET::] P9-2 changes. Details: `node .claude/scripts/tickets/show-ticket-context.js --ticket-key=P9-2 --for-spec --no-implementation-order`.
        fn assert_send<T: Send>() {}
        assert_traits::<AudioTapMode>();
        assert_send::<AudioTapHandle>();
        assert_ne!(AudioTapMode::Realtime, AudioTapMode::Lossless);
    }

    #[test]
    // @verifies C032
    // [::TICKET::] P9-2 changes. Details: `node .claude/scripts/tickets/show-ticket-context.js --ticket-key=P9-2 --for-spec --no-implementation-order`.
    fn validate_capacity_accepts_one_and_rejects_zero() {
        assert!(validate_tap_capacity(1).is_ok());
        assert!(validate_tap_capacity(16).is_ok());
        let err = validate_tap_capacity(0).expect_err("capacity == 0 must be rejected");
        assert_eq!(err.kind, SipErrorKind::InvalidConfig);
    }

    #[test]
    #[should_panic(expected = "tap capacity must be at least 1")]
    // @verifies C032
    // [::TICKET::] P9-2 changes. Details: `node .claude/scripts/tickets/show-ticket-context.js --ticket-key=P9-2 --for-spec --no-implementation-order`.
    fn tap_channel_panics_on_zero_capacity() {
        let _ = tap_channel(0, AudioTapMode::Realtime);
    }

    #[tokio::test]
    // @verifies C032
    async fn realtime_capacity_one_keeps_newest() -> Result<(), IdError> {
        let (sender, mut handle) = tap_channel(1, AudioTapMode::Realtime);
        let pair_a = synthetic_pair(1)?;
        let pair_b = synthetic_pair(2)?;
        assert_eq!(sender.push(pair_a.clone()).await, None);
        assert_eq!(
            sender.push(pair_b.clone()).await,
            Some(pair_a),
            "oldest pair_a is evicted"
        );
        assert_eq!(handle.recv().await, Some(pair_b), "newest pair_b survives");
        Ok(())
    }

    #[tokio::test]
    // @verifies C032
    async fn realtime_capacity_two_evicts_oldest_first() -> Result<(), IdError> {
        let (sender, mut handle) = tap_channel(2, AudioTapMode::Realtime);
        let pair_a = synthetic_pair(1)?;
        let pair_b = synthetic_pair(2)?;
        let pair_c = synthetic_pair(3)?;
        assert_eq!(sender.push(pair_a.clone()).await, None);
        assert_eq!(sender.push(pair_b.clone()).await, None);
        assert_eq!(sender.push(pair_c.clone()).await, Some(pair_a));
        assert_eq!(handle.recv().await, Some(pair_b));
        assert_eq!(handle.recv().await, Some(pair_c));
        Ok(())
    }

    #[tokio::test]
    // @verifies C032
    async fn lossless_backpressures_instead_of_dropping() -> Result<(), Box<dyn std::error::Error>>
    {
        let (sender, mut handle) = tap_channel(1, AudioTapMode::Lossless);
        let pair_a = synthetic_pair(1)?;
        let pair_b = synthetic_pair(2)?;
        assert_eq!(sender.push(pair_a.clone()).await, None);
        let pair_b_for_push = pair_b.clone();
        let push_b = tokio::spawn(async move { sender.push(pair_b_for_push).await });
        tokio::task::yield_now().await;
        assert!(
            !push_b.is_finished(),
            "push(pair_b) must await channel space"
        );
        assert_eq!(handle.recv().await, Some(pair_a));
        assert_eq!(push_b.await?, None);
        assert_eq!(handle.recv().await, Some(pair_b));
        Ok(())
    }

    #[tokio::test]
    // @verifies C032
    async fn recv_yields_none_after_sender_dropped() -> Result<(), IdError> {
        let (sender, mut handle) = tap_channel(1, AudioTapMode::Realtime);
        sender.push(synthetic_pair(1)?).await;
        drop(sender);
        assert!(handle.recv().await.is_some());
        assert_eq!(handle.recv().await, None);
        Ok(())
    }
}
