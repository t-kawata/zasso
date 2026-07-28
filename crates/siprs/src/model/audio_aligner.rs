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
//   - NODE_ID=N0035:  §25 IN/OUT Pair Alignment Algorithm
//     → To show details: (cd ../.. && node .claude/scripts/rfc-graph/query.js --graph="RFC-ROOT-GRAPH.json" --source="RFC-ROOT.md" --dirs-tree="RFC-ROOT-Dirs-Tree.json" --id=N0035 --hops=2)
//
// Full graph exploration:
//   (cd ../.. && node .claude/scripts/rfc-graph/show-graph-summary-markdown.js --graph="RFC-ROOT-GRAPH.json" --source="RFC-ROOT.md")
//   (cd ../.. && node .claude/scripts/rfc-graph/query.js --graph="RFC-ROOT-GRAPH.json" --source="RFC-ROOT.md" --dirs-tree="RFC-ROOT-Dirs-Tree.json" --id=Nxxxx (e.g. N0001) --hops=<N> (hop count: 1=direct edges only, 2+=includes grandchildren, etc.)
// ============================================================================

use std::collections::VecDeque;
use std::sync::atomic::{AtomicU64, Ordering};
use std::time::{Duration, Instant};

// ---------------------------------------------------------------------------
// TimedFrame
// ---------------------------------------------------------------------------

/// A frame of audio data tagged with a monotonic timestamp.
///
/// The timestamp (`ts_mono`) is used by `PairAligner` to determine whether
/// two frames from the IN and OUT queues are close enough to pair.
#[derive(Debug, Clone)]
pub struct TimedFrame<T> {
    /// Monotonic clock timestamp of when this frame was received.
    pub ts_mono: Instant,
    /// The audio data carried by this frame.
    pub data: T,
}

// ---------------------------------------------------------------------------
// PairAligner
// ---------------------------------------------------------------------------

/// Aligns IN (RTP received) and OUT (mixer sourced) audio frames by
/// their timestamps, producing paired `(in_data, out_data)` outputs.
///
/// # Behavior
///
/// - Frames within `tolerance` are paired and returned.
/// - If both queues have data but timestamps exceed tolerance, the
///   earlier frame is silently dropped (it arrived too late).
/// - If only one queue has data and its front frame has been waiting
///   longer than `tolerance`, the missing side is zero-padded and a
///   drift counter is incremented (informational, not an error).
/// - If both queues are empty, `try_pair` returns `None`.
///
/// # Design notes
///
/// PairAligner is designed to run in the `AudioWorkerTask` (Tokio async
/// context) where `Vec` allocation is acceptable. It must NOT be called
/// from an RT callback — only `VecDeque::push_back` / `pop_front` here.
#[derive(Debug)]
pub struct PairAligner {
    /// Ingress (RTP received) frame queue.
    pub(crate) in_q: VecDeque<TimedFrame<Vec<i16>>>,
    /// Egress (mixer sourced) frame queue.
    pub(crate) out_q: VecDeque<TimedFrame<Vec<i16>>>,
    /// Maximum allowed timestamp delta for pairing.
    pub(crate) tolerance: Duration,
    /// Counter of zero-padding events (informational drift metric).
    drift_counter: AtomicU64,
}

// [::TICKET::] P4-2 changes. Details: `node .claude/scripts/tickets/show-ticket-context.js --ticket-key=P4-2 --for-spec --no-implementation-order`.
impl PairAligner {
    /// Create a new `PairAligner` with the given tolerance.
    ///
    /// Both IN and OUT queues start empty.
    /// `tolerance` should typically be ≥20ms to accommodate normal jitter.
    pub fn new(tolerance: Duration) -> Self {
        Self {
            in_q: VecDeque::new(),
            out_q: VecDeque::new(),
            tolerance,
            drift_counter: AtomicU64::new(0),
        }
    }

    /// Push an IN frame (received from the network).
    pub fn push_in(&mut self, data: Vec<i16>, ts: Instant) {
        self.in_q.push_back(TimedFrame {
            ts_mono: ts,
            data,
        });
    }

    /// Push an OUT frame (sourced from the local mixer).
    pub fn push_out(&mut self, data: Vec<i16>, ts: Instant) {
        self.out_q.push_back(TimedFrame {
            ts_mono: ts,
            data,
        });
    }

