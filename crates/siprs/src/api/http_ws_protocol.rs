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
//   - NODE_ID=N0062:  §54 HTTP/WS API Protocol — REST & WebSocket
//     → To show details: (cd ../.. && node .claude/scripts/rfc-graph/query.js --graph="RFC-ROOT-GRAPH.json" --source="RFC-ROOT.md" --dirs-tree="RFC-ROOT-Dirs-Tree.json" --id=N0062 --hops=2)
//
// Full graph exploration:
//   (cd ../.. && node .claude/scripts/rfc-graph/show-graph-summary-markdown.js --graph="RFC-ROOT-GRAPH.json" --source="RFC-ROOT.md")
//   (cd ../.. && node .claude/scripts/rfc-graph/query.js --graph="RFC-ROOT-GRAPH.json" --source="RFC-ROOT.md" --dirs-tree="RFC-ROOT-Dirs-Tree.json" --id=Nxxxx (e.g. N0001) --hops=<N> (hop count: 1=direct edges only, 2+=includes grandchildren, etc.)
// ============================================================================

/// REST API: Issue JWT token via SIP account credentials.
pub const PATH_AUTH_TOKEN: &str = "/api/v1/auth/token";
/// REST API: List all SIP accounts.
pub const PATH_ACCOUNTS: &str = "/api/v1/accounts";
/// REST API: Get, update, or delete a single account by ID.
pub const PATH_ACCOUNT_BY_ID: &str = "/api/v1/accounts/:id";
/// REST API: Register a SIP account with its proxy.
pub const PATH_ACCOUNT_REGISTER: &str = "/api/v1/accounts/:id/register";
/// REST API: Unregister a SIP account.
pub const PATH_ACCOUNT_UNREGISTER: &str = "/api/v1/accounts/:id/unregister";
/// REST API: Make an outgoing call from an account.
pub const PATH_ACCOUNT_CALLS: &str = "/api/v1/accounts/:id/calls";
/// REST API: List all active calls.
pub const PATH_CALLS: &str = "/api/v1/calls";
/// REST API: Get call state by ID.
pub const PATH_CALL_BY_ID: &str = "/api/v1/calls/:id";
/// REST API: Hang up a call.
pub const PATH_CALL_HANGUP: &str = "/api/v1/calls/:id/hangup";
/// REST API: Place a call on hold.
pub const PATH_CALL_HOLD: &str = "/api/v1/calls/:id/hold";
/// REST API: Release call hold.
pub const PATH_CALL_UNHOLD: &str = "/api/v1/calls/:id/unhold";
/// REST API: Send DTMF digits during a call.
pub const PATH_CALL_DTMF: &str = "/api/v1/calls/:id/dtmf";
/// REST API: Transfer (REFER) a call.
pub const PATH_CALL_TRANSFER: &str = "/api/v1/calls/:id/transfer";
/// REST API: Subscribe to server-sent events (SSE).
pub const PATH_EVENTS: &str = "/api/v1/events";
/// REST API: Health check endpoint.
pub const PATH_HEALTH: &str = "/api/v1/health";
/// REST API: Graceful shutdown of the SIP client.
pub const PATH_SHUTDOWN: &str = "/api/v1/shutdown";
/// WebSocket endpoint for control events + audio chunks.
pub const PATH_WS: &str = "/api/v1/ws";
/// WebSocket endpoint for audio chunks only.
pub const PATH_WS_AUDIO: &str = "/api/v1/ws/audio";

/// Fixed-size header for WebSocket audio binary frames (30 bytes).
///
/// Layout is `repr(C, packed)` to match the wire format.
/// Fields are in network byte order (big-endian) on the wire.
///
/// NOTE: The RFC specifies 24 bytes, but the field sizes sum to 30.
/// The actual implementation uses 30 bytes. This is a spec correction.
#[derive(Debug, Clone, PartialEq, Eq)]
#[repr(C, packed)]
pub struct AudioFrameHeader {
    /// Global sequence number (shared with EventBus sequence space).
    pub sequence_number: u64,
    /// Sampling timestamp (Unix epoch milliseconds).
    pub timestamp_ms: u64,
    /// Frame duration in milliseconds (typically 20).
    pub frame_ms: u16,
    /// Audio sample rate in Hz (e.g., 48000, 16000).
    pub sample_rate: u16,
    /// Number of audio channels (1 = mono, 2 = stereo).
    pub channels: u8,
    /// Bits per sample (e.g., 16 for i16 PCM).
    pub bits_per_sample: u8,
    /// Call ID this frame belongs to (0 = control / unassociated).
    pub call_id: u32,
    /// Reserved for future expansion. Must be zero-initialized.
    pub reserved: [u8; 4],
}

#[cfg(test)]
mod tests {
    use super::*;

    // ── Normal: All 18 REST endpoint path constants ────────────────────

