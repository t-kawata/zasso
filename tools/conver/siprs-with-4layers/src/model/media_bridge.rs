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
//   - NODE_ID=N0049:  §39 Media Bridge & PJSUA Conference Port
//     → To show details: (cd ../.. && node .claude/scripts/rfc-graph/query.js --graph="RFC-ROOT-GRAPH.json" --source="RFC-ROOT.md" --dirs-tree="RFC-ROOT-Dirs-Tree.json" --id=N0049 --hops=2)
//
// Full graph exploration:
//   (cd ../.. && node .claude/scripts/rfc-graph/show-graph-summary-markdown.js --graph="RFC-ROOT-GRAPH.json" --source="RFC-ROOT.md")
//   (cd ../.. && node .claude/scripts/rfc-graph/query.js --graph="RFC-ROOT-GRAPH.json" --source="RFC-ROOT.md" --dirs-tree="RFC-ROOT-Dirs-Tree.json" --id=Nxxxx (e.g. N0001) --hops=<N> (hop count: 1=direct edges only, 2+=includes grandchildren, etc.)
// ============================================================================

// [::TICKET::] P4-3: §39 Media Bridge & PJSUA Conference Port — lock-free RT/async boundary.

use crossbeam_queue::ArrayQueue;

use crate::runtime::audio_worker::MIXER_FRAME_SAMPLES;

// ---------------------------------------------------------------------------
// PortDirection — direction of media flow through a media port
// ---------------------------------------------------------------------------

/// Direction of media flow for a `RustMediaPort`.
#[derive(Debug, Clone, Copy, PartialEq, Eq)]
pub enum PortDirection {
    /// Capture direction: remote audio (IN) flows from PJSUA to AudioWorkerTask.
    Capture,
    /// Playback direction: AudioWorkerTask output (OUT) flows to PJSUA conference.
    Playback,
}

// ---------------------------------------------------------------------------
// MediaFrame — audio data frame crossing the RT/async boundary
// ---------------------------------------------------------------------------

/// A single frame of PCM i16 mono audio data, sized to the mixer frame.
///
/// This frame crosses the lock-free boundary between the PJSUA RT callback
/// thread and the Tokio async AudioWorkerTask.
#[derive(Debug, Clone)]
pub struct MediaFrame {
    /// PCM i16 samples (typically 160 samples for 20ms@8kHz mono).
    pub samples: Vec<i16>,
    /// Monotonically increasing timestamp (AudioWorkerTask frame counter).
    pub timestamp: u64,
    /// Call ID this frame belongs to.
    pub call_id: u64,
}

// [::TICKET::] P4-3 changes. Details: `node .claude/scripts/tickets/show-ticket-context.js --ticket-key=P4-3 --for-spec --no-implementation-order`.
impl MediaFrame {
    /// Create a new frame with the standard mixer frame size, zero-filled.
    pub fn new_silent(timestamp: u64, call_id: u64) -> Self {
        Self {
            samples: vec![0i16; MIXER_FRAME_SAMPLES],
            timestamp,
            call_id,
        }
    }

    /// Create a new frame with the given sample data.
    ///
    /// If `samples` is shorter than `MIXER_FRAME_SAMPLES`, the frame is
    /// zero-padded. If longer, it is truncated.
    pub fn new(samples: Vec<i16>, timestamp: u64, call_id: u64) -> Self {
        let mut frame = Self::new_silent(timestamp, call_id);
        let copy_len = samples.len().min(MIXER_FRAME_SAMPLES);
        frame.samples[..copy_len].copy_from_slice(&samples[..copy_len]);
        frame
    }
}

// ---------------------------------------------------------------------------
// AudioBridge — lock-free bridge between AudioWorkerTask and RT callback
// ---------------------------------------------------------------------------

/// Lock-free bridge connecting the async AudioWorkerTask (mixer) to the PJSUA
/// RT callback (conference port).
///
/// Two independent `ArrayQueue`s provide the async-to-RT and RT-to-async paths:
/// - `to_rt`: AudioMixer output frames → PJSUA conference port playback
/// - `from_rt`: PJSUA conference port capture → AudioMixer / PairAligner input
///
/// All operations are lock-free and non-blocking, suitable for use on RT threads.
pub struct AudioBridge {
    /// AudioMixer → RT callback: mixed output frames for playback injection.
    to_rt: ArrayQueue<MediaFrame>,
    /// RT callback → AudioWorkerTask: captured input frames for PairAligner.
    from_rt: ArrayQueue<MediaFrame>,
}

// [::TICKET::] P4-3 changes. Details: `node .claude/scripts/tickets/show-ticket-context.js --ticket-key=P4-3 --for-spec --no-implementation-order`.
impl AudioBridge {
    /// Create a new `AudioBridge` with the given queue capacity.
    ///
    /// Each queue (to_rt and from_rt) independently holds up to `capacity` frames.
    /// A capacity of 8 provides ~160ms of buffering at 20ms frames.
    pub fn new(capacity: usize) -> Self {
        Self {
            to_rt: ArrayQueue::new(capacity),
            from_rt: ArrayQueue::new(capacity),
        }
    }