    /// Attempt to produce a paired `(in_data, out_data)` output.
    ///
    /// Returns `Some((in_data, out_data, timestamp))` on success, or `None`
    /// if pairing is not yet possible (queues need more data).
    ///
    /// Zero-padding: when one queue has data and the other has been empty
    /// past tolerance, the missing side is filled with zeros.
    ///
    /// Frame drops: when both queues have data but timestamps differ by
    /// more than tolerance, the earlier frame is dropped silently.
    #[must_use]
    pub fn try_pair(&mut self) -> Option<(Vec<i16>, Vec<i16>, Instant)> {
        match (self.in_q.front(), self.out_q.front()) {
            (Some(in_front), Some(out_front)) => {
                // Both queues have data — compare timestamps
                let delta = if in_front.ts_mono >= out_front.ts_mono {
                    in_front.ts_mono - out_front.ts_mono
                } else {
                    out_front.ts_mono - in_front.ts_mono
                };

                if delta <= self.tolerance {
                    // Within tolerance: produce a matched pair
                    let in_frame = self.in_q.pop_front().unwrap();
                    let out_frame = self.out_q.pop_front().unwrap();
                    let ts = std::cmp::max(in_frame.ts_mono, out_frame.ts_mono);
                    Some((in_frame.data, out_frame.data, ts))
                } else if in_front.ts_mono < out_front.ts_mono {
                    // IN is too old — drop it, OUT stays for next attempt
                    self.in_q.pop_front();
                    None
                } else {
                    // OUT is too old — drop it, IN stays for next attempt
                    self.out_q.pop_front();
                    None
                }
            }
            (Some(in_front), None) => {
                // Only IN has data — check if it has waited past tolerance
                if in_front.ts_mono.elapsed() > self.tolerance {
                    let frame = self.in_q.pop_front().unwrap();
                    self.drift_counter.fetch_add(1, Ordering::Relaxed);
                    let zeros = vec![0i16; frame.data.len()];
                    Some((frame.data, zeros, frame.ts_mono))
                } else {
                    None
                }
            }
            (None, Some(out_front)) => {
                // Only OUT has data — check if it has waited past tolerance
                if out_front.ts_mono.elapsed() > self.tolerance {
                    let frame = self.out_q.pop_front().unwrap();
                    self.drift_counter.fetch_add(1, Ordering::Relaxed);
                    let zeros = vec![0i16; frame.data.len()];
                    Some((zeros, frame.data, frame.ts_mono))
                } else {
                    None
                }
            }
            (None, None) => None,
        }
    }

    /// Return the current alignment drift counter value.
    ///
    /// This counter increments on each zero-padding event, providing an
    /// informational metric for monitoring audio synchronisation health.
    #[must_use]
    pub fn alignment_drift(&self) -> u64 {
        self.drift_counter.load(Ordering::Relaxed)
    }

    /// Return the number of frames currently in the IN queue.
    #[must_use]
    pub fn in_q_len(&self) -> usize {
        self.in_q.len()
    }

    /// Return the number of frames currently in the OUT queue.
    #[must_use]
    pub fn out_q_len(&self) -> usize {
        self.out_q.len()
    }
}

// ===========================================================================
// Tests — TDD Red: failing → Green: passing
// ===========================================================================

#[cfg(test)]
mod tests {
    use super::*;
    use std::fmt::Debug;

    // ── C036-Pre: PairAligner construction ──────────────────────────────

    /// @verifies C036
    #[test]
// [::TICKET::] P4-2 changes. Details: `node .claude/scripts/tickets/show-ticket-context.js --ticket-key=P4-2 --for-spec --no-implementation-order`.
    fn pair_aligner_new_initializes_empty_queues() {
        let aligner = PairAligner::new(Duration::from_millis(30));
        assert_eq!(aligner.in_q.len(), 0);
        assert_eq!(aligner.out_q.len(), 0);
        assert_eq!(aligner.tolerance, Duration::from_millis(30));
        assert_eq!(aligner.alignment_drift(), 0);
    }

    // ── C036-Post: try_pair with matching frames ───────────────────────

    /// @verifies C036
    #[test]
// [::TICKET::] P4-2 changes. Details: `node .claude/scripts/tickets/show-ticket-context.js --ticket-key=P4-2 --for-spec --no-implementation-order`.
    fn pair_aligner_returns_paired_frames_within_tolerance() {
        let mut aligner = PairAligner::new(Duration::from_millis(30));
        let now = Instant::now();
        aligner.push_in(vec![1i16; 160], now);
        aligner.push_out(vec![2i16; 160], now + Duration::from_millis(10));

        let result = aligner.try_pair();
        assert!(result.is_some());
        let (in_data, out_data, _ts) = result.unwrap();
        assert_eq!(in_data.len(), 160);
        assert!(in_data.iter().all(|&s| s == 1));
        assert_eq!(out_data.len(), 160);
        assert!(out_data.iter().all(|&s| s == 2));
    }