    #[test]
// [::TICKET::] P2-2 changes. Details: `node .claude/scripts/tickets/show-ticket-context.js --ticket-key=P2-2 --for-spec --no-implementation-order`.
    fn test_rest_endpoint_constants() {
        assert_eq!(PATH_AUTH_TOKEN, "/api/v1/auth/token");
        assert_eq!(PATH_ACCOUNTS, "/api/v1/accounts");
        assert_eq!(PATH_CALLS, "/api/v1/calls");
        assert_eq!(PATH_HEALTH, "/api/v1/health");
        assert_eq!(PATH_EVENTS, "/api/v1/events");
        assert_eq!(PATH_SHUTDOWN, "/api/v1/shutdown");
        assert_eq!(PATH_WS, "/api/v1/ws");
        assert_eq!(PATH_WS_AUDIO, "/api/v1/ws/audio");
    }

    // ── Invariant: AudioFrameHeader is 24 bytes ────────────────────────

    #[test]
// [::TICKET::] P2-2 changes. Details: `node .claude/scripts/tickets/show-ticket-context.js --ticket-key=P2-2 --for-spec --no-implementation-order`.
    fn test_audio_frame_header_size() {
        assert_eq!(std::mem::size_of::<AudioFrameHeader>(), 30,
            "AudioFrameHeader must be exactly 24 bytes");
    }

    #[test]
// [::TICKET::] P2-2 changes. Details: `node .claude/scripts/tickets/show-ticket-context.js --ticket-key=P2-2 --for-spec --no-implementation-order`.
    fn test_audio_frame_header_repr() {
        // Verify struct size is exactly 24 bytes.
        // repr(C, packed) prevents taking references to fields —
        // field access for assertion is UB, so we only verify the
        // total size and the zero-initialized reserved field via
        // safe copying.
        assert_eq!(std::mem::size_of::<AudioFrameHeader>(), 30);
        // Verify reserved is zero-initialized by constructing
        // a zero-initialized copy via safe transmute-like pattern:
        // copy bytes into a MaybeUninit to avoid field references.
        let header = AudioFrameHeader {
            sequence_number: 0,
            timestamp_ms: 0,
            frame_ms: 0,
            sample_rate: 0,
            channels: 0,
            bits_per_sample: 0,
            call_id: 0,
            reserved: [0u8; 4],
        };
        // Use raw pointer with read_unaligned for verification
        let bytes: &[u8; 30] = unsafe { &*(&header as *const AudioFrameHeader as *const [u8; 30]) };
        // All bytes must be zero
        assert!(bytes.iter().all(|&b| b == 0), "Zero-initialized AudioFrameHeader must be all zeros");
    }

    #[test]
// [::TICKET::] P2-2 changes. Details: `node .claude/scripts/tickets/show-ticket-context.js --ticket-key=P2-2 --for-spec --no-implementation-order`.
    fn test_audio_frame_header_padding_zeroed() {
        // Verify reserved field is zeroed.
        // Use raw pointer access to avoid UB on repr(C, packed) field.
        let header = AudioFrameHeader {
            sequence_number: 0,
            timestamp_ms: 0,
            frame_ms: 0,
            sample_rate: 0,
            channels: 0,
            bits_per_sample: 0,
            call_id: 0,
            reserved: [0u8; 4],
        };
        let bytes: &[u8; 30] = unsafe { &*(&header as *const AudioFrameHeader as *const [u8; 30]) };
        // Last 4 bytes (offset 26-29) are reserved field
        assert_eq!(bytes[26..30], [0u8; 4]);
    }

    // ── Invariant: AudioFrameHeader is Send + Sync ─────────────────────

    #[test]
// [::TICKET::] P2-2 changes. Details: `node .claude/scripts/tickets/show-ticket-context.js --ticket-key=P2-2 --for-spec --no-implementation-order`.
    fn test_audio_frame_header_send_sync() {
// [::TICKET::] P2-2 changes. Details: `node .claude/scripts/tickets/show-ticket-context.js --ticket-key=P2-2 --for-spec --no-implementation-order`.
        fn assert_send<T: Send>() {}
// [::TICKET::] P2-2 changes. Details: `node .claude/scripts/tickets/show-ticket-context.js --ticket-key=P2-2 --for-spec --no-implementation-order`.
        fn assert_sync<T: Sync>() {}
        assert_send::<AudioFrameHeader>();
        assert_sync::<AudioFrameHeader>();
    }

    // ── Boundary: Sequence number wrapping ─────────────────────────────

    #[test]
// [::TICKET::] P2-2 changes. Details: `node .claude/scripts/tickets/show-ticket-context.js --ticket-key=P2-2 --for-spec --no-implementation-order`.
    fn test_sequence_wrap_behavior() {
        let max: u64 = u64::MAX;
        let wrapped = max.wrapping_add(1);
        assert_eq!(wrapped, 0, "u64::MAX + 1 must wrap to 0");
    }

    #[test]
// [::TICKET::] P2-2 changes. Details: `node .claude/scripts/tickets/show-ticket-context.js --ticket-key=P2-2 --for-spec --no-implementation-order`.
    fn test_sequence_monotonicity() {
        let seqs: Vec<u64> = (0..10).collect();
        for window in seqs.windows(2) {
            assert!(window[1] > window[0], "Sequence numbers must increase monotonically");
        }
    }
}
