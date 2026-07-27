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

//! Audio subscribe API types — AudioTapMode, AudioTapHandle, MediaDirection,
//! HangupReason, and subscribe_audio() on SipClient (N0031 / §22).
//!
//! ## AudioTapMode
//!
//! Controls backpressure policy for audio subscription:
//! - `Realtime`: oldest-drop when buffer is full (low-latency monitoring).
//! - `Lossless`: backpressure on sender when buffer is full (recording/QA).
//!
//! ## AudioTapHandle
//!
//! A receiver handle for tapped audio chunk pairs. Constructed by
//! `SipClient::subscribe_audio()` and consumed by the caller via `recv()`.
//!
//! ## MediaDirection
//!
//! Specifies which conference port to connect for audio tapping:
//! `Inbound` (remote→local), `Outbound` (local→remote), or `Both`.

use tokio::sync::mpsc;

use crate::model::audio_format_chunkpair::AudioChunkPair;

// ---------------------------------------------------------------------------
// AudioTapMode — backpressure policy
// ---------------------------------------------------------------------------

/// Audio tap backpressure policy.
///
/// Determines behaviour when the consumer reads slower than the producer writes.
///
/// - `Realtime` (default): oldest-drop — the channel drops the oldest frame
///   when full and reports a `MediaError(AudioTapOverflow)`.
/// - `Lossless`: backpressure — the sender blocks when the channel is full,
///   at the cost of potentially jittering the audio processing pipeline.
#[derive(Debug, Clone, Copy, PartialEq, Eq)]
pub enum AudioTapMode {
    /// Real-time priority: oldest-drop when buffer is full.
    /// Suitable for low-latency monitoring and analysis.
    Realtime,
    /// Lossless priority: backpressure on sender when buffer is full.
    /// Suitable for recording and quality measurement.
    Lossless,
}

// ---------------------------------------------------------------------------
// AudioTapHandle — receiver for tapped audio
// ---------------------------------------------------------------------------

/// A handle for receiving tapped audio from a call.
///
/// Created by `SipClient::subscribe_audio()`. The caller calls `recv()` to
/// receive the next `AudioChunkPair` from the conference bridge.
///
/// When the underlying call ends or the handle is dropped, `recv()` returns
/// `None`, signalling clean termination.
#[derive(Debug)]
pub struct AudioTapHandle {
    /// Receiver half of the audio channel.
    pub(crate) rx: mpsc::Receiver<AudioChunkPair>,
}

// [::STUB::] P3-2: dead_code until runtime dispatches SubscribeAudio commands.
#[allow(dead_code)]
// [::TICKET::] P5-1 changes. Details: `node .claude/scripts/tickets/show-ticket-context.js --ticket-key=P5-1 --for-spec --no-implementation-order`.
impl AudioTapHandle {
    /// Creates a new `AudioTapHandle` wrapping the given receiver.
    pub(crate) fn new(rx: mpsc::Receiver<AudioChunkPair>) -> Self {
        Self { rx }
    }

    /// Receives the next audio chunk pair from the conference port.
    ///
    /// Returns `Some(AudioChunkPair)` when audio data is available, or `None`
    /// when the channel has been closed (call ended or handle dropped).
    pub async fn recv(&mut self) -> Option<AudioChunkPair> {
        self.rx.recv().await
    }
}

// ---------------------------------------------------------------------------
// MediaDirection — conference port direction
// ---------------------------------------------------------------------------

/// Direction of media stream for conference port connections.
///
/// Used by `RuntimeCommand::ConfConnect` to specify which port to connect.
#[derive(Debug, Clone, Copy, PartialEq, Eq)]
pub enum MediaDirection {
    /// Connect the inbound (remote→local) conference port.
    Inbound,
    /// Connect the outbound (local→remote) conference port.
    Outbound,
    /// Connect both inbound and outbound ports (full-duplex tap).
    Both,
}

// ---------------------------------------------------------------------------
// HangupReason — reasons for call termination
// ---------------------------------------------------------------------------

/// Reason for terminating a SIP call.
///
/// Maps to standard PJSIP hangup causes and SIP response codes.
#[derive(Debug, Clone, Copy, PartialEq, Eq)]
pub enum HangupReason {
    /// Normal call termination (BYE).
    Normal,
    /// Remote party is busy (486 Busy Here).
    Busy,
    /// Call was declined (603 Decline).
    Decline,
    /// Call timed out (408 Request Timeout).
    Timeout,
    /// Internal error caused termination.
    InternalError,
    /// Call was explicitly rejected by user.
    Rejected,
}

// ============================================================================
// Tests — Red Phase (TDD)
// ============================================================================

#[cfg(test)]
mod tests {
    use super::*;