    /// Push a mixed output frame toward the RT callback (AudioMixer side).
    ///
    /// Returns `true` if the frame was enqueued, `false` if the queue was full
    /// (frame dropped silently — latest-priority semantics).
    /// Never blocks.
    pub fn push_out_frame(&self, frame: MediaFrame) -> bool {
        self.to_rt.push(frame).is_ok()
    }

    /// Pop a received output frame from the RT-to-async queue (worker side).
    ///
    /// Returns `None` if the queue is empty (no inbound audio).
    /// Never blocks.
    pub fn pop_in_frame(&self) -> Option<MediaFrame> {
        self.from_rt.pop()
    }

    /// Push a captured input frame from the RT callback (PJSUA side).
    ///
    /// Called from `put_frame` on the RT callback thread.
    /// Returns `true` if the frame was enqueued, `false` if the queue was full.
    /// Never blocks.
    pub fn push_in_frame(&self, frame: MediaFrame) -> bool {
        self.from_rt.push(frame).is_ok()
    }

    /// Pop a mixed output frame for the RT callback (PJSUA side).
    ///
    /// Called from `get_frame` on the RT callback thread.
    /// Returns `None` if the queue is empty (underrun → zero-fill).
    /// Never blocks.
    pub fn pop_out_frame(&self) -> Option<MediaFrame> {
        self.to_rt.pop()
    }

    /// Current fill level of the to_rt queue (number of pending output frames).
    pub fn to_rt_len(&self) -> usize {
        self.to_rt.len()
    }

    /// Current fill level of the from_rt queue (number of pending input frames).
    pub fn from_rt_len(&self) -> usize {
        self.from_rt.len()
    }

    /// Total capacity of each queue (set at construction time).
    pub fn capacity(&self) -> usize {
        self.to_rt.capacity()
    }
}

// ---------------------------------------------------------------------------
// Tests — TDD Red: failing → Green: passing
// ---------------------------------------------------------------------------

#[cfg(test)]
mod tests {
    use super::*;

    // ── C050-Pre: Queue construction ────────────────────────────────

    #[test]
    // @verifies C050
    // [::TICKET::] P4-3 changes. Details: `node .claude/scripts/tickets/show-ticket-context.js --ticket-key=P4-3 --for-spec --no-implementation-order`.
    fn audio_bridge_new_creates_queues_with_capacity() {
        let bridge = AudioBridge::new(8);
        assert_eq!(bridge.capacity(), 8);
        assert_eq!(bridge.to_rt_len(), 0);
        assert_eq!(bridge.from_rt_len(), 0);
    }

    // ── C050-Post: AudioBridge operations ───────────────────────────

    #[test]
    // @verifies C050
    // [::TICKET::] P4-3 changes. Details: `node .claude/scripts/tickets/show-ticket-context.js --ticket-key=P4-3 --for-spec --no-implementation-order`.
    fn audio_bridge_push_out_frame_to_rt() {
        let bridge = AudioBridge::new(8);
        let frame = MediaFrame::new_silent(1, 42);
        assert!(bridge.push_out_frame(frame));
        assert_eq!(bridge.to_rt_len(), 1);
    }

    #[test]
    // @verifies C050
    // [::TICKET::] P4-3 changes. Details: `node .claude/scripts/tickets/show-ticket-context.js --ticket-key=P4-3 --for-spec --no-implementation-order`.
    fn audio_bridge_pop_in_frame_from_rt() {
        let bridge = AudioBridge::new(8);
        let frame = MediaFrame::new_silent(1, 42);
        assert!(bridge.push_in_frame(frame));
        assert_eq!(bridge.from_rt_len(), 1);

        let popped = bridge.pop_in_frame();
        assert!(popped.is_some());
        assert_eq!(popped.unwrap().call_id, 42);
        assert_eq!(bridge.from_rt_len(), 0);
    }

    #[test]
    // @verifies C050
    // [::TICKET::] P4-3 changes. Details: `node .claude/scripts/tickets/show-ticket-context.js --ticket-key=P4-3 --for-spec --no-implementation-order`.
    fn audio_bridge_round_trip_via_both_queues() {
        let bridge = AudioBridge::new(8);
        let out_frame = MediaFrame::new(vec![100i16; 160], 10, 1);
        let in_frame = MediaFrame::new(vec![200i16; 160], 10, 1);

        // Push (async side → RT)
        assert!(bridge.push_out_frame(out_frame.clone()));
        // Push (RT → async side)
        assert!(bridge.push_in_frame(in_frame.clone()));

        // Pop (RT side gets output)
        let rt_out = bridge.pop_out_frame();
        assert!(rt_out.is_some());
        assert_eq!(rt_out.unwrap().timestamp, 10);

        // Pop (async side gets input)
        let async_in = bridge.pop_in_frame();
        assert!(async_in.is_some());
        assert_eq!(async_in.unwrap().timestamp, 10);

        // Both queues empty
        assert_eq!(bridge.to_rt_len(), 0);
        assert_eq!(bridge.from_rt_len(), 0);
    }