    /// @verifies C036
    #[test]
// [::TICKET::] P4-2 changes. Details: `node .claude/scripts/tickets/show-ticket-context.js --ticket-key=P4-2 --for-spec --no-implementation-order`.
    fn pair_aligner_returns_paired_frames_identical_timestamp() {
        let mut aligner = PairAligner::new(Duration::from_millis(20));
        let now = Instant::now();
        aligner.push_in(vec![10i16; 80], now);
        aligner.push_out(vec![20i16; 80], now);

        let result = aligner.try_pair();
        assert!(result.is_some());
        let (in_data, out_data, ts) = result.unwrap();
        assert_eq!(in_data, vec![10i16; 80]);
        assert_eq!(out_data, vec![20i16; 80]);
        assert_eq!(ts, now);
    }

    // ── C036-Inv: Zero-padding on missing data ─────────────────────────

    /// @verifies C036
    #[test]
// [::TICKET::] P4-2 changes. Details: `node .claude/scripts/tickets/show-ticket-context.js --ticket-key=P4-2 --for-spec --no-implementation-order`.
    fn pair_aligner_zero_pads_when_only_in_has_data() {
        let mut aligner = PairAligner::new(Duration::from_millis(10));
        aligner.push_in(vec![5i16; 160], Instant::now());

        // Wait past tolerance
        std::thread::sleep(Duration::from_millis(30));

        let result = aligner.try_pair();
        assert!(result.is_some());
        let (in_data, out_data, _ts) = result.unwrap();
        assert!(in_data.iter().all(|&s| s == 5));
        assert!(out_data.iter().all(|&s| s == 0));
        assert!(aligner.alignment_drift() > 0);
    }

    /// @verifies C036
    #[test]
// [::TICKET::] P4-2 changes. Details: `node .claude/scripts/tickets/show-ticket-context.js --ticket-key=P4-2 --for-spec --no-implementation-order`.
    fn pair_aligner_zero_pads_when_only_out_has_data() {
        let mut aligner = PairAligner::new(Duration::from_millis(10));
        aligner.push_out(vec![7i16; 160], Instant::now());

        // Wait past tolerance
        std::thread::sleep(Duration::from_millis(30));

        let result = aligner.try_pair();
        assert!(result.is_some());
        let (in_data, out_data, _ts) = result.unwrap();
        assert!(in_data.iter().all(|&s| s == 0));
        assert!(out_data.iter().all(|&s| s == 7));
        assert!(aligner.alignment_drift() > 0);
    }

    // ── C036-Err: Empty queues ─────────────────────────────────────────

    /// @verifies C036
    #[test]
// [::TICKET::] P4-2 changes. Details: `node .claude/scripts/tickets/show-ticket-context.js --ticket-key=P4-2 --for-spec --no-implementation-order`.
    fn pair_aligner_try_pair_returns_none_when_both_empty() {
        let mut aligner = PairAligner::new(Duration::from_millis(30));
        assert!(aligner.try_pair().is_none());
    }

    // ── C036-Boundary: Frame drop on tolerance exceed ──────────────────

    /// @verifies C036
    #[test]
// [::TICKET::] P4-2 changes. Details: `node .claude/scripts/tickets/show-ticket-context.js --ticket-key=P4-2 --for-spec --no-implementation-order`.
    fn pair_aligner_drops_earlier_in_frame_when_delta_exceeds_tolerance() {
        let mut aligner = PairAligner::new(Duration::from_millis(10));
        let now = Instant::now();
        aligner.push_in(vec![1i16; 160], now);
        // OUT arrives much later
        aligner.push_out(vec![2i16; 160], now + Duration::from_millis(100));

        // IN is too old relative to OUT — should be dropped
        let result = aligner.try_pair();
        assert!(result.is_none());
        assert_eq!(aligner.in_q.len(), 0, "IN frame should be dropped");
        assert_eq!(aligner.out_q.len(), 1, "OUT frame should remain");
    }

    /// @verifies C036
    #[test]
// [::TICKET::] P4-2 changes. Details: `node .claude/scripts/tickets/show-ticket-context.js --ticket-key=P4-2 --for-spec --no-implementation-order`.
    fn pair_aligner_drops_earlier_out_frame_when_delta_exceeds_tolerance() {
        let mut aligner = PairAligner::new(Duration::from_millis(10));
        let now = Instant::now();
        // OUT arrives first, IN arrives much later
        aligner.push_out(vec![2i16; 160], now);
        aligner.push_in(vec![1i16; 160], now + Duration::from_millis(100));

        let result = aligner.try_pair();
        assert!(result.is_none());
        assert_eq!(aligner.out_q.len(), 0, "OUT frame should be dropped");
        assert_eq!(aligner.in_q.len(), 1, "IN frame should remain");
    }

    // ── C036-Metric: alignment_drift counter ───────────────────────────