    // -----------------------------------------------------------------------
    // ── C032: AudioTapMode ─────────────────────────────────────────────────
    // -----------------------------------------------------------------------

    /// @verifies C032-postcondition
    #[test]
// [::TICKET::] P5-1 changes. Details: `node .claude/scripts/tickets/show-ticket-context.js --ticket-key=P5-1 --for-spec --no-implementation-order`.
    fn audio_tap_mode_variants_constructable() {
        let modes = [AudioTapMode::Realtime, AudioTapMode::Lossless];
        assert_eq!(modes.len(), 2);
        assert_ne!(AudioTapMode::Realtime, AudioTapMode::Lossless);
    }

    /// @verifies C032-postcondition
    #[test]
// [::TICKET::] P5-1 changes. Details: `node .claude/scripts/tickets/show-ticket-context.js --ticket-key=P5-1 --for-spec --no-implementation-order`.
    fn audio_tap_mode_derives_debug_clone_copy_partial_eq_eq() {
// [::TICKET::] P5-1 changes. Details: `node .claude/scripts/tickets/show-ticket-context.js --ticket-key=P5-1 --for-spec --no-implementation-order`.
        fn assert_debug<T: std::fmt::Debug>() {}
// [::TICKET::] P5-1 changes. Details: `node .claude/scripts/tickets/show-ticket-context.js --ticket-key=P5-1 --for-spec --no-implementation-order`.
        fn assert_clone<T: Clone>() {}
// [::TICKET::] P5-1 changes. Details: `node .claude/scripts/tickets/show-ticket-context.js --ticket-key=P5-1 --for-spec --no-implementation-order`.
        fn assert_copy<T: Copy>() {}
// [::TICKET::] P5-1 changes. Details: `node .claude/scripts/tickets/show-ticket-context.js --ticket-key=P5-1 --for-spec --no-implementation-order`.
        fn assert_partial_eq<T: PartialEq>() {}
// [::TICKET::] P5-1 changes. Details: `node .claude/scripts/tickets/show-ticket-context.js --ticket-key=P5-1 --for-spec --no-implementation-order`.
        fn assert_eq_trait<T: Eq>() {}
        assert_debug::<AudioTapMode>();
        assert_clone::<AudioTapMode>();
        assert_copy::<AudioTapMode>();
        assert_partial_eq::<AudioTapMode>();
        assert_eq_trait::<AudioTapMode>();
    }

    // -----------------------------------------------------------------------
    // ── C032/C033: AudioTapHandle ──────────────────────────────────────────
    // -----------------------------------------------------------------------

    /// @verifies C033-postcondition
    #[tokio::test]
    async fn audio_tap_handle_recv_returns_some_when_data_available() {
        let (tx, rx) = mpsc::channel::<AudioChunkPair>(16);

        // Create a minimal AudioChunkPair for testing
        use crate::model::audio_format_chunkpair::{AudioChunk, AudioChunkPair};
        use crate::model::id_design_newtype::{AccountId, CallId};
        use std::time::SystemTime;
        let pair = AudioChunkPair::new(
            CallId::from_u64(1).unwrap(),
            AccountId::from_u64(1).unwrap(),
            SystemTime::now(),
            AudioChunk::I16(vec![0i16; 160]),
            AudioChunk::I16(vec![1i16; 160]),
        );

        tx.send(pair).await.expect("send should succeed");
        let mut handle = AudioTapHandle::new(rx);
        let result = handle.recv().await;
        assert!(result.is_some(), "recv should return Some when data is available");
    }

    /// @verifies C033-invariant
    #[tokio::test]
    async fn audio_tap_handle_recv_returns_none_when_closed() {
        let (tx, rx) = mpsc::channel::<AudioChunkPair>(16);
        drop(tx); // Close the sender

        let mut handle = AudioTapHandle::new(rx);
        let result = handle.recv().await;
        assert!(result.is_none(), "recv should return None when channel is closed");
    }

    /// @verifies C032-postcondition
    #[test]
// [::TICKET::] P5-1 changes. Details: `node .claude/scripts/tickets/show-ticket-context.js --ticket-key=P5-1 --for-spec --no-implementation-order`.
    fn audio_tap_handle_derives_debug() {
// [::TICKET::] P5-1 changes. Details: `node .claude/scripts/tickets/show-ticket-context.js --ticket-key=P5-1 --for-spec --no-implementation-order`.
        fn assert_debug<T: std::fmt::Debug>() {}
        assert_debug::<AudioTapHandle>();
    }

    // -----------------------------------------------------------------------
    // ── C032: MediaDirection ───────────────────────────────────────────────
    // -----------------------------------------------------------------------