    // ── C050-Inv: Non-blocking queue operations ─────────────────────

    #[test]
    // @verifies C050
    // [::TICKET::] P4-3 changes. Details: `node .claude/scripts/tickets/show-ticket-context.js --ticket-key=P4-3 --for-spec --no-implementation-order`.
    fn audio_bridge_overflow_on_to_rt_drops_frame_silently() {
        let bridge = AudioBridge::new(2);
        assert!(bridge.push_out_frame(MediaFrame::new_silent(1, 1)));
        assert!(bridge.push_out_frame(MediaFrame::new_silent(2, 1)));
        // Queue full — push must return false (not block, not panic)
        assert!(!bridge.push_out_frame(MediaFrame::new_silent(3, 1)));
        // First frame still available
        assert_eq!(bridge.to_rt_len(), 2);
    }

    #[test]
    // @verifies C050
    // [::TICKET::] P4-3 changes. Details: `node .claude/scripts/tickets/show-ticket-context.js --ticket-key=P4-3 --for-spec --no-implementation-order`.
    fn audio_bridge_overflow_on_from_rt_drops_frame_silently() {
        let bridge = AudioBridge::new(2);
        assert!(bridge.push_in_frame(MediaFrame::new_silent(1, 1)));
        assert!(bridge.push_in_frame(MediaFrame::new_silent(2, 1)));
        // Queue full — push must return false
        assert!(!bridge.push_in_frame(MediaFrame::new_silent(3, 1)));
        assert_eq!(bridge.from_rt_len(), 2);
    }

    #[test]
    // @verifies C050
    // [::TICKET::] P4-3 changes. Details: `node .claude/scripts/tickets/show-ticket-context.js --ticket-key=P4-3 --for-spec --no-implementation-order`.
    fn audio_bridge_pop_from_empty_queue_returns_none() {
        let bridge = AudioBridge::new(4);
        assert!(bridge.pop_out_frame().is_none());
        assert!(bridge.pop_in_frame().is_none());
    }

    // ── MediaFrame ──────────────────────────────────────────────────

    #[test]
    // @verifies C050
    // [::TICKET::] P4-3 changes. Details: `node .claude/scripts/tickets/show-ticket-context.js --ticket-key=P4-3 --for-spec --no-implementation-order`.
    fn media_frame_new_silent_creates_zero_filled_frame() {
        let frame = MediaFrame::new_silent(100, 7);
        assert_eq!(frame.timestamp, 100);
        assert_eq!(frame.call_id, 7);
        assert_eq!(frame.samples.len(), MIXER_FRAME_SAMPLES);
        assert!(frame.samples.iter().all(|&s| s == 0));
    }

    #[test]
    // @verifies C050
    // [::TICKET::] P4-3 changes. Details: `node .claude/scripts/tickets/show-ticket-context.js --ticket-key=P4-3 --for-spec --no-implementation-order`.
    fn media_frame_new_copies_samples_with_padding() {
        let short = vec![5i16; 10];
        let frame = MediaFrame::new(short, 200, 3);
        assert_eq!(frame.samples.len(), MIXER_FRAME_SAMPLES);
        assert_eq!(frame.samples[0], 5);
        assert_eq!(frame.samples[9], 5);
        assert_eq!(frame.samples[10], 0); // zero-padded
    }

    #[test]
    // @verifies C050
    // [::TICKET::] P4-3 changes. Details: `node .claude/scripts/tickets/show-ticket-context.js --ticket-key=P4-3 --for-spec --no-implementation-order`.
    fn media_frame_new_truncates_oversized_input() {
        let long = vec![7i16; MIXER_FRAME_SAMPLES * 2];
        let frame = MediaFrame::new(long, 300, 5);
        assert_eq!(frame.samples.len(), MIXER_FRAME_SAMPLES);
    }

    #[test]
    // @verifies C050
    // [::TICKET::] P4-3 changes. Details: `node .claude/scripts/tickets/show-ticket-context.js --ticket-key=P4-3 --for-spec --no-implementation-order`.
    fn media_frame_is_send_sync() {
        // [::TICKET::] P4-3 changes. Details: `node .claude/scripts/tickets/show-ticket-context.js --ticket-key=P4-3 --for-spec --no-implementation-order`.
        fn assert_send<T: Send>() {}
        // [::TICKET::] P4-3 changes. Details: `node .claude/scripts/tickets/show-ticket-context.js --ticket-key=P4-3 --for-spec --no-implementation-order`.
        fn assert_sync<T: Sync>() {}
        assert_send::<MediaFrame>();
        assert_sync::<MediaFrame>();
        assert_send::<AudioBridge>();
        assert_sync::<AudioBridge>();
    }

    // ── PortDirection ───────────────────────────────────────────────

    #[test]
    // @verifies C050
    // [::TICKET::] P4-3 changes. Details: `node .claude/scripts/tickets/show-ticket-context.js --ticket-key=P4-3 --for-spec --no-implementation-order`.
    fn port_direction_variants() {
        assert_eq!(PortDirection::Capture as isize, 0);
        assert_eq!(PortDirection::Playback as isize, 1);
    }
}