    /// @verifies C036
    #[test]
// [::TICKET::] P4-2 changes. Details: `node .claude/scripts/tickets/show-ticket-context.js --ticket-key=P4-2 --for-spec --no-implementation-order`.
    fn pair_aligner_alignment_drift_increments_on_zero_pad() {
        let mut aligner = PairAligner::new(Duration::from_millis(5));
        assert_eq!(aligner.alignment_drift(), 0);

        aligner.push_in(vec![1i16; 160], Instant::now());
        std::thread::sleep(Duration::from_millis(20));

        let _ = aligner.try_pair();
        assert_eq!(aligner.alignment_drift(), 1);

        // Second zero-pad
        aligner.push_in(vec![2i16; 160], Instant::now());
        std::thread::sleep(Duration::from_millis(20));

        let _ = aligner.try_pair();
        assert_eq!(aligner.alignment_drift(), 2);
    }

    // ── Normal: queuing and lengths ────────────────────────────────────

    #[test]
// [::TICKET::] P4-2 changes. Details: `node .claude/scripts/tickets/show-ticket-context.js --ticket-key=P4-2 --for-spec --no-implementation-order`.
    fn pair_aligner_push_increases_queue_lengths() {
        let mut aligner = PairAligner::new(Duration::from_millis(30));
        let now = Instant::now();

        aligner.push_in(vec![0; 160], now);
        assert_eq!(aligner.in_q_len(), 1);
        assert_eq!(aligner.out_q_len(), 0);

        aligner.push_out(vec![0; 160], now);
        assert_eq!(aligner.in_q_len(), 1);
        assert_eq!(aligner.out_q_len(), 1);
    }

    #[test]
// [::TICKET::] P4-2 changes. Details: `node .claude/scripts/tickets/show-ticket-context.js --ticket-key=P4-2 --for-spec --no-implementation-order`.
    fn pair_aligner_queues_drain_after_successful_pair() {
        let mut aligner = PairAligner::new(Duration::from_millis(30));
        let now = Instant::now();
        aligner.push_in(vec![0; 160], now);
        aligner.push_out(vec![0; 160], now);

        assert!(aligner.try_pair().is_some());
        assert_eq!(aligner.in_q_len(), 0);
        assert_eq!(aligner.out_q_len(), 0);
    }

    // ── Trait derives ──────────────────────────────────────────────────

    #[test]
// [::TICKET::] P4-2 changes. Details: `node .claude/scripts/tickets/show-ticket-context.js --ticket-key=P4-2 --for-spec --no-implementation-order`.
    fn pair_aligner_derives_debug() {
// [::TICKET::] P4-2 changes. Details: `node .claude/scripts/tickets/show-ticket-context.js --ticket-key=P4-2 --for-spec --no-implementation-order`.
        fn assert_debug<T: Debug>() {}
        assert_debug::<PairAligner>();
    }

    #[test]
// [::TICKET::] P4-2 changes. Details: `node .claude/scripts/tickets/show-ticket-context.js --ticket-key=P4-2 --for-spec --no-implementation-order`.
    fn timed_frame_derives_clone_debug() {
// [::TICKET::] P4-2 changes. Details: `node .claude/scripts/tickets/show-ticket-context.js --ticket-key=P4-2 --for-spec --no-implementation-order`.
        fn assert_traits<T: Clone + Debug>() {}
        assert_traits::<TimedFrame<Vec<i16>>>();
    }

    // ── Edge: tolerance wall-clock elapsed ─────────────────────────────

    #[test]
// [::TICKET::] P4-2 changes. Details: `node .claude/scripts/tickets/show-ticket-context.js --ticket-key=P4-2 --for-spec --no-implementation-order`.
    fn pair_aligner_zero_pad_only_after_tolerance_elapsed() {
        let mut aligner = PairAligner::new(Duration::from_millis(100));
        aligner.push_in(vec![1i16; 160], Instant::now());

        // Before tolerance elapses — should return None
        let result = aligner.try_pair();
        assert!(result.is_none());
        assert_eq!(aligner.alignment_drift(), 0);
    }

    // ── Edge: multiple frames queued consecutively ─────────────────────

    #[test]
// [::TICKET::] P4-2 changes. Details: `node .claude/scripts/tickets/show-ticket-context.js --ticket-key=P4-2 --for-spec --no-implementation-order`.
    fn pair_aligner_multiple_frames_sequentially() {
        let mut aligner = PairAligner::new(Duration::from_millis(30));
        let now = Instant::now();

        // Push three pairs with increasing timestamps
        for i in 0..3 {
            aligner.push_in(vec![i as i16; 160], now + Duration::from_millis(i * 20));
            aligner.push_out(vec![(i + 10) as i16; 160], now + Duration::from_millis(i * 20));
        }

        for i in 0..3 {
            let result = aligner.try_pair();
            assert!(result.is_some(), "Failed at pair {i}");
            let (in_data, out_data, _ts) = result.unwrap();
            assert_eq!(in_data[0], i as i16);
            assert_eq!(out_data[0], (i + 10) as i16);
        }

        assert!(aligner.try_pair().is_none());
    }
}