    /// @verifies C032-postcondition
    #[test]
// [::TICKET::] P5-1 changes. Details: `node .claude/scripts/tickets/show-ticket-context.js --ticket-key=P5-1 --for-spec --no-implementation-order`.
    fn media_direction_variants_constructable() {
        let dirs = [MediaDirection::Inbound, MediaDirection::Outbound, MediaDirection::Both];
        assert_eq!(dirs.len(), 3);
        assert_ne!(MediaDirection::Inbound, MediaDirection::Outbound);
        assert_ne!(MediaDirection::Inbound, MediaDirection::Both);
    }

    /// @verifies C032-postcondition
    #[test]
// [::TICKET::] P5-1 changes. Details: `node .claude/scripts/tickets/show-ticket-context.js --ticket-key=P5-1 --for-spec --no-implementation-order`.
    fn media_direction_derives_debug_clone_copy_partial_eq_eq() {
// [::TICKET::] P5-1 changes. Details: `node .claude/scripts/tickets/show-ticket-context.js --ticket-key=P5-1 --for-spec --no-implementation-order`.
        fn assert_debug<T: std::fmt::Debug>() {}
// [::TICKET::] P5-1 changes. Details: `node .claude/scripts/tickets/show-ticket-context.js --ticket-key=P5-1 --for-spec --no-implementation-order`.
        fn assert_clone<T: Clone>() {}
// [::TICKET::] P5-1 changes. Details: `node .claude/scripts/tickets/show-ticket-context.js --ticket-key=P5-1 --for-spec --no-implementation-order`.
        fn assert_copy<T: Copy>() {}
// [::TICKET::] P5-1 changes. Details: `node .claude/scripts/tickets/show-ticket-context.js --ticket-key=P5-1 --for-spec --no-implementation-order`.
        fn assert_partial_eq<T: PartialEq>() {}
// [::TICKET::] P5-1 changes. Details: `node .claude/scripts/tickets/show-ticket-context.js --ticket-key=P5-1 --for-spec --no-implementation-order`.
        fn assert_eq_trait<T: Eq>() {}
        assert_debug::<MediaDirection>();
        assert_clone::<MediaDirection>();
        assert_copy::<MediaDirection>();
        assert_partial_eq::<MediaDirection>();
        assert_eq_trait::<MediaDirection>();
    }

    // -----------------------------------------------------------------------
    // ── C028: HangupReason ─────────────────────────────────────────────────
    // -----------------------------------------------------------------------

    /// @verifies C028-postcondition
    #[test]
// [::TICKET::] P5-1 changes. Details: `node .claude/scripts/tickets/show-ticket-context.js --ticket-key=P5-1 --for-spec --no-implementation-order`.
    fn hangup_reason_variants_constructable() {
        let reasons = [
            HangupReason::Normal,
            HangupReason::Busy,
            HangupReason::Decline,
            HangupReason::Timeout,
            HangupReason::InternalError,
            HangupReason::Rejected,
        ];
        assert_eq!(reasons.len(), 6);
        assert_ne!(HangupReason::Normal, HangupReason::Busy);
    }

    /// @verifies C028-postcondition
    #[test]
// [::TICKET::] P5-1 changes. Details: `node .claude/scripts/tickets/show-ticket-context.js --ticket-key=P5-1 --for-spec --no-implementation-order`.
    fn hangup_reason_derives_debug_clone_copy_partial_eq_eq() {
// [::TICKET::] P5-1 changes. Details: `node .claude/scripts/tickets/show-ticket-context.js --ticket-key=P5-1 --for-spec --no-implementation-order`.
        fn assert_debug<T: std::fmt::Debug>() {}
// [::TICKET::] P5-1 changes. Details: `node .claude/scripts/tickets/show-ticket-context.js --ticket-key=P5-1 --for-spec --no-implementation-order`.
        fn assert_clone<T: Clone>() {}
// [::TICKET::] P5-1 changes. Details: `node .claude/scripts/tickets/show-ticket-context.js --ticket-key=P5-1 --for-spec --no-implementation-order`.
        fn assert_copy<T: Copy>() {}
// [::TICKET::] P5-1 changes. Details: `node .claude/scripts/tickets/show-ticket-context.js --ticket-key=P5-1 --for-spec --no-implementation-order`.
        fn assert_partial_eq<T: PartialEq>() {}
// [::TICKET::] P5-1 changes. Details: `node .claude/scripts/tickets/show-ticket-context.js --ticket-key=P5-1 --for-spec --no-implementation-order`.
        fn assert_eq_trait<T: Eq>() {}
        assert_debug::<HangupReason>();
        assert_clone::<HangupReason>();
        assert_copy::<HangupReason>();
        assert_partial_eq::<HangupReason>();
        assert_eq_trait::<HangupReason>();
    }
}
